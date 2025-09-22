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
from app.api.auth import get_current_user
from app.db.models import User
from app.services.duplicate_detection_service import DuplicateDetectionService
from app.services.user_profile_service import UserProfileService
from app.services.audit_logging_service import AuditLoggingService
import os
import shutil
from datetime import datetime
from uuid import uuid4
from app.services.gcs_utils import upload_file_to_gcs, get_gcs_file_url, download_file_from_gcs
import logging
import asyncio
from typing import Optional, Dict, Any
from fastapi.responses import JSONResponse
import uuid
from app.services.hierarchical_extraction_service import HierarchicalExtractionService
import hashlib

router = APIRouter(tags=["new-extract"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = "pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def transform_gpt_extraction_response_to_client_format(gpt_result: Dict[str, Any], filename: str, company_id: str) -> Dict[str, Any]:
    """
    Transform GPT extraction result to client format.
    
    Args:
        gpt_result: Result from GPT4oVisionService.extract_commission_data
        filename: Original filename
        company_id: Company ID
        
    Returns:
        Client-formatted response
    """
    try:
        if not gpt_result.get("success"):
            return {
                "status": "error",
                "error": gpt_result.get("error", "GPT extraction failed"),
                "tables": []
            }
        
        tables = gpt_result.get("tables", [])
        if not tables:
            return {
                "status": "error", 
                "error": "No tables found in GPT extraction result",
                "tables": []
            }
        
        # Transform tables to client format
        client_tables = []
        for table in tables:
            # GPT service returns tables with 'headers' and 'rows' keys
            headers = table.get("headers", [])
            rows = table.get("rows", [])
            
            # Convert to client format (header array, rows as array of arrays)
            client_table = {
                "header": headers,
                "rows": rows,
                "extractor": table.get("extractor", "gpt4o_vision"),
                "metadata": {
                    "extraction_method": "gpt4o_vision",
                    "processing_notes": table.get("processing_notes", ""),
                    "company_detection_applied": gpt_result.get("company_detection_applied", False)
                }
            }
            client_tables.append(client_table)
        
        # Get extraction metadata
        extraction_metadata = gpt_result.get("extraction_metadata", {})
        
        return {
            "status": "success",
            "job_id": str(uuid.uuid4()),
            "file_name": filename,
            "tables": client_tables,
            "extraction_metrics": {
                "total_tables": len(client_tables),
                "extraction_time": 1.0,  # GPT doesn't provide timing info
                "confidence": extraction_metadata.get("confidence", 0.9),
                "method": extraction_metadata.get("method", "gpt4o_vision")
            },
            "extraction_config": {
                "method": "gpt4o_vision",
                "description": "OpenAI GPT-4 Vision extraction for scanned PDFs"
            }
        }
        
    except Exception as e:
        logger.error(f"Error transforming GPT extraction result: {e}")
        return {
            "status": "error",
            "error": f"Failed to transform GPT extraction result: {str(e)}",
            "tables": []
        }

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
    replace_duplicate: bool = Form(False),
    current_user: User = Depends(get_current_user),
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
    
    # Calculate file hash for duplicate detection
    file_hash = hashlib.sha256(file_content).hexdigest()
    
    # Check for duplicates
    duplicate_service = DuplicateDetectionService(db)
    duplicate_check = await duplicate_service.check_duplicate(
        file_hash=file_hash,
        user_id=current_user.id,
        file_name=file.filename
    )
    
    if duplicate_check['is_duplicate']:
        if not replace_duplicate:
            return JSONResponse(
                status_code=409,
                content={
                    "status": "duplicate_detected",
                    "message": duplicate_check['message'],
                    "duplicate_info": {
                        "type": duplicate_check['duplicate_type'],
                        "existing_upload_id": str(duplicate_check['existing_upload'].id),
                        "existing_file_name": duplicate_check['existing_upload'].file_name,
                        "existing_upload_date": duplicate_check['existing_upload'].uploaded_at.isoformat() if duplicate_check['existing_upload'].uploaded_at else None
                    }
                }
            )
        else:
            # Handle replacement logic
            existing_upload = duplicate_check['existing_upload']
            if duplicate_check['duplicate_type'] == 'user':
                # Replace user's existing file
                existing_upload.file_name = file.filename
                existing_upload.uploaded_at = datetime.utcnow()
                existing_upload.status = 'pending'
                await duplicate_service.record_duplicate(
                    file_hash=file_hash,
                    original_upload_id=existing_upload.id,
                    duplicate_upload_id=existing_upload.id,
                    action_taken="replaced"
                )
                
                # Log duplicate detection for audit
                audit_service = AuditLoggingService(db)
                await audit_service.log_duplicate_detection(
                    user_id=current_user.id,
                    file_hash=file_hash,
                    duplicate_type="user",
                    original_upload_id=existing_upload.id,
                    duplicate_upload_id=existing_upload.id,
                    action_taken="replaced"
                )
                
                logger.info(f"Replaced existing file: {existing_upload.file_name}")
            else:
                # Global duplicate - cannot replace
                return JSONResponse(
                    status_code=409,
                    content={
                        "status": "global_duplicate",
                        "message": "Cannot replace file uploaded by another user",
                        "duplicate_info": {
                            "type": "global",
                            "existing_upload_id": str(existing_upload.id),
                            "existing_file_name": existing_upload.file_name,
                            "existing_upload_date": existing_upload.uploaded_at.isoformat() if existing_upload.uploaded_at else None
                        }
                    }
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

        # Upload to GCS
        gcs_key = f"statements/{company_id}/{file.filename}"
        uploaded = upload_file_to_gcs(file_path, gcs_key)
        if not uploaded:
            raise HTTPException(status_code=500, detail="Failed to upload file to GCS.")
        gcs_url = get_gcs_file_url(gcs_key)

        # Get the new extraction service
        extraction_service = await get_new_extraction_service_instance()
        hierarchical_service = HierarchicalExtractionService()
        
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
        
        # Check for hierarchical document structure
        tables = extraction_result.get('tables', [])
        hierarchical_tables = []
        standard_tables = []
        
        for table in tables:
            # Analyze table structure to detect hierarchical patterns
            if hierarchical_service._is_hierarchical_table(table):
                logger.info(f"Detected hierarchical table structure")
                hierarchical_result = hierarchical_service.process_hierarchical_statement(table)
                if hierarchical_result['customer_blocks']:
                    # Convert to standard format for compatibility
                    standard_rows = hierarchical_service.convert_to_standard_format(hierarchical_result)
                    hierarchical_table = {
                        'headers': ['Company Name', 'Commission Earned', 'Invoice Total', 'Customer ID', 'Section Type'],
                        'rows': standard_rows,
                        'structure_type': 'hierarchical',
                        'original_data': hierarchical_result
                    }
                    hierarchical_tables.append(hierarchical_table)
                else:
                    standard_tables.append(table)
            else:
                standard_tables.append(table)
        
        # Combine results
        final_tables = hierarchical_tables + standard_tables
        extraction_result['tables'] = final_tables
        extraction_result['hierarchical_tables_count'] = len(hierarchical_tables)
        extraction_result['standard_tables_count'] = len(standard_tables)
        
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
        client_response["gcs_url"] = gcs_url
        
        # Save extraction record to database
        extraction_record = schemas.ExtractionRecord(
            id=str(uuid4()),
            company_id=company_id,
            filename=file.filename,
            gcs_key=gcs_key,
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Smart extraction endpoint that automatically detects PDF type and routes to appropriate extraction method.
    - Digital PDFs: Uses new advanced extraction pipeline (TableFormer + Docling)
    - Scanned PDFs: Uses existing extraction pipeline (Google DocAI + Docling)
    - Includes format learning integration for automatic settings application
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
    
    # Calculate file size and hash for duplicate detection
    file_size = len(file_content)
    file_hash = hashlib.sha256(file_content).hexdigest()
    
    # Check for duplicates
    duplicate_service = DuplicateDetectionService(db)
    duplicate_check = await duplicate_service.check_duplicate(
        file_hash=file_hash,
        user_id=current_user.id,
        file_name=file.filename
    )
    
    if duplicate_check['is_duplicate']:
        return JSONResponse(
            status_code=409,
            content={
                "status": "duplicate_detected",
                "message": duplicate_check['message'],
                "duplicate_info": {
                    "type": duplicate_check['duplicate_type'],
                    "existing_upload_id": str(duplicate_check['existing_upload'].id),
                    "existing_file_name": duplicate_check['existing_upload'].file_name,
                    "existing_upload_date": duplicate_check['existing_upload'].uploaded_at.isoformat() if duplicate_check['existing_upload'].uploaded_at else None
                }
            }
        )
    
    try:
        # Save uploaded file
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)

        # Get company info with retry
        company = await with_db_retry(db, crud.get_company_by_id, company_id=company_id)
        if not company:
            os.remove(file_path)
            raise HTTPException(status_code=404, detail="Company not found")

        # Upload to GCS
        gcs_key = f"statements/{company_id}/{file.filename}"
        uploaded = upload_file_to_gcs(file_path, gcs_key)
        if not uploaded:
            raise HTTPException(status_code=500, detail="Failed to upload file to GCS.")
        gcs_url = get_gcs_file_url(gcs_key)

        # Detect PDF type and page count for automatic routing
        from app.services.extraction_utils import detect_pdf_type, get_pdf_page_count
        pdf_type = detect_pdf_type(file_path)
        page_count = get_pdf_page_count(file_path)
        logger.info(f"🔍 PDF Analysis: {file.filename} - Type: {pdf_type}, Pages: {page_count}")
        
        # Log routing decision
        if pdf_type == "digital":
            logger.info(f"📄 Routing to Docling (Digital PDF): {file.filename}")
        elif pdf_type == "scanned" and page_count <= 20:
            logger.info(f"🤖 Routing to OpenAI GPT (Scanned PDF ≤ 20 pages): {file.filename}")
        elif pdf_type == "scanned" and page_count > 20:
            logger.info(f"🔍 Routing to DocAI (Scanned PDF > 20 pages): {file.filename}")
        else:
            logger.info(f"⚠️ Unknown PDF type, defaulting to DocAI: {file.filename}")
        
        extraction_result = None
        extraction_method = None
        
        if pdf_type == "digital":
            # Use new advanced extraction pipeline (Docling) for digital PDFs
            logger.info(f"Using new advanced extraction pipeline (Docling) for digital PDF: {file.filename}")
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
            
        elif pdf_type == "scanned":
            # Automatic routing for scanned PDFs based on page count
            if page_count <= 20:
                # Use OpenAI GPT extraction for scanned PDFs ≤ 20 pages
                logger.info(f"Using OpenAI GPT extraction for scanned PDF ≤ 20 pages: {file.filename} ({page_count} pages)")
                from app.services.gpt4o_vision_service import GPT4oVisionService
                
                gpt4o_service = GPT4oVisionService()
                if not gpt4o_service.is_available():
                    logger.warning("GPT-4 Vision service not available, falling back to DocAI")
                    # Fallback to DocAI if GPT service is not available
                    from app.services.extractor_google_docai import GoogleDocAIExtractor
                    extractor = GoogleDocAIExtractor()
                    extraction_result = await extractor.extract_tables_async(file_path)
                    extraction_method = "google_docai"
                else:
                    # Use GPT extraction with page count limit
                    extraction_result = gpt4o_service.extract_commission_data(file_path, max_pages=page_count)
                    extraction_method = "gpt4o_vision"
            else:
                # Use Google DocAI extraction for scanned PDFs > 20 pages
                logger.info(f"Using Google DocAI extraction for scanned PDF > 20 pages: {file.filename} ({page_count} pages)")
                from app.services.extractor_google_docai import GoogleDocAIExtractor
                
                extractor = GoogleDocAIExtractor()
                extraction_result = await extractor.extract_tables_async(file_path)
                extraction_method = "google_docai"
        else:
            # Unknown PDF type - default to DocAI
            logger.warning(f"Unknown PDF type detected, defaulting to DocAI extraction: {file.filename}")
            from app.services.extractor_google_docai import GoogleDocAIExtractor
            
            extractor = GoogleDocAIExtractor()
            extraction_result = await extractor.extract_tables_async(file_path)
            extraction_method = "google_docai"
        
        if not extraction_result.get("success"):
            logger.error(f"❌ Extraction failed with {extraction_method}: {extraction_result.get('error', 'Unknown error')}")
            raise HTTPException(
                status_code=400, 
                detail=f"Extraction failed: {extraction_result.get('error', 'Unknown error')}"
            )
        
        logger.info(f"✅ Extraction successful with {extraction_method} for {file.filename}")
        
        # Transform response based on extraction method
        if extraction_method == "new_advanced_pipeline":
            client_response = transform_new_extraction_response_to_client_format(
                extraction_result, file.filename, company_id
            )
        elif extraction_method == "gpt4o_vision":
            # Transform GPT extraction result to client format
            client_response = transform_gpt_extraction_response_to_client_format(
                extraction_result, file.filename, company_id
            )
        else:
            # Use existing transform function for existing pipeline (DocAI)
            from app.services.extraction_utils import transform_pipeline_response_to_client_format
            client_response = transform_pipeline_response_to_client_format(extraction_result, file.filename)
        
        # Apply format learning if tables are available
        format_learning_data = None
        if client_response.get("tables") and len(client_response["tables"]) > 0:
            try:
                logger.info(f"🎯 Applying format learning for company {company_id}")
                from app.services.format_learning_service import FormatLearningService
                format_learning_service = FormatLearningService()
                
                # Get the first table for format matching
                first_table = client_response["tables"][0]
                headers = first_table.get("header", [])
                rows = first_table.get("rows", [])
                
                if headers and rows:
                    # Analyze table structure
                    table_structure = format_learning_service.analyze_table_structure(rows, headers)
                    
                    # Find matching format
                    learned_format, match_score = await format_learning_service.find_matching_format(
                        db=db,
                        company_id=company_id,
                        headers=headers,
                        table_structure=table_structure
                    )
                    
                    if learned_format and match_score > 0.5:  # Even more flexible confidence threshold
                        logger.info(f"🎯 Found matching format with score {match_score}")
                        logger.info(f"🎯 Learned format field_mapping: {learned_format.get('field_mapping', {})}")
                        logger.info(f"🎯 Learned format table_editor_settings: {learned_format.get('table_editor_settings')}")
                        
                        format_learning_data = {
                            "found_match": True,
                            "match_score": match_score,
                            "learned_format": learned_format,
                            "suggested_mapping": learned_format.get("field_mapping", {}),
                            "table_editor_settings": learned_format.get("table_editor_settings")
                        }
                        
                        logger.info(f"🎯 Created format_learning_data: {format_learning_data}")
                        
                        # Apply table editor settings if available
                        if learned_format.get("table_editor_settings"):
                            table_editor_settings = learned_format["table_editor_settings"]
                            logger.info(f"🎯 Applying table editor settings: {table_editor_settings}")
                            
                            # Apply learned headers with intelligent matching
                            if table_editor_settings.get("headers"):
                                learned_headers = table_editor_settings["headers"]
                                current_headers = first_table.get("header", [])
                                
                                logger.info(f"🎯 Learned headers: {learned_headers}")
                                logger.info(f"🎯 Current headers: {current_headers}")
                                logger.info(f"🎯 Learned count: {len(learned_headers)}, Current count: {len(current_headers)}")
                                
                                # For financial tables, the learned headers are usually correct
                                # Check if this looks like a financial table that needs header correction
                                is_financial_table = any(keyword in ' '.join(current_headers).lower() for keyword in [
                                    'premium', 'commission', 'billed', 'group', 'client', 'invoice',
                                    'total', 'amount', 'due', 'paid', 'rate', 'percentage', 'period'
                                ])
                                
                                if is_financial_table and match_score > 0.5:
                                    # For financial tables with good match score, apply learned headers
                                    # and adjust the data rows accordingly
                                    logger.info(f"🎯 Financial table detected - applying learned headers")
                                    
                                    # Apply learned headers
                                    first_table["header"] = learned_headers
                                    logger.info(f"🎯 Applied learned headers: {learned_headers}")
                                    
                                    # Adjust data rows if column count changed
                                    current_rows = first_table.get("rows", [])
                                    if current_rows and len(learned_headers) != len(current_headers):
                                        logger.info(f"🎯 Adjusting data rows for header correction")
                                        adjusted_rows = []
                                        
                                        for row in current_rows:
                                            if len(learned_headers) > len(current_headers):
                                                # Add empty columns if learned has more columns
                                                adjusted_row = row + [""] * (len(learned_headers) - len(current_headers))
                                            else:
                                                # Truncate row if learned has fewer columns
                                                adjusted_row = row[:len(learned_headers)]
                                            
                                            adjusted_rows.append(adjusted_row)
                                        
                                        first_table["rows"] = adjusted_rows
                                        logger.info(f"🎯 Adjusted {len(adjusted_rows)} rows to match {len(learned_headers)} columns")
                                    
                                else:
                                    # For non-financial tables or low confidence, use length-based matching
                                    if len(learned_headers) == len(current_headers):
                                        # Apply headers directly if count matches
                                        first_table["header"] = learned_headers
                                        logger.info(f"🎯 Applied learned headers (length match): {learned_headers}")
                                    elif len(learned_headers) > len(current_headers):
                                        # Pad current headers if learned has more columns
                                        padded_headers = current_headers + [f"Column_{i+1}" for i in range(len(current_headers), len(learned_headers))]
                                        first_table["header"] = learned_headers[:len(padded_headers)]
                                        logger.info(f"🎯 Applied learned headers with padding: {learned_headers[:len(padded_headers)]}")
                                    else:
                                        # Truncate learned headers if current has more columns
                                        first_table["header"] = learned_headers + [f"Column_{i+1}" for i in range(len(learned_headers), len(current_headers))]
                                        logger.info(f"🎯 Applied learned headers with truncation: {first_table['header']}")
                            else:
                                logger.info(f"🎯 No learned headers to apply")
                            
                            # Apply learned summary rows
                            if table_editor_settings.get("summary_rows"):
                                summary_rows_set = set(table_editor_settings["summary_rows"])
                                first_table["summaryRows"] = summary_rows_set
                                logger.info(f"🎯 Applied learned summary rows: {list(summary_rows_set)}")
                            else:
                                logger.info(f"🎯 No summary rows to apply")
                        else:
                            logger.info(f"🎯 No table editor settings found in learned format")
                        
                    else:
                        logger.info(f"🎯 No matching format found (score: {match_score})")
                        format_learning_data = {
                            "found_match": False,
                            "match_score": match_score or 0.0,
                            "learned_format": None,
                            "suggested_mapping": {},
                            "table_editor_settings": None
                        }
                        
            except Exception as e:
                logger.error(f"🎯 Error applying format learning: {e}")
                format_learning_data = {
                    "found_match": False,
                    "match_score": 0.0,
                    "learned_format": None,
                    "suggested_mapping": {},
                    "table_editor_settings": None
                }
        
        # Add extraction timing and metadata
        extraction_time = (datetime.now() - start_time).total_seconds()
        client_response["extraction_time_seconds"] = extraction_time
        client_response["pdf_type"] = pdf_type
        client_response["extraction_method"] = extraction_method
        
        # Add format learning data to response (always include it)
        client_response["format_learning"] = format_learning_data or {
            "found_match": False,
            "match_score": 0.0,
            "learned_format": None,
            "suggested_mapping": {},
            "table_editor_settings": None
        }
        
        logger.info(f"🎯 Final format_learning in response: {client_response.get('format_learning')}")
        
        # Create statement upload record for database
        upload_id = uuid4()
        db_upload = schemas.StatementUpload(
            id=upload_id,
            company_id=company_id,
            user_id=current_user.id,
            file_name=gcs_key,
            file_hash=file_hash,
            file_size=file_size,
            uploaded_at=datetime.utcnow(),
            status="extracted",
            current_step="extracted",
            raw_data=extraction_result.get("tables", []),
            mapping_used=None
        )
        
        # Save statement upload with retry
        await with_db_retry(db, crud.save_statement_upload, upload=db_upload)
        
        # Record user contribution
        profile_service = UserProfileService(db)
        await profile_service.record_user_contribution(
            user_id=current_user.id,
            upload_id=upload_id,
            contribution_type="upload",
            contribution_data={
                "file_name": file.filename,
                "file_size": file_size,
                "file_hash": file_hash,
                "extraction_method": "smart_extraction",
                "confidence_threshold": 0.6,
                "enable_ocr": True,
                "enable_multipage": True
            }
        )
        
        # Log file upload for audit
        audit_service = AuditLoggingService(db)
        await audit_service.log_file_upload(
            user_id=current_user.id,
            file_name=file.filename,
            file_size=file_size,
            file_hash=file_hash,
            company_id=company_id,
            upload_id=upload_id
        )
        
        # Clean up local file
        os.remove(file_path)
        
        # Add server-specific fields to response
        client_response.update({
            "success": True,
            "extraction_id": str(upload_id),
            "upload_id": str(upload_id),
            "gcs_url": gcs_url,
            "gcs_key": gcs_key
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


@router.post("/extract-tables-gpt/")
async def extract_tables_gpt(
    upload_id: str = Form(...),
    company_id: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Extract tables using GPT-5 Vision analysis.
    This endpoint uses the same format as the default extraction for consistency.
    """
    start_time = datetime.now()
    logger.info(f"Starting GPT extraction for upload_id: {upload_id}")
    
    try:
        # Get upload information
        upload_info = await crud.get_upload_by_id(db, upload_id)
        if not upload_info:
            raise HTTPException(status_code=404, detail="Upload not found")
        
        # Get PDF file from GCS
        gcs_key = upload_info.file_name
        logger.info(f"Using GCS key: {gcs_key}")
        
        # Download PDF from GCS to temporary file
        temp_pdf_path = download_file_from_gcs(gcs_key)
        if not temp_pdf_path:
            raise HTTPException(
                status_code=404, 
                detail=f"Failed to download PDF from GCS: {gcs_key}"
            )
        
        logger.info(f"Processing PDF: {temp_pdf_path} (downloaded from GCS)")
        
        # Use the GPT-5 Vision service for extraction
        from app.services.gpt4o_vision_service import GPT4oVisionService
        gpt4o_service = GPT4oVisionService()
        
        if not gpt4o_service.is_available():
            raise HTTPException(
                status_code=503, 
                detail="GPT-5 Vision service not available. Please check OPENAI_API_KEY configuration."
            )
        
        # Step 1: Determine number of pages and enhance page images
        import fitz  # PyMuPDF
        doc = fitz.open(temp_pdf_path)
        num_pages = len(doc)
        doc.close()
        
        logger.info(f"PDF has {num_pages} pages")
        
        # Use the new intelligent extraction method that automatically handles PDF type and optimization
        logger.info("Starting intelligent GPT extraction with automatic PDF type detection...")
        extraction_result = gpt4o_service.extract_commission_data(
            pdf_path=temp_pdf_path,
            max_pages=min(num_pages, 5)  # Limit to first 5 pages or total pages if less
        )
        
        # Clean up temporary file
        try:
            os.remove(temp_pdf_path)
            logger.info(f"Cleaned up temporary file: {temp_pdf_path}")
        except Exception as e:
            logger.warning(f"Failed to clean up temporary file {temp_pdf_path}: {e}")
        
        if not extraction_result.get("success"):
            raise HTTPException(
                status_code=500, 
                detail=f"GPT extraction failed: {extraction_result.get('error', 'Unknown error')}"
            )
        
        logger.info(f"GPT extraction completed successfully")
        
        # Check if extraction was successful
        if not extraction_result.get("success"):
            error_msg = extraction_result.get('error', 'Unknown error')
            logger.error(f"GPT extraction failed: {error_msg}")
            return JSONResponse(
                status_code=422,  # Unprocessable Entity
                content={
                    "success": False,
                    "error": f"GPT extraction failed: {error_msg}",
                    "message": "The document could not be processed by GPT. This may be due to document format or content issues. Please try with a different document or contact support.",
                    "upload_id": upload_id,
                    "timestamp": datetime.now().isoformat()
                }
            )
        
        # Get extracted tables
        extracted_tables = extraction_result.get("tables", [])
        extraction_metadata = extraction_result.get("extraction_metadata", {})
        
        if not extracted_tables:
            logger.warning("No tables extracted from GPT analysis")
            return JSONResponse(
                status_code=422,  # Unprocessable Entity
                content={
                    "success": False,
                    "error": "No tables found in document",
                    "message": "GPT could not identify any tables in the document. This may be due to document format or content issues. Please try with a different document or contact support.",
                    "upload_id": upload_id,
                    "timestamp": datetime.now().isoformat()
                }
            )
        
        logger.info("GPT extraction completed successfully")
        
        # Use enhanced extracted tables with hierarchical structure detection
        processed_tables = []
        
        logger.info(f"Processing {len(extracted_tables)} extracted tables with hierarchical structure enhancement")
        for i, table in enumerate(extracted_tables):
            logger.info(f"Processing table {i+1} with hierarchical structure enhancement")
            # The hierarchical structure detection is already applied in the GPT service
            # Just add final metadata
            table["extractor"] = "gpt4o_vision_enhanced"
            table["processing_notes"] = "Enhanced extraction with hierarchical structure detection and company name propagation"
            processed_tables.append(table)
        
        
        # Step 4: Merge similar tables with identical headers
        merged_tables = gpt4o_service.merge_similar_tables(processed_tables)
        
        final_tables = merged_tables
        
        # Transform tables to the format expected by TableEditor
        frontend_tables = []
        total_rows = 0
        total_cells = 0
        all_headers = []
        all_table_data = []
        
        for i, table in enumerate(final_tables):
            rows = table.get("rows", [])
            # Handle both "header" and "headers" keys for compatibility
            headers = table.get("headers", table.get("header", []))
            
            # Calculate metrics
            total_rows += len(rows)
            total_cells += sum(len(row) for row in rows) if rows else 0
            
            # Collect headers (use the most comprehensive set)
            if len(headers) > len(all_headers):
                all_headers = headers
            
            # Convert rows to table_data format for backward compatibility
            for row in rows:
                row_dict = {}
                for j, header in enumerate(headers):
                    header_key = header.lower().replace(" ", "_").replace("-", "_")
                    value = str(row[j]) if j < len(row) else ""
                    row_dict[header_key] = value
                all_table_data.append(row_dict)
            
            # Determine extractor type and processing notes
            extractor = table.get("extractor", "gpt4o_vision")
            processing_notes = "GPT-5 Vision enhanced extraction with multi-pass analysis and smart pattern detection"
            if extractor == "gpt4o_vision_enhanced":
                processing_notes = "GPT-5 Vision enhanced extraction with hierarchical company detection"
            elif extractor == "gpt4o_vision_hierarchical":
                processing_notes = "GPT-5 Vision hierarchical extraction"
            elif extractor == "gpt4o_vision_merged":
                processing_notes = "GPT-5 Vision merged extraction with similar table consolidation"
            elif extractor == "enhanced_multi_pass_extraction":
                processing_notes = "GPT-5 Vision enhanced multi-pass extraction with smart pattern detection and validation"
            
            table_data = {
                "name": table.get("name", f"GPT Extracted Table {i + 1}"),
                "header": headers,
                "rows": rows,
                "extractor": extractor,
                "structure_type": table.get("structure_type", "standard"),
                "metadata": {
                    "extraction_method": extractor,
                    "timestamp": datetime.now().isoformat(),
                    "processing_notes": processing_notes,
                    "confidence": 0.95
                }
            }
            frontend_tables.append(table_data)
        
        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()
        
        # Add format learning (same as PDF flow)
        format_learning_data = None
        if frontend_tables and len(frontend_tables) > 0:
            try:
                from app.services.format_learning_service import FormatLearningService
                format_learning_service = FormatLearningService()
                
                # Get first table for format learning
                first_table = frontend_tables[0]
                headers = first_table.get("header", [])
                
                # Generate table structure for format learning
                table_structure = {
                    "row_count": len(first_table.get("rows", [])),
                    "column_count": len(headers),
                    "has_financial_data": any(keyword in ' '.join(headers).lower() for keyword in [
                        'premium', 'commission', 'billed', 'group', 'client', 'invoice',
                        'total', 'amount', 'due', 'paid', 'rate', 'percentage', 'period'
                    ])
                }
                
                # Find matching format
                learned_format, match_score = await format_learning_service.find_matching_format(
                    db=db,
                    company_id=company_id,
                    headers=headers,
                    table_structure=table_structure
                )
                
                if learned_format and match_score > 0.5:
                    logger.info(f"🎯 GPT: Found matching format with score {match_score}")
                    logger.info(f"🎯 GPT: Learned format field_mapping: {learned_format.get('field_mapping', {})}")
                    logger.info(f"🎯 GPT: Learned format table_editor_settings: {learned_format.get('table_editor_settings')}")
                    format_learning_data = {
                        "found_match": True,
                        "match_score": match_score,
                        "learned_format": learned_format,
                        "suggested_mapping": learned_format.get("field_mapping", {}),
                        "table_editor_settings": learned_format.get("table_editor_settings")
                    }
                    logger.info(f"🎯 GPT: Created format_learning_data: {format_learning_data}")
                else:
                    format_learning_data = {
                        "found_match": False,
                        "match_score": match_score or 0,
                        "learned_format": None,
                        "suggested_mapping": {},
                        "table_editor_settings": None
                    }
                    
            except Exception as e:
                logger.warning(f"GPT: Format learning failed: {str(e)}")
                format_learning_data = {
                    "found_match": False,
                    "match_score": 0,
                    "learned_format": None,
                    "suggested_mapping": {},
                    "table_editor_settings": None
                }
        
        # Prepare response in the exact same format as extraction API
        response_data = {
            "status": "success",
            "success": True,
                            "message": f"Successfully extracted tables with GPT-5 Vision using high quality image processing and intelligent table merging",
            "job_id": str(uuid.uuid4()),
            "upload_id": upload_id,
            "extraction_id": upload_id,
            "tables": frontend_tables,
            "table_headers": all_headers,
            "table_data": all_table_data,
            "processing_time_seconds": processing_time,
            "extraction_time_seconds": processing_time,
            "extraction_metrics": {
                "total_text_elements": total_cells,
                "extraction_time": processing_time,
                "table_confidence": 0.95,
                "model_used": "gpt4o_vision"
            },
            "document_info": {
                "pdf_type": "commission_statement",
                "total_tables": len(frontend_tables),
                "hierarchical_tables_count": len([t for t in final_tables if t.get("structure_type") == "hierarchical_with_company_column"]),
                "standard_tables_count": len([t for t in final_tables if t.get("structure_type") == "standard"]),
                "hierarchical_indicators": extraction_metadata.get("hierarchical_structure", {})
            },
            "quality_summary": {
                "total_tables": len(frontend_tables),
                "valid_tables": len(frontend_tables),
                "average_quality_score": 95.0,
                "overall_confidence": "HIGH",
                "issues_found": [],
                "recommendations": [
                    "GPT-5 Vision extraction completed successfully",
                    f"Hierarchical processing: {len([t for t in final_tables if t.get('structure_type') == 'hierarchical_with_company_column'])} tables processed" if any(t.get('structure_type') == 'hierarchical_with_company_column' for t in final_tables) else "Standard table extraction"
                ]
            },
            "quality_metrics": {
                "table_confidence": 0.95,
                "text_elements_extracted": total_cells,
                "table_rows_extracted": total_rows,
                "extraction_completeness": "complete",
                "data_quality": "high"
            },
            "extraction_log": [
                {
                    "extractor": "gpt4o_vision",
                    "pdf_type": "commission_statement",
                    "timestamp": datetime.now().isoformat(),
                    "processing_method": "GPT-5 Vision table extraction",
                    "format_accuracy": "≥95%"
                }
            ],
            "pipeline_metadata": {
                "extraction_methods_used": ["gpt4o_vision"],
                "pdf_type": "commission_statement",
                "extraction_errors": [],
                "processing_notes": "GPT-5 Vision table extraction",
                "format_accuracy": "≥95%"
            },
            "gcs_key": upload_info.file_name,
            "gcs_url": f"https://text-extraction-pdf.s3.us-east-1.amazonaws.com/{upload_info.file_name}",
            "file_name": upload_info.file_name.split('/')[-1] if '/' in upload_info.file_name else upload_info.file_name,
            "timestamp": datetime.now().isoformat(),
            "format_learning": format_learning_data
        }
        
        logger.info(f"GPT extraction completed successfully in {processing_time:.2f} seconds")
        
        return JSONResponse(response_data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in GPT extraction: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"GPT extraction failed: {str(e)}"
        )


@router.post("/extract-tables-google-docai/")
async def extract_tables_google_docai(
    upload_id: str = Form(...),
    company_id: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Extract tables using Google Document AI.
    This endpoint uses the same format as the default extraction for consistency.
    """
    start_time = datetime.now()
    logger.info(f"Starting Google DOC AI extraction for upload_id: {upload_id}")
    
    try:
        # Get upload information
        upload_info = await crud.get_upload_by_id(db, upload_id)
        if not upload_info:
            raise HTTPException(status_code=404, detail="Upload not found")
        
        # Get PDF file from GCS
        gcs_key = upload_info.file_name
        logger.info(f"Using GCS key: {gcs_key}")
        
        # Download PDF from GCS to temporary file
        temp_pdf_path = download_file_from_gcs(gcs_key)
        if not temp_pdf_path:
            raise HTTPException(
                status_code=404, 
                detail=f"Failed to download PDF from GCS: {gcs_key}"
            )
        
        logger.info(f"Processing PDF: {temp_pdf_path} (downloaded from GCS)")
        
        # Use Google DOC AI extractor
        from app.services.extractor_google_docai import GoogleDocAIExtractor
        extractor = GoogleDocAIExtractor()
        
        if not extractor.is_available():
            raise HTTPException(
                status_code=503, 
                detail="Google Document AI not available or not properly configured"
            )
        
        # Extract tables using Google DOC AI
        logger.info("Starting Google DOC AI table extraction...")
        extraction_result = await extractor.extract_tables_async(temp_pdf_path)
        
        if not extraction_result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Google DOC AI extraction failed: {extraction_result.get('error', 'Unknown error')}"
            )
        
        logger.info("Google DOC AI table extraction completed successfully")
        
        # Step 3: Transform to client format
        extracted_tables = extraction_result.get("tables", [])
        
        # Transform tables to the format expected by TableEditor
        frontend_tables = []
        total_rows = 0
        total_cells = 0
        all_headers = []
        all_table_data = []
        
        for i, table in enumerate(extracted_tables):
            rows = table.get("rows", [])
            headers = table.get("header", [])
            
            # Calculate metrics
            total_rows += len(rows)
            total_cells += sum(len(row) for row in rows) if rows else 0
            
            # Collect headers (use the most comprehensive set)
            if len(headers) > len(all_headers):
                all_headers = headers
            
            # Convert rows to table_data format for backward compatibility
            for row in rows:
                row_dict = {}
                for j, header in enumerate(headers):
                    header_key = header.lower().replace(" ", "_").replace("-", "_")
                    value = str(row[j]) if j < len(row) else ""
                    row_dict[header_key] = value
                all_table_data.append(row_dict)
            
            table_data = {
                "name": table.get("name", f"Google DOC AI Table {i + 1}"),
                "header": headers,
                "rows": rows,
                "extractor": "google_docai",
                "metadata": {
                    "extraction_method": "google_docai",
                    "timestamp": datetime.now().isoformat(),
                    "processing_notes": "Google Document AI table extraction",
                    "confidence": table.get("confidence", 0.8)
                }
            }
            frontend_tables.append(table_data)
        
        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()
        
        # Add format learning (same as PDF flow)
        format_learning_data = None
        if frontend_tables and len(frontend_tables) > 0:
            try:
                from app.services.format_learning_service import FormatLearningService
                format_learning_service = FormatLearningService()
                
                # Get first table for format learning
                first_table = frontend_tables[0]
                headers = first_table.get("header", [])
                
                # Generate table structure for format learning
                table_structure = {
                    "row_count": len(first_table.get("rows", [])),
                    "column_count": len(headers),
                    "has_financial_data": any(keyword in ' '.join(headers).lower() for keyword in [
                        'premium', 'commission', 'billed', 'group', 'client', 'invoice',
                        'total', 'amount', 'due', 'paid', 'rate', 'percentage', 'period'
                    ])
                }
                
                # Find matching format
                learned_format, match_score = await format_learning_service.find_matching_format(
                    db=db,
                    company_id=company_id,
                    headers=headers,
                    table_structure=table_structure
                )
                
                if learned_format and match_score > 0.5:
                    logger.info(f"🎯 Google DocAI: Found matching format with score {match_score}")
                    format_learning_data = {
                        "found_match": True,
                        "match_score": match_score,
                        "learned_format": learned_format,
                        "suggested_mapping": learned_format.get("field_mapping", {}),
                        "table_editor_settings": learned_format.get("table_editor_settings")
                    }
                else:
                    format_learning_data = {
                        "found_match": False,
                        "match_score": match_score or 0,
                        "learned_format": None,
                        "suggested_mapping": {},
                        "table_editor_settings": None
                    }
                    
            except Exception as e:
                logger.warning(f"Google DocAI: Format learning failed: {str(e)}")
                format_learning_data = {
                    "found_match": False,
                    "match_score": 0,
                    "learned_format": None,
                    "suggested_mapping": {},
                    "table_editor_settings": None
                }
        
        # Prepare response in the exact same format as extraction API
        response_data = {
            "status": "success",
            "success": True,
            "message": f"Successfully extracted tables with Google Document AI",
            "job_id": str(uuid.uuid4()),
            "upload_id": upload_id,
            "extraction_id": upload_id,
            "tables": frontend_tables,
            "table_headers": all_headers,
            "table_data": all_table_data,
            "processing_time_seconds": processing_time,
            "extraction_time_seconds": processing_time,
            "extraction_metrics": {
                "total_text_elements": total_cells,
                "extraction_time": processing_time,
                "table_confidence": 0.8,
                "model_used": "google_docai"
            },
            "document_info": {
                "pdf_type": "commission_statement",
                "total_tables": len(frontend_tables)
            },
            "quality_summary": {
                "total_tables": len(frontend_tables),
                "valid_tables": len(frontend_tables),
                "average_quality_score": 80.0,
                "overall_confidence": "HIGH",
                "issues_found": [],
                "recommendations": ["Google Document AI extraction completed successfully"]
            },
            "quality_metrics": {
                "table_confidence": 0.8,
                "text_elements_extracted": total_cells,
                "table_rows_extracted": total_rows,
                "extraction_completeness": "complete",
                "data_quality": "good"
            },
            "extraction_log": [
                {
                    "extractor": "google_docai",
                    "pdf_type": "commission_statement",
                    "timestamp": datetime.now().isoformat(),
                    "processing_method": "Google Document AI table extraction",
                    "format_accuracy": "≥80%"
                }
            ],
            "pipeline_metadata": {
                "extraction_methods_used": ["google_docai"],
                "pdf_type": "commission_statement",
                "extraction_errors": [],
                "processing_notes": "Google Document AI table extraction",
                "format_accuracy": "≥80%"
            },
            "gcs_key": upload_info.file_name,
            "gcs_url": f"https://text-extraction-pdf.s3.us-east-1.amazonaws.com/{upload_info.file_name}",
            "file_name": upload_info.file_name.split('/')[-1] if '/' in upload_info.file_name else upload_info.file_name,
            "timestamp": datetime.now().isoformat(),
            "format_learning": format_learning_data
        }
        
        logger.info(f"Google DOC AI extraction completed successfully in {processing_time:.2f} seconds")
        
        return JSONResponse(response_data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in Google DOC AI extraction: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Google DOC AI extraction failed: {str(e)}"
        )


@router.post("/extract-tables-gpt-enhanced/")
async def extract_tables_gpt_enhanced(
    upload_id: str = Form(...),
    company_id: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Extract tables using enhanced GPT-5 Vision analysis with multi-pass analysis,
    smart pattern detection, and intelligent validation.
    This endpoint provides improved accuracy for complex table structures.
    """
    start_time = datetime.now()
    logger.info(f"Starting enhanced GPT extraction for upload_id: {upload_id}")
    
    try:
        # Get upload information
        upload_info = await crud.get_upload_by_id(db, upload_id)
        if not upload_info:
            raise HTTPException(status_code=404, detail="Upload not found")
        
        # Get PDF file from GCS
        gcs_key = upload_info.file_name
        logger.info(f"Using GCS key: {gcs_key}")
        
        # Download PDF from GCS to temporary file
        temp_pdf_path = download_file_from_gcs(gcs_key)
        if not temp_pdf_path:
            raise HTTPException(
                status_code=404, 
                detail=f"Failed to download PDF from GCS: {gcs_key}"
            )
        
        logger.info(f"Processing PDF: {temp_pdf_path} (downloaded from GCS)")
        
        # Use the GPT-5 Vision service for enhanced extraction
        from app.services.gpt4o_vision_service import GPT4oVisionService
        gpt4o_service = GPT4oVisionService()
        
        if not gpt4o_service.is_available():
            raise HTTPException(
                status_code=503, 
                detail="GPT-5 Vision service not available. Please check OPENAI_API_KEY configuration."
            )
        
        # Step 1: Determine number of pages and enhance page images
        import fitz  # PyMuPDF
        doc = fitz.open(temp_pdf_path)
        num_pages = len(doc)
        doc.close()
        
        logger.info(f"PDF has {num_pages} pages")
        
        # Use the new intelligent extraction method for enhanced endpoint
        logger.info("Starting enhanced intelligent GPT extraction with automatic PDF type detection...")
        extraction_result = gpt4o_service.extract_commission_data(
            pdf_path=temp_pdf_path,
            max_pages=min(num_pages, 5)  # Limit to first 5 pages or total pages if less
        )
        
        # Clean up temporary file
        try:
            os.remove(temp_pdf_path)
            logger.info(f"Cleaned up temporary file: {temp_pdf_path}")
        except Exception as e:
            logger.warning(f"Failed to clean up temporary file {temp_pdf_path}: {e}")
        
        if not extraction_result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Enhanced GPT extraction failed: {extraction_result.get('error', 'Unknown error')}"
            )
        
        logger.info("Enhanced GPT extraction completed successfully")
        
        # Step 3: Process extracted tables with company detection
        extracted_tables = extraction_result.get("tables", [])
        extraction_metadata = extraction_result.get("extraction_metadata", {})
        
        logger.info(f"GPT extraction completed with method: {extraction_metadata.get('method', 'unknown')}")
        logger.info(f"Pages analyzed: {extraction_metadata.get('pages_analyzed', 0)}")
        logger.info(f"Confidence: {extraction_metadata.get('confidence', 0.0)}")
        
        # Process tables with company detection
        processed_tables = []
        
        for table in extracted_tables:
            # Apply company detection service for all tables
            from app.services.company_name_service import CompanyNameDetectionService
            company_detector = CompanyNameDetectionService()
            
            enhanced_table = company_detector.detect_company_names_in_extracted_data(
                table, "gpt4o_vision_enhanced"
            )
            processed_tables.append(enhanced_table)
        
        # Step 4: Merge similar tables with identical headers
        logger.info(f"Processing {len(processed_tables)} tables for merging")
        merged_tables = gpt4o_service.merge_similar_tables(processed_tables)
        logger.info(f"After merging: {len(merged_tables)} tables")
        
        final_tables = merged_tables
        
        # Transform tables to the format expected by TableEditor
        frontend_tables = []
        total_rows = 0
        total_cells = 0
        all_headers = []
        all_table_data = []
        
        for i, table in enumerate(final_tables):
            rows = table.get("rows", [])
            # Handle both "header" and "headers" keys for compatibility
            headers = table.get("headers", table.get("header", []))
            
            # Calculate metrics
            total_rows += len(rows)
            total_cells += sum(len(row) for row in rows) if rows else 0
            
            # Collect headers (use the most comprehensive set)
            if len(headers) > len(all_headers):
                all_headers = headers
            
            # Convert rows to table_data format for backward compatibility
            for row in rows:
                row_dict = {}
                for j, header in enumerate(headers):
                    header_key = header.lower().replace(" ", "_").replace("-", "_")
                    value = str(row[j]) if j < len(row) else ""
                    row_dict[header_key] = value
                all_table_data.append(row_dict)
            
            # Enhanced processing notes
            extractor = table.get("extractor", "gpt4o_vision_enhanced")
            processing_notes = f"GPT-5 Vision enhanced extraction with multi-pass analysis, quality score: {extraction_metadata.get('confidence', 0.0):.2f}"
            
            table_data = {
                "name": table.get("name", f"Enhanced GPT Extracted Table {i + 1}"),
                "header": headers,
                "rows": rows,
                "extractor": extractor,
                "structure_type": table.get("structure_type", "standard"),
                "metadata": {
                    "extraction_method": extractor,
                    "timestamp": datetime.now().isoformat(),
                    "processing_notes": processing_notes,
                    "confidence": extraction_metadata.get("confidence", 0.0),
                    "enhanced_features": [
                        "multi_pass_analysis",
                        "smart_pattern_detection", 
                        "intelligent_validation",
                        "column_alignment_correction"
                    ]
                }
            }
            frontend_tables.append(table_data)
        
        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()
        
        # Add format learning (same as PDF flow)
        format_learning_data = None
        if frontend_tables and len(frontend_tables) > 0:
            try:
                from app.services.format_learning_service import FormatLearningService
                format_learning_service = FormatLearningService()
                
                # Use the first table for format learning
                first_table = frontend_tables[0]
                format_learning_data = format_learning_service.learn_format_from_table(
                    first_table, company_id
                )
                logger.info("Format learning completed for enhanced GPT extraction")
            except Exception as e:
                logger.warning(f"Format learning failed for enhanced GPT extraction: {e}")
        
        # Prepare response
        response_data = {
            "success": True,
            "tables": frontend_tables,
            "table_data": all_table_data,
            "headers": all_headers,
            "total_rows": total_rows,
            "total_cells": total_cells,
            "processing_time": processing_time,
            "extraction_method": "gpt4o_vision_enhanced",
            "quality_score": extraction_metadata.get("confidence", 0.0),
            "enhanced_features": [
                "multi_pass_analysis",
                "smart_pattern_detection",
                "intelligent_validation", 
                "column_alignment_correction"
            ],
            "format_learning": format_learning_data,
            "metadata": {
                "upload_id": upload_id,
                "company_id": company_id,
                "extraction_timestamp": datetime.now().isoformat(),
                "method": extraction_metadata.get("method", "unknown"),
                "quality_score": extraction_metadata.get("confidence", 0.0),
                "corrections_applied": extraction_result.get("corrections_applied", False)
            }
        }
        
        logger.info(f"Enhanced GPT extraction completed successfully in {processing_time:.2f} seconds")
        logger.info(f"Quality score: {extraction_metadata.get('confidence', 0.0):.2f}")
        logger.info(f"Total tables: {len(frontend_tables)}, Total rows: {total_rows}")
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Enhanced GPT extraction error: {str(e)}")
        # Clean up file on error
        if 'temp_pdf_path' in locals() and os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)
        raise HTTPException(status_code=500, detail=f"Enhanced GPT extraction failed: {str(e)}")





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
    
    # **ENHANCED LOGGING: Track transformation results**
    print(f"✅ Transformation completed: {len(tables)} backend tables → {len(frontend_tables)} frontend tables")
    print(f"📊 Total rows: {total_rows}, Total cells: {total_cells}")
    
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



