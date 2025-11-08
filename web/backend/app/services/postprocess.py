from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from ..models.ai_model import AIModel
from ..schemas import FeatureContribution, PredictJSONResponse


def make_response(model: AIModel, contributions: List[tuple[str, float]]) -> PredictJSONResponse:
  # contributions sorted by magnitude (desc)
  features = [FeatureContribution(name=n, contribution=float(v)) for n, v in contributions]
  # Placeholder values are passed in by the caller; this function focuses on formatting.
  now = datetime.now(timezone.utc)
  # The caller will patch label/probability before returning.
  return PredictJSONResponse(label="", probability=0.0, top_features=features, timestamp=now)

