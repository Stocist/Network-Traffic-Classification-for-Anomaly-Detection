from __future__ import annotations

from typing import Dict

import pandas as pd

from ..schemas import PredictRequest
from ..services.artifacts import ModelArtifacts


def request_to_features(req: PredictRequest, artifacts: ModelArtifacts) -> pd.DataFrame:
  """
  Map a single PredictRequest into a dataframe aligned with the model's
  expected input features. Unknown features are filled with reasonable defaults.
  """
  # Best-effort mapping based on common flow column names.
  base: Dict[str, object] = {
    "src_ip": req.src_ip,
    "dst_ip": req.dst_ip,
    "src_port": req.src_port,
    "dst_port": req.dst_port,
    "protocol_type": req.protocol,  # common canonical name in metadata
    "protocol": req.protocol,       # include raw in case metadata expects this
    "bytes": req.pkt_bytes,
    "pkt_bytes": req.pkt_bytes,
    "packets": req.pkt_count,
    "pkt_count": req.pkt_count,
    "inter_arrival_ms": req.inter_arrival_ms,
    "duration": req.inter_arrival_ms / 1000.0 if req.inter_arrival_ms else 0.0,
  }

  # Ensure all required features are present in the row; fill with neutral defaults.
  row: Dict[str, object] = {}
  numeric = set(artifacts.meta.get("feature_numeric") or [])
  categorical = set(artifacts.meta.get("feature_categorical") or [])
  for col in artifacts.required_features:
    if col in base:
      row[col] = base[col]
    elif col in numeric:
      row[col] = 0
    elif col in categorical:
      row[col] = "unknown"
    else:
      row[col] = None

  df = pd.DataFrame([row])
  # Keep columns ordered per the training metadata to reduce surprises downstream.
  df = df.loc[:, artifacts.ordered_feature_columns(df.columns)]
  return df

