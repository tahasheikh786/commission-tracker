"""
WebSocket service for real-time progress tracking during document extraction.
"""

import asyncio
import json
import logging
from typing import Dict, Set, Any, Optional
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime
import uuid

logger = logging.getLogger(__name__)

class ConnectionManager:
    """Manages WebSocket connections for real-time progress updates."""
    
    def __init__(self):
        # Active connections: {upload_id: {session_id: websocket}}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        # Connection metadata: {session_id: {upload_id, user_id, connected_at}}
        self.connection_metadata: Dict[str, Dict[str, Any]] = {}
    
    async def connect(self, websocket: WebSocket, upload_id: str, session_id: str, user_id: str = None):
        """Accept a WebSocket connection and register it."""
        await websocket.accept()
        
        if upload_id not in self.active_connections:
            self.active_connections[upload_id] = {}
        
        self.active_connections[upload_id][session_id] = websocket
        self.connection_metadata[session_id] = {
            'upload_id': upload_id,
            'user_id': user_id,
            'connected_at': datetime.utcnow().isoformat()
        }
        
        logger.info(f"WebSocket connected: upload_id={upload_id}, session_id={session_id}")
        
        # Send initial connection confirmation
        await self.send_personal_message({
            'type': 'connection_established',
            'upload_id': upload_id,
            'session_id': session_id,
            'timestamp': datetime.utcnow().isoformat()
        }, upload_id, session_id)
    
    def disconnect(self, upload_id: str, session_id: str):
        """Remove a WebSocket connection."""
        if upload_id in self.active_connections and session_id in self.active_connections[upload_id]:
            del self.active_connections[upload_id][session_id]
            
            # Clean up empty upload_id entries
            if not self.active_connections[upload_id]:
                del self.active_connections[upload_id]
        
        if session_id in self.connection_metadata:
            del self.connection_metadata[session_id]
        
        logger.info(f"WebSocket disconnected: upload_id={upload_id}, session_id={session_id}")
    
    async def send_personal_message(self, message: Dict[str, Any], upload_id: str, session_id: str):
        """Send a message to a specific connection."""
        if upload_id in self.active_connections and session_id in self.active_connections[upload_id]:
            try:
                websocket = self.active_connections[upload_id][session_id]
                # Check if the WebSocket is still open before sending
                if websocket.client_state.name == 'CONNECTED':
                    await websocket.send_text(json.dumps(message))
                else:
                    logger.warning(f"WebSocket not connected for upload_id={upload_id}, session_id={session_id}")
                    self.disconnect(upload_id, session_id)
            except Exception as e:
                logger.error(f"Error sending personal message: {e}")
                self.disconnect(upload_id, session_id)
    
    async def broadcast_to_upload(self, message: Dict[str, Any], upload_id: str):
        """Broadcast a message to all connections for a specific upload."""
        logger.info(f"Broadcasting message to upload_id {upload_id}: {message.get('type', 'unknown')}")
        
        if upload_id in self.active_connections:
            logger.info(f"Found {len(self.active_connections[upload_id])} connections for upload_id {upload_id}")
            disconnected_sessions = []
            
            for session_id, websocket in self.active_connections[upload_id].items():
                try:
                    # Check if the WebSocket is still open before sending
                    if websocket.client_state.name == 'CONNECTED':
                        await websocket.send_text(json.dumps(message))
                        logger.debug(f"Message sent to session {session_id} for upload_id {upload_id}")
                    else:
                        logger.warning(f"WebSocket not connected for session {session_id}")
                        disconnected_sessions.append(session_id)
                except Exception as e:
                    logger.error(f"Error broadcasting to session {session_id}: {e}")
                    disconnected_sessions.append(session_id)
            
            # Clean up disconnected sessions
            for session_id in disconnected_sessions:
                self.disconnect(upload_id, session_id)
        else:
            logger.warning(f"No active connections found for upload_id {upload_id}")
    
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

# Global connection manager instance
connection_manager = ConnectionManager()

class ProgressTracker:
    """Tracks and broadcasts progress updates during document processing."""
    
    def __init__(self, upload_id: str, connection_manager: ConnectionManager):
        self.upload_id = upload_id
        self.connection_manager = connection_manager
        self.current_stage = None
        self.start_time = datetime.utcnow()
        self.stage_start_time = None
    
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
    
    async def update_progress(self, stage: str, progress_percentage: float, message: str = None):
        """Update progress for the current stage."""
        await self.connection_manager.send_stage_update(
            self.upload_id, 
            stage, 
            progress_percentage, 
            message
        )
        
        logger.debug(f"Progress update for {stage}: {progress_percentage}%")
    
    async def complete_stage(self, stage: str, message: str = None):
        """Mark a stage as completed."""
        await self.connection_manager.send_stage_update(
            self.upload_id, 
            stage, 
            100.0, 
            message or f"Completed {stage.replace('_', ' ')}"
        )
        
        logger.info(f"Completed stage {stage} for upload {self.upload_id}")
    
    async def send_error(self, error_message: str, error_code: str = None):
        """Send an error notification."""
        await self.connection_manager.send_error(
            self.upload_id, 
            error_message, 
            error_code
        )
        
        logger.error(f"Error in upload {self.upload_id}: {error_message}")
    
    async def send_completion(self, result_data: Dict[str, Any]):
        """Send completion notification with results."""
        processing_time = (datetime.utcnow() - self.start_time).total_seconds()
        result_data['processing_time'] = processing_time
        
        await self.connection_manager.send_completion(
            self.upload_id, 
            result_data
        )
        
        logger.info(f"Completed processing for upload {self.upload_id} in {processing_time:.2f} seconds")

def create_progress_tracker(upload_id: str) -> ProgressTracker:
    """Create a new progress tracker for an upload."""
    return ProgressTracker(upload_id, connection_manager)
