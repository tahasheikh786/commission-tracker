"""
Cancellation Manager Service

This service manages extraction cancellation state and provides
fast checking for cancellation requests with cleanup callback support.
"""

import asyncio
from typing import Dict, Set, Callable, List, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class CancellationManager:
    """Singleton manager for tracking cancelled extractions with cleanup support."""
    
    _instance = None
    _cancelled_uploads: Set[str] = set()
    _cancellation_times: Dict[str, datetime] = {}
    _cancellation_callbacks: Dict[str, List[Callable]] = {}  # NEW: Callbacks for cleanup
    _lock = asyncio.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(CancellationManager, cls).__new__(cls)
        return cls._instance
    
    async def mark_cancelled(self, upload_id: str, cleanup_callback: Optional[Callable] = None) -> None:
        """
        Mark an upload as cancelled with optional cleanup callback.
        
        Args:
            upload_id: The upload ID to cancel
            cleanup_callback: Optional async function to call for cleanup
        """
        async with self._lock:
            self._cancelled_uploads.add(upload_id)
            self._cancellation_times[upload_id] = datetime.utcnow()
            
            if cleanup_callback:
                if upload_id not in self._cancellation_callbacks:
                    self._cancellation_callbacks[upload_id] = []
                self._cancellation_callbacks[upload_id].append(cleanup_callback)
            
            logger.info(f"✅ Marked upload {upload_id} as cancelled immediately")
    
    async def execute_cleanup(self, upload_id: str) -> None:
        """Execute all registered cleanup callbacks for cancelled upload."""
        async with self._lock:
            if upload_id in self._cancellation_callbacks:
                callbacks = self._cancellation_callbacks[upload_id]
                logger.info(f"🧹 Executing {len(callbacks)} cleanup callbacks for {upload_id}")
                
                for callback in callbacks:
                    try:
                        await callback()
                        logger.info(f"✅ Cleanup callback executed successfully")
                    except Exception as e:
                        logger.error(f"❌ Cleanup callback failed for {upload_id}: {e}")
                
                # Clear callbacks after execution
                del self._cancellation_callbacks[upload_id]
    
    async def is_cancelled(self, upload_id: str) -> bool:
        """Check if an upload is cancelled."""
        async with self._lock:
            return upload_id in self._cancelled_uploads
    
    async def clear_cancelled(self, upload_id: str) -> None:
        """Remove an upload from cancelled set (after processing)."""
        async with self._lock:
            self._cancelled_uploads.discard(upload_id)
            self._cancellation_times.pop(upload_id, None)
            self._cancellation_callbacks.pop(upload_id, None)
            logger.info(f"Cleared cancellation status for upload {upload_id}")
    
    async def check_cancellation(self, upload_id: str) -> None:
        """
        Check if extraction is cancelled and raise CancelledError if it is.
        This should be called periodically during long-running operations.
        """
        if await self.is_cancelled(upload_id):
            logger.info(f"🛑 Extraction cancelled for upload {upload_id}")
            raise asyncio.CancelledError(f"Extraction cancelled for upload {upload_id}")
    
    def cleanup_old_cancellations(self, hours: int = 24) -> None:
        """Clean up old cancellation records older than specified hours."""
        # This would be called periodically by a background task
        pass

# Global instance
cancellation_manager = CancellationManager()
