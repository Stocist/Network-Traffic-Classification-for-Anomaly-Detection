from __future__ import annotations

import io
from typing import List

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import settings
from .schemas import HealthResponse, PredictionResponse
from .services.artifacts import ModelArtifacts
from .services.prediction_service import PredictionService
from .services.store import ResultStore
from .services.history import HistoryStore
from .services.config_service import ConfigService
from .routers import predict as predict_router
from .routers import metrics as metrics_router
from .routers import config as config_router

app = FastAPI(
  title="Network Traffic Anomaly Detection API",
  version="0.1.0",
  description="Serve predictions from the trained logistic regression pipeline.",
)

origins: List[str]
if settings.allow_origins == "*":
  origins = ["*"]
else:
  origins = [origin.strip() for origin in settings.allow_origins.split(",") if origin.strip()]
# Support a wildcard or comma separated origin list so deployments can tighten CORS without code edits.

app.add_middleware(
  CORSMiddleware,
  allow_origins=origins,
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

# These singletons keep heavyweight artifacts in memory instead of reloading them per-request.
artifacts = ModelArtifacts(settings.model_path, settings.meta_path)
prediction_service = PredictionService(artifacts)
result_store = ResultStore()
history_store = HistoryStore(maxlen=1000)
config_service = ConfigService()


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
  model_loaded = artifacts is not None and artifacts.pipeline is not None
  return HealthResponse(status="ok", model_loaded=model_loaded)


@app.post("/api/predict", response_model=PredictionResponse)
async def predict(file: UploadFile = File(...)) -> PredictionResponse:
  filename = file.filename or "uploaded.csv"
  if not filename.lower().endswith(".csv"):
    raise HTTPException(status_code=400, detail="Only CSV files are supported.")

  file_bytes = await file.read()
  try:
    response, enriched_df = prediction_service.process_upload(file_bytes, filename)
  except ValueError as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from exc

  # Persist the enriched dataframe so the client can later download the same rows it inspected.
  result_store.set(response.result_id, enriched_df)
  return response


@app.get("/api/results/{result_id}/download")
async def download_csv(result_id: str) -> StreamingResponse:
  df = result_store.get(result_id)
  if df is None:
    raise HTTPException(status_code=404, detail="Result not found.")

  csv_bytes = df.to_csv(index=False).encode("utf-8")
  buffer = io.BytesIO(csv_bytes)
  # Stream the CSV so large responses do not need to be held in memory by FastAPI.
  headers = {"Content-Disposition": f'attachment; filename="predictions_{result_id}.csv"'}
  return StreamingResponse(buffer, media_type="text/csv", headers=headers)

# Mount Assignment-3 routers
app.include_router(predict_router.router)
app.include_router(metrics_router.router)
app.include_router(config_router.router)
