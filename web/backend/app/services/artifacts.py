from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Sequence

from joblib import load

class ModelArtifacts:
  """Utility wrapper to keep pipeline and metadata together."""

  def __init__(self, model_path: Path, meta_path: Path) -> None:
    model_path = model_path.resolve()
    meta_path = meta_path.resolve()

    if not model_path.exists():
      raise FileNotFoundError(f"Model artifact not found at {model_path}")
    if not meta_path.exists():
      raise FileNotFoundError(f"Meta artifact not found at {meta_path}")

    self.model_path = model_path
    self.meta_path = meta_path
    self.pipeline = load(model_path)
    self.meta: Dict[str, Any] = json.loads(meta_path.read_text())

    numeric = self.meta.get("feature_numeric") or []
    categorical = self.meta.get("feature_categorical") or []
    self.required_features: List[str] = [*numeric, *categorical]
    self.positive_label: str | None = self.meta.get("positive_label")
    self.classes: Sequence[str] = tuple(self.meta.get("classes") or ())

  def ordered_feature_columns(self, df_columns: Sequence[str]) -> List[str]:
    """Return columns ordered with required features first, extras at the end."""
    seen = set()
    ordered = []
    for col in self.required_features:
      if col in df_columns and col not in seen:
        ordered.append(col)
        seen.add(col)
    extras = [c for c in df_columns if c not in seen]
    ordered.extend(extras)
    return ordered
