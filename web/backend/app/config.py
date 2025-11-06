from __future__ import annotations

import os
from pathlib import Path


def project_root() -> Path:
  return Path(__file__).resolve().parents[3]


class Settings:
  """Application settings with defaults that can be overridden via environment variables."""

  def __init__(self) -> None:
    root = project_root()
    artifacts_dir = root / "web" / "backend" / "artifacts"
    self.model_path = Path(os.getenv("MODEL_PATH", artifacts_dir / "pipeline.joblib")).resolve()
    self.meta_path = Path(os.getenv("META_PATH", artifacts_dir / "meta.json")).resolve()
    self.allow_origins = os.getenv("CORS_ALLOW_ORIGINS", "*")
    self.max_rows = int(os.getenv("MAX_PREDICTION_ROWS", "50000"))


settings = Settings()
