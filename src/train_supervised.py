from __future__ import annotations

import argparse
import hashlib
import json
import time
import platform
import importlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from joblib import dump
from sklearn.metrics import classification_report
from sklearn.model_selection import StratifiedKFold, cross_val_predict, GridSearchCV, RandomizedSearchCV

from .data_prep import FeatureSpec, infer_feature_types, load_csvs, split_Xy
from .eval_utils import (
    compute_classification_metrics,
    save_confusion_matrix,
    plot_pr_curve,
    plot_roc_curve,
    threshold_curve_plot,
    best_f1_threshold,
    threshold_for_precision,
    get_feature_names_from_column_transformer,
    extract_final_estimator,
    plot_feature_importance,
    orient_scores_if_needed,
)
from .pipeline import make_pipeline


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train supervised classifier with CV and persist full pipeline")
    p.add_argument("--data", nargs="+", required=True, help="Path(s) to CSV file(s) containing data")
    p.add_argument("--target", required=True, help="Target column name")
    p.add_argument("--task", choices=["binary", "multiclass"], default="multiclass", help="Classification task type")
    p.add_argument("--label-map", default=None, help="Optional CSV mapping fine labels to coarse classes")
    p.add_argument("--categorical-cols", nargs="*", default=None, help="Optional list of categorical column names")
    p.add_argument("--model", default="rf", choices=["rf", "logreg", "lr", "gb", "gbc", "lsvc", "svm", "xgb", "xgboost"], help="Model type")
    p.add_argument("--class-weight", default="none", choices=["balanced", "none"], help="Class weight strategy")
    p.add_argument("--use-smote", action="store_true", help="Use SMOTE inside the pipeline")
    p.add_argument("--search", choices=["none", "grid", "random"], default="none", help="Hyperparameter search strategy")
    p.add_argument("--param-grid", default=None, help="Path to JSON param grid (for grid/random)")
    p.add_argument("--n-iter", type=int, default=30, help="RandomizedSearchCV iterations (if search=random)")
    p.add_argument("--calibrate", choices=["none", "platt", "isotonic"], default="none", help="Probability calibration method")
    p.add_argument("--threshold-mode", choices=["default", "max_f1", "recall_at_precision"], default="default", help="Threshold selection mode for binary tasks")
    p.add_argument("--precision-target", type=float, default=0.9, help="Target precision for recall@precision thresholding (binary)")
    p.add_argument("--pos-label", default=None, help="Positive class label for binary tasks (defaults to minority class)")
    p.add_argument("--cv-folds", type=int, default=5, help="Number of StratifiedKFold folds")
    p.add_argument("--seed", type=int, default=42, help="Random state for reproducibility")
    p.add_argument("--outdir", default="runs", help="Root directory to save run artifacts")
    p.add_argument("--run-name", default=None, help="Optional run name; defaults to timestamp+spec")
    return p.parse_args()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def default_param_grid(model: str) -> Dict[str, List]:
    model = model.lower()
    if model in ("rf", "randomforest"):
        return {
            "clf__n_estimators": [200, 300, 500],
            "clf__max_depth": [None, 10, 20, 40],
            "clf__min_samples_split": [2, 5, 10],
            "clf__min_samples_leaf": [1, 2, 4],
            "clf__max_features": ["sqrt", None],
        }
    if model in ("logreg", "lr"):
        return {
            "clf__C": [0.1, 0.5, 1.0, 2.0, 5.0],
            "clf__penalty": ["l2"],
            "clf__solver": ["lbfgs"],
        }
    if model in ("gb", "gbc", "gradientboosting"):
        return {
            "clf__n_estimators": [100, 200, 300],
            "clf__learning_rate": [0.05, 0.1, 0.2],
            "clf__max_depth": [2, 3, 4],
        }
    if model in ("xgb", "xgboost"):
        return {
            "clf__n_estimators": [300, 500, 800],
            "clf__max_depth": [4, 6, 8],
            "clf__learning_rate": [0.05, 0.1, 0.2],
            "clf__subsample": [0.7, 0.8, 1.0],
            "clf__colsample_bytree": [0.7, 0.8, 1.0],
            "clf__min_child_weight": [1, 5, 10],
        }
    if model in ("lsvc", "svm"):
        return {
            "clf__C": [0.1, 1.0, 10.0],
        }
    return {}


def load_label_map(path: str | None) -> Optional[Dict]:
    if not path:
        return None
    mdf = pd.read_csv(path)
    if mdf.shape[1] < 2:
        raise ValueError("Label map CSV must have at least two columns (source,target)")
    src_col, dst_col = mdf.columns[:2]
    return dict(zip(mdf[src_col], mdf[dst_col]))


def pick_pos_label(y: pd.Series, provided: Optional[str]) -> str:
    if provided is not None:
        return provided
    vc = y.value_counts()
    if len(vc) != 2:
        raise ValueError("pos_label can only be auto-inferred for binary tasks")
    return vc.idxmin()


def main():
    args = parse_args()
    # Map CLI 'none' to Python None for class_weight
    if args.class_weight == "none":
        args.class_weight = None
    root = Path(args.outdir)
    root.mkdir(parents=True, exist_ok=True)

    df = load_csvs(args.data)

    # Optional label mapping
    label_map = load_label_map(args.label_map)
    if label_map:
        if args.target not in df.columns:
            raise ValueError(f"Target column '{args.target}' not found for label mapping")
        df[args.target] = df[args.target].map(lambda x: label_map.get(x, x))

    spec = infer_feature_types(df, target=args.target, categorical_cols=args.categorical_cols)
    X, y = split_Xy(df, target=args.target)

    # Resolve positive label for binary
    pos_label = None
    if args.task == "binary":
        pos_label = pick_pos_label(y, args.pos_label)

    pipe = make_pipeline(
        numeric=spec.numeric,
        categorical=spec.categorical,
        model=args.model,
        use_smote=args.use_smote,
        class_weight=args.class_weight,
        random_state=args.seed,
        calibrate=None if args.calibrate == "none" else ("isotonic" if args.calibrate == "isotonic" else "platt"),
    )

    skf = StratifiedKFold(n_splits=args.cv_folds, shuffle=True, random_state=args.seed)

    # Optional hyperparameter search
    best_pipe = pipe
    search_results = None
    if args.search != "none":
        grid = default_param_grid(args.model)
        if args.param_grid:
            with open(args.param_grid, "r") as f:
                grid = json.load(f)
        scoring = "f1_macro"
        common_kwargs = dict(scoring=scoring, cv=skf, n_jobs=-1, verbose=1, refit=True)
        if args.search == "grid":
            search = GridSearchCV(estimator=pipe, param_grid=grid, **common_kwargs)
        else:
            search = RandomizedSearchCV(estimator=pipe, param_distributions=grid, n_iter=args.n_iter, **common_kwargs)
        search.fit(X, y)
        best_pipe = search.best_estimator_
        # Collect search results
        search_results = {
            "best_params": search.best_params_,
            "best_score": float(search.best_score_),
            "cv_results": pd.DataFrame(search.cv_results_).to_dict(orient="list"),
        }

    # Build run directory name
    ts = time.strftime("%Y%m%d_%H%M%S")
    name_bits = [args.model, args.task]
    if args.use_smote:
        name_bits.append("smote")
    if args.class_weight == "balanced":
        name_bits.append("cw")
    if args.calibrate != "none":
        name_bits.append(f"cal_{args.calibrate}")
    run_name = args.run_name or ("_".join(name_bits))
    run_dir = root / f"{ts}_{run_name}"
    figs_dir = run_dir / "figures"
    run_dir.mkdir(parents=True, exist_ok=True)
    figs_dir.mkdir(parents=True, exist_ok=True)

    # Obtain out-of-fold predictions to evaluate without leakage
    # For binary, also get probabilities/scores for threshold tuning
    if args.task == "binary":
        # Try predict_proba; fall back to decision_function
        y_proba = None
        try:
            proba = cross_val_predict(best_pipe, X, y, cv=skf, n_jobs=-1, method="predict_proba")
            # Index of positive class under standard sklearn ordering (sorted unique labels)
            classes_sorted = sorted(pd.Series(y).unique().tolist())
            idx = classes_sorted.index(pos_label)
            y_scores = proba[:, idx]
        except Exception:
            # decision function
            scores = cross_val_predict(best_pipe, X, y, cv=skf, n_jobs=-1, method="decision_function")
            scores = np.asarray(scores)
            # Ensure higher score => positive class, then min-max scale for plotting/thresholding convenience
            scores = orient_scores_if_needed(scores, y, pos_label)
            y_scores = (scores - scores.min()) / (scores.max() - scores.min() + 1e-12)

        thr = 0.5
        thr_info = {"mode": args.threshold_mode}
        if args.threshold_mode == "max_f1":
            thr, best_f1 = best_f1_threshold(y, y_scores, pos_label=pos_label)
            thr_info.update({"best_f1": best_f1})
        elif args.threshold_mode == "recall_at_precision":
            thr, info = threshold_for_precision(y, y_scores, precision_target=args.precision_target, pos_label=pos_label)
            thr_info.update(info)

        y_pred = (y_scores >= thr).astype(object)
        # Map booleans back to original labels order (pos_label vs other)
        neg_label = [c for c in y.unique() if c != pos_label][0]
        y_pred = np.where(y_pred == 1, pos_label, neg_label)

        # Curves and numeric metrics
        pr = plot_pr_curve(y, y_scores, figs_dir / "pr_curve.png", pos_label=pos_label)
        roc = plot_roc_curve(y, y_scores, figs_dir / "roc_curve.png", pos_label=pos_label)
        ap = pr.get("ap")
        roc_auc = roc.get("roc_auc")
        if (ap is None) or (roc_auc is None):
            from sklearn.metrics import average_precision_score, roc_auc_score
            y_bin = (pd.Series(y).astype(str) == str(pos_label)).astype(int).values
            ap = float(average_precision_score(y_bin, y_scores))
            roc_auc = float(roc_auc_score(y_bin, y_scores))
        threshold_curve_plot(y, y_scores, figs_dir / "threshold_curves.png", pos_label=pos_label)
    else:
        y_pred = cross_val_predict(best_pipe, X, y, cv=skf, n_jobs=-1)
        thr = None
        thr_info = None

    metrics = compute_classification_metrics(y, y_pred)
    macro_f1 = metrics["macro_f1"]
    print(json.dumps({"macro_f1": macro_f1}, indent=2))
    print("Classification report:\n", classification_report(y, y_pred))

    # For binary tasks, include AP and ROC-AUC
    if args.task == "binary":
        if ap is not None:
            metrics["average_precision"] = float(ap)
        if roc_auc is not None:
            metrics["roc_auc"] = float(roc_auc)
    # Persist metrics and confusion matrix
    (run_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    class_labels = sorted(pd.Series(y).unique().tolist())
    save_confusion_matrix(y, y_pred, figs_dir / "confusion_matrix.png", labels=class_labels, title="Confusion Matrix (OOF)")

    # Persist params and search results
    if search_results is not None:
        (run_dir / "params.json").write_text(json.dumps(search_results["best_params"], indent=2))
        # Save complete cv_results to CSV for convenience
        pd.DataFrame(search.cv_results_).to_csv(run_dir / "cv_results.csv", index=False)
    else:
        # Save estimator params
        (run_dir / "params.json").write_text(json.dumps(best_pipe.get_params(), indent=2, default=str))

    # Fit on full data and persist the complete pipeline
    best_pipe.fit(X, y)
    model_path = run_dir / "pipeline.joblib"
    dump(best_pipe, model_path)

    # Feature importances (if available)
    try:
        pre = best_pipe.named_steps["preprocess"]
        feat_names = get_feature_names_from_column_transformer(pre)
        final_est = extract_final_estimator(best_pipe)
        plot_feature_importance(final_est, feat_names, figs_dir / "feature_importance.png", top_k=20)
    except Exception:
        pass

    # Build meta with versions
    try:
        classes = list(best_pipe.named_steps["clf"].classes_)  # type: ignore
    except Exception:
        classes = class_labels

    data_files = [str(Path(p)) for p in args.data]
    checksums = {str(Path(p)): sha256_file(Path(p)) for p in args.data}
    def _ver(mod: str):
        try:
            m = importlib.import_module(mod)
            return getattr(m, "__version__", None)
        except Exception:
            return None
    versions = {
        "python": platform.python_version(),
        "pandas": pd.__version__,
        "numpy": np.__version__,
        "sklearn": _ver("sklearn"),
        "imblearn": _ver("imblearn"),
        "xgboost": _ver("xgboost"),
        "lightgbm": _ver("lightgbm"),
        "scipy": _ver("scipy"),
        "matplotlib": _ver("matplotlib"),
    }
    meta = {
        "task": args.task,
        "target": args.target,
        "classes": classes,
        "positive_label": pos_label,
        "threshold": thr,
        "threshold_info": thr_info,
        "calibration": args.calibrate,
        "model": args.model,
        "use_smote": bool(args.use_smote),
        "class_weight": args.class_weight,
        "cv_folds": args.cv_folds,
        "seed": args.seed,
        "feature_numeric": spec.numeric,
        "feature_categorical": spec.categorical,
        "data_files": data_files,
        "data_sha256": checksums,
        "label_map": args.label_map,
        "timestamp": ts,
        "versions": versions,
    }
    (run_dir / "meta.json").write_text(json.dumps(meta, indent=2))

    print(f"Saved run artifacts to {run_dir}")


if __name__ == "__main__":
    main()
