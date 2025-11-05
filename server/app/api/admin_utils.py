"""
Admin utility endpoints for maintenance tasks.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, update
from app.db import crud, schemas
from app.db.models import StatementUpload, User
from app.config import get_db
from app.dependencies.auth_dependencies import get_current_user_hybrid
from app.services.gcs_utils import download_file_from_gcs
import hashlib
import logging
from typing import List, Dict, Any
import os
import tempfile

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)


@router.get("/check-file-hashes")
async def check_file_hashes(
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """
    Check for uploads with NULL file hashes.
    """
    # Check if user is authorized (you might want to add admin role check)
    logger.info(f"User {current_user.email} checking file hashes")
    
    # Find uploads with NULL file_hash
    result = await db.execute(
        select(StatementUpload)
        .where(
            and_(
                StatementUpload.user_id == current_user.id,
                StatementUpload.file_hash.is_(None)
            )
        )
        .order_by(StatementUpload.uploaded_at.desc())
    )
    
    uploads_without_hash = result.scalars().all()
    
    return {
        "total_uploads_without_hash": len(uploads_without_hash),
        "uploads": [
            {
                "id": str(upload.id),
                "file_name": upload.file_name,
                "uploaded_at": upload.uploaded_at.isoformat() if upload.uploaded_at else None,
                "status": upload.status
            }
            for upload in uploads_without_hash
        ]
    }


@router.post("/update-file-hash/{upload_id}")
async def update_file_hash(
    upload_id: str,
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """
    Calculate and update file hash for a specific upload.
    """
    # Get the upload
    result = await db.execute(
        select(StatementUpload)
        .where(
            and_(
                StatementUpload.id == upload_id,
                StatementUpload.user_id == current_user.id
            )
        )
    )
    
    upload = result.scalar_one_or_none()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    if upload.file_hash:
        return {"message": "File hash already exists", "hash": upload.file_hash}
    
    # Download file from GCS
    if not upload.file_name:
        raise HTTPException(status_code=400, detail="No file name associated with upload")
    
    temp_file = None
    try:
        # Create temp file
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            temp_file = tmp.name
        
        # Download from GCS
        success = download_file_from_gcs(upload.file_name, temp_file)
        if not success:
            raise HTTPException(status_code=404, detail="File not found in storage")
        
        # Calculate hash
        with open(temp_file, 'rb') as f:
            file_content = f.read()
            file_hash = hashlib.sha256(file_content).hexdigest()
            file_size = len(file_content)
        
        # Update database
        await db.execute(
            update(StatementUpload)
            .where(StatementUpload.id == upload_id)
            .values(file_hash=file_hash, file_size=file_size)
        )
        await db.commit()
        
        logger.info(f"Updated hash for upload {upload_id}: {file_hash}")
        
        return {
            "message": "File hash updated successfully",
            "file_hash": file_hash,
            "file_size": file_size
        }
        
    finally:
        # Clean up temp file
        if temp_file and os.path.exists(temp_file):
            os.remove(temp_file)


@router.post("/update-all-file-hashes")
async def update_all_file_hashes(
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """
    Update file hashes for all uploads without hashes (for current user).
    """
    # Find uploads without hash
    result = await db.execute(
        select(StatementUpload)
        .where(
            and_(
                StatementUpload.user_id == current_user.id,
                StatementUpload.file_hash.is_(None),
                StatementUpload.file_name.isnot(None)
            )
        )
        .limit(10)  # Process in batches to avoid timeout
    )
    
    uploads = result.scalars().all()
    updated = []
    errors = []
    
    for upload in uploads:
        try:
            temp_file = None
            with tempfile.NamedTemporaryFile(delete=False) as tmp:
                temp_file = tmp.name
            
            # Download from GCS
            success = download_file_from_gcs(upload.file_name, temp_file)
            if not success:
                errors.append({
                    "upload_id": str(upload.id),
                    "file_name": upload.file_name,
                    "error": "File not found in storage"
                })
                continue
            
            # Calculate hash
            with open(temp_file, 'rb') as f:
                file_content = f.read()
                file_hash = hashlib.sha256(file_content).hexdigest()
                file_size = len(file_content)
            
            # Update database
            await db.execute(
                update(StatementUpload)
                .where(StatementUpload.id == upload.id)
                .values(file_hash=file_hash, file_size=file_size)
            )
            
            updated.append({
                "upload_id": str(upload.id),
                "file_name": upload.file_name,
                "file_hash": file_hash,
                "file_size": file_size
            })
            
        except Exception as e:
            errors.append({
                "upload_id": str(upload.id),
                "file_name": upload.file_name,
                "error": str(e)
            })
        finally:
            if temp_file and os.path.exists(temp_file):
                os.remove(temp_file)
    
    await db.commit()
    
    return {
        "message": f"Updated {len(updated)} uploads, {len(errors)} errors",
        "updated": updated,
        "errors": errors
    }
