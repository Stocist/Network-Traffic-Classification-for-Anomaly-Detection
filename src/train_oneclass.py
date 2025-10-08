from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import List, Optional

import numpy as np
import pandas as pd
from joblib import dump
from sklearn.ensemble import IsolationForest
from sklearn.metrics import average_precision_score, precision_recall_curve, roc_auc_score, roc_curve

from .data_prep import infer_feature_types, load_csvs
from .pipeline import build_preprocessor
import matplotlib.pyplot as plt


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train a one-class anomaly detector (IsolationForest)")
    p.add_argument("--data", nargs="+", required=True, help="CSV(s) with only normal data for training")
    p.add_argument("--target", default=None, help="Optional target column to drop if present")
    p.add_argument("--categorical-cols", nargs="*", default=None, help="Optional categorical column names")
    p.add_argument("--contamination", type=float, default=0.01, help="Expected anomaly fraction for thresholding")
    p.add_argument("--n-estimators", type=int, default=300, help="Number of trees in IsolationForest")
    p.add_argument("--max-train-rows", type=int, default=0,
                   help="If >0, randomly sample at most this many rows from training data")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--outdir", default="runs")
    p.add_argument("--run-name", default=None)
    # Optional evaluation on labeled test set
    p.add_argument("--test", nargs="*", default=None, help="CSV(s) with labeled test data for evaluation")
    p.add_argument("--test-target", default=None, help="Target label in test data (1=anomaly, 0=normal)")
    p.add_argument("--scorer", choices=["pr", "roc"], default="pr", help="Evaluation metric for labeled test")
    p.add_argument("--fpr-target", type=float, default=0.05, help="Report recall at fixed FPR")
    p.add_argument("--max-test-rows", type=int, default=0,
                   help="If >0, randomly sample at most this many rows from labeled test data")
    return p.parse_args()


def main():
    args = parse_args()
    root = Path(args.outdir)
    root.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S")
    run_name = args.run_name or "oneclass_iforest"
    run_dir = root / f"{ts}_{run_name}"
    figs_dir = run_dir / "figures"
    run_dir.mkdir(parents=True, exist_ok=True)
    figs_dir.mkdir(parents=True, exist_ok=True)

    df = load_csvs(args.data)
    if args.target and args.target in df.columns:
        df = df.drop(columns=[args.target])
    if args.max_train_rows and len(df) > args.max_train_rows:
        df = df.sample(args.max_train_rows, random_state=args.seed)
    spec = infer_feature_types(df.assign(_dummy=0), target="_dummy", categorical_cols=args.categorical_cols)
    pre = build_preprocessor(spec.numeric, spec.categorical)

    # IsolationForest expects numeric input after preprocessing
    from sklearn.pipeline import Pipeline

    pipe = Pipeline(steps=[
        ("preprocess", pre),
        ("clf", IsolationForest(random_state=args.seed, n_estimators=args.n_estimators, n_jobs=-1,
                                contamination=args.contamination)),
    ])

    pipe.fit(df)
    model_path = run_dir / "oneclass_iforest.joblib"
    dump(pipe, model_path)
    print(f"Saved one-class pipeline to {model_path}")

    # Optional labeled evaluation
    if args.test:
        if not args.test_target:
            raise SystemExit("--test-target is required when using --test")
        test_df = load_csvs(args.test)
        if args.test_target not in test_df.columns:
            raise SystemExit(f"Test target '{args.test_target}' not found in test data")
        if args.max_test_rows and len(test_df) > args.max_test_rows:
            test_df = test_df.sample(args.max_test_rows, random_state=args.seed)
        X_test = test_df.drop(columns=[args.test_target])
        y_test = test_df[args.test_target]

        # IsolationForest: lower scores = more anomalous; use -decision_function for anomaly score
        scores = -pipe.decision_function(X_test)
        result = {}
        if args.scorer == "pr":
            ap = average_precision_score(y_test, scores)
            precision, recall, thresholds = precision_recall_curve(y_test, scores)
            result.update({"pr_auc": float(ap)})
            # Save PR curve
            fig, ax = plt.subplots(figsize=(6, 5))
            ax.plot(recall, precision, label=f"AP={ap:.3f}")
            ax.set_xlabel("Recall"); ax.set_ylabel("Precision"); ax.legend(); ax.set_title("One-class PR curve")
            fig.tight_layout(); fig.savefig(figs_dir / "pr_curve.png", dpi=160); plt.close(fig)
        else:
            roc_auc = roc_auc_score(y_test, scores)
            fpr, tpr, _ = roc_curve(y_test, scores)
            result.update({"roc_auc": float(roc_auc)})
            fig, ax = plt.subplots(figsize=(6, 5))
            ax.plot(fpr, tpr, label=f"AUC={roc_auc:.3f}")
            ax.plot([0,1],[0,1],"k--",alpha=0.4)
            ax.set_xlabel("FPR"); ax.set_ylabel("TPR"); ax.legend(); ax.set_title("One-class ROC curve")
            fig.tight_layout(); fig.savefig(figs_dir / "roc_curve.png", dpi=160); plt.close(fig)

        # Recall at fixed FPR
        fpr, tpr, thr = roc_curve(y_test, scores)
        idx = np.argmax(fpr >= args.fpr_target)
        rec_at_fpr = float(tpr[idx])
        result.update({"recall_at_fpr": rec_at_fpr, "fpr_target": float(fpr[idx])})

        # Score histograms
        fig, ax = plt.subplots(figsize=(7, 5))
        ax.hist(scores[y_test == 0], bins=40, alpha=0.6, label="normal")
        ax.hist(scores[y_test == 1], bins=40, alpha=0.6, label="attack")
        ax.set_title("Anomaly scores distribution")
        ax.legend(); fig.tight_layout(); fig.savefig(figs_dir / "score_hist.png", dpi=160); plt.close(fig)

        (run_dir / "metrics.json").write_text(json.dumps(result, indent=2))
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
