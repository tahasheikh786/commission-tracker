from fastapi import APIRouter, HTTPException, Depends
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.config import get_db
from app.db import crud, schemas
from app.services.user_profile_service import UserProfileService
from app.dependencies.auth_dependencies import get_current_user_hybrid
from app.db.models import User
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/review", tags=["review"])

# --- Pydantic payload models for request bodies ---

class ApprovePayload(BaseModel):
    upload_id: UUID
    final_data: List[Dict[str, Any]]
    field_config: Optional[List[Dict[str, str]]] = None
    plan_types: Optional[List[str]] = None
    selected_statement_date: Optional[Dict[str, Any]] = None
    # CRITICAL: Add upload metadata since DB record doesn't exist yet
    upload_metadata: Optional[Dict[str, Any]] = None

class RejectPayload(BaseModel):
    upload_id: UUID
    final_data: List[Dict[str, Any]]
    rejection_reason: str
    field_config: Optional[List[Dict[str, str]]] = None
    plan_types: Optional[List[str]] = None
    selected_statement_date: Optional[Dict[str, Any]] = None
    # CRITICAL: Add upload metadata since DB record doesn't exist yet
    upload_metadata: Optional[Dict[str, Any]] = None

@router.post("/approve/")
async def approve_statement(
    payload: ApprovePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_hybrid)
):
    try:
        # Get environment_id from upload_metadata if available
        environment_id = None
        if payload.upload_metadata and payload.upload_metadata.get('environment_id'):
            from uuid import UUID
            try:
                environment_id = UUID(payload.upload_metadata.get('environment_id'))
            except (ValueError, TypeError):
                logger.warning(f"Invalid environment_id in upload_metadata: {payload.upload_metadata.get('environment_id')}")
        
        # CRITICAL: Pass upload_metadata and current user info for creating new records
        updated = await crud.save_statement_review(
            db,
            upload_id=payload.upload_id,
            final_data=payload.final_data,
            status="Approved",
            field_config=payload.field_config,
            plan_types=payload.plan_types,
            selected_statement_date=payload.selected_statement_date,
            upload_metadata=payload.upload_metadata,  # NEW: Pass metadata
            current_user_id=current_user.id,  # NEW: Pass current user ID
            current_environment_id=environment_id  # NEW: Pass environment ID
        )
        
        if not updated:
            raise HTTPException(status_code=404, detail=f"Upload with ID {payload.upload_id} not found and no metadata provided")
        
        # Record user contribution now that the statement is persisted
        try:
            profile_service = UserProfileService(db)
            await profile_service.record_user_contribution(
                user_id=current_user.id,
                upload_id=payload.upload_id,
                contribution_type="approval",
                contribution_data={
                    "file_name": payload.upload_metadata.get('file_name') if payload.upload_metadata else None,
                    "status": "Approved",
                    "approved_at": updated.completed_at.isoformat() if updated.completed_at else None
                }
            )
            await db.commit()  # Commit the contribution
            logger.info(f"✅ User contribution recorded for approved statement {payload.upload_id}")
        except Exception as e:
            logger.warning(f"⚠️ Could not record user contribution: {e}")
            # Don't fail the approval if contribution recording fails
            
        return {"success": True, "review": schemas.StatementReview.model_validate(updated)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reject/")
async def reject_statement(
    payload: RejectPayload,
    db: AsyncSession = Depends(get_db)
):
    """
    CRITICAL CHANGE: Rejected statements are NO LONGER stored in the database.
    
    According to the new data integrity rules:
    - Only Approved and needs_review statuses are persisted
    - Rejected files should be discarded/deleted, not saved
    
    This endpoint now simply returns success without persisting anything.
    If a DB record exists, it will be deleted. Otherwise, nothing happens.
    """
    try:
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"🗑️ Statement {payload.upload_id} rejected - will not be persisted to database")
        
        # Try to delete the record if it exists (cleanup)
        # This handles cases where a record might have been created erroneously
        try:
            existing_record = await crud.get_statement_by_id(db, str(payload.upload_id))
            if existing_record:
                logger.info(f"🗑️ Deleting existing record for rejected statement {payload.upload_id}")
                await crud.delete_statement(db, str(payload.upload_id))
        except Exception as e:
            logger.warning(f"⚠️ Could not delete existing record for {payload.upload_id}: {e}")
            # Continue anyway - rejection should succeed even if cleanup fails
        
        # Return success without persisting
        return {
            "success": True, 
            "message": "Statement rejected successfully. No database record created.",
            "upload_id": str(payload.upload_id)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/all/")
async def get_all_reviews(db: AsyncSession = Depends(get_db)):
    rows = await crud.get_all_statement_reviews(db)
    return rows
