from __future__ import annotations

from typing import Dict

from fastapi import APIRouter, Query

from ..schemas import HistoryItem, HistoryResponse, MetricsResponse


router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("", response_model=MetricsResponse)
async def get_metrics() -> MetricsResponse:
  try:
    from ..main import history_store as _history  # type: ignore
  except Exception:
    return MetricsResponse(counts_by_label={})

  counts: Dict[str, int] = {}
  for item in _history.list(limit=1000):
    counts[item.label] = counts.get(item.label, 0) + 1
  return MetricsResponse(counts_by_label=counts)


@router.get("/history", response_model=HistoryResponse)
async def get_history(limit: int = Query(100, ge=1, le=1000)) -> HistoryResponse:
  try:
    from ..main import history_store as _history  # type: ignore
  except Exception:
    return HistoryResponse(items=[])

  items = [
    HistoryItem(
      id=r.id,
      timestamp=r.timestamp,
      label=r.label,
      probability=r.probability,
      payload=r.payload,
    )
    for r in _history.list(limit=limit)
  ]
  return HistoryResponse(items=items)

