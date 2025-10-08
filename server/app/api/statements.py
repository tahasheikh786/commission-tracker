from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from app.db import crud, schemas
from app.config import get_db
from typing import List
from uuid import UUID
from pydantic import BaseModel
from app.services.gcs_utils import generate_gcs_signed_url, gcs_service
import httpx
import logging

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

class DeleteStatementsRequest(BaseModel):
    statement_ids: List[UUID]

@router.get("/companies/{company_id}/statements/", response_model=List[schemas.StatementReview])
async def get_statements_for_company(company_id: UUID, db: AsyncSession = Depends(get_db)):
    """Returns all uploads/statements for a given carrier"""
    # IMPORTANT: This endpoint fetches statements for a carrier (insurance company)
    # NOTE: Support both old (company_id) and new (carrier_id) format for backwards compatibility
    statements = await crud.get_statements_for_carrier(db, company_id)
    # Convert ORM objects to StatementReview, including raw_data
    return [schemas.StatementReview.model_validate(s) for s in statements]

# In your CRUD:
async def get_statements_for_company(db, company_id):
    from app.db.models import StatementUpload
    # NOTE: Support both old and new format
    # Old format: carrier stored in company_id, carrier_id is NULL
    # New format: carrier stored in carrier_id
    result = await db.execute(
        select(StatementUpload)
        .where(
            or_(
                StatementUpload.carrier_id == company_id,
                and_(
                    StatementUpload.company_id == company_id,
                    StatementUpload.carrier_id.is_(None)
                )
            )
        )
        .order_by(StatementUpload.uploaded_at.desc())
    )
    return result.scalars().all()


@router.delete("/companies/{company_id}/statements/{statement_id}")
async def delete_statement(statement_id: str, db: AsyncSession = Depends(get_db)):
    try:
        statement = await crud.get_statement_by_id(db, statement_id)
        if not statement:
            raise HTTPException(status_code=404, detail="Statement not found")
        await crud.delete_statement(db, statement_id)
        return {"message": "Statement deleted successfully"}
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Return error response with 500 status code for unexpected errors
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to delete statement: {str(e)}"
        )

@router.delete("/companies/{company_id}/statements/")
async def delete_multiple_statements(
    company_id: UUID,
    request: DeleteStatementsRequest,
    db: AsyncSession = Depends(get_db)
):
    statement_ids = request.statement_ids
    deleted_count = 0
    errors = []
    
    try:
        for statement_id in statement_ids:
            try:
                statement = await crud.get_statement_by_id(db, str(statement_id))
                if not statement:
                    errors.append(f"Statement with ID {statement_id} not found")
                    continue
                await crud.delete_statement(db, str(statement_id))
                deleted_count += 1
            except Exception as e:
                errors.append(f"Failed to delete statement with ID {statement_id}: {str(e)}")
        
        if errors:
            # Return error response with 400 status code
            raise HTTPException(
                status_code=400, 
                detail=f"Some deletions failed. Deleted: {deleted_count}, Errors: {errors}"
            )
        
        return {"message": f"Successfully deleted {deleted_count} statements"}
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Return error response with 500 status code for unexpected errors
        raise HTTPException(
            status_code=500, 
            detail=f"Transaction failed: {str(e)}"
        )

@router.get("/pdf-preview/")
async def get_pdf_preview_url(gcs_key: str):
    """
    Simple endpoint to get a signed URL for PDF preview.
    Returns a time-limited signed URL that can be used directly in an iframe.
    """
    if not gcs_key:
        raise HTTPException(status_code=400, detail="gcs_key parameter is required")
    
    # Check if file exists in GCS
    if not gcs_service.file_exists(gcs_key):
        raise HTTPException(status_code=404, detail=f"PDF file not found in storage: {gcs_key}")
    
    # Generate signed URL (valid for 1 hour by default)
    signed_url = generate_gcs_signed_url(gcs_key, expiration_hours=1)
    
    if not signed_url:
        raise HTTPException(status_code=500, detail="Could not generate signed URL")
    
    return {
        "url": signed_url,
        "gcs_key": gcs_key,
        "expires_in_hours": 1
    }

@router.get("/pdf-proxy/")
async def proxy_pdf(gcs_key: str):
    """
    Proxy endpoint that fetches PDF from GCS and streams it to the frontend.
    This avoids CORS issues by proxying the PDF through the backend.
    """
    if not gcs_key:
        raise HTTPException(status_code=400, detail="gcs_key parameter is required")
    
    try:
        # Check if file exists in GCS
        if not gcs_service.file_exists(gcs_key):
            raise HTTPException(status_code=404, detail=f"PDF file not found in storage: {gcs_key}")
        
        # Generate signed URL
        signed_url = generate_gcs_signed_url(gcs_key, expiration_hours=1)
        
        if not signed_url:
            raise HTTPException(status_code=500, detail="Could not generate signed URL")
        
        logger.info(f"Proxying PDF from GCS: {gcs_key}")
        
        # Fetch PDF from GCS using httpx
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(signed_url)
            
            if response.status_code != 200:
                logger.error(f"Failed to fetch PDF from GCS: {response.status_code}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to fetch PDF from storage: {response.status_code}"
                )
            
            # Stream the PDF content back to the frontend
            # Build headers conditionally based on environment
            headers = {
                "Content-Disposition": f'inline; filename="{gcs_key.split("/")[-1]}"',
                "Access-Control-Allow-Origin": "*",  # Allow CORS
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
            }
            
            # Only set X-Frame-Options in production for security
            # In development, omit it to allow iframe embedding between localhost:3000 and localhost:8000
            import os
            environment = os.getenv("ENVIRONMENT", "development")
            if environment == "production":
                headers["X-Frame-Options"] = "SAMEORIGIN"
            
            return StreamingResponse(
                iter([response.content]),
                media_type="application/pdf",
                headers=headers
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error proxying PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching PDF: {str(e)}")

@router.get("/statements/{statement_id}/formatted-tables")
async def get_formatted_tables(statement_id: str, db: AsyncSession = Depends(get_db)):
    """Get formatted/edited tables for a statement"""
    try:
        statement = await crud.get_statement_by_id(db, statement_id)
        if not statement:
            raise HTTPException(status_code=404, detail="Statement not found")
        
        # Return edited_tables which contains the formatted tables after table editor
        formatted_tables = statement.edited_tables or []
        
        # If no edited tables, fall back to raw data
        if not formatted_tables and statement.raw_data:
            formatted_tables = statement.raw_data
        
        return {
            "statement_id": statement_id,
            "tables": formatted_tables,
            "table_count": len(formatted_tables)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching formatted tables: {str(e)}")
