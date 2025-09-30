"""
WebSocket endpoints for real-time progress tracking.
"""

import json
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.security import HTTPBearer
from app.services.websocket_service import connection_manager
from app.dependencies.auth_dependencies import get_current_user_hybrid
from app.db.models import User
import uuid

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")
security = HTTPBearer()

@router.websocket("/ws/progress/{upload_id}")
async def websocket_progress_endpoint(
    websocket: WebSocket,
    upload_id: str,
    session_id: Optional[str] = Query(None),
    token: Optional[str] = Query(None)
):
    """
    WebSocket endpoint for real-time progress tracking during document extraction.
    
    Args:
        websocket: WebSocket connection
        upload_id: UUID of the upload being processed
        session_id: Optional session ID for connection tracking
        token: Optional JWT token for authentication
    """
    
    # Generate session ID if not provided
    if not session_id:
        session_id = str(uuid.uuid4())
    
    user_id = None
    
    # Try to authenticate user if token is provided
    if token:
        try:
            # Validate JWT token using the same logic as other endpoints
            from app.services.jwt_service import jwt_service
            payload = jwt_service.verify_token(token)
            if payload and 'sub' in payload:
                user_id = payload['sub']
                logger.info(f"WebSocket authenticated user: {user_id}")
            else:
                logger.warning("Invalid token payload")
                await websocket.close(code=1008, reason="Invalid token")
                return
        except Exception as e:
            logger.warning(f"Token validation failed: {e}")
            await websocket.close(code=1008, reason="Token validation failed")
            return
    else:
        # Allow connection without token for now (for development)
        # In production, you might want to require authentication
        logger.info("WebSocket connection without token - allowing for development")
    
    try:
        # Connect to the WebSocket
        logger.info(f"Attempting to connect WebSocket for upload_id: {upload_id}, session_id: {session_id}")
        await connection_manager.connect(websocket, upload_id, session_id, user_id)
        logger.info(f"WebSocket connected successfully for upload_id: {upload_id}, session_id: {session_id}")
        
        # Keep the connection alive and handle incoming messages
        while True:
            try:
                # Wait for messages from the client
                data = await websocket.receive_text()
                message = json.loads(data)
                
                # Handle different message types from client
                if message.get('type') == 'ping':
                    # Respond to ping with pong
                    await connection_manager.send_personal_message({
                        'type': 'pong',
                        'timestamp': message.get('timestamp')
                    }, upload_id, session_id)
                
                elif message.get('type') == 'get_status':
                    # Send current status
                    await connection_manager.send_personal_message({
                        'type': 'status',
                        'upload_id': upload_id,
                        'session_id': session_id,
                        'connection_count': connection_manager.get_connection_count(upload_id)
                    }, upload_id, session_id)
                
                else:
                    logger.info(f"Received unknown message type: {message.get('type')}")
                    
            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected: upload_id={upload_id}, session_id={session_id}")
                break
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON received from client: {data}")
                try:
                    await connection_manager.send_personal_message({
                        'type': 'error',
                        'error': 'Invalid JSON format'
                    }, upload_id, session_id)
                except Exception as send_error:
                    logger.error(f"Failed to send JSON error message: {send_error}")
                    break
            except Exception as e:
                logger.error(f"Error handling WebSocket message: {e}")
                # Don't try to send error message if connection is already closed
                try:
                    await connection_manager.send_personal_message({
                        'type': 'error',
                        'error': 'Internal server error'
                    }, upload_id, session_id)
                except Exception as send_error:
                    logger.error(f"Failed to send error message: {send_error}")
                    # If we can't send the error message, break the loop to prevent infinite errors
                    break
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected during connection: upload_id={upload_id}")
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
    finally:
        # Clean up the connection
        connection_manager.disconnect(upload_id, session_id)

@router.get("/ws/status")
async def get_websocket_status():
    """Get status of WebSocket connections."""
    return connection_manager.get_connection_info()

@router.get("/ws/connections/{upload_id}")
async def get_upload_connections(upload_id: str):
    """Get connection information for a specific upload."""
    return {
        'upload_id': upload_id,
        'connection_count': connection_manager.get_connection_count(upload_id),
        'has_connections': upload_id in connection_manager.active_connections
    }
