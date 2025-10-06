from __future__ import annotations

import argparse
from pathlib import Path
from typing import List, Tuple

import pandas as pd


def find_unsw_csvs(root: Path) -> Tuple[Path, Path]:
    """Find UNSW-NB15 training and testing CSVs under the given root."""
    train = root / "UNSW_NB15_training-set.csv"
    test = root / "UNSW_NB15_testing-set.csv"
    if not train.exists() or not test.exists():
        # Fallback: search by glob
        trains = list(root.glob("*training*set*.csv"))
        tests = list(root.glob("*testing*set*.csv"))
        if not trains or not tests:
            raise FileNotFoundError(
                f"Could not find UNSW CSVs under {root}. Expected files named like 'UNSW_NB15_training-set.csv' and 'UNSW_NB15_testing-set.csv'."
            )
        train = sorted(trains)[0]
        test = sorted(tests)[0]
    return train, test


def load_concat_csvs(paths: List[Path]) -> pd.DataFrame:
    frames = []
    for p in paths:
        # Handle potential UTF-8 BOM in header
        df = pd.read_csv(p, encoding="utf-8-sig")
        frames.append(df)
    if not frames:
        raise ValueError("No input CSVs provided")
    return pd.concat(frames, axis=0, ignore_index=True)


def preprocess_unsw(df: pd.DataFrame) -> pd.DataFrame:
    # Harmonise column names
    rename_map = {"proto": "protocol_type", "state": "flag"}
    df = df.rename(columns=rename_map)

    # Create fine-grained label from attack_cat if present
    if "attack_cat" in df.columns:
        # Fill missing as Normal (UNSW uses '-' for service sometimes; treat NaN in attack_cat as Normal)
        fine = df["attack_cat"].fillna("Normal").astype(str)
        df["label"] = fine
    else:
        # Fallback: derive from binary label column if present
        if "label" in df.columns:
            df["label"] = df["label"].map(lambda x: "Normal" if str(x) == "0" else "Attack")
        else:
            raise ValueError("Neither 'attack_cat' nor 'label' columns found to create targets")

    # Coarse family: Normal vs Attack (anything not Normal)
    df["label_family"] = df["label"].apply(lambda x: "Normal" if str(x).lower() == "normal" else "Attack")

    # Ensure expected categoricals exist
    for col in ("protocol_type", "service", "flag"):
        if col not in df.columns:
            raise ValueError(f"Expected categorical column '{col}' not found in data")
        df[col] = df[col].astype("string").fillna("UNK")

    # Drop clearly non-predictive identifiers if present
    drop_cols = [
        "id",
        "srcip",
        "dstip",
        "sport",
        "dsport",
        "stime",
        "ltime",
    ]
    present_drops = [c for c in drop_cols if c in df.columns]
    if present_drops:
        df = df.drop(columns=present_drops)

    return df


def write_outputs(df: pd.DataFrame, outdir: Path) -> Tuple[Path, Path]:
    outdir.mkdir(parents=True, exist_ok=True)
    flows_path = outdir / "flows_clean.csv"
    df.to_csv(flows_path, index=False)

    # Build fine -> coarse label map
    map_df = (
        df[["label", "label_family"]]
        .drop_duplicates()
        .rename(columns={"label": "label", "label_family": "category"})
        .sort_values(by=["label", "category"]) 
    )
    map_path = outdir / "label_category_map.csv"
    map_df.to_csv(map_path, index=False)
    return flows_path, map_path


def main():
    ap = argparse.ArgumentParser(description="Generate processed UNSW flows CSV and label map")
    ap.add_argument(
        "--unsw-dir",
        default=str(Path("data_raw/unsw_nb15/Training and Testing Sets")),
        help="Directory containing UNSW_NB15_training-set.csv and UNSW_NB15_testing-set.csv",
    )
    ap.add_argument(
        "--outdir",
        default=str(Path("data_processed")),
        help="Output directory for flows_clean.csv and label_category_map.csv",
    )
    args = ap.parse_args()

    unsw_dir = Path(args.unsw_dir)
    outdir = Path(args.outdir)

    train_csv, test_csv = find_unsw_csvs(unsw_dir)
    df_raw = load_concat_csvs([train_csv, test_csv])
    print(f"[info] Loaded {len(df_raw):,} rows from 2 files")

    df = preprocess_unsw(df_raw)

    flows_path, map_path = write_outputs(df, outdir)
    print(f"[ok] Wrote: {flows_path}")
    print(f"[ok] Wrote: {map_path}")

    # Report basic schema
    numeric_cols = [c for c in df.columns if c not in ("protocol_type", "service", "flag", "label", "label_family")]
    print(
        f"[info] Rows: {len(df):,} | Numeric: {len(numeric_cols)} | Cats: ['protocol_type', 'service', 'flag']"
    )

    # Label distribution (coarse)
    vc = df["label_family"].value_counts()
    print("[info] Label distribution:")
    print(vc.to_string())


if __name__ == "__main__":
    main()


