#!/usr/bin/env python
"""Build CESNET window datasets and compute regression residuals."""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--agg-dir", required=True, help="Directory of aggregated flows (CSV per ip_id)")
    p.add_argument("--ids", required=True, help="Path to ids_relationship.csv")
    p.add_argument("--times", required=True, help="Path to times_10_minutes.csv")
    p.add_argument("--calendar", required=True, help="Path to weekends_and_holidays.csv")
    p.add_argument("--outdir", default="data_processed")
    p.add_argument("--max-files", type=int, default=500,
                   help="Limit number of IP CSVs processed (keeps runtime reasonable)")
    p.add_argument("--lag-windows", nargs="+", type=int, default=[1, 2, 3, 6, 12],
                   help="Lag steps (in 10-min intervals) to compute for n_bytes and n_flows")
    p.add_argument("--roll-window", type=int, default=12,
                   help="Rolling window length (10-min steps) for mean/std features")
    p.add_argument("--contamination", type=float, default=0.03,
                   help="Approximate share of anomalies to promote (top residual tail)")
    p.add_argument("--prevalence-cap", type=float, default=-1.0,
                   help="If >0, cap anomaly prevalence in test set to this fraction (e.g. 0.05)")
    p.add_argument("--out-prefix", type=str, default="cesnet_windows",
                   help="Prefix for output train/test CSVs (default: cesnet_windows)")
    return p.parse_args()


def load_flow_files(agg_dir: Path, max_files: int) -> pd.DataFrame:
    files = sorted(agg_dir.glob("*.csv"))
    if max_files:
        files = files[:max_files]
    frames = []
    for path in files:
        df = pd.read_csv(path)
        df["ip_id"] = int(path.stem)
        frames.append(df)
    windows = pd.concat(frames, ignore_index=True)
    return windows


def add_calendar_features(df: pd.DataFrame, calendar_path: Path) -> pd.DataFrame:
    cal = pd.read_csv(calendar_path, parse_dates=["Date"])
    cal["Date"] = cal["Date"].dt.date
    df["date"] = df["time"].dt.date
    df = df.merge(cal.rename(columns={"Date": "date"}), on="date", how="left")
    df["Type"] = df["Type"].fillna("Weekday")
    df["is_weekend"] = (df["Type"] == "Weekend").astype(int)
    df["is_holiday"] = (df["Type"] == "Holiday").astype(int)
    return df


def add_lag_features(df: pd.DataFrame, lags: list[int]) -> pd.DataFrame:
    df = df.sort_values(["ip_id", "time"])
    for lag in lags:
        df[f"lag{lag}_n_bytes"] = df.groupby("ip_id")["n_bytes"].shift(lag)
        df[f"lag{lag}_n_flows"] = df.groupby("ip_id")["n_flows"].shift(lag)
    return df


def add_rolling_features(df: pd.DataFrame, window: int) -> pd.DataFrame:
    df = df.sort_values(["ip_id", "time"])
    df[f"rolling_mean_{window}_bytes"] = (
        df.groupby("ip_id")["n_bytes"].rolling(window=window, min_periods=1)
        .mean().reset_index(level=0, drop=True)
    )
    df[f"rolling_std_{window}_bytes"] = (
        df.groupby("ip_id")["n_bytes"].rolling(window=window, min_periods=1)
        .std().reset_index(level=0, drop=True)
    )
    return df


def build_feature_columns(lag_windows: list[int], roll_window: int) -> list[str]:
    base = [
        "hour", "dow", "is_weekend", "is_holiday",
        "n_flows", "n_packets", "n_bytes",
        "n_dest_asn", "n_dest_ports", "n_dest_ip",
        "tcp_udp_ratio_packets", "tcp_udp_ratio_bytes",
        "dir_ratio_packets", "dir_ratio_bytes",
        "avg_duration", "avg_ttl",
    ]
    for lag in lag_windows:
        base.append(f"lag{lag}_n_bytes")
        base.append(f"lag{lag}_n_flows")
    base.append(f"rolling_mean_{roll_window}_bytes")
    base.append(f"rolling_std_{roll_window}_bytes")
    return base


def main():
    args = parse_args()
    agg_dir = Path(args.agg_dir)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    windows = load_flow_files(agg_dir, args.max_files)
    ids_rel = pd.read_csv(args.ids)
    times = pd.read_csv(args.times, parse_dates=["time"])

    windows = windows.merge(ids_rel, left_on="ip_id", right_on="id_ip", how="left")
    windows = windows.merge(times, on="id_time", how="left")
    windows["time"] = pd.to_datetime(windows["time"], utc=True).dt.tz_convert(None)
    windows["hour"] = windows["time"].dt.hour
    windows["dow"] = windows["time"].dt.dayofweek

    windows = add_calendar_features(windows, Path(args.calendar))
    windows = add_lag_features(windows, args.lag_windows)
    windows = add_rolling_features(windows, args.roll_window)

    feature_cols = build_feature_columns(args.lag_windows, args.roll_window)
    windows = windows.dropna(subset=feature_cols)

    cutoff = windows["time"].quantile(0.7)
    train_df = windows[windows["time"] <= cutoff].copy()
    test_df = windows[windows["time"] > cutoff].copy()

    keep_cols = ["ip_id", "id_time", "time", "id_institution"] + feature_cols
    train_df = train_df[keep_cols]
    test_df = test_df[keep_cols]

    train_path = outdir / f"{args.out_prefix}_train.csv"
    test_path = outdir / f"{args.out_prefix}_test.csv"
    train_df.to_csv(train_path, index=False)

    X_train = train_df.drop(columns=["time", "ip_id", "id_time", "id_institution"])
    y_train = train_df["n_bytes"]
    reg = GradientBoostingRegressor(random_state=42)
    reg.fit(X_train, y_train)

    X_test = test_df.drop(columns=["time", "ip_id", "id_time", "id_institution"])
    y_test = test_df["n_bytes"]
    yhat = reg.predict(X_test)

    mae = mean_absolute_error(y_test, yhat)
    mse = mean_squared_error(y_test, yhat)
    rmse = mse ** 0.5
    residuals = y_test - yhat

    sigma = residuals.groupby(test_df["ip_id"]).transform("std").replace(0, np.nan).fillna(residuals.std())
    is_anom = (residuals.abs() > (3 * sigma)).astype(int)

    k = max(int(args.contamination * len(test_df)), 1)
    top_idx = residuals.abs().nlargest(k).index
    mask = residuals.index.isin(top_idx)
    is_anom.loc[mask] = 1

    test_df["n_bytes_pred"] = yhat
    test_df["residual"] = residuals
    test_df["is_anom"] = is_anom.astype(int)

    if args.prevalence_cap and args.prevalence_cap > 0:
        current = float(test_df["is_anom"].mean())
        if current > args.prevalence_cap:
            k_cap = max(int(args.prevalence_cap * len(test_df)), 1)
            keep_idx = residuals.abs().nlargest(k_cap).index
            test_df["is_anom"] = 0
            test_df.loc[keep_idx, "is_anom"] = 1

    k_tail = max(int(args.contamination * len(test_df)), 1)
    tail_idx = residuals.abs().nlargest(k_tail).index
    test_df.loc[tail_idx, "is_anom"] = 1

    test_df.to_csv(test_path, index=False)

    print(f"Saved train -> {train_path} shape={train_df.shape}")
    print(f"Saved test  -> {test_path} shape={test_df.shape}")
    print({
        "mae": float(mae),
        "rmse": float(rmse),
        "anomaly_rate": float(test_df['is_anom'].mean()),
    })


if __name__ == "__main__":
    main()
