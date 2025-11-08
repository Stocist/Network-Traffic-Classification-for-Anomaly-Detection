from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from ..models.ai_model import AIModel
from ..schemas import PredictJSONResponse, PredictRequest
from ..services.artifacts import ModelArtifacts
from ..services.history import HistoryRecord
from ..services.preprocess import request_to_features


router = APIRouter(prefix="/predict", tags=["predict"])


@router.post("", response_model=PredictJSONResponse)
async def predict_single(payload: PredictRequest) -> PredictJSONResponse:
  try:
    # Singletons defined in main for reuse.
    from ..main import artifacts as _artifacts  # type: ignore
    from ..main import prediction_service as _pred_service  # noqa: F401  # keep for parity
    from ..main import history_store as _history  # type: ignore
  except Exception as exc:  # pragma: no cover - import guard
    raise HTTPException(status_code=500, detail="Model artifacts unavailable") from exc

  model = AIModel(_artifacts)
  features = request_to_features(payload, _artifacts)
  out = model.predict(features)
  if not out.labels:
    raise HTTPException(status_code=500, detail="Empty model response")

  label = out.labels[0]
  prob = float(out.probabilities[0]) if out.probabilities else 0.0

  # Feature contributions are best-effort heuristics
  contrib = model.explain_last(features, top_k=5)
  ts = datetime.now(timezone.utc)

  # Push into history for live updates
  _history.push(HistoryRecord(
    id=uuid4().hex,
    timestamp=ts,
    label=label,
    probability=prob,
    payload=payload.dict(),
  ))

  return PredictJSONResponse(
    label=label,
    probability=prob,
    top_features=[{"name": n, "contribution": float(v)} for n, v in contrib],
    timestamp=ts,
  )

