from __future__ import annotations

import io
from collections import Counter
from typing import Any, Dict, List, Optional
from uuid import uuid4

import numpy as np
import pandas as pd

from ..config import settings
from ..schemas import ChartsPayload, LabelBreakdown, PortCount, PredictionResponse, PredictionRow, TimelinePoint, ValidationReport
from .artifacts import ModelArtifacts


class PredictionService:
  COLUMN_ALIASES: Dict[str, str] = {
    "proto": "protocol_type",
    "state": "flag",
  }
  DOWNSAMPLE_FRACTION: float = 0.8

  def __init__(self, artifacts: ModelArtifacts) -> None:
    self.artifacts = artifacts

  def process_upload(self, file_bytes: bytes, filename: str) -> PredictionResponse:
    """End-to-end inference flow that cleans, validates, scores, and packages the uploaded dataset."""
    df = self._load_csv(file_bytes, filename)
    df = self._harmonize_columns(df)
    df, validation = self._validate(df)
    feature_df = df.loc[:, self.artifacts.required_features]
    predictions, scores = self._predict(feature_df)

    enriched_df = df.copy()
    enriched_df["prediction"] = predictions
    if scores is not None:
      enriched_df["score"] = scores

    result_id = uuid4().hex

    charts = self._build_charts(enriched_df, scores)
    prediction_rows = self._build_rows(enriched_df, scores)

    response = PredictionResponse(
      result_id=result_id,
      validation=validation,
      columns=list(enriched_df.columns),
      predictions=prediction_rows,
      charts=charts,
    )

    return response, enriched_df

  def _load_csv(self, file_bytes: bytes, filename: str) -> pd.DataFrame:
    """Parse raw upload bytes into a dataframe while handling BOMs and common encoding fallbacks."""
    if not file_bytes:
      raise ValueError("Uploaded file is empty.")

    try:
      decoded = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
      decoded = file_bytes.decode("latin-1")

    try:
      df = pd.read_csv(io.StringIO(decoded))
    except Exception as exc:  # pragma: no cover - pandas error message is adequate
      raise ValueError(f"Unable to parse CSV file {filename}: {exc}") from exc

    if df.empty:
      raise ValueError("Uploaded CSV contains no rows.")

    return df

  def _harmonize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
    """Rename common aliases so CSVs with alternate headers still map to the model features."""
    rename_map = {}
    for alias, canonical in self.COLUMN_ALIASES.items():
      if alias in df.columns and canonical not in df.columns:
        rename_map[alias] = canonical
    if rename_map:
      df = df.rename(columns=rename_map)
    return df

  def _validate(self, df: pd.DataFrame) -> tuple[pd.DataFrame, ValidationReport]:
    """Ensure required features exist and downsample extremely large uploads to keep processing bounded."""
    missing = [col for col in self.artifacts.required_features if col not in df.columns]
    if missing:
      raise ValueError(f"Uploaded CSV is missing required columns: {', '.join(missing)}")

    extra = [c for c in df.columns if c not in self.artifacts.required_features]
    original_row_count = len(df)
    max_rows_exceeded = original_row_count > settings.max_rows
    if max_rows_exceeded:
      # Keep a deterministic subset whenever the input is huge so downstream charts stay responsive.
      target_fraction = self.DOWNSAMPLE_FRACTION
      sample_size = max(int(original_row_count * target_fraction), 1)
      sample_size = min(sample_size, settings.max_rows)
      df = df.sample(n=sample_size, random_state=42).sort_index()
      sample_fraction = len(df) / original_row_count if original_row_count else None
    else:
      sample_fraction = None

    report = ValidationReport(
      missing_columns=missing,
      extra_columns=extra,
      row_count=len(df),
      max_rows_exceeded=max_rows_exceeded,
      downsampled=max_rows_exceeded,
      original_row_count=original_row_count if max_rows_exceeded else None,
      sampling_fraction=sample_fraction,
    )
    return df, report

  def _predict(self, features: pd.DataFrame) -> tuple[List[str], Optional[List[float]]]:
    """Run the model pipeline and extract class probabilities when available."""
    preds = self.artifacts.pipeline.predict(features)
    scores: Optional[List[float]] = None

    if hasattr(self.artifacts.pipeline, "predict_proba"):
      proba = self.artifacts.pipeline.predict_proba(features)
      positive_label = self.artifacts.positive_label
      if positive_label and positive_label in self.artifacts.pipeline.classes_:
        pos_index = list(self.artifacts.pipeline.classes_).index(positive_label)
      else:
        # Default to the second column for binary problems or the sole column for one-class scores.
        pos_index = 1 if proba.shape[1] > 1 else 0
      scores = proba[:, pos_index].astype(np.float64).tolist()

    return preds.tolist(), scores

  def _build_rows(self, df: pd.DataFrame, scores: Optional[List[float]]) -> List[PredictionRow]:
    """Convert dataframe rows into serializable payloads for the UI table."""
    rows: List[PredictionRow] = []
    score_column = "score" if scores is not None else None

    for idx, row in df.iterrows():
      data_payload = {k: self._to_serializable(v) for k, v in row.items() if k not in {"prediction", "score"}}
      score_value = None
      if score_column:
        raw_score = row.get(score_column)
        if pd.notna(raw_score):
          score_value = float(raw_score)
      rows.append(
        PredictionRow(
          row_index=int(idx),
          prediction=str(row["prediction"]),
          score=score_value,
          data=data_payload,
        )
      )
    return rows

  def _build_charts(self, df: pd.DataFrame, scores: Optional[List[float]]) -> ChartsPayload:
    """Build derived aggregates that power the dashboard visualisations."""
    label_counts = Counter(df["prediction"])

    timeline = self._timeline(df)
    port_counts = self._top_ports(df)

    return ChartsPayload(
      label_breakdown=LabelBreakdown(counts=dict(label_counts)),
      anomalies_over_time=timeline,
      top_destination_ports=port_counts,
    )

  def _timeline(self, df: pd.DataFrame) -> List[TimelinePoint]:
    """Aggregate anomalies by minute using the best-effort timestamp column heuristic."""
    timestamp_col = self._find_timestamp_column(df)
    if not timestamp_col:
      return []

    timestamp_series = pd.to_datetime(df[timestamp_col], errors="coerce")
    mask_valid = timestamp_series.notna()
    if not mask_valid.any():
      return []

    positive_label = self.artifacts.positive_label or "Attack"
    anomaly_mask = (df["prediction"] == positive_label) & mask_valid
    grouped = (
      timestamp_series[anomaly_mask]
      .dt.floor("1min")
      .value_counts()
      .sort_index()
    )

    return [
      TimelinePoint(timestamp=ts.isoformat(), count=int(count))
      for ts, count in grouped.items()
    ]

  def _top_ports(self, df: pd.DataFrame) -> List[PortCount]:
    """Count the most frequent destination ports among anomalous records."""
    port_col = self._find_port_column(df)
    if not port_col:
      return []

    positive_label = self.artifacts.positive_label or "Attack"
    anomaly_df = df[df["prediction"] == positive_label]
    if anomaly_df.empty:
      return []

    counts = (
      anomaly_df[port_col]
      .astype(str)
      .replace({"nan": "Unknown", "None": "Unknown"})
      .value_counts()
      .head(10)
    )

    return [PortCount(port=str(port), count=int(count)) for port, count in counts.items()]

  @staticmethod
  def _to_serializable(value: Any) -> Any:
    if pd.isna(value):
      return None
    if isinstance(value, (np.integer, np.floating)):
      return value.item()
    return value

  @staticmethod
  def _find_timestamp_column(df: pd.DataFrame) -> Optional[str]:
    candidates = ["timestamp", "time", "event_time", "datetime", "capture_time"]
    lower_map = {c.lower(): c for c in df.columns}
    for cand in candidates:
      if cand in lower_map:
        return lower_map[cand]
    for col in df.columns:
      if "time" in col.lower():
        return col
    return None

  @staticmethod
  def _find_port_column(df: pd.DataFrame) -> Optional[str]:
    candidates = ["dst_port", "dport", "destination_port", "dest_port", "dstport"]
    lower_map = {c.lower(): c for c in df.columns}
    for cand in candidates:
      if cand in lower_map:
        return lower_map[cand]
    for col in df.columns:
      if "port" in col.lower():
        return col
    return None
