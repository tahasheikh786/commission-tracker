"""
Date Extraction API - Extracts statement dates from commission statements
This API provides endpoints for extracting dates from the first page of documents
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud
from app.services.date_extraction_service import get_date_extraction_service
from app.config import get_db
from app.utils.db_retry import with_db_retry
import os
from datetime import datetime
from app.services.s3_utils import upload_file_to_s3, get_s3_file_url
import logging
from typing import Optional, Dict, Any

router = APIRouter(tags=["date-extraction"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = "pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Initialize the date extraction service
date_extraction_service = None

async def get_date_extraction_service_instance():
    """Get or create the date extraction service instance."""
    global date_extraction_service
    if date_extraction_service is None:
        config_path = "configs/new_extraction_config.yaml"
        date_extraction_service = get_date_extraction_service(config_path)
    return date_extraction_service


@router.post("/extract-dates/")
async def extract_dates(
    file: UploadFile = File(...),
    company_id: str = Form(...),
    max_pages: int = Form(1),  # Default to first page only
    db: AsyncSession = Depends(get_db)
):
    """
    Extract dates from the first page of a commission statement document.
    This endpoint finds all dates with their labels for user selection.
    """
    start_time = datetime.now()
    logger.info(f"Starting date extraction for {file.filename}")
    
    # Validate file type
    allowed_extensions = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.xlsx', '.xls', '.xlsm', '.xlsb']
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Check file size (limit to 50MB)
    file_size = 0
    file_content = b""
    while chunk := await file.read(8192):
        file_content += chunk
        file_size += len(chunk)
        if file_size > 50 * 1024 * 1024:  # 50MB limit
            raise HTTPException(
                status_code=413, 
                detail="File too large. Maximum size is 50MB."
            )
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    try:
        # Save uploaded file
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)

        # Verify file was saved successfully
        if not os.path.exists(file_path):
            raise HTTPException(status_code=500, detail="Failed to save uploaded file")

        # Get company info with retry (optional for date extraction)
        company = None
        try:
            company = await with_db_retry(db, crud.get_company_by_id, company_id=company_id)
        except Exception as e:
            logger.warning(f"Could not validate company {company_id}: {e}")
            # Continue with date extraction even if company validation fails
        
        # Upload to S3 (only if company is valid)
        s3_url = None
        if company:
            s3_key = f"statements/{company_id}/{file.filename}"
            uploaded = upload_file_to_s3(file_path, s3_key)
            if uploaded:
                s3_url = get_s3_file_url(s3_key)
            else:
                logger.warning("Failed to upload file to S3, but continuing with date extraction")
        else:
            logger.warning("Skipping S3 upload due to invalid company ID")

        # Get the date extraction service
        extraction_service = await get_date_extraction_service_instance()
        
        # Extract dates from the document
        logger.info("Starting date extraction...")
        print(f"🚀 API: Starting date extraction for {file.filename}")
        
        # Verify file still exists before extraction
        if not os.path.exists(file_path):
            raise HTTPException(status_code=500, detail="File was removed before extraction")
        
        extraction_result = await extraction_service.extract_dates_from_file(
            file_path=file_path,
            max_pages=max_pages
        )
        
        print(f"✅ API: Date extraction completed")
        
        if not extraction_result.get("success"):
            raise HTTPException(
                status_code=400, 
                detail=f"Date extraction failed: {extraction_result.get('error', 'Unknown error')}"
            )
        
        # Transform response to client format
        client_response = transform_date_extraction_response_to_client_format(
            extraction_result, file.filename, company_id
        )
        
        # Add extraction timing and metadata
        extraction_time = (datetime.now() - start_time).total_seconds()
        client_response["extraction_time_seconds"] = extraction_time
        client_response["extraction_method"] = "date_extraction_service"
        client_response["s3_url"] = s3_url
        
        # Note: Extraction record saving is disabled as ExtractionRecord schema doesn't exist
        # This doesn't affect the date extraction functionality
        logger.info("Skipping extraction record creation - schema not available")
        
        logger.info(f"Date extraction completed successfully for {file.filename}")
        return client_response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Date extraction failed for {file.filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Date extraction failed: {str(e)}")
    finally:
        # Clean up uploaded file
        if os.path.exists(file_path):
            os.remove(file_path)


@router.post("/extract-dates-bytes/")
async def extract_dates_bytes(
    file: UploadFile = File(...),
    company_id: str = Form(...),
    max_pages: int = Form(1),  # Default to first page only
    db: AsyncSession = Depends(get_db)
):
    """
    Extract dates from file bytes (no temporary file creation)
    """
    start_time = datetime.now()
    logger.info(f"Starting date extraction from bytes for {file.filename}")
    
    # Validate file type
    allowed_extensions = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif']
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Read file content
    file_content = await file.read()
    if len(file_content) > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(
            status_code=413, 
            detail="File too large. Maximum size is 50MB."
        )
    
    try:
        # Get company info with retry
        company = await with_db_retry(db, crud.get_company_by_id, company_id=company_id)
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

        # Get the date extraction service
        extraction_service = await get_date_extraction_service_instance()
        
        # Extract dates from file bytes
        logger.info("Starting date extraction from bytes...")
        print(f"🚀 API: Starting date extraction from bytes for {file.filename}")
        
        extraction_result = await extraction_service.extract_dates_from_bytes(
            file_bytes=file_content,
            file_name=file.filename,
            file_type=file_ext[1:],  # Remove the dot
            max_pages=max_pages
        )
        
        print(f"✅ API: Date extraction from bytes completed")
        
        if not extraction_result.get("success"):
            raise HTTPException(
                status_code=400, 
                detail=f"Date extraction failed: {extraction_result.get('error', 'Unknown error')}"
            )
        
        # Transform response to client format
        client_response = transform_date_extraction_response_to_client_format(
            extraction_result, file.filename, company_id
        )
        
        # Add extraction timing and metadata
        extraction_time = (datetime.now() - start_time).total_seconds()
        client_response["extraction_time_seconds"] = extraction_time
        client_response["extraction_method"] = "date_extraction_service_bytes"
        
        logger.info(f"Date extraction from bytes completed successfully for {file.filename}")
        return client_response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Date extraction from bytes failed for {file.filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Date extraction failed: {str(e)}")


def transform_date_extraction_response_to_client_format(
    extraction_result: Dict[str, Any], 
    filename: str, 
    company_id: str
) -> Dict[str, Any]:
    """
    Transform the date extraction result to the format expected by the client.
    
    Args:
        extraction_result: Raw extraction result from the service
        filename: Name of the uploaded file
        company_id: ID of the company
        
    Returns:
        Formatted response for the client
    """
    try:
        # Extract dates from the result
        dates = extraction_result.get("dates", [])
        
        # Group dates by type for better organization
        dates_by_type = {}
        for date in dates:
            date_type = date.get("date_type", "unknown")
            if date_type not in dates_by_type:
                dates_by_type[date_type] = []
            dates_by_type[date_type].append(date)
        
        # Create formatted response
        client_response = {
            "success": extraction_result.get("success", False),
            "filename": filename,
            "company_id": company_id,
            "total_dates_found": len(dates),
            "dates": dates,
            "dates_by_type": dates_by_type,
            "extraction_methods": extraction_result.get("extraction_methods", []),
            "processing_time": extraction_result.get("processing_time", 0),
            "warnings": extraction_result.get("warnings", []),
            "errors": extraction_result.get("errors", []),
            "metadata": {
                "file_type": filename.split('.')[-1].lower(),
                "extraction_timestamp": datetime.now().isoformat(),
                "service_version": "1.0.0"
            }
        }
        
        # Add error information if extraction failed
        if not extraction_result.get("success"):
            client_response["error"] = extraction_result.get("error", "Unknown error")
        
        return client_response
        
    except Exception as e:
        logger.error(f"Error transforming date extraction response: {e}")
        return {
            "success": False,
            "error": f"Response transformation failed: {str(e)}",
            "filename": filename,
            "company_id": company_id,
            "dates": [],
            "dates_by_type": {},
            "total_dates_found": 0
        }


@router.get("/date-extraction-status/")
async def get_date_extraction_status():
    """
    Get the status of the date extraction service.
    """
    try:
        extraction_service = await get_date_extraction_service_instance()
        status = await extraction_service.get_extraction_status()
        return status
    except Exception as e:
        logger.error(f"Error getting date extraction status: {e}")
        raise HTTPException(status_code=500, detail=f"Status check failed: {str(e)}")
