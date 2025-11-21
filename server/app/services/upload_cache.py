"""
In-memory cache for temporary upload data snapshots.

Used to avoid resending large table payloads (e.g., auto-approval lite flow).
"""

from __future__ import annotations

import time
from threading import Lock
from typing import Any, Dict, Optional


class _UploadCache:
    def __init__(self) -> None:
        self._lock = Lock()
        self._store: Dict[str, Dict[str, Any]] = {}

    def set(self, upload_id: str, data: Dict[str, Any], ttl_seconds: int = 900) -> None:
        """Store snapshot for upload_id with TTL (default 15 minutes)."""
        expires_at = time.time() + ttl_seconds
        with self._lock:
            self._store[upload_id] = {
                "data": data,
                "expires_at": expires_at,
            }

    def get(self, upload_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve snapshot if present and not expired."""
        with self._lock:
            entry = self._store.get(upload_id)
            if not entry:
                return None

            if entry["expires_at"] < time.time():
                # Expired – prune and return None
                self._store.pop(upload_id, None)
                return None

            return entry["data"]

    def delete(self, upload_id: str) -> None:
        with self._lock:
            self._store.pop(upload_id, None)

    def purge_expired(self) -> None:
        """Remove expired entries (optional housekeeping)."""
        now = time.time()
        with self._lock:
            expired_keys = [key for key, entry in self._store.items() if entry["expires_at"] < now]
            for key in expired_keys:
                self._store.pop(key, None)


upload_cache = _UploadCache()


