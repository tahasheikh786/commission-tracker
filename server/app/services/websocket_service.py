"""
WebSocket service for real-time progress tracking during document extraction.
Enhanced with timeout management and keepalive functionality for large file processing.
"""

import asyncio
import json
import logging
from collections import deque
from typing import Dict, Set, Any, Optional
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime
import uuid
import sys
import os

# Add parent directory to path to import config
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from config.timeouts import timeout_settings

logger = logging.getLogger(__name__)

class ConnectionManager:
    """
    Manages WebSocket connections for real-time progress updates.
    Enhanced with timeout management and keepalive for large file processing.
    """
    
    def __init__(self):
        # Active connections: {upload_id: {session_id: websocket}}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        # Connection metadata: {session_id: {upload_id, user_id, connected_at}}
        self.connection_metadata: Dict[str, Dict[str, Any]] = {}
        
        # Configure longer timeouts for large file processing
        self.websocket_timeout = timeout_settings.websocket_connection
        self.keepalive_timeout = timeout_settings.websocket_keepalive
        self.ping_interval = timeout_settings.websocket_ping_interval  # Ultra-aggressive ping interval
        self.progress_interval = timeout_settings.websocket_progress_interval
        
        # Track keepalive tasks
        self.keepalive_tasks: Dict[str, asyncio.Task] = {}
        self.progress_tasks: Dict[str, asyncio.Task] = {}
        
        # Message backlog for replay (per upload_id)
        self.message_backlog: Dict[str, deque] = {}
        self.backlog_limit = int(os.getenv("WEBSOCKET_BACKLOG_LIMIT", "50"))
    
    async def connect(self, websocket: WebSocket, upload_id: str, session_id: str, user_id: str = None):
        """
        Accept a WebSocket connection and register it.
        Enhanced with timeout configuration and keepalive task for long-running processes.
        """
        await websocket.accept()
        
        # Configure WebSocket timeouts if supported
        if hasattr(websocket, 'timeout'):
            websocket.timeout = self.websocket_timeout
        
        if upload_id not in self.active_connections:
            self.active_connections[upload_id] = {}
        
        self.active_connections[upload_id][session_id] = websocket
        self.connection_metadata[session_id] = {
            'upload_id': upload_id,
            'user_id': user_id,
            'connected_at': datetime.utcnow().isoformat(),
            'last_heartbeat': datetime.utcnow().isoformat()
        }
        
        logger.info(f"WebSocket connected: upload_id={upload_id}, session_id={session_id}, timeout={self.websocket_timeout}s")
        
        # Start keepalive task for long-running processes
        keepalive_key = f"{upload_id}:{session_id}"
        self.keepalive_tasks[keepalive_key] = asyncio.create_task(
            self._keepalive_task(websocket, upload_id, session_id)
        )
        self.progress_tasks[keepalive_key] = asyncio.create_task(
            self._progress_update_task(websocket, upload_id, session_id)
        )
        
        # Send initial connection confirmation
        await self.send_personal_message({
            'type': 'connection_established',
            'upload_id': upload_id,
            'session_id': session_id,
            'timeout_config': {
                'websocket_timeout': self.websocket_timeout,
                'keepalive_interval': self.ping_interval
            },
            'timestamp': datetime.utcnow().isoformat()
        }, upload_id, session_id, record_backlog=False)
        
        await self._replay_backlog(upload_id, session_id)
    
    async def _keepalive_task(self, websocket: WebSocket, upload_id: str, session_id: str):
        """Enhanced keepalive with aggressive ping schedule to prevent Render 1006 errors."""
        keepalive_key = f"{upload_id}:{session_id}"
        consecutive_failures = 0
        max_failures = 3
        
        try:
            while websocket.client_state.name == 'CONNECTED':
                await asyncio.sleep(self.ping_interval)
                
                # Check if connection still exists
                if upload_id not in self.active_connections or session_id not in self.active_connections[upload_id]:
                    break
                
                # Send keepalive ping
                try:
                    # Send keepalive ping with timestamp
                    await asyncio.wait_for(
                        self.send_personal_message(
                            {
                                'type': 'ping',
                                'timestamp': datetime.utcnow().isoformat(),
                                'keepalive': True,
                                'upload_id': upload_id,  # ✅ NEW: Include upload_id
                                'message': 'Connection active'
                            },
                            upload_id,
                            session_id,
                            record_backlog=False
                        ),
                        timeout=5.0
                    )
                    
                    # Reset failure counter
                    consecutive_failures = 0
                    
                    # Update last heartbeat
                    if session_id in self.connection_metadata:
                        self.connection_metadata[session_id]['last_heartbeat'] = \
                            datetime.utcnow().isoformat()
                    
                    logger.debug(f"💓 Keepalive ping sent: {upload_id}")
                    
                except asyncio.TimeoutError:
                    consecutive_failures += 1
                    logger.warning(
                        f"⚠️ Keepalive timeout ({consecutive_failures}/{max_failures}): {upload_id}"
                    )
                    
                    if consecutive_failures >= max_failures:
                        logger.error(f"🔴 Max failures reached, closing: {upload_id}")
                        break
                        
                except Exception as e:
                    consecutive_failures += 1
                    logger.warning(f"⚠️ Keepalive error ({consecutive_failures}/{max_failures}): {e}")
                    
                    if consecutive_failures >= max_failures:
                        break
                    
        except asyncio.CancelledError:
            logger.debug(f"🛑 Keepalive cancelled: {upload_id}")
        except Exception as e:
            logger.error(f"❌ Keepalive error: {e}")
        finally:
            if keepalive_key in self.keepalive_tasks:
                del self.keepalive_tasks[keepalive_key]

    async def _progress_update_task(self, websocket: WebSocket, upload_id: str, session_id: str):
        """Periodic progress heartbeat broadcasting lightweight updates."""
        task_key = f"{upload_id}:{session_id}"
        try:
            while websocket.client_state.name == 'CONNECTED':
                await asyncio.sleep(self.progress_interval)
                
                if upload_id not in self.active_connections or session_id not in self.active_connections[upload_id]:
                    break
                
                await self.send_personal_message(
                    {
                        'type': 'progress_ping',
                        'upload_id': upload_id,
                        'session_id': session_id,
                        'message': 'Processing continues – keeping connection warm',
                        'timestamp': datetime.utcnow().isoformat()
                    },
                    upload_id,
                    session_id,
                    record_backlog=False
                )
        except asyncio.CancelledError:
            logger.debug(f"🛑 Progress heartbeat cancelled: {upload_id}")
        except Exception as exc:
            logger.warning(f"⚠️ Progress heartbeat error ({upload_id}): {exc}")
        finally:
            self.progress_tasks.pop(task_key, None)
    
    def disconnect(self, upload_id: str, session_id: str):
        """Remove a WebSocket connection and cleanup keepalive task with idempotency."""
        # Make disconnect idempotent - safe to call multiple times
        cleanup_performed = False
        
        # Cancel keepalive task
        keepalive_key = f"{upload_id}:{session_id}"
        if keepalive_key in self.keepalive_tasks:
            try:
                self.keepalive_tasks[keepalive_key].cancel()
                del self.keepalive_tasks[keepalive_key]
                cleanup_performed = True
            except Exception as e:
                logger.warning(f"Error cancelling keepalive task: {e}")
        
        if keepalive_key in self.progress_tasks:
            try:
                self.progress_tasks[keepalive_key].cancel()
                del self.progress_tasks[keepalive_key]
                cleanup_performed = True
            except Exception as e:
                logger.warning(f"Error cancelling progress task: {e}")
        
        # Remove from active connections
        if upload_id in self.active_connections and session_id in self.active_connections[upload_id]:
            try:
                # Try to close the websocket gracefully if still connected
                websocket = self.active_connections[upload_id][session_id]
                if hasattr(websocket, 'client_state'):
                    try:
                        if websocket.client_state.name == 'CONNECTED':
                            # Close without waiting to avoid blocking
                            asyncio.create_task(websocket.close(code=1000))
                    except Exception:
                        pass  # Socket already closed or closing
                
                del self.active_connections[upload_id][session_id]
                cleanup_performed = True
                
                # Clean up empty upload_id entries
                if not self.active_connections[upload_id]:
                    del self.active_connections[upload_id]
            except Exception as e:
                logger.warning(f"Error removing connection: {e}")
        
        # Remove metadata
        if session_id in self.connection_metadata:
            try:
                del self.connection_metadata[session_id]
                cleanup_performed = True
            except Exception as e:
                logger.warning(f"Error removing metadata: {e}")
        
        if cleanup_performed:
            logger.info(f"WebSocket disconnected: upload_id={upload_id}, session_id={session_id}")
        else:
            logger.debug(f"Disconnect called but connection already cleaned up: upload_id={upload_id}, session_id={session_id}")
    
    async def send_personal_message(
        self,
        message: Dict[str, Any],
        upload_id: str,
        session_id: str,
        record_backlog: bool = True
    ):
        """Send a message to a specific connection with robust state checking."""
        if upload_id not in self.active_connections or session_id not in self.active_connections[upload_id]:
            logger.debug(f"Connection not found: upload_id={upload_id}, session_id={session_id}")
            return  # Connection already cleaned up
        
        websocket = self.active_connections[upload_id][session_id]
        
        # Multi-layer state check
        try:
            # Check application state (FastAPI level)
            if websocket.application_state.name != 'CONNECTED':
                logger.warning(f"WebSocket application not connected: upload_id={upload_id}, session_id={session_id}")
                self.disconnect(upload_id, session_id)
                return
            
            # Check client state (Starlette level)
            if websocket.client_state.name != 'CONNECTED':
                logger.warning(f"WebSocket client not connected: upload_id={upload_id}, session_id={session_id}")
                self.disconnect(upload_id, session_id)
                return
            
            # Attempt to send with timeout to prevent hanging
            await asyncio.wait_for(
                websocket.send_text(json.dumps(message)),
                timeout=5.0  # 5 second timeout for send operation
            )
            
            if record_backlog and self._should_record_backlog(message):
                self._append_to_backlog(upload_id, message)
            
        except asyncio.TimeoutError:
            logger.error(f"Timeout sending message to upload_id={upload_id}, session_id={session_id}")
            self.disconnect(upload_id, session_id)
        except RuntimeError as e:
            # This catches "WebSocket is not connected" errors
            if "not connected" in str(e).lower() or "accept" in str(e).lower():
                logger.warning(f"WebSocket already disconnected: {e}")
                self.disconnect(upload_id, session_id)
            else:
                logger.error(f"RuntimeError sending message: {e}")
                self.disconnect(upload_id, session_id)
        except Exception as e:
            logger.error(f"Error sending personal message: {e}", exc_info=True)
            self.disconnect(upload_id, session_id)
    
    async def broadcast_to_upload(self, message: Dict[str, Any], upload_id: str):
        """Broadcast a message to all connections for a specific upload with safe iteration."""
        logger.info(f"Broadcasting message to upload_id {upload_id}: {message.get('type', 'unknown')}")
        
        if upload_id not in self.active_connections:
            logger.warning(f"No active connections found for upload_id {upload_id}")
            return
        
        # Create a copy of the dict items to prevent modification during iteration
        connections_snapshot = list(self.active_connections[upload_id].items())
        logger.info(f"Found {len(connections_snapshot)} connections for upload_id {upload_id}")
        
        disconnected_sessions = []
        
        for session_id, websocket in connections_snapshot:
            # Skip if already disconnected by another task
            if upload_id not in self.active_connections or session_id not in self.active_connections[upload_id]:
                continue
            
            try:
                # Multi-layer state validation
                if (websocket.application_state.name != 'CONNECTED' or 
                    websocket.client_state.name != 'CONNECTED'):
                    logger.debug(f"WebSocket not connected for session {session_id}")
                    disconnected_sessions.append(session_id)
                    continue
                
                # Send with timeout
                await asyncio.wait_for(
                    websocket.send_text(json.dumps(message)),
                    timeout=5.0
                )
                logger.debug(f"Message sent to session {session_id} for upload_id {upload_id}")
                
            except asyncio.TimeoutError:
                logger.error(f"Timeout broadcasting to session {session_id}")
                disconnected_sessions.append(session_id)
            except RuntimeError as e:
                if "not connected" in str(e).lower() or "accept" in str(e).lower():
                    logger.debug(f"WebSocket already disconnected for session {session_id}: {e}")
                else:
                    logger.error(f"RuntimeError broadcasting to session {session_id}: {e}")
                disconnected_sessions.append(session_id)
            except Exception as e:
                logger.error(f"Error broadcasting to session {session_id}: {e}", exc_info=True)
                disconnected_sessions.append(session_id)
        
        # Clean up disconnected sessions
        for session_id in disconnected_sessions:
            self.disconnect(upload_id, session_id)
        
        if self._should_record_backlog(message):
            self._append_to_backlog(upload_id, message)
    
    async def send_progress_update(self, upload_id: str, progress_data: Dict[str, Any]):
        """Send a progress update to all connections for an upload."""
        message = {
            'type': 'progress_update',
            'upload_id': upload_id,
            'progress': progress_data,
            'timestamp': datetime.utcnow().isoformat()
        }
        await self.broadcast_to_upload(message, upload_id)
    
    async def send_stage_update(self, upload_id: str, stage: str, progress: int, message: str = "", stage_details: dict = None):
        """Send detailed stage update to clients."""
        
        # Define stage information
        stage_info = {
            'document_processing': {
                'name': 'Document Processing',
                'description': 'Analyzing document structure and format',
                'icon': '📄',
                'estimated_duration': '5-10 seconds'
            },
            'metadata_extraction': {
                'name': 'Metadata Extraction',
                'description': 'Extracting carrier name and statement date with GPT-4',
                'icon': '🏷️',
                'estimated_duration': '3-5 seconds'
            },
            'table_detection': {
                'name': 'Table Detection', 
                'description': 'AI-powered table and data structure identification',
                'icon': '🔍',
                'estimated_duration': '10-15 seconds'
            },
            'data_extraction': {
                'name': 'Data Extraction',
                'description': 'Extracting text and financial data from tables', 
                'icon': '📊',
                'estimated_duration': '15-20 seconds'
            },
            'financial_processing': {
                'name': 'Financial Processing',
                'description': 'Processing commission calculations and financial data',
                'icon': '💰', 
                'estimated_duration': '8-12 seconds'
            },
            'quality_assurance': {
                'name': 'Quality Assurance',
                'description': 'Validating extraction accuracy and completeness',
                'icon': '✅',
                'estimated_duration': '3-5 seconds'
            }
        }

        update_data = {
            'type': 'progress_update',
            'upload_id': upload_id,
            'progress': {
                'stage': stage,
                'progress_percentage': progress,
                'message': message or f"Processing {stage_info.get(stage, {}).get('name', stage)}...",
                'stage_details': stage_details or stage_info.get(stage, {})
            },
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await self.broadcast_to_upload(update_data, upload_id)

    async def send_commission_specific_message(self, upload_id: str, message_type: str, data: dict = None):
        """Send commission-specific messages to enhance user experience."""
        
        commission_messages = {
            'carrier_detected': f"Detected {data.get('carrier_name', 'Unknown')} commission format",
            'tables_found': f"Found {data.get('table_count', 0)} commission tables",
            'calculations_complete': f"Processed {data.get('commission_amount', '$0.00')} in commissions",
            'quality_check': f"Quality score: {data.get('quality_score', 0)}%"
        }
        
        message = commission_messages.get(message_type, "Processing commission data...")
        
        await self.send_stage_update(
            upload_id, 
            data.get('current_stage', 'processing'),
            data.get('progress', 0),
            message,
            data.get('stage_details')
        )
    
    async def send_error(self, upload_id: str, error_message: str, error_code: str = None):
        """Send an error message to all connections for an upload."""
        message = {
            'type': 'error',
            'upload_id': upload_id,
            'error': {
                'message': error_message,
                'code': error_code,
                'timestamp': datetime.utcnow().isoformat()
            }
        }
        await self.broadcast_to_upload(message, upload_id)
    
    async def send_completion(self, upload_id: str, result_data: Dict[str, Any]):
        """Send completion notification with results."""
        message = {
            'type': 'completion',
            'upload_id': upload_id,
            'result': result_data,
            'timestamp': datetime.utcnow().isoformat()
        }
        await self.broadcast_to_upload(message, upload_id)
    
    # ===== ENHANCED STEP-BASED PROGRESS EVENTS =====
    
    async def send_step_started(self, upload_id: str, step_index: int, step_id: str, step_title: str, 
                                step_description: str, percentage: int):
        """Send STEP_STARTED event for premium progress loader."""
        message = {
            'type': 'STEP_STARTED',
            'upload_id': upload_id,
            'stepIndex': step_index,
            'stepId': step_id,
            'stepTitle': step_title,
            'stepDescription': step_description,
            'percentage': percentage,
            'message': step_description,
            'timestamp': datetime.utcnow().isoformat()
        }
        await self.broadcast_to_upload(message, upload_id)
        logger.info(f"Step started: {step_title} (Step {step_index + 1}) for upload_id {upload_id}")
    
    async def send_step_progress(self, upload_id: str, percentage: int, estimated_time: str = None, current_stage: str = None, **kwargs):
        """Send STEP_PROGRESS event for real-time progress updates."""
        message = {
            'type': 'STEP_PROGRESS',
            'upload_id': upload_id,
            'percentage': percentage,
            'estimatedTime': estimated_time,
            'timestamp': datetime.utcnow().isoformat(),
            'current_stage': current_stage,
        }

        # Update message with additional keyword arguments
        if kwargs:
            message.update(kwargs)

        await self.broadcast_to_upload(message, upload_id)
        logger.debug(f"Step progress: {percentage}% for upload_id {upload_id}")
    
    async def send_step_completed(self, upload_id: str, step_index: int, step_id: str, percentage: int):
        """Send STEP_COMPLETED event when a step finishes."""
        message = {
            'type': 'STEP_COMPLETED',
            'upload_id': upload_id,
            'stepIndex': step_index,
            'stepId': step_id,
            'percentage': percentage,
            'timestamp': datetime.utcnow().isoformat()
        }
        await self.broadcast_to_upload(message, upload_id)
        logger.info(f"Step completed: {step_id} (Step {step_index + 1}) for upload_id {upload_id}")
    
    async def send_extraction_complete(self, upload_id: str, results: Dict[str, Any]):
        """Send EXTRACTION_COMPLETE event with full results."""
        message = {
            'type': 'EXTRACTION_COMPLETE',
            'upload_id': upload_id,
            'results': results,
            'timestamp': datetime.utcnow().isoformat()
        }
        await self.broadcast_to_upload(message, upload_id)
        logger.info(f"Extraction complete for upload_id {upload_id}")
        # Completion marks end of backlog relevance
        self.message_backlog.pop(upload_id, None)
    
    # Helper method for step-based workflow
    # ✅ CRITICAL: Step order must match frontend UPLOAD_STEPS in SummaryProgressLoader.tsx
    UPLOAD_STEPS = [
        {'id': 'upload', 'title': 'Uploading Document', 'description': 'Securing your file in the cloud'},
        {'id': 'extraction', 'title': 'Analyzing Document', 'description': 'AI is reading your commission statement'},
        {'id': 'table_extraction', 'title': 'Reading Commission Data', 'description': 'Extracting payment details'},
        {'id': 'plan_detection', 'title': 'Understanding Structure', 'description': 'Identifying document format'},
        {'id': 'ai_field_mapping', 'title': 'AI Field Mapping', 'description': 'Mapping fields intelligently'},
        {'id': 'preparing_results', 'title': 'Preparing Results', 'description': 'Finalizing your data'}
    ]
    
    async def emit_upload_step(self, upload_id: str, step_name: str, progress_percentage: int = None):
        """
        Emit a step event based on the step name from UPLOAD_STEPS.
        This is a convenience method that automatically calculates step index and percentage.
        """
        step_index = next((i for i, s in enumerate(self.UPLOAD_STEPS) if s['id'] == step_name), -1)
        
        if step_index == -1:
            logger.warning(f"Unknown step name: {step_name}")
            return
        
        step_info = self.UPLOAD_STEPS[step_index]
        
        # Calculate percentage based on step if not provided
        if progress_percentage is None:
            # Each step represents a portion of the total progress
            progress_percentage = int((step_index / len(self.UPLOAD_STEPS)) * 100)
        
        await self.send_step_started(
            upload_id=upload_id,
            step_index=step_index,
            step_id=step_info['id'],
            step_title=step_info['title'],
            step_description=step_info['description'],
            percentage=progress_percentage
        )
    
    def _get_stage_details(self, stage: str) -> Dict[str, Any]:
        """Get detailed information about a processing stage."""
        stage_details = {
            'document_processing': {
                'name': 'Document Processing',
                'description': 'Analyzing document structure and format',
                'icon': 'file-text',
                'estimated_duration': '5-10 seconds'
            },
            'metadata_extraction': {
                'name': 'Metadata Extraction',
                'description': 'Extracting carrier name and statement date with GPT-4',
                'icon': 'tag',
                'estimated_duration': '3-5 seconds'
            },
            'table_detection': {
                'name': 'Table Detection',
                'description': 'Identifying tables and data structures',
                'icon': 'table',
                'estimated_duration': '10-15 seconds'
            },
            'structure_recognition': {
                'name': 'Structure Recognition',
                'description': 'Understanding table layouts and relationships',
                'icon': 'layout',
                'estimated_duration': '8-12 seconds'
            },
            'text_extraction': {
                'name': 'Text Extraction',
                'description': 'Extracting text and data from tables',
                'icon': 'type',
                'estimated_duration': '15-20 seconds'
            },
            'post_processing': {
                'name': 'Post Processing',
                'description': 'Cleaning and formatting extracted data',
                'icon': 'settings',
                'estimated_duration': '5-8 seconds'
            },
            'validation': {
                'name': 'Validation',
                'description': 'Validating extraction quality and accuracy',
                'icon': 'check-circle',
                'estimated_duration': '3-5 seconds'
            },
            'multipage_linking': {
                'name': 'Multi-page Linking',
                'description': 'Connecting tables across multiple pages',
                'icon': 'link',
                'estimated_duration': '5-10 seconds'
            },
            'financial_processing': {
                'name': 'Financial Processing',
                'description': 'Processing financial data and calculations',
                'icon': 'calculator',
                'estimated_duration': '8-12 seconds'
            },
            'table_merging': {
                'name': 'Table Merging',
                'description': 'Merging related tables and data',
                'icon': 'merge',
                'estimated_duration': '3-5 seconds'
            }
        }
        
        return stage_details.get(stage, {
            'name': stage.replace('_', ' ').title(),
            'description': f'Processing {stage.replace("_", " ")}',
            'icon': 'cog',
            'estimated_duration': '5-10 seconds'
        })
    
    def get_connection_count(self, upload_id: str = None) -> int:
        """Get the number of active connections."""
        if upload_id:
            return len(self.active_connections.get(upload_id, {}))
        return sum(len(connections) for connections in self.active_connections.values())
    
    def get_connection_info(self) -> Dict[str, Any]:
        """Get information about all active connections."""
        return {
            'total_connections': self.get_connection_count(),
            'uploads_with_connections': len(self.active_connections),
            'connection_details': {
                upload_id: {
                    'session_count': len(sessions),
                    'sessions': list(sessions.keys())
                }
                for upload_id, sessions in self.active_connections.items()
            }
        }
    
    def _append_to_backlog(self, upload_id: str, message: Dict[str, Any]):
        """Store recent messages so new connections can replay progress."""
        if upload_id not in self.message_backlog:
            self.message_backlog[upload_id] = deque(maxlen=self.backlog_limit)
        # Store a shallow copy to avoid mutation
        self.message_backlog[upload_id].append(json.loads(json.dumps(message)))
    
    async def _replay_backlog(self, upload_id: str, session_id: str):
        """Replay recent messages for a newly connected session."""
        if upload_id not in self.message_backlog:
            return
        
        for cached_message in list(self.message_backlog[upload_id]):
            await self.send_personal_message(
                cached_message,
                upload_id,
                session_id,
                record_backlog=False
            )
    
    @staticmethod
    def _should_record_backlog(message: Dict[str, Any]) -> bool:
        """Determine whether a message should be stored for replay."""
        message_type = message.get('type')
        return message_type not in {'ping', 'progress_ping'}

# Global connection manager instance
connection_manager = ConnectionManager()

class ProgressTracker:
    """
    Tracks and broadcasts progress updates during document processing.
    Enhanced with timeout awareness and monitoring for large file processing.
    """
    
    def __init__(self, upload_id: str, connection_manager: ConnectionManager):
        self.upload_id = upload_id
        self.connection_manager = connection_manager
        self.current_stage = None
        self.start_time = datetime.utcnow()
        self.stage_start_time = None
        self.last_update = datetime.utcnow()
        self.timeout_threshold = timeout_settings.total_extraction  # 30 minutes
        self._heartbeat_tasks: Dict[str, asyncio.Task] = {}
        self._heartbeat_progress: Dict[str, float] = {}
    
    async def start_stage(self, stage: str, message: str = None):
        """Start a new processing stage."""
        self.current_stage = stage
        self.stage_start_time = datetime.utcnow()
        
        await self.connection_manager.send_stage_update(
            self.upload_id, 
            stage, 
            0.0, 
            message or f"Starting {stage.replace('_', ' ')}"
        )
        
        logger.info(f"Started stage {stage} for upload {self.upload_id}")
    
    async def check_timeout(self) -> bool:
        """Check if processing has exceeded timeout threshold."""
        elapsed = (datetime.utcnow() - self.start_time).total_seconds()
        if elapsed > self.timeout_threshold:
            await self.send_error(
                f"Processing timeout exceeded ({elapsed:.0f}s > {self.timeout_threshold}s). "
                f"The document may be too large or complex for processing.",
                "PROCESSING_TIMEOUT"
            )
            logger.error(f"Processing timeout for upload {self.upload_id}: {elapsed:.0f}s > {self.timeout_threshold}s")
            return True
        return False
    
    async def update_progress(self, stage: str, progress_percentage: float, message: str = None):
        """Update progress for the current stage."""
        await self.connection_manager.send_stage_update(
            self.upload_id, 
            stage, 
            progress_percentage, 
            message
        )
        
        self.last_update = datetime.utcnow()
        logger.debug(f"Progress update for {stage}: {progress_percentage}%")
    
    async def update_progress_with_timeout_check(self, stage: str, progress: float, message: str = None) -> bool:
        """
        Update progress and check for timeout.
        Returns False if timeout exceeded, True otherwise.
        """
        # Check timeout before updating
        if await self.check_timeout():
            return False
        
        # Update progress
        await self.connection_manager.send_stage_update(
            self.upload_id, stage, progress, message
        )
        self.last_update = datetime.utcnow()
        return True
    
    async def complete_stage(self, stage: str, message: str = None):
        """Mark a stage as completed."""
        await self.stop_heartbeat(stage)
        await self.connection_manager.send_stage_update(
            self.upload_id, 
            stage, 
            100.0, 
            message or f"Completed {stage.replace('_', ' ')}"
        )
        
        logger.info(f"Completed stage {stage} for upload {self.upload_id}")
    
    async def send_error(self, error_message: str, error_code: str = None):
        """Send an error notification."""
        await self.stop_all_heartbeats()
        await self.connection_manager.send_error(
            self.upload_id, 
            error_message, 
            error_code
        )
        
        logger.error(f"Error in upload {self.upload_id}: {error_message}")
    
    async def send_completion(self, result_data: Dict[str, Any]):
        """Send completion notification with results."""
        await self.stop_all_heartbeats()
        processing_time = (datetime.utcnow() - self.start_time).total_seconds()
        result_data['processing_time'] = processing_time
        
        await self.connection_manager.send_completion(
            self.upload_id, 
            result_data
        )
        
        logger.info(f"Completed processing for upload {self.upload_id} in {processing_time:.2f} seconds")

    def start_heartbeat(
        self,
        stage: str,
        message: str = None,
        base_percentage: float = 5.0,
        max_percentage: float = 95.0,
        interval_seconds: float = 8.0
    ) -> Optional[asyncio.Task]:
        """Start periodic heartbeat updates for long-running asynchronous work."""
        if not stage or stage in self._heartbeat_tasks:
            return None
        
        async def _beat():
            percentage = base_percentage
            while True:
                await asyncio.sleep(interval_seconds)
                percentage = min(max_percentage, percentage + 2.5)
                self._heartbeat_progress[stage] = percentage
                await self.connection_manager.send_stage_update(
                    self.upload_id,
                    stage,
                    percentage,
                    message or f"{stage.replace('_', ' ').title()} in progress..."
                )
        
        task = asyncio.create_task(_beat())
        self._heartbeat_tasks[stage] = task
        self._heartbeat_progress[stage] = base_percentage
        return task

    async def stop_heartbeat(self, stage: str):
        """Stop a heartbeat task for a stage."""
        task = self._heartbeat_tasks.pop(stage, None)
        self._heartbeat_progress.pop(stage, None)
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def stop_all_heartbeats(self):
        """Stop all heartbeat tasks."""
        tasks = list(self._heartbeat_tasks.keys())
        for stage in tasks:
            await self.stop_heartbeat(stage)

def create_progress_tracker(upload_id: str) -> ProgressTracker:
    """Create a new progress tracker for an upload."""
    return ProgressTracker(upload_id, connection_manager)
