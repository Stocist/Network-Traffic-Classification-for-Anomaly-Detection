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
    Best-effort feature contributions. If the pipeline exposes coefficients aligned to
    feature names, return absolute-weight ranking. Otherwise return an empty list.
    """
    try:
      # Many sklearn transformers expose feature_names_in_ at the pipeline level;
      # if unavailable we fall back to required feature ordering from metadata.
      if hasattr(self.pipeline, "feature_names_in_"):
        names = list(self.pipeline.feature_names_in_)
      else:
        names = list(self.artifacts.required_features)

      # Attempt to locate a final estimator with coef_. This is a heuristic.
      clf = getattr(self.pipeline, "named_steps", {}).get("classifier")
      coef = getattr(clf, "coef_", None)
      if coef is None:
        return []
      weights = np.abs(np.squeeze(coef))
      pairs = list(zip(names[: len(weights)], weights[: len(names)]))
      pairs.sort(key=lambda t: float(t[1]), reverse=True)
      return pairs[:top_k]
    except Exception:
      return []

