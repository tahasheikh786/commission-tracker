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
    document_metadata: Optional[Dict[str, Any]] = None  # ✅ NEW: For total validation

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
        
        # Extract document_metadata from upload_metadata if available
        document_metadata = payload.document_metadata
        if not document_metadata and payload.upload_metadata:
            document_metadata = payload.upload_metadata.get('document_metadata')
        
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
            current_environment_id=environment_id,  # NEW: Pass environment ID
            document_metadata=document_metadata  # ✅ NEW: Pass document metadata for validation
        )
        
        if not updated:
            raise HTTPException(status_code=404, detail=f"Upload with ID {payload.upload_id} not found and no metadata provided")
        
        # ✅ CRITICAL FIX: Check if status was changed to needs_review due to total mismatch
        actual_status = updated.status
        needs_review = actual_status == "needs_review"
        
        # Record user contribution now that the statement is persisted
        try:
            profile_service = UserProfileService(db)
            await profile_service.record_user_contribution(
                user_id=current_user.id,
                upload_id=payload.upload_id,
                contribution_type="approval",
                contribution_data={
                    "file_name": payload.upload_metadata.get('file_name') if payload.upload_metadata else None,
                    "status": actual_status,  # ✅ Use actual status, not hardcoded "Approved"
                    "approved_at": updated.completed_at.isoformat() if updated.completed_at else None
                }
            )
            await db.commit()  # Commit the contribution
            logger.info(f"✅ User contribution recorded for {'needs_review' if needs_review else 'approved'} statement {payload.upload_id}")
        except Exception as e:
            logger.warning(f"⚠️ Could not record user contribution: {e}")
            # Don't fail the approval if contribution recording fails
        
        # ✅ CRITICAL FIX: Return actual status and needs_review flag to frontend
        return {
            "success": True, 
            "review": schemas.StatementReview.model_validate(updated),
            "status": actual_status,  # ✅ NEW: Include actual status
            "needs_review": needs_review  # ✅ NEW: Flag if totals mismatched
        }
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

@router.post("/recalculate-commissions/{upload_id}")
async def recalculate_commissions(
    upload_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_hybrid)
):
    """
    Recalculate and save commission data for an existing approved statement.
    
    This is useful when:
    - A statement was approved but commission data wasn't saved due to missing field_config
    - Commission calculation logic has been updated
    - Data integrity issues need to be fixed
    """
    try:
        logger.info(f"🔄 Recalculating commissions for upload {upload_id}")
        
        # Get the statement from database
        statement = await crud.get_statement_upload_by_id(db, upload_id)
        if not statement:
            raise HTTPException(status_code=404, detail=f"Statement with ID {upload_id} not found")
        
        # Verify it's approved
        if statement.status.lower() != 'approved':
            raise HTTPException(
                status_code=400, 
                detail=f"Can only recalculate commissions for approved statements. Current status: {statement.status}"
            )
        
        # Verify user has access (same user or admin)
        if statement.user_id != current_user.id:
            # TODO: Add admin check here if needed
            raise HTTPException(status_code=403, detail="Access denied")
        
        logger.info(f"✅ Statement found: {statement.file_name}, Status: {statement.status}")
        logger.info(f"   field_config present: {bool(statement.field_config)}")
        logger.info(f"   progress_data present: {bool(statement.progress_data)}")
        
        # Call bulk_process_commissions to reprocess the data
        from app.db.crud.earned_commission import bulk_process_commissions
        
        result = await bulk_process_commissions(db, statement)
        
        if result is None:
            # Check if field_config was recovered
            if not statement.field_config:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot recalculate: field_config is missing and could not be recovered from progress_data"
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail="Commission recalculation failed. Check server logs for details."
                )
        
        # CRITICAL FIX: After reprocessing, update extracted_invoice_total and calculated_total
        # to reflect the corrected values from earned_commissions table
        from app.db.models import EarnedCommission
        from sqlalchemy import func
        
        commission_result = await db.execute(
            select(
                func.sum(EarnedCommission.commission_earned).label('total_commission'),
                func.sum(EarnedCommission.invoice_total).label('total_invoice')
            )
            .where(
                EarnedCommission.upload_ids.contains([str(upload_id)])
            )
        )
        commission_totals = commission_result.first()
        
        if commission_totals:
            actual_commission = float(commission_totals.total_commission) if commission_totals.total_commission else 0
            actual_invoice = float(commission_totals.total_invoice) if commission_totals.total_invoice else 0
            
            # Update the statement record with the corrected totals
            statement.calculated_total = actual_commission
            statement.extracted_invoice_total = actual_invoice
            
            logger.info(f"✅ Updated statement totals: commission=${actual_commission:.2f}, invoice=${actual_invoice:.2f}")
        
        await db.commit()
        
        logger.info(f"✅ Successfully recalculated commissions for upload {upload_id}")
        
        return {
            "success": True,
            "message": "Commissions recalculated successfully",
            "upload_id": str(upload_id),
            "records_processed": result if isinstance(result, int) else "unknown",
            "updated_totals": {
                "commission": actual_commission if commission_totals else None,
                "invoice": actual_invoice if commission_totals else None
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error recalculating commissions for {upload_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error recalculating commissions: {str(e)}")
