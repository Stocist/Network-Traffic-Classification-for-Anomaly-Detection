from __future__ import annotations

from threading import Lock

from ..schemas import AppConfig


class ConfigService:
  def __init__(self) -> None:
    self._lock = Lock()
    self._config = AppConfig()

  def get(self) -> AppConfig:
    with self._lock:
      return self._config.copy(deep=True)

  def update(self, cfg: AppConfig) -> AppConfig:
    with self._lock:
      self._config = cfg
      return self._config.copy(deep=True)

