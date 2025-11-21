"""
Database convenience exports for async CRUD operations.

Provides a lightweight package interface so callers can simply import:

    from app.db import crud, get_db

without needing to know the internal module layout.
"""

from . import crud  # re-export CRUD helpers
from .database import get_db  # async session generator

__all__ = ["crud", "get_db"]

