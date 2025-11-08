from __future__ import annotations

from fastapi import APIRouter

from ..schemas import AppConfig


router = APIRouter(prefix="/config", tags=["config"])


@router.get("", response_model=AppConfig)
async def get_config() -> AppConfig:
  from ..main import config_service as _cfg  # type: ignore
  return _cfg.get()


@router.put("", response_model=AppConfig)
async def put_config(cfg: AppConfig) -> AppConfig:
  from ..main import config_service as _cfg  # type: ignore
  return _cfg.update(cfg)

