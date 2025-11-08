from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np
import pandas as pd

from ..services.artifacts import ModelArtifacts


@dataclass
class PredictionOutput:
  labels: List[str]
  probabilities: Optional[List[float]]


class AIModel:
  """
  Thin wrapper around the loaded sklearn pipeline to provide a stable
  interface for single-row inference and optional probability outputs.
  """

  def __init__(self, artifacts: ModelArtifacts) -> None:
    self.artifacts = artifacts
    self.pipeline = artifacts.pipeline
    self.positive_label = artifacts.positive_label

  def predict(self, features: pd.DataFrame) -> PredictionOutput:
    preds = self.pipeline.predict(features)
    proba: Optional[List[float]] = None

    if hasattr(self.pipeline, "predict_proba"):
      probs = self.pipeline.predict_proba(features)
      # Default to positive label column when available, else use second column for binary.
      if self.positive_label and hasattr(self.pipeline, "classes_") and self.positive_label in list(self.pipeline.classes_):
        col_idx = list(self.pipeline.classes_).index(self.positive_label)
      else:
        col_idx = 1 if probs.shape[1] > 1 else 0
      proba = probs[:, col_idx].astype(np.float64).tolist()

    return PredictionOutput(labels=[str(x) for x in preds.tolist()], probabilities=proba)

  def explain_last(self, features: pd.DataFrame, top_k: int = 5) -> List[Tuple[str, float]]:
    """
    Best-effort feature contributions:
    - Pull transformed feature names from a ColumnTransformer step named "preprocess" if available.
    - Locate an estimator step ("clf" or any step with coef_ / feature_importances_).
    - Rank absolute weights and return top_k pairs.
    Falls back to an empty list when unavailable.
    """
    try:
      names: List[str] | None = None
      if hasattr(self.pipeline, "named_steps"):
        pre = self.pipeline.named_steps.get("preprocess")
        if pre is not None and hasattr(pre, "get_feature_names_out"):
          try:
            names = list(pre.get_feature_names_out())  # type: ignore[arg-type]
          except Exception:
            names = None

      # Find an estimator with usable importances/coefficients
      est = None
      if hasattr(self.pipeline, "named_steps"):
        # Prefer conventional name
        est = self.pipeline.named_steps.get("clf") or self.pipeline.named_steps.get("classifier")
        if est is None:
          for _, step in self.pipeline.named_steps.items():
            if hasattr(step, "coef_") or hasattr(step, "feature_importances_"):
              est = step
              break
      if est is None:
        return []

      # Unwrap calibrated models if present
      base = None
      for attr in ("base_estimator", "estimator"):
        if hasattr(est, attr):
          base = getattr(est, attr)
          break
      if base is None and hasattr(est, "calibrated_classifiers_"):
        try:
          base = est.calibrated_classifiers_[0].estimator
        except Exception:
          base = None
      if base is not None:
        est = base

      vec: Optional[np.ndarray] = None
      if hasattr(est, "coef_"):
        coef = np.squeeze(getattr(est, "coef_"))
        vec = np.abs(coef)
      elif hasattr(est, "feature_importances_"):
        fi = np.squeeze(getattr(est, "feature_importances_"))
        vec = np.abs(fi)
      if vec is None:
        return []

      # Feature names fallback
      if names is None:
        if hasattr(self.pipeline, "feature_names_in_"):
          names = list(self.pipeline.feature_names_in_)
        else:
          names = list(self.artifacts.required_features)

      n = min(len(names), int(vec.shape[0]))
      pairs = list(zip(names[:n], vec[:n].tolist()))
      pairs.sort(key=lambda t: float(t[1]), reverse=True)
      return pairs[:top_k]
    except Exception:
      return []
