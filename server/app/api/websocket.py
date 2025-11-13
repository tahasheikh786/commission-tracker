"""
WebSocket endpoints for real-time progress tracking.
"""

import json
import logging
from typing import Optional
from datetime import datetime
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
    import asyncio
    
    # Generate session ID if not provided
    if not session_id:
        session_id = str(uuid.uuid4())
    
    user_id = None
    
    # Try to authenticate user if token is provided
    if token:
        try:
            # Validate JWT token using the same logic as other endpoints
            from app.services.jwt_service import jwt_service
            payload = jwt_service.verify_token(token, "access")  # Fixed: Added token_type parameter
            if payload and 'sub' in payload:
                user_id = payload['sub']
                logger.info(f"WebSocket authenticated user: {user_id}")
            elif payload and 'email' in payload:
                # Alternative payload structure for OTP auth
                user_id = payload['email']
                logger.info(f"WebSocket authenticated user by email: {user_id}")
            else:
                logger.warning("Invalid token payload")
                await websocket.close(code=1008, reason="Invalid token")
                return
        except Exception as e:
            logger.warning(f"Token validation failed: {e}")
            await websocket.close(code=1008, reason="Token validation failed")
            return
    else:
        # Allow WebSocket connection without token for progress tracking
        # This is safe because WebSocket is only used for read-only progress updates
        # and the actual data access is still protected by authentication on REST endpoints
        logger.warning(
            f"WebSocket connection without explicit token for upload_id={upload_id}. "
            "This is allowed for progress tracking, but consider implementing token passing for production."
        )
        user_id = "anonymous"  # Set a placeholder user_id for tracking
    
    # Keepalive ping task
    keepalive_task = None
    
    async def send_keepalive_pings():
        """Send periodic ping messages to keep the connection alive."""
        try:
            while True:
                await asyncio.sleep(25)  # Send ping every 25 seconds
                try:
                    await connection_manager.send_personal_message({
                        'type': 'ping',
                        'timestamp': datetime.now().isoformat()
                    }, upload_id, session_id)
                    logger.debug(f"Sent keepalive ping for upload_id={upload_id}, session_id={session_id}")
                except Exception as e:
                    logger.error(f"Failed to send keepalive ping: {e}")
                    break
        except asyncio.CancelledError:
            logger.debug(f"Keepalive task cancelled for upload_id={upload_id}")
    
    try:
        # Connect to the WebSocket
        logger.info(f"Attempting to connect WebSocket for upload_id: {upload_id}, session_id: {session_id}")
        await connection_manager.connect(websocket, upload_id, session_id, user_id)
        logger.info(f"WebSocket connected successfully for upload_id: {upload_id}, session_id: {session_id}")
        
        # Start keepalive task
        keepalive_task = asyncio.create_task(send_keepalive_pings())
        logger.info(f"Started keepalive task for upload_id={upload_id}")
        
        # Keep the connection alive and handle incoming messages
        while True:
            try:
                # Validate connection state before attempting to receive
                if websocket.application_state.name != 'CONNECTED':
                    logger.info(f"WebSocket application state not CONNECTED for upload_id={upload_id}")
                    break
                
                if websocket.client_state.name != 'CONNECTED':
                    logger.info(f"WebSocket client state not CONNECTED for upload_id={upload_id}")
                    break
                
                # Wait for messages from the client with timeout
                # Increased to 10 minutes for large document processing
                data = await asyncio.wait_for(websocket.receive_text(), timeout=600)
                message = json.loads(data)
                
                # Handle different message types from client
                if message.get('type') == 'ping':
                    # Respond to ping with pong
                    await connection_manager.send_personal_message({
                        'type': 'pong',
                        'timestamp': message.get('timestamp')
                    }, upload_id, session_id)
                
                elif message.get('type') == 'pong':
                    # Client responded to our ping - connection is healthy
                    logger.debug(f"Received pong from client: upload_id={upload_id}")
                
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
            
            except asyncio.TimeoutError:
                logger.warning(f"WebSocket receive timeout for upload_id={upload_id}, connection may be stale")
                # Don't break on timeout - keepalive will maintain connection
                continue
                    
            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected: upload_id={upload_id}, session_id={session_id}")
                break
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON received from client")
                try:
                    await connection_manager.send_personal_message({
                        'type': 'error',
                        'error': 'Invalid JSON format'
                    }, upload_id, session_id)
                except Exception as send_error:
                    logger.error(f"Failed to send JSON error message: {send_error}")
                    break
            except RuntimeError as e:
                # Handle "WebSocket is not connected" errors specifically
                if "not connected" in str(e).lower() or "accept" in str(e).lower():
                    logger.warning(f"WebSocket disconnected during message handling: {e}")
                    # Don't try to send anything, just break the loop
                    break
                else:
                    logger.error(f"RuntimeError handling WebSocket message: {e}", exc_info=True)
                    break  # Break on any RuntimeError to prevent loop
            except Exception as e:
                logger.error(f"Error handling WebSocket message: {e}", exc_info=True)
                # NEVER try to send error messages in the exception handler
                # This prevents infinite error loops when connection is dead
                break  # Always break the loop on unhandled exceptions
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected during connection: upload_id={upload_id}")
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
    finally:
        # Cancel keepalive task
        if keepalive_task:
            keepalive_task.cancel()
            try:
                await keepalive_task
            except asyncio.CancelledError:
                pass
        
        # Clean up the connection
        connection_manager.disconnect(upload_id, session_id)
        logger.info(f"WebSocket cleanup completed for upload_id={upload_id}")

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
