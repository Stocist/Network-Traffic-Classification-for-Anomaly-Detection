from __future__ import annotations

from fastapi import APIRouter

from ..schemas import HealthResponse
from ..services.artifacts import ModelArtifacts


router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
  try:
    # Try to resolve artifacts via the main app singletons if present.
    from ..main import artifacts as _artifacts  # type: ignore

    model_loaded = _artifacts is not None and _artifacts.pipeline is not None
  except Exception:
    model_loaded = False
  return HealthResponse(status="ok", model_loaded=model_loaded)

