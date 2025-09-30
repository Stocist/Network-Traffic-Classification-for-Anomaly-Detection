from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional, Tuple, List

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    classification_report,
    confusion_matrix,
    f1_score,
    roc_curve,
    auc,
    precision_recall_curve,
    average_precision_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
import warnings


def compute_classification_metrics(y_true, y_pred) -> Dict:
    cm = confusion_matrix(y_true, y_pred)
    macro_f1 = f1_score(y_true, y_pred, average="macro")
    report = classification_report(y_true, y_pred, output_dict=True)
    return {
        "macro_f1": macro_f1,
        "confusion_matrix": cm.tolist(),
        "classification_report": report,
    }


def save_confusion_matrix(
    y_true,
    y_pred,
    outpath: str | Path,
    labels: Optional[list] = None,
    title: Optional[str] = None,
):
    outpath = Path(outpath)
    outpath.parent.mkdir(parents=True, exist_ok=True)
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=labels)
    fig, ax = plt.subplots(figsize=(6, 6))
    disp.plot(ax=ax, cmap="Blues", colorbar=False)
    if title:
        ax.set_title(title)
    fig.tight_layout()
    fig.savefig(outpath, dpi=160)
    plt.close(fig)


def plot_pr_curve(y_true, scores, outpath: str | Path, pos_label=None, title: Optional[str] = None) -> Dict:
    precision, recall, _ = precision_recall_curve(y_true, scores, pos_label=pos_label)
    ap = average_precision_score(y_true, scores, pos_label=pos_label)
    outpath = Path(outpath)
    outpath.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(6, 5))
    ax.plot(recall, precision, label=f"AP={ap:.3f}")
    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_title(title or "Precision-Recall Curve")
    ax.legend()
    fig.tight_layout()
    fig.savefig(outpath, dpi=160)
    plt.close(fig)
    return {"ap": float(ap)}


def plot_roc_curve(y_true, scores, outpath: str | Path, pos_label=None, title: Optional[str] = None) -> Dict:
    fpr, tpr, _ = roc_curve(y_true, scores, pos_label=pos_label)
    roc_auc = auc(fpr, tpr)
    outpath = Path(outpath)
    outpath.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(6, 5))
    ax.plot(fpr, tpr, label=f"AUC={roc_auc:.3f}")
    ax.plot([0, 1], [0, 1], "k--", alpha=0.4)
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title(title or "ROC Curve")
    ax.legend()
    fig.tight_layout()
    fig.savefig(outpath, dpi=160)
    plt.close(fig)
    return {"roc_auc": float(roc_auc)}


def best_f1_threshold(y_true, scores, pos_label=None) -> Tuple[float, float]:
    precision, recall, thresh = precision_recall_curve(y_true, scores, pos_label=pos_label)
    # Avoid division by zero
    f1 = (2 * precision * recall) / np.clip(precision + recall, 1e-12, None)
    idx = int(np.nanargmax(f1))
    if idx == len(thresh):
        # In some cases, the last threshold is not defined; back off by one
        idx = max(0, idx - 1)
    best_thr = float(thresh[idx]) if len(thresh) > 0 else 0.5
    return best_thr, float(np.nanmax(f1))


def threshold_for_precision(y_true, scores, precision_target: float, pos_label=None) -> Tuple[float, Dict]:
    precision, recall, thresh = precision_recall_curve(y_true, scores, pos_label=pos_label)
    idx = np.argmax(precision >= precision_target)
    if precision[idx] < precision_target:
        # Could not achieve target precision
        return 0.5, {"achieved": False, "precision": float(precision[idx]), "recall": float(recall[idx])}
    thr = float(thresh[min(idx, len(thresh) - 1)]) if len(thresh) > 0 else 0.5
    return thr, {"achieved": True, "precision": float(precision[idx]), "recall": float(recall[idx])}


def threshold_curve_plot(y_true, scores, outpath: str | Path, pos_label=None, title: Optional[str] = None):
    precision, recall, thresh = precision_recall_curve(y_true, scores, pos_label=pos_label)
    f1 = (2 * precision * recall) / np.clip(precision + recall, 1e-12, None)
    x = thresh if len(thresh) > 0 else np.array([0.5])
    if len(thresh) == 0:
        f1 = np.array([0])
        precision = np.array([0])
        recall = np.array([0])
    outpath = Path(outpath)
    outpath.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.plot(x, f1[:-1] if len(f1) == len(x) + 1 else f1, label="F1")
    ax.plot(x, precision[:-1] if len(precision) == len(x) + 1 else precision, label="Precision")
    ax.plot(x, recall[:-1] if len(recall) == len(x) + 1 else recall, label="Recall")
    ax.set_xlabel("Threshold")
    ax.set_ylabel("Score")
    ax.set_title(title or "Threshold curves")
    ax.legend()
    fig.tight_layout()
    fig.savefig(outpath, dpi=160)
    plt.close(fig)


def get_feature_names_from_column_transformer(ct) -> List[str]:
    feature_names: List[str] = []
    try:
        for name, trans, cols in ct.transformers_:
            if name == "remainder":
                continue
            if hasattr(trans, "get_feature_names_out"):
                names = trans.get_feature_names_out()
                feature_names.extend(names.tolist())
            else:
                # Pipeline: get last step
                if hasattr(trans, "steps") and len(trans.steps) > 0:
                    last_step = trans.steps[-1][1]
                    if hasattr(last_step, "get_feature_names_out"):
                        names = last_step.get_feature_names_out(cols)
                        feature_names.extend(names.tolist())
                    else:
                        if isinstance(cols, list):
                            feature_names.extend(cols)
                else:
                    if isinstance(cols, list):
                        feature_names.extend(cols)
    except Exception:
        # Fallback to raw feature list
        warnings.warn("Falling back to raw column names for feature names.")
        if hasattr(ct, "feature_names_in_"):
            feature_names = list(ct.feature_names_in_)
    return feature_names


def extract_final_estimator(pipe: Pipeline):
    est = pipe
    if hasattr(pipe, "named_steps") and "clf" in pipe.named_steps:
        est = pipe.named_steps["clf"]
    # CalibratedClassifierCV wraps the estimator
    if hasattr(est, "base_estimator"):
        try:
            return est.base_estimator
        except Exception:
            return est
    return est


def plot_feature_importance(estimator, feature_names: List[str], outpath: str | Path, top_k: int = 20, title: Optional[str] = None):
    outpath = Path(outpath)
    outpath.parent.mkdir(parents=True, exist_ok=True)
    importances = None
    try:
        if hasattr(estimator, "feature_importances_"):
            importances = np.asarray(estimator.feature_importances_)
        elif hasattr(estimator, "coef_"):
            coef = estimator.coef_
            importances = np.mean(np.abs(coef), axis=0) if coef.ndim > 1 else np.abs(coef)
    except Exception:
        importances = None
    if importances is None:
        return False
    idx = np.argsort(importances)[::-1][:top_k]
    names = [feature_names[i] if i < len(feature_names) else f"f{i}" for i in idx]
    vals = importances[idx]
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.barh(range(len(names))[::-1], vals[::-1])
    ax.set_yticks(range(len(names))[::-1])
    ax.set_yticklabels(names[::-1])
    ax.set_xlabel("Importance")
    ax.set_title(title or "Top feature importances")
    fig.tight_layout()
    fig.savefig(outpath, dpi=160)
    plt.close(fig)
    return True


def recall_at_fpr(y_true, scores, fpr_target: float, pos_label=None) -> Tuple[float, float]:
    fpr, tpr, _ = roc_curve(y_true, scores, pos_label=pos_label)
    idx = np.argmax(fpr >= fpr_target)
    return float(tpr[idx]), float(fpr[idx])


def orient_scores_if_needed(scores, y_labels, pos_label):
    """
    Ensure that higher scores correspond to the positive class.
    If mean score for positives < mean score for negatives, flip sign.
    """
    y = (pd.Series(y_labels).astype(str) == str(pos_label)).astype(int).values
    scores = np.asarray(scores)
    try:
        pos_mean = float(scores[y == 1].mean())
        neg_mean = float(scores[y == 0].mean())
    except Exception:
        return scores
    if np.isnan(pos_mean) or np.isnan(neg_mean):
        return scores
    return -scores if pos_mean < neg_mean else scores
