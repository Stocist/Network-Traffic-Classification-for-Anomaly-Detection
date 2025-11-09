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
    
    # * Use the fixed improved model with correct feature types
    improved_model_dir = root / "models" / "improved_model_fixed"
    if (improved_model_dir / "pipeline.joblib").exists():
      default_model = improved_model_dir / "pipeline.joblib"
      default_meta = improved_model_dir / "meta.json"
    else:
      # Fallback to original model
      default_model = artifacts_dir / "pipeline.joblib"
      default_meta = artifacts_dir / "meta.json"
    
    self.model_path = Path(os.getenv("MODEL_PATH", default_model)).resolve()
    self.meta_path = Path(os.getenv("META_PATH", default_meta)).resolve()
    self.allow_origins = os.getenv("CORS_ALLOW_ORIGINS", "*")
    self.max_rows = int(os.getenv("MAX_PREDICTION_ROWS", "50000"))


settings = Settings()
