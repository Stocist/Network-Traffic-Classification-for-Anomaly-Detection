from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ValidationReport(BaseModel):
  missing_columns: List[str] = Field(default_factory=list)
  extra_columns: List[str] = Field(default_factory=list)
  row_count: int = 0
  max_rows_exceeded: bool = False
  downsampled: bool = False
  original_row_count: Optional[int] = None
  sampling_fraction: Optional[float] = None


class PredictionRow(BaseModel):
  row_index: int
  prediction: str
  score: Optional[float] = None
  data: Dict[str, Any]


class LabelBreakdown(BaseModel):
  counts: Dict[str, int]


class TimelinePoint(BaseModel):
  timestamp: str
  count: int


class PortCount(BaseModel):
  port: str
  count: int


class ChartsPayload(BaseModel):
  label_breakdown: LabelBreakdown
  anomalies_over_time: List[TimelinePoint]
  top_destination_ports: List[PortCount]


class PredictionResponse(BaseModel):
  result_id: str
  validation: ValidationReport
  columns: List[str]
  predictions: List[PredictionRow]
  charts: ChartsPayload


class HealthResponse(BaseModel):
  status: str
