from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import datetime
from threading import Lock
from typing import Deque, Dict, List


@dataclass
class HistoryRecord:
  id: str
  timestamp: datetime
  label: str
  probability: float
  payload: Dict[str, object]


class HistoryStore:
  def __init__(self, maxlen: int = 1000) -> None:
    self._items: Deque[HistoryRecord] = deque(maxlen=maxlen)
    self._lock = Lock()

  def push(self, record: HistoryRecord) -> None:
    with self._lock:
      self._items.appendleft(record)

  def list(self, limit: int = 100) -> List[HistoryRecord]:
    with self._lock:
      return list(list(self._items)[: max(0, limit)])

