from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
from pydantic import field_validator
import re
from datetime import datetime


# ===== Existing CSV-based response models =====


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
  attack_taxonomy: Dict[str, int] = Field(default_factory=dict)
  port_attack_heatmap: Dict[str, Any] = Field(default_factory=dict)
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
  model_loaded: bool | None = None


# ===== Assignment 3 JSON prediction schemas =====

_IPV4_REGEX = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")


class FeatureContribution(BaseModel):
  name: str
  contribution: float


class PredictRequest(BaseModel):
  src_ip: str
  dst_ip: str
  src_port: int = Field(ge=1, le=65535)
  dst_port: int = Field(ge=1, le=65535)
  protocol: str = Field(pattern=r"^(TCP|UDP|ICMP|GRE|ESP|AH|OTHER)$", description="One of TCP, UDP, ICMP, GRE, ESP, AH, OTHER")
  pkt_bytes: int = Field(ge=0)
  pkt_count: int = Field(ge=1)
  inter_arrival_ms: float = Field(ge=0)

  @field_validator("src_ip", "dst_ip")
  @classmethod
  def _validate_ipv4(cls, v: str) -> str:
    if not _IPV4_REGEX.match(v):
      raise ValueError(f"Invalid IP format: {v}")
    octets = v.split(".")
    if any(int(o) > 255 for o in octets):
      raise ValueError(f"Invalid IP octet in: {v}")
    return v


class PredictJSONResponse(BaseModel):
  label: str
  probability: float
  top_features: List[FeatureContribution] = Field(default_factory=list)
  timestamp: datetime


class MetricsResponse(BaseModel):
  counts_by_label: Dict[str, int]
  accuracy: Optional[float] = None
  f1: Optional[float] = None


class HistoryItem(BaseModel):
  id: str
  timestamp: datetime
  label: str
  probability: float
  payload: Dict[str, Any]


class HistoryResponse(BaseModel):
  items: List[HistoryItem]


class AppConfig(BaseModel):
  threshold_anomaly: float = Field(0.5, ge=0.0, le=1.0)
  live_mode: bool = False
