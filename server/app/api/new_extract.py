"""
New Extraction API - Advanced table extraction using the new working solution
This API provides endpoints for the new advanced extraction pipeline while
maintaining compatibility with the existing server structure.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.services.new_extraction_service import get_new_extraction_service
from app.config import get_db
from app.utils.db_retry import with_db_retry
import os
import shutil
from datetime import datetime
from uuid import uuid4
from app.services.s3_utils import upload_file_to_s3, get_s3_file_url
import logging
import asyncio
from typing import Optional, Dict, Any

router = APIRouter(tags=["new-extract"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = "pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Initialize the new extraction service
new_extraction_service = None

async def get_new_extraction_service_instance():
    """Get or create the new extraction service instance."""
    global new_extraction_service
    if new_extraction_service is None:
        config_path = "configs/new_extraction_config.yaml"
        new_extraction_service = get_new_extraction_service(config_path)
    return new_extraction_service


@router.post("/extract-tables-advanced/")
async def extract_tables_advanced(
    file: UploadFile = File(...),
    company_id: str = Form(...),
    confidence_threshold: float = Form(0.6),
    enable_ocr: bool = Form(True),
    enable_multipage: bool = Form(True),
    max_tables_per_page: int = Form(10),
    output_format: str = Form("json"),
    db: AsyncSession = Depends(get_db)
):
    """
    Advanced table extraction using the new working solution
    This endpoint uses the advanced extraction pipeline with improved accuracy
    """
    start_time = datetime.now()
    logger.info(f"Starting advanced extraction for {file.filename}")
    
    # Validate file type
    allowed_extensions = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.docx']
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

        # Get the new extraction service
        extraction_service = await get_new_extraction_service_instance()
        
        # Extract tables with the new advanced pipeline
        logger.info("Starting advanced table extraction...")
        print(f"🚀 API: Starting advanced extraction for {file.filename}")
        
        extraction_result = await extraction_service.extract_tables_from_file(
            file_path=file_path,
            file_type=file_ext[1:],  # Remove the dot
            confidence_threshold=confidence_threshold,
            enable_ocr=enable_ocr,
            enable_multipage=enable_multipage,
            max_tables_per_page=max_tables_per_page,
            output_format=output_format
        )
        
        print(f"✅ API: Advanced extraction pipeline completed")
        
        if not extraction_result.get("success"):
            raise HTTPException(
                status_code=400, 
                detail=f"Extraction failed: {extraction_result.get('error', 'Unknown error')}"
            )
        
        # Transform response to client format
        client_response = transform_new_extraction_response_to_client_format(
            extraction_result, file.filename, company_id
        )
        
        # Add extraction timing and metadata
        extraction_time = (datetime.now() - start_time).total_seconds()
        client_response["extraction_time_seconds"] = extraction_time
        client_response["extraction_method"] = "new_advanced_pipeline"
        client_response["s3_url"] = s3_url
        
        # Save extraction record to database
        extraction_record = schemas.ExtractionRecord(
            id=str(uuid4()),
            company_id=company_id,
            filename=file.filename,
            s3_key=s3_key,
            extraction_method="new_advanced_pipeline",
            processing_time=extraction_time,
            tables_found=len(extraction_result.get("tables", [])),
            success=extraction_result.get("success", False),
            created_at=datetime.now()
        )
        
        await with_db_retry(db, crud.create_extraction_record, extraction_record)
        
        logger.info(f"Advanced extraction completed successfully for {file.filename}")
        return client_response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Advanced extraction failed for {file.filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")
    finally:
        # Clean up uploaded file
        if os.path.exists(file_path):
            os.remove(file_path)


@router.post("/extract-tables-advanced-bytes/")
async def extract_tables_advanced_bytes(
    file: UploadFile = File(...),
    company_id: str = Form(...),
    confidence_threshold: float = Form(0.6),
    enable_ocr: bool = Form(True),
    enable_multipage: bool = Form(True),
    max_tables_per_page: int = Form(10),
    output_format: str = Form("json"),
    db: AsyncSession = Depends(get_db)
):
    """
    Advanced table extraction from file bytes (no temporary file creation)
    """
    start_time = datetime.now()
    logger.info(f"Starting advanced extraction from bytes for {file.filename}")
    
    # Validate file type
    allowed_extensions = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.docx']
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

        # Get the new extraction service
        extraction_service = await get_new_extraction_service_instance()
        
        # Extract tables directly from bytes
        logger.info("Starting advanced table extraction from bytes...")
        print(f"🚀 API: Starting advanced extraction from bytes for {file.filename}")
        
        extraction_result = await extraction_service.extract_tables_from_bytes(
            file_bytes=file_content,
            file_name=file.filename,
            file_type=file_ext[1:],  # Remove the dot
            confidence_threshold=confidence_threshold,
            enable_ocr=enable_ocr,
            enable_multipage=enable_multipage,
            max_tables_per_page=max_tables_per_page,
            output_format=output_format
        )
        
        print(f"✅ API: Advanced extraction from bytes completed")
        
        if not extraction_result.get("success"):
            raise HTTPException(
                status_code=400, 
                detail=f"Extraction failed: {extraction_result.get('error', 'Unknown error')}"
            )
        
        # Transform response to client format
        client_response = transform_new_extraction_response_to_client_format(
            extraction_result, file.filename, company_id
        )
        
        # Add extraction timing and metadata
        extraction_time = (datetime.now() - start_time).total_seconds()
        client_response["extraction_time_seconds"] = extraction_time
        client_response["extraction_method"] = "new_advanced_pipeline_bytes"
        
        logger.info(f"Advanced extraction from bytes completed successfully for {file.filename}")
        return client_response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Advanced extraction from bytes failed for {file.filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@router.get("/new-extraction-status")
async def get_new_extraction_status():
    """
    Get the status of the new extraction service
    """
    try:
        extraction_service = await get_new_extraction_service_instance()
        status = await extraction_service.get_extraction_status()
        return {
            "status": "success",
            "data": status
        }
    except Exception as e:
        logger.error(f"Failed to get new extraction status: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@router.post("/validate-file")
async def validate_file_for_extraction(
    file: UploadFile = File(...)
):
    """
    Validate if a file can be processed by the new extraction service
    """
    try:
        # Save file temporarily for validation
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        file_content = await file.read()
        
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)
        
        try:
            extraction_service = await get_new_extraction_service_instance()
            validation_result = await extraction_service.validate_file(file_path)
            return {
                "status": "success",
                "data": validation_result
            }
        finally:
            # Clean up temporary file
            if os.path.exists(file_path):
                os.remove(file_path)
                
    except Exception as e:
        logger.error(f"File validation failed: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@router.post("/extract-tables-smart/")
async def extract_tables_smart(
    file: UploadFile = File(...),
    company_id: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Smart extraction endpoint that automatically detects PDF type and routes to appropriate extraction method.
    - Digital PDFs: Uses new advanced extraction pipeline (TableFormer + Docling)
    - Scanned PDFs: Uses existing extraction pipeline (Google DocAI + Docling)
    """
    start_time = datetime.now()
    
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    # Save uploaded file
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    file_content = await file.read()
    
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

        # Detect PDF type
        from app.services.extraction_utils import detect_pdf_type
        pdf_type = detect_pdf_type(file_path)
        logger.info(f"Detected PDF type: {pdf_type} for {file.filename}")
        
        extraction_result = None
        extraction_method = None
        
        if pdf_type == "digital":
            # Use new advanced extraction pipeline for digital PDFs
            logger.info(f"Using new advanced extraction pipeline for digital PDF: {file.filename}")
            extraction_service = await get_new_extraction_service_instance()
            
            extraction_result = await extraction_service.extract_tables_from_file(
                file_path=file_path,
                file_type="pdf",
                confidence_threshold=0.6,
                enable_ocr=True,
                enable_multipage=True,
                max_tables_per_page=10,
                output_format="json"
            )
            extraction_method = "new_advanced_pipeline"
            
        else:
            # Use Google DocAI extractor for scanned PDFs
            logger.info(f"Using Google DocAI extractor for scanned PDF: {file.filename}")
            from app.services.extractor_google_docai import GoogleDocAIExtractor
            
            extractor = GoogleDocAIExtractor()
            extraction_result = await extractor.extract_tables_async(file_path)
            extraction_method = "google_docai"
        
        if not extraction_result.get("success"):
            raise HTTPException(
                status_code=400, 
                detail=f"Extraction failed: {extraction_result.get('error', 'Unknown error')}"
            )
        
        # Transform response based on extraction method
        if extraction_method == "new_advanced_pipeline":
            client_response = transform_new_extraction_response_to_client_format(
                extraction_result, file.filename, company_id
            )
        else:
            # Use existing transform function for existing pipeline
            from app.services.extraction_utils import transform_pipeline_response_to_client_format
            client_response = transform_pipeline_response_to_client_format(extraction_result, file.filename)
        
        # Add extraction timing and metadata
        extraction_time = (datetime.now() - start_time).total_seconds()
        client_response["extraction_time_seconds"] = extraction_time
        client_response["pdf_type"] = pdf_type
        client_response["extraction_method"] = extraction_method
        
        # Create statement upload record for database
        upload_id = uuid4()
        db_upload = schemas.StatementUpload(
            id=upload_id,
            company_id=company_id,
            file_name=s3_key,
            uploaded_at=datetime.utcnow(),
            status="extracted",
            current_step="extracted",
            raw_data=extraction_result.get("tables", []),
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
            "upload_id": str(upload_id),
            "s3_url": s3_url,
            "s3_key": s3_key
        })
        
        return client_response
        
    except HTTPException:
        # Clean up file on error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    except Exception as e:
        logger.error(f"Smart extraction error: {str(e)}")
        # Clean up file on error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Smart extraction failed: {str(e)}")


def transform_new_extraction_response_to_client_format(
    extraction_result: Dict[str, Any], 
    filename: str, 
    company_id: str
) -> Dict[str, Any]:
    """
    Transform the new extraction result to the client-expected format
    Compatible with TableEditor component and existing frontend structure
    """
    import uuid
    from datetime import datetime
    
    tables = extraction_result.get("tables", [])
    
    if not tables:
        return {
            "success": True,
            "upload_id": str(uuid.uuid4()),
            "file_name": filename,
            "tables": [],
            "quality_summary": {
                "total_tables": 0,
                "valid_tables": 0,
                "average_quality_score": 0.0,
                "overall_confidence": "LOW",
                "issues_found": ["No tables found"],
                "recommendations": ["Check PDF quality and extraction parameters"]
            },
            "extraction_method": "new_advanced_pipeline"
        }
    
    # Transform tables to the frontend-expected format
    frontend_tables = []
    total_rows = 0
    total_cells = 0
    all_valid = True
    
    for i, table in enumerate(tables):

        
        headers = table.get("headers", [])
        rows = table.get("rows", [])
        
        # Handle case where headers might be in a different field
        if not headers and "data" in table:
            # Try to extract headers from data structure
            data = table.get("data", {})
            if isinstance(data, dict) and "headers" in data:
                headers = data["headers"]
            elif isinstance(data, list) and len(data) > 0:
                # Assume first row is headers
                headers = data[0] if isinstance(data[0], list) else []
                rows = data[1:] if len(data) > 1 else []
        
        # Ensure headers and rows are properly formatted
        if not headers and rows:
            # Generate headers if missing
            max_cols = max(len(row) for row in rows) if rows else 1
            headers = [f"Column_{j+1}" for j in range(max_cols)]
        
        # Ensure all rows have the same number of columns as headers
        normalized_rows = []
        for row in rows:
            if not isinstance(row, list):
                continue  # Skip non-list rows
            normalized_row = []
            for j in range(len(headers)):
                if j < len(row):
                    normalized_row.append(str(row[j]))
                else:
                    normalized_row.append("")
            normalized_rows.append(normalized_row)
        
        # Create frontend table format
        frontend_table = {
            "header": headers,
            "rows": normalized_rows,
            "name": table.get("name", f"Table_{i+1}"),
            "id": table.get("id", str(i)),
            "extractor": "new_advanced_pipeline",
            "metadata": {
                "extraction_method": "new_advanced_pipeline",
                "confidence": table.get("confidence", 0.0),
                "page_number": table.get("page_number", 1),
                "bbox": table.get("bbox", [0, 0, 0, 0]),
                "table_type": table.get("table_type", "unknown"),
                "row_count": len(normalized_rows),
                "column_count": len(headers)
            }
        }
        
        frontend_tables.append(frontend_table)
        total_rows += len(normalized_rows)
        total_cells += sum(len(row) for row in normalized_rows)
        
        # Check if table is valid
        validation = table.get("validation", {})
        if not validation.get("is_valid", True):
            all_valid = False
    
    # Calculate quality metrics
    confidence = 1.0 if all_valid else 0.5
    quality_score = 100.0 if all_valid else 50.0
    
    return {
        "success": True,
        "upload_id": str(uuid.uuid4()),
        "file_name": filename,
        "tables": frontend_tables,
        "quality_summary": {
            "total_tables": len(frontend_tables),
            "valid_tables": len(frontend_tables) if all_valid else 0,
            "average_quality_score": quality_score,
            "overall_confidence": "HIGH" if all_valid else "MEDIUM",
            "issues_found": [] if all_valid else ["Some tables may have extraction issues"],
            "recommendations": ["Extraction completed successfully"] if all_valid else ["Review extracted data for accuracy"]
        },
        "extraction_metrics": {
            "total_text_elements": total_cells,
            "extraction_time": extraction_result.get("processing_time", 0.0),
            "table_confidence": confidence,
            "model_used": "new_advanced_pipeline"
        },
        "extraction_method": "new_advanced_pipeline",
        "processing_time": extraction_result.get("processing_time", 0),
        "confidence_scores": extraction_result.get("confidence_scores", {"overall": confidence}),
        "warnings": extraction_result.get("warnings", []),
        "errors": extraction_result.get("errors", [])
    }
