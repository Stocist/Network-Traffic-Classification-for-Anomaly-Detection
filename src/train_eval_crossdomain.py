from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from joblib import dump
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import classification_report

from .data_prep import infer_feature_types, load_csvs, split_Xy
from .pipeline import make_pipeline
from .eval_utils import (
    compute_classification_metrics,
    save_confusion_matrix,
    plot_pr_curve,
    plot_roc_curve,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train on dataset A and evaluate on dataset B (cross-domain)")
    p.add_argument("--train", nargs="+", required=True, help="CSV(s) for training")
    p.add_argument("--test", nargs="+", required=True, help="CSV(s) for testing")
    p.add_argument("--task", choices=["binary", "multiclass"], default="multiclass")
    p.add_argument("--target", required=True)
    p.add_argument("--categorical-cols", nargs="*", default=None)
    p.add_argument("--model", default="rf", choices=["rf", "logreg", "lr", "gb", "gbc", "lsvc", "svm", "xgb", "xgboost"])
    p.add_argument("--class-weight", default=None, choices=[None, "balanced"])
    p.add_argument("--use-smote", action="store_true")
    p.add_argument("--calibrate", choices=["none", "platt", "isotonic"], default="none")
    p.add_argument("--cv-folds", type=int, default=5)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--pos-label", default=None, help="Positive class label for binary")
    p.add_argument("--outdir", default="runs")
    p.add_argument("--run-name", default=None)
    return p.parse_args()


def align_columns(df: pd.DataFrame, numeric_cols, categorical_cols) -> pd.DataFrame:
    needed = list(numeric_cols) + list(categorical_cols)
    X = df.copy()
    # Add missing columns with NaN
    for c in needed:
        if c not in X.columns:
            X[c] = np.nan
    # Reorder
    return X[needed]


def pick_pos_label(y: pd.Series, provided: Optional[str]) -> str:
    if provided is not None:
        return provided
    vc = y.value_counts()
    if len(vc) != 2:
        raise ValueError("pos_label can only be auto-inferred for binary tasks")
    return vc.idxmin()


def main():
    args = parse_args()
    root = Path(args.outdir)
    root.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S")
    run_name = args.run_name or f"crossdomain_{args.model}_{args.task}"
    run_dir = root / f"{ts}_{run_name}"
    figs_dir = run_dir / "figures"
    run_dir.mkdir(parents=True, exist_ok=True)
    figs_dir.mkdir(parents=True, exist_ok=True)

    train_df = load_csvs(args.train)
    test_df = load_csvs(args.test)

    train_spec = infer_feature_types(train_df, target=args.target, categorical_cols=args.categorical_cols)
    X_train, y_train = split_Xy(train_df, target=args.target)
    X_test_raw, y_test = split_Xy(test_df, target=args.target)

    X_test = align_columns(X_test_raw, train_spec.numeric, train_spec.categorical)
    X_train = align_columns(X_train, train_spec.numeric, train_spec.categorical)

    pos_label = pick_pos_label(y_train, args.pos_label) if args.task == "binary" else None

    pipe = make_pipeline(
        numeric=train_spec.numeric,
        categorical=train_spec.categorical,
        model=args.model,
        use_smote=args.use_smote,
        class_weight=args.class_weight,
        random_state=args.seed,
        calibrate=None if args.calibrate == "none" else ("isotonic" if args.calibrate == "isotonic" else "platt"),
    )

    pipe.fit(X_train, y_train)

    if args.task == "binary":
        # Prefer predict_proba
        try:
            proba = pipe.predict_proba(X_test)
            idx = list(pipe.named_steps["clf"].classes_).index(pos_label)
            scores = proba[:, idx]
            y_pred = (scores >= 0.5).astype(object)
            neg_label = [c for c in pipe.named_steps["clf"].classes_ if c != pos_label][0]
            y_pred = np.where(y_pred == 1, pos_label, neg_label)
            plot_pr_curve(y_test, scores, figs_dir / "pr_curve_test.png", pos_label=pos_label)
            plot_roc_curve(y_test, scores, figs_dir / "roc_curve_test.png", pos_label=pos_label)
        except Exception:
            y_pred = pipe.predict(X_test)
    else:
        y_pred = pipe.predict(X_test)

    metrics = compute_classification_metrics(y_test, y_pred)
    (run_dir / "metrics_test.json").write_text(json.dumps(metrics, indent=2))
    class_labels = sorted(pd.Series(y_test).unique().tolist())
    save_confusion_matrix(y_test, y_pred, figs_dir / "confusion_matrix_test.png", labels=class_labels, title="Test Confusion Matrix")

    # Save pipeline for reproducibility
    dump(pipe, run_dir / "pipeline.joblib")
    (run_dir / "meta.json").write_text(json.dumps({
        "task": args.task,
        "target": args.target,
        "classes": list(getattr(pipe.named_steps.get("clf", None), "classes_", class_labels)),
        "calibration": args.calibrate,
        "model": args.model,
        "seed": args.seed,
        "train_files": [str(Path(p)) for p in args.train],
        "test_files": [str(Path(p)) for p in args.test],
        "timestamp": ts,
    }, indent=2))

    print(f"Saved cross-domain evaluation to {run_dir}")


if __name__ == "__main__":
    main()

