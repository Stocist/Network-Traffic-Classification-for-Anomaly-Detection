from __future__ import annotations

from threading import Lock
from typing import Dict, Optional

import pandas as pd


class ResultStore:
  """In-memory storage for latest inference results."""

  def __init__(self) -> None:
    self._lock = Lock()
    self._data: Dict[str, pd.DataFrame] = {}

  def set(self, key: str, df: pd.DataFrame) -> None:
    with self._lock:
      self._data[key] = df.copy()

  def get(self, key: str) -> Optional[pd.DataFrame]:
    with self._lock:
      df = self._data.get(key)
      if df is None:
        return None
      return df.copy()

  def pop(self, key: str) -> Optional[pd.DataFrame]:
    with self._lock:
      return self._data.pop(key, None)
