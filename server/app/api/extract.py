from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.services.extraction_pipeline import TableExtractionPipeline
from app.services.enhanced_extraction_pipeline import EnhancedExtractionPipeline
from app.services.extraction_utils import transform_pipeline_response_to_client_format
from app.config import get_db
from app.utils.db_retry import with_db_retry
import os
import shutil
from datetime import datetime
from uuid import uuid4
from app.services.s3_utils import upload_file_to_s3, get_s3_file_url
import logging
import asyncio

router = APIRouter(tags=["extract"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = "pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Use enhanced extraction pipeline with format learning
extraction_pipeline = EnhancedExtractionPipeline()

@router.post("/extract-tables/")
async def extract_tables(
    file: UploadFile = File(...),
    company_id: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Default table extraction using advanced AI-powered system with format learning
    """
    start_time = datetime.now()
    logger.info(f"Starting enhanced extraction for {file.filename}")
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    # Check file size (limit to 100MB for larger documents)
    file_size = 0
    file_content = b""
    while chunk := await file.read(8192):
        file_content += chunk
        file_size += len(chunk)
        if file_size > 100 * 1024 * 1024:  # 100MB limit
            raise HTTPException(
                status_code=413, 
                detail="File too large. Maximum size is 100MB. Please compress your PDF or split it into smaller files."
            )
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    try:
        # Save uploaded file
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)

        # Get company info with retry
        company = await with_db_retry(db, crud.get_company_by_id, company_id=company_id)
        if not company:
            os.remove(file_path)
            raise HTTPException(status_code=404, detail="Company not found")

        # Upload to S3
        s3_key = f"statements/{company_id}/{file.filename}"
        uploaded = upload_file_to_s3(file_path, s3_key)
        if not uploaded:
            raise HTTPException(status_code=500, detail="Failed to upload file to S3.")
        s3_url = get_s3_file_url(s3_key)

        # Extract tables with enhanced pipeline (includes format learning)
        logger.info("Starting enhanced table extraction with format learning...")
        print(f"🚀 API: Starting enhanced extraction for {file.filename}")
        
        # Extract tables with format learning
        print(f"🔧 API: Calling enhanced extraction pipeline...")
        extraction_result = await extraction_pipeline.extract_tables_with_format_learning(
            file_path, company_id, db
        )
        print(f"✅ API: Enhanced extraction pipeline completed")
        
        if not extraction_result.get("success"):
            raise HTTPException(
                status_code=400, 
                detail=f"Extraction failed: {extraction_result.get('error', 'Unknown error')}"
            )
        
        # Transform response to client format (like backend)
        client_response = transform_pipeline_response_to_client_format(extraction_result, file.filename)
        
        # Add extraction timing and metadata
        extraction_time = (datetime.now() - start_time).total_seconds()
        client_response["extraction_time_seconds"] = extraction_time
        
        # Add detailed extraction log if available
        if "extraction_log" in extraction_result:
            client_response["extraction_log"] = extraction_result["extraction_log"]
        
        # Add pipeline metadata
        if "metadata" in extraction_result:
            client_response["pipeline_metadata"] = extraction_result["metadata"]
        
        # Add format learning metadata
        if "format_learning" in extraction_result:
            client_response["format_learning"] = extraction_result["format_learning"]
        
        # Create statement upload record for database
        upload_id = uuid4()
        db_upload = schemas.StatementUpload(
            id=upload_id,
            company_id=company_id,
            file_name=s3_key,  # Use S3 key as file_name
            uploaded_at=datetime.utcnow(),
            status="extracted",  # Initial status
            current_step="extracted",  # Current step
            raw_data=extraction_result.get("tables", []),  # Store tables as raw_data
            mapping_used=None
        )
        
        # Save statement upload with retry
        await with_db_retry(db, crud.save_statement_upload, upload=db_upload)
        
        # Clean up local file
        os.remove(file_path)
        
        # Add server-specific fields to response
        client_response.update({
            "success": True,
            "extraction_id": str(upload_id),
            "upload_id": str(upload_id),  # Frontend expects upload_id
            "s3_url": s3_url,
            "s3_key": s3_key  # Add S3 key for PDF URL construction
        })
        
        return client_response
        
    except HTTPException:
        # Clean up file on error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    except Exception as e:
        logger.error(f"Enhanced extraction error: {str(e)}")
        # Clean up file on error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Enhanced extraction failed: {str(e)}")

@router.post("/extract-tables-docai/")
async def extract_tables_docai(
    file: UploadFile = File(...),
    company_id: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Force DOCAI extraction for when user wants to try a different extraction method
    """
    start_time = datetime.now()
    logger.info(f"Starting DOCAI extraction for {file.filename}")
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    try:
        # Save uploaded file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Get company info
        company = await crud.get_company_by_id(db, company_id)
        if not company:
            os.remove(file_path)
            raise HTTPException(status_code=404, detail="Company not found")

        # Upload to S3
        s3_key = f"statements/{company_id}/{file.filename}"
        uploaded = upload_file_to_s3(file_path, s3_key)
        if not uploaded:
            raise HTTPException(status_code=500, detail="Failed to upload file to S3.")
        s3_url = get_s3_file_url(s3_key)

        # Force DOCAI extraction
        logger.info("Starting DOCAI table extraction...")
        extraction_result = extraction_pipeline.extract_tables(file_path, force_extractor="google_docai")
        
        if not extraction_result.get("success"):
            raise HTTPException(
                status_code=400, 
                detail=f"DOCAI extraction failed: {extraction_result.get('error', 'Unknown error')}"
            )
        
        # Transform response to client format
        client_response = transform_pipeline_response_to_client_format(extraction_result, file.filename)
        
        # Add extraction timing and metadata
        extraction_time = (datetime.now() - start_time).total_seconds()
        client_response["extraction_time_seconds"] = extraction_time
        
        # Add detailed extraction log if available
        if "extraction_log" in extraction_result:
            client_response["extraction_log"] = extraction_result["extraction_log"]
        
        # Add pipeline metadata
        if "metadata" in extraction_result:
            client_response["pipeline_metadata"] = extraction_result["metadata"]
        
        # Create statement upload record for database
        upload_id = uuid4()
        db_upload = schemas.StatementUpload(
            id=upload_id,
            company_id=company_id,
            file_name=s3_key,  # Use S3 key as file_name
            uploaded_at=datetime.utcnow(),
            status="extracted",  # Initial status
            raw_data=extraction_result.get("tables", []),  # Store tables as raw_data
            mapping_used=None
        )
        
        await crud.save_statement_upload(db, db_upload)
        
        # Clean up local file
        os.remove(file_path)
        
        # Add server-specific fields to response
        client_response.update({
            "success": True,
            "extraction_id": str(upload_id),
            "upload_id": str(upload_id),  # Frontend expects upload_id
            "s3_url": s3_url,
            "s3_key": s3_key  # Add S3 key for PDF URL construction
        })
        
        return client_response
        
    except HTTPException:
        # Clean up file on error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    except Exception as e:
        logger.error(f"DOCAI extraction error: {str(e)}")
        # Clean up file on error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"DOCAI extraction failed: {str(e)}")

@router.post("/extract-tables-docling/")
async def extract_tables_docling(
    file: UploadFile = File(...),
    company_id: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Force Docling extraction for when user wants to try a different extraction method
    """
    start_time = datetime.now()
    logger.info(f"Starting Docling extraction for {file.filename}")
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    try:
        # Save uploaded file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Get company info
        company = await crud.get_company_by_id(db, company_id)
        if not company:
            os.remove(file_path)
            raise HTTPException(status_code=404, detail="Company not found")

        # Upload to S3
        s3_key = f"statements/{company_id}/{file.filename}"
        uploaded = upload_file_to_s3(file_path, s3_key)
        if not uploaded:
            raise HTTPException(status_code=500, detail="Failed to upload file to S3.")
        s3_url = get_s3_file_url(s3_key)

        # Force Docling extraction
        logger.info("Starting Docling table extraction...")
        extraction_result = extraction_pipeline.extract_tables(file_path, force_extractor="docling")
        
        if not extraction_result.get("success"):
            raise HTTPException(
                status_code=400, 
                detail=f"Docling extraction failed: {extraction_result.get('error', 'Unknown error')}"
            )
        
        # Transform response to client format
        client_response = transform_pipeline_response_to_client_format(extraction_result, file.filename)
        
        # Add extraction timing and metadata
        extraction_time = (datetime.now() - start_time).total_seconds()
        client_response["extraction_time_seconds"] = extraction_time
        
        # Add detailed extraction log if available
        if "extraction_log" in extraction_result:
            client_response["extraction_log"] = extraction_result["extraction_log"]
        
        # Add pipeline metadata
        if "metadata" in extraction_result:
            client_response["pipeline_metadata"] = extraction_result["metadata"]
        
        # Create statement upload record for database
        upload_id = uuid4()
        db_upload = schemas.StatementUpload(
            id=upload_id,
            company_id=company_id,
            file_name=s3_key,  # Use S3 key as file_name
            uploaded_at=datetime.utcnow(),
            status="extracted",  # Initial status
            current_step="extracted",  # Current step
            raw_data=extraction_result.get("tables", []),  # Store tables as raw_data
            mapping_used=None
        )
        
        await crud.save_statement_upload(db, db_upload)
        
        # Clean up local file
        os.remove(file_path)
        
        # Add server-specific fields to response
        client_response.update({
            "success": True,
            "extraction_id": str(upload_id),
            "upload_id": str(upload_id),  # Frontend expects upload_id
            "s3_url": s3_url,
            "s3_key": s3_key  # Add S3 key for PDF URL construction
        })
        
        return client_response
        
    except HTTPException:
        # Clean up file on error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    except Exception as e:
        logger.error(f"Docling extraction error: {str(e)}")
        # Clean up file on error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Docling extraction failed: {str(e)}")

@router.get("/extractors/status")
async def get_extractor_status():
    """
    Get status of all available extractors
    """
    try:
        status = extraction_pipeline.get_extractor_status()
        return {
            "success": True,
            "status": status
        }
    except Exception as e:
        logger.error(f"Error getting extractor status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get extractor status: {str(e)}")


@router.get("/test-form-parser-adapter")
async def test_form_parser_adapter():
    """
    Test the new Form Parser adapter functionality
    """
    try:
        from app.services.extractor_google_docai import GoogleDocAIExtractor
        
        extractor = GoogleDocAIExtractor()
        test_result = extractor.test_form_parser_adapter()
        
        return {
            "success": True,
            "test_result": test_result,
            "message": "Form Parser adapter test completed"
        }
    except Exception as e:
        logger.error(f"Error testing Form Parser adapter: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/extract-single-table/")
async def extract_single_table(
    file: UploadFile = File(...),
    table_index: int = Form(0),
    db: AsyncSession = Depends(get_db)
):
    """
    Extract a single table by index
    """
    logger.info(f"Starting single table extraction for {file.filename}, table index: {table_index}")
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    try:
        # Save uploaded file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Extract single table
        logger.info(f"Extracting table at index {table_index}")
        extraction_result = extraction_pipeline.extract_single_table(file_path, table_index)
        
        if not extraction_result.get("success"):
            raise HTTPException(
                status_code=400, 
                detail=f"Extraction failed: {extraction_result.get('error', 'Unknown error')}"
            )
        
        table = extraction_result.get("table", {})
        
        # Clean up local file
        os.remove(file_path)
        
        return {
            "success": True,
            "table_index": table_index,
            "table": table,
            "metadata": extraction_result.get("metadata", {})
        }
        
    except HTTPException:
        # Clean up file on error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    except Exception as e:
        logger.error(f"Single table extraction error: {str(e)}")
        # Clean up file on error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")
