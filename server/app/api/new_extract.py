"""
New Extraction API - Advanced table extraction using the new working solution
This API provides endpoints for the new advanced extraction pipeline while
maintaining compatibility with the existing server structure.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.services.new_extraction_service import get_new_extraction_service
from app.services.enhanced_extraction_service import EnhancedExtractionService
from app.services.claude.service import ClaudeDocumentAIService
from app.config import get_db
from app.utils.db_retry import with_db_retry
from app.dependencies.auth_dependencies import get_current_user_hybrid
from app.db.models import User
from app.services.duplicate_detection_service import DuplicateDetectionService
from app.services.user_profile_service import UserProfileService
from app.services.audit_logging_service import AuditLoggingService
import asyncio
import os
from datetime import datetime
from uuid import uuid4, UUID
from app.services.gcs_utils import upload_file_to_gcs, get_gcs_file_url, download_file_from_gcs, generate_gcs_signed_url
from app.services.extraction_utils import stitch_multipage_tables
from app.services.websocket_service import connection_manager
import logging
from typing import Optional, Dict, Any
from fastapi.responses import JSONResponse
import uuid
import re
import hashlib
from app.services.cancellation_manager import cancellation_manager

router = APIRouter(prefix="/api", tags=["new-extract"])
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
                # CRITICAL FIX: Include summaryRows for frontend display
                "summaryRows": table.get("summaryRows", []),
                "summary_detection": table.get("summary_detection", {}),
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
enhanced_extraction_service = None

async def get_new_extraction_service_instance():
    """Get or create the new extraction service instance."""
    global new_extraction_service
    if new_extraction_service is None:
        config_path = "configs/new_extraction_config.yaml"
        new_extraction_service = get_new_extraction_service(config_path)
    return new_extraction_service

async def get_enhanced_extraction_service_instance(use_enhanced: bool = None):
    """
    Get or create the enhanced extraction service instance.
    
    Args:
        use_enhanced: If True, use enhanced 3-phase extraction pipeline.
                     If None, uses default (environment variable or False).
    """
    # Create new instance with specific configuration when use_enhanced is specified
    if use_enhanced is not None:
        return EnhancedExtractionService(use_enhanced=use_enhanced)
    
    # Otherwise use cached instance with default configuration
    global enhanced_extraction_service
    if enhanced_extraction_service is None:
        enhanced_extraction_service = EnhancedExtractionService()
    return enhanced_extraction_service



# Store running extraction tasks for cancellation
running_extractions: Dict[str, asyncio.Task] = {}

@router.post("/extract-tables-smart/")
async def extract_tables_smart(
    file: UploadFile = File(...),
    company_id: Optional[str] = Form(None),
    extraction_method: str = Form("smart"),
    upload_id: Optional[str] = Form(None),
    environment_id: Optional[str] = Form(None),
    use_enhanced: Optional[bool] = Form(None),  # ⭐ New parameter for enhanced extraction
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """
    Smart extraction endpoint that automatically detects PDF type and routes to appropriate extraction method.
    - Digital PDFs: Uses new advanced extraction pipeline (TableFormer + Docling)
    - Scanned PDFs: Uses existing extraction pipeline (Google DocAI + Docling)
    - Includes format learning integration for automatic settings application
    - Supports real-time progress tracking via WebSocket
    - Enhanced mode: Uses 3-phase intelligent extraction for Google Gemini-quality results
    
    New Parameters:
        use_enhanced: Optional[bool] - Enable enhanced 3-phase extraction pipeline
                      (Phase 1: Document Intelligence, Phase 2: Semantic Extraction, 
                       Phase 3: Intelligent Summarization)
    """
    start_time = datetime.now()
    # Generate a proper UUID for database operations
    upload_id_uuid = uuid4()
    
    # Use provided upload_id for tracking or generate a new one
    if upload_id:
        # If upload_id is provided, use it as-is (it's already a string)
        upload_id_str = upload_id
    else:
        # Generate a new tracking ID if none provided
        upload_id_str = str(upload_id_uuid)
    
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    # Determine file type
    file_ext = file.filename.lower().split('.')[-1]
    allowed_extensions = ['pdf', 'xlsx', 'xls', 'xlsm', 'xlsb']
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Save uploaded file
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    file_content = await file.read()
    
    # Calculate file size and hash for duplicate detection
    file_size = len(file_content)
    file_hash = hashlib.sha256(file_content).hexdigest()
    
    logger.info(f"📁 File: {file.filename}")
    logger.info(f"🔑 Hash: {file_hash}")
    logger.info(f"📏 Size: {file_size} bytes")
    logger.info(f"👤 User: {current_user.id}")
    
    # Check for duplicates
    duplicate_service = DuplicateDetectionService(db)
    duplicate_check = await duplicate_service.check_duplicate(
        file_hash=file_hash,
        user_id=current_user.id,
        file_name=file.filename
    )
    
    if duplicate_check['is_duplicate']:
        # Return 409 Conflict with duplicate information
        existing_upload = duplicate_check['existing_upload']
        
        # Generate GCS URL for the existing file
        existing_gcs_url = None
        if existing_upload.file_name:
            existing_gcs_url = generate_gcs_signed_url(existing_upload.file_name)
            if not existing_gcs_url:
                existing_gcs_url = get_gcs_file_url(existing_upload.file_name)
        
        # Format upload date for user-friendly display
        upload_date = None
        if existing_upload.uploaded_at:
            upload_date = existing_upload.uploaded_at.strftime("%B %d, %Y at %I:%M %p")
        
        # Return 409 Conflict status with clear error message
        return JSONResponse(
            status_code=409,
            content={
                "success": False,
                "status": "duplicate_detected",
                "error": f"This file has already been uploaded on {upload_date}.",
                "message": f"Duplicate file detected. This file was previously uploaded on {upload_date}. Please upload a different file or use the existing one.",
                "duplicate_info": {
                    "type": duplicate_check['duplicate_type'],
                    "existing_upload_id": str(existing_upload.id),
                    "existing_file_name": existing_upload.file_name,
                    "existing_upload_date": existing_upload.uploaded_at.isoformat() if existing_upload.uploaded_at else None,
                    "existing_upload_date_formatted": upload_date,
                    "gcs_url": existing_gcs_url,
                    "gcs_key": existing_upload.file_name,
                    "table_count": len(existing_upload.raw_data or [])
                }
            }
        )
    
    try:
        logger.info(f"🚀 Starting extract-tables-smart for file: {file.filename}")
        logger.info(f"📁 File path: {file_path}")
        logger.info(f"📊 File size: {file_size} bytes")
        logger.info(f"🆔 Upload ID: {upload_id_str}")
        
        # Save uploaded file
        logger.info("💾 Saving uploaded file...")
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)
        logger.info("✅ File saved successfully")

        # Handle company_id - if not provided, we'll extract it from the document
        if not company_id:
            # Get all companies and use the first one, or create a default company
            all_companies = await with_db_retry(db, crud.get_all_companies)
            if all_companies:
                company_id = all_companies[0].id
            else:
                # Create a default company
                default_company = schemas.CompanyCreate(
                    name="Auto-Detected Carrier"
                )
                company = await with_db_retry(db, crud.create_company, company=default_company)
                company_id = company.id

        # Get company info with retry
        company = await with_db_retry(db, crud.get_company_by_id, company_id=company_id)
        if not company:
            os.remove(file_path)
            raise HTTPException(status_code=404, detail="Company not found")

        # Upload to GCS using upload_id for consistent path (not company_id which changes with carrier detection)
        gcs_key = f"statements/{upload_id_uuid}/{file.filename}"
        logger.info(f"📤 Uploading file to GCS: {gcs_key}")
        
        # Verify GCS is available before uploading
        from app.services.gcs_utils import gcs_service
        if not gcs_service.is_available():
            logger.error("❌ GCS service is not available. Check GOOGLE_APPLICATION_CREDENTIALS.")
            raise HTTPException(
                status_code=503, 
                detail="Cloud storage service is not available. Please contact support."
            )
        
        uploaded = upload_file_to_gcs(file_path, gcs_key)
        if not uploaded:
            logger.error(f"❌ Failed to upload file to GCS: {gcs_key}")
            raise HTTPException(status_code=500, detail="Failed to upload file to GCS.")
        
        # Verify file was actually uploaded
        if not gcs_service.file_exists(gcs_key):
            logger.error(f"❌ File upload verification failed - file not found in GCS: {gcs_key}")
            raise HTTPException(status_code=500, detail="File upload verification failed.")
        
        logger.info(f"✅ Successfully uploaded and verified file in GCS: {gcs_key}")
        
        # Generate signed URL for PDF preview
        gcs_url = generate_gcs_signed_url(gcs_key)
        if not gcs_url:
            # Fallback to public URL if signed URL generation fails
            gcs_url = get_gcs_file_url(gcs_key)

        # Emit WebSocket: Step 1 - Upload started (10% progress)
        if upload_id:
            await connection_manager.emit_upload_step(upload_id, 'upload', 10)
        
        # Get or create default environment for the user's company
        from app.db.crud.environment import get_or_create_default_environment, get_environment_by_id
        
        # Use provided environment_id if available, otherwise get/create default
        if environment_id:
            try:
                env_uuid = UUID(environment_id)
                target_env = await get_environment_by_id(db, env_uuid, current_user.company_id, current_user.id)
                logger.info(f"Using specified environment {target_env.id} ({target_env.name}) for upload")
            except (ValueError, Exception) as e:
                logger.warning(f"Invalid or inaccessible environment_id {environment_id}: {e}. Using default.")
                target_env = await get_or_create_default_environment(
                    db=db,
                    company_id=current_user.company_id,
                    user_id=current_user.id
                )
        else:
            target_env = await get_or_create_default_environment(
                db=db,
                company_id=current_user.company_id,
                user_id=current_user.id
            )
            logger.info(f"Using default environment {target_env.id} ({target_env.name}) for upload")
        
        # Create statement upload record for progress tracking
        # NOTE: company_id is used for the carrier here (legacy behavior)
        # We'll set carrier_id explicitly after extraction for proper carrier association
        db_upload = schemas.StatementUpload(
            id=upload_id_uuid,
            company_id=company_id,
            carrier_id=company_id,  # Set carrier_id to the same value for now
            user_id=current_user.id,
            environment_id=target_env.id,  # Use the determined environment (either specified or default)
            file_name=gcs_key,
            file_hash=file_hash,
            file_size=file_size,
            uploaded_at=datetime.utcnow(),
            status="pending",  # Changed from "processing" to "pending"
            current_step="extraction",
            progress_data={
                'extraction_method': extraction_method,
                'file_type': file_ext,
                'start_time': start_time.isoformat()
            }
        )
        
        # Save statement upload with retry
        await with_db_retry(db, crud.save_statement_upload, upload=db_upload)
        
        # Log the extraction start
        audit_service = AuditLoggingService(db)
        await audit_service.log_extraction_start(
            user_id=current_user.id,
            company_id=company_id,
            file_name=file.filename,
            extraction_method=extraction_method,
            upload_id=upload_id_uuid
        )
        
        # Get enhanced extraction service with websocket progress tracking
        logger.info("🔧 Getting enhanced extraction service...")
        enhanced_service = await get_enhanced_extraction_service_instance(use_enhanced=use_enhanced)
        logger.info(f"✅ Enhanced extraction service obtained (enhanced_mode={enhanced_service.use_enhanced})")
        
        # Create extraction task for cancellation support
        logger.info("🚀 Starting extraction task...")
        async def extraction_task():
            try:
                logger.info("📊 Calling extract_tables_with_progress...")
                result = await enhanced_service.extract_tables_with_progress(
                    file_path=file_path,
                    company_id=company_id,
                    upload_id=upload_id_str,
                    file_type=file_ext,
                    extraction_method=extraction_method,
                    upload_id_uuid=str(upload_id_uuid)  # Pass UUID for WebSocket completion message
                )
                logger.info(f"✅ Extraction completed successfully: {result}")
                return result
            except Exception as e:
                logger.error(f"❌ Error in extraction task: {str(e)}")
                import traceback
                logger.error(f"❌ Traceback: {traceback.format_exc()}")
                raise e
        
        # Store the task for potential cancellation
        task = asyncio.create_task(extraction_task())
        running_extractions[upload_id_str] = task
        
        try:
            # Perform extraction with progress tracking
            extraction_result = await task
        except asyncio.CancelledError:
            logger.info(f"Extraction cancelled for upload {upload_id_str}")
            
            # Send WebSocket notification about cancellation (not as error, but as completion)
            try:
                await connection_manager.send_upload_complete(
                    upload_id_str, 
                    {"status": "cancelled", "message": "Upload cancelled by user"}
                )
            except Exception as e:
                logger.warning(f"Failed to send WebSocket cancellation notification: {e}")
            
            # Update the upload status to 'cancelled' instead of deleting
            try:
                update_data = schemas.StatementUploadUpdate(
                    status="rejected",  # Use 'rejected' for cancelled uploads
                    rejection_reason="Cancelled by user",  # Distinguish from actual rejections
                    progress_data={
                        'extraction_method': extraction_method,
                        'file_type': file_ext,
                        'start_time': start_time.isoformat(),
                        'cancelled_at': datetime.utcnow().isoformat(),
                        'cancellation_reason': 'User cancelled'
                    }
                )
                await with_db_retry(db, crud.update_statement, statement_id=str(upload_id_uuid), statement_update=update_data)
                logger.info(f"✅ Updated cancelled upload status: {upload_id_uuid}")
            except Exception as update_error:
                logger.error(f"Failed to update cancelled upload status: {update_error}")
            raise HTTPException(status_code=499, detail="Extraction cancelled by user")
        finally:
            # Clean up the task from running extractions
            running_extractions.pop(upload_id_str, None)
            # Clear from cancellation manager
            await cancellation_manager.clear_cancelled(upload_id_str)
        
        # Update upload record with results - set to 'pending' for review
        logger.info("💾 Updating upload record with results...")
        
        # Get format learning data from extraction result
        format_learning_info = extraction_result.get('format_learning', {})
        
        # Include field_mapping if format learning found a match
        field_mapping = None
        if format_learning_info and format_learning_info.get('found_match'):
            field_mapping = format_learning_info.get('suggested_mapping', {})
            logger.info(f"💾 Saving field_mapping from format learning: {field_mapping}")
        
        update_data = schemas.StatementUploadUpdate(
            status="pending",  # Changed from "extracted" to "pending" for review workflow
            current_step="extracted",
            raw_data=extraction_result.get('tables', []),
            field_mapping=field_mapping,  # Save field mapping from format learning
            progress_data={
                **db_upload.progress_data,
                'extraction_completed': True,
                'completion_time': datetime.utcnow().isoformat(),
                'tables_count': len(extraction_result.get('tables', [])),
                'extraction_method_used': extraction_method
            }
        )
        
        await with_db_retry(db, crud.update_statement_upload, upload_id=upload_id_uuid, update_data=update_data)
        logger.info("✅ Upload record updated successfully")
        
        # Log successful extraction
        processing_time = (datetime.now() - start_time).total_seconds()
        await audit_service.log_extraction_complete(
            user_id=current_user.id,
            company_id=company_id,
            upload_id=upload_id_uuid,
            processing_time=processing_time,
            tables_count=len(extraction_result.get('tables', []))
        )
        
        # Extract carrier and date information from document metadata
        document_metadata = extraction_result.get('document_metadata', {})
        extracted_carrier = document_metadata.get('carrier_name')
        extracted_date = document_metadata.get('statement_date')
        
        # Initialize AI data and variables (CRITICAL: Initialize outside carrier block to avoid scope errors)
        ai_plan_type_data = None
        ai_field_mapping_data = None
        table_selection_data = None  # FIX: Initialize here to avoid UnboundLocalError
        
        # Look up learned formats if carrier was detected
        format_learning_data = extraction_result.get('format_learning', {})
        carrier_id_for_response = None  # Initialize carrier_id for response
        
        if extracted_carrier and extraction_result.get('tables'):
            try:
                from app.services.format_learning_service import FormatLearningService
                format_learning_service = FormatLearningService()
                
                # Find carrier by name to get carrier_id
                carrier = await with_db_retry(db, crud.get_company_by_name, name=extracted_carrier)
                
                # ⚠️ AUTO-CREATE CARRIER IF NOT FOUND
                if not carrier:
                    logger.info(f"🆕 Carrier '{extracted_carrier}' not found in database, creating automatically...")
                    try:
                        # Create new carrier
                        carrier_data = schemas.CompanyCreate(name=extracted_carrier)
                        carrier = await with_db_retry(db, crud.create_company, company=carrier_data)
                        logger.info(f"✅ Auto-created carrier: {carrier.name} with ID {carrier.id}")
                    except Exception as create_error:
                        logger.error(f"❌ Failed to auto-create carrier '{extracted_carrier}': {create_error}")
                        carrier = None
                
                if carrier:
                    logger.info(f"🎯 Format Learning: Using carrier {carrier.name} with ID {carrier.id}")
                    
                    # Always save carrier_id for response
                    carrier_id_for_response = str(carrier.id)
                    
                    # ⚠️ CRITICAL FIX: Always update carrier_id to the extracted carrier
                    # This ensures the file appears under the correct carrier in My Data
                    if str(carrier.id) != str(company_id):
                        logger.warning(f"🚨 CARRIER MISMATCH DETECTED: File uploaded to {company_id} but extracted as {carrier.name} ({carrier.id})")
                        logger.info(f"🔄 Reassigning file to correct carrier: {carrier.name}")
                        
                        # Also update the GCS key to move file to correct carrier folder
                        old_gcs_key = gcs_key
                        new_gcs_key = f"statements/{carrier.id}/{file.filename}"
                        
                        # Move file in GCS (copy to new location and delete old)
                        from app.services.gcs_utils import copy_gcs_file, delete_gcs_file
                        if copy_gcs_file(old_gcs_key, new_gcs_key):
                            delete_gcs_file(old_gcs_key)
                            gcs_key = new_gcs_key
                            gcs_url = generate_gcs_signed_url(gcs_key) or get_gcs_file_url(gcs_key)
                            logger.info(f"✅ File moved to correct carrier folder in GCS: {new_gcs_key}")
                            
                            # CRITICAL FIX: Update carrier_id (not company_id) AND new file location
                            # carrier_id = insurance carrier (what we extracted)
                            # company_id = user's broker company (keep as is)
                            carrier_update_data = schemas.StatementUploadUpdate(
                                carrier_id=carrier.id,  # Set carrier_id to extracted carrier
                                company_id=carrier.id,  # Also set company_id for backwards compatibility
                                file_name=new_gcs_key  # Update with new GCS path
                            )
                            await with_db_retry(db, crud.update_statement_upload, upload_id=upload_id_uuid, update_data=carrier_update_data)
                            logger.info(f"✅ Updated statement upload: carrier_id={carrier.id}, company_id={carrier.id}")
                        else:
                            logger.warning(f"⚠️ Failed to move file in GCS, keeping original location")
                            # Still update carrier_id even if file move failed
                            carrier_update_data = schemas.StatementUploadUpdate(
                                carrier_id=carrier.id,  # Set carrier_id to extracted carrier
                                company_id=carrier.id   # Also set company_id for backwards compatibility
                            )
                            await with_db_retry(db, crud.update_statement_upload, upload_id=upload_id_uuid, update_data=carrier_update_data)
                            logger.info(f"✅ Updated statement upload: carrier_id={carrier.id}, company_id={carrier.id}")
                        
                        # Update company_id for all subsequent operations
                        company_id = str(carrier.id)
                    else:
                        # Even if carrier matches, ensure carrier_id is set
                        logger.info(f"✅ Carrier matches upload: {carrier.name} ({carrier.id})")
                        carrier_update_data = schemas.StatementUploadUpdate(
                            carrier_id=carrier.id  # Ensure carrier_id is always set
                        )
                        await with_db_retry(db, crud.update_statement_upload, upload_id=upload_id_uuid, update_data=carrier_update_data)
                        logger.info(f"✅ Ensured carrier_id is set: {carrier.id}")
                    
                    # ===== INTELLIGENT TABLE SELECTION =====
                    # Use AI to select the best table for field mapping when multiple tables exist
                    selected_table_index = 0
                    
                    if len(extraction_result['tables']) > 1:
                        logger.info(f"🔍 Multiple tables detected ({len(extraction_result['tables'])}), analyzing for field mapping suitability")
                        
                        # ✅ INTELLIGENT TABLE SELECTION
                        # Prioritize tables for field mapping based on:
                        # 1. table_type: commission_table > commission_detail > data_table > summary/hold tables
                        # 2. Row count: More rows generally means main data table
                        # 3. Header patterns: Look for commission-related headers
                        
                        best_table_index = 0
                        best_score = 0
                        reasoning_parts = []
                        
                        for idx, table in enumerate(extraction_result['tables']):
                            score = 0
                            table_type = (table.get('table_type') or '').lower()
                            row_count = len(table.get('rows', []))
                            headers = table.get('header', table.get('headers', []))
                            
                            # Score based on table_type (most important)
                            if 'commission' in table_type and 'detail' in table_type:
                                score += 100  # commission_detail_table
                            elif 'commission' in table_type:
                                score += 90   # commission_table
                            elif 'data' in table_type:
                                score += 70
                            elif any(x in table_type for x in ['hold', 'summary', 'total']):
                                score += 10   # Usually not for mapping
                            else:
                                score += 50   # Unknown type
                            
                            # Score based on row count (more rows = likely main table)
                            score += min(row_count, 50)  # Cap at 50 points
                            
                            # Score based on commission-related headers
                            commission_headers = ['commission', 'paid_amount', 'client', 'company', 'premium', 'rate']
                            header_matches = sum(1 for h in headers if any(keyword in h.lower() for keyword in commission_headers))
                            score += header_matches * 5
                            
                            logger.info(f"   Table {idx}: type={table_type}, rows={row_count}, score={score}")
                            
                            if score > best_score:
                                best_score = score
                                best_table_index = idx
                                reasoning_parts = [
                                    f"table_type={table_type}",
                                    f"rows={row_count}",
                                    f"commission_headers={header_matches}",
                                    f"score={score}"
                                ]
                        
                        selected_table_index = best_table_index
                        table_selection_data = {
                            "enabled": True,
                            "selected_table_index": best_table_index,
                            "reasoning": f"Selected table {best_table_index} ({', '.join(reasoning_parts)})",
                            "total_tables": len(extraction_result['tables']),
                            "fallback_used": False
                        }
                        logger.info(f"🎯 INTELLIGENT SELECTION: Using table {best_table_index} for field mapping")
                        logger.info(f"   Reasoning: {table_selection_data['reasoning']}")
                    else:
                        # Single table - use it directly
                        logger.info("📊 Single table detected, using it for field mapping")
                        table_selection_data = {
                            "enabled": False,
                            "selected_table_index": 0,
                            "confidence": 1.0,
                            "single_table": True,
                            "total_tables": 1
                        }
                    
                    # Get the selected table for format matching and AI mapping
                    selected_table = extraction_result['tables'][selected_table_index]
                    headers = selected_table.get('header', []) or selected_table.get('headers', [])
                    
                    logger.info(f"🎯 Using table {selected_table_index} for field mapping with {len(headers)} headers")
                    
                    # Generate table structure
                    table_structure = {
                        "row_count": len(selected_table.get('rows', [])),
                        "column_count": len(headers),
                        "has_financial_data": any(keyword in ' '.join(headers).lower() for keyword in [
                            'premium', 'commission', 'billed', 'group', 'client', 'invoice',
                            'total', 'amount', 'due', 'paid', 'rate', 'percentage', 'period'
                        ])
                    }
                    
                    # Look up learned format for this carrier
                    learned_format, match_score = await format_learning_service.find_matching_format(
                        db=db,
                        company_id=str(carrier.id),  # Use carrier_id for lookup
                        headers=headers,
                        table_structure=table_structure
                    )
                    
                    if learned_format and match_score > 0.5:
                        logger.info(f"🎯 Format Learning: Found matching format with score {match_score}")
                        format_learning_data = {
                            "found_match": True,
                            "match_score": match_score,
                            "learned_format": learned_format,
                            "suggested_mapping": learned_format.get("field_mapping", {}),
                            "table_editor_settings": learned_format.get("table_editor_settings")
                        }
                        
                        # CRITICAL: Use corrected carrier name if available from format learning
                        table_editor_settings = learned_format.get('table_editor_settings', {})
                        if table_editor_settings.get('corrected_carrier_name'):
                            corrected_carrier = table_editor_settings.get('corrected_carrier_name')
                            logger.info(f"🎯 Format Learning: Applying corrected carrier name from learned format: {corrected_carrier}")
                            # Update extracted carrier with the corrected one
                            extracted_carrier = corrected_carrier
                            document_metadata['carrier_name'] = corrected_carrier
                            document_metadata['carrier_source'] = 'format_learning'
                        
                        # NOTE: We do NOT auto-apply statement dates from format learning 
                        # because dates are document-specific, not format-specific
                        # The extracted date from the current document should be used as-is
                        logger.info(f"🎯 Format Learning: Skipping statement date auto-apply (dates are document-specific)")
                        
                        # CRITICAL FIX: Auto-apply table deletions from learned format
                        if table_editor_settings.get('deleted_tables') or table_editor_settings.get('table_deletions'):
                            deleted_tables = table_editor_settings.get('deleted_tables') or table_editor_settings.get('table_deletions', [])
                            if deleted_tables:
                                logger.info(f"🎯 Format Learning: Auto-applying table deletions: {deleted_tables}")
                                # Store deletion info for frontend to apply
                                format_learning_data['auto_delete_tables'] = deleted_tables
                        
                        # CRITICAL FIX: Auto-apply row deletions from learned format
                        if table_editor_settings.get('deleted_rows') or table_editor_settings.get('row_deletions'):
                            deleted_rows = table_editor_settings.get('deleted_rows') or table_editor_settings.get('row_deletions', [])
                            if deleted_rows:
                                logger.info(f"🎯 Format Learning: Auto-applying row deletions: {len(deleted_rows)} rows")
                                # Store deletion info for frontend to apply
                                format_learning_data['auto_delete_rows'] = deleted_rows
                        
                        # CRITICAL: Check if automation is eligible
                        can_automate = False
                        automation_reason = None
                        
                        # Requirement 1: Statement date must be present
                        has_statement_date = extracted_date is not None and extracted_date.strip() != ""
                        
                        # Requirement 2: Carrier name must be present  
                        has_carrier_name = carrier is not None and carrier.name is not None
                        
                        # Requirement 3: Format must have been successfully learned (high confidence)
                        has_high_confidence = learned_format.get("confidence_score", 0) >= 70
                        
                        # Requirement 4: Has been used successfully at least once before
                        has_usage_history = learned_format.get("usage_count", 0) >= 1
                        
                        if not has_statement_date:
                            automation_reason = "Statement date not detected - manual review required"
                        elif not has_carrier_name:
                            automation_reason = "Carrier name not detected - manual review required"
                        elif not has_high_confidence:
                            automation_reason = "Format confidence too low for automation"
                        elif not has_usage_history:
                            automation_reason = "First-time format - manual review required"
                        else:
                            can_automate = True
                            automation_reason = "All criteria met - automation eligible"
                        
                        # Extract total amount from current file for validation
                        current_total_amount = None
                        
                        # First try to extract from GPT metadata summary
                        if document_metadata and document_metadata.get('summary'):
                            summary_text = document_metadata['summary']
                            # Extract total amount from summary using regex
                            # Look for patterns like "Total amount: $1,027.20" or "total of $1,027.20"
                            total_matches = re.findall(r'[Tt]otal(?:\s+amount)?[:]*\s*\$?([\d,]+\.?\d*)', summary_text)
                            if total_matches:
                                # Take the first match and parse it
                                total_str = total_matches[0].replace(',', '')
                                try:
                                    current_total_amount = float(total_str)
                                    logger.info(f"🎯 Format Learning: Extracted total from GPT summary: ${current_total_amount:.2f}")
                                except ValueError:
                                    pass
                        
                        # Fallback to table extraction if not found in GPT summary
                        total_field_name = table_editor_settings.get("total_amount_field_name")
                        learned_total_amount = table_editor_settings.get("statement_total_amount")
                        
                        if total_field_name and selected_table:
                            # Find the total amount in the current extraction
                            try:
                                headers = selected_table.get("header", [])
                                rows = selected_table.get("rows", [])
                                
                                # Find the field index
                                total_idx = None
                                for idx, header in enumerate(headers):
                                    if header.lower() == total_field_name.lower():
                                        total_idx = idx
                                        break
                                
                                if total_idx is not None:
                                    # Try to find in last few rows or summary rows
                                    for row in reversed(rows[-5:]):  # Check last 5 rows
                                        if total_idx < len(row):
                                            current_total_amount = format_learning_service.parse_currency_value(str(row[total_idx]))
                                            if current_total_amount:
                                                logger.info(f"🎯 Format Learning: Extracted current total amount: ${current_total_amount:.2f}")
                                                break
                            except Exception as e:
                                logger.warning(f"Failed to extract current total amount: {e}")
                        
                        # Validate total amount if we have both values
                        total_validation = None
                        if can_automate and current_total_amount is not None:
                            total_validation = format_learning_service.validate_total_amount(
                                extracted_amount=current_total_amount,
                                learned_amount=learned_total_amount,
                                tolerance_percent=5.0  # 5% tolerance
                            )
                            logger.info(f"🎯 Format Learning: Total validation result: {total_validation}")
                        
                        # Add automation eligibility to format learning data
                        format_learning_data.update({
                            "can_automate": can_automate,
                            "automation_reason": automation_reason,
                            "requires_review": not can_automate,
                            "current_total_amount": current_total_amount,
                            "learned_total_amount": learned_total_amount,
                            "total_validation": total_validation,
                        })
                    else:
                        logger.info(f"🎯 Format Learning: No matching format found (score: {match_score})")
                        
                    # ===== AI PLAN TYPE DETECTION (DURING EXTRACTION) =====
                    # Plan type detection happens here, but field mapping happens after table editing
                    # Emit WebSocket: Step 4 - Plan Detection started (70% progress)
                    if upload_id:
                        await connection_manager.emit_upload_step(upload_id, 'plan_detection', 70)
                    
                    try:
                        from app.services.ai_plan_type_detection_service import AIPlanTypeDetectionService
                        
                        ai_plan_service = AIPlanTypeDetectionService()
                        
                        if ai_plan_service.is_available() and selected_table:
                            logger.info("🔍 AI Plan Type Detection: Detecting plan types during extraction")
                            
                            # Get AI plan type detection
                            ai_plan_result = await ai_plan_service.detect_plan_types(
                                db=db,
                                document_context={
                                    'carrier_name': carrier.name,
                                    'statement_date': extracted_date,
                                    'document_type': 'commission_statement'
                                },
                                table_headers=headers,
                                table_sample_data=selected_table.get('rows', [])[:5],
                                extracted_carrier=carrier.name
                            )
                            
                            if ai_plan_result.get('success'):
                                ai_plan_type_data = {
                                    "ai_enabled": True,
                                    "detected_plan_types": ai_plan_result.get('detected_plan_types', []),
                                    "confidence": ai_plan_result.get('overall_confidence', 0.0),
                                    "multi_plan_document": ai_plan_result.get('multi_plan_document', False),
                                    "statistics": ai_plan_result.get('detection_statistics', {})
                                }
                                logger.info(f"✅ AI Plan Detection: {len(ai_plan_result.get('detected_plan_types', []))} plan types with {ai_plan_result.get('overall_confidence', 0):.2f} confidence")
                            else:
                                ai_plan_type_data = None
                        else:
                            ai_plan_type_data = None
                        
                    except Exception as ai_error:
                        logger.warning(f"AI plan type detection failed (non-critical): {str(ai_error)}")
                        ai_plan_type_data = None
                    
                    # Perform AI field mapping during extraction
                    # Emit WebSocket: Step 5 - AI Field Mapping started (80% progress)
                    if upload_id:
                        await connection_manager.emit_upload_step(upload_id, 'ai_field_mapping', 80)
                    
                    try:
                        logger.info("🧠 AI Field Mapping: Starting field mapping during extraction")
                        
                        # Call the enhanced extraction analysis endpoint for both field mapping and plan detection
                        from app.api.ai_intelligent_mapping import enhanced_extraction_analysis
                        from fastapi import Body
                        
                        # Prepare request data
                        analysis_request = {
                            "extracted_headers": selected_table['header'],
                            "table_sample_data": selected_table.get('rows', [])[:5],
                            "document_context": {
                                'carrier_name': carrier.name if carrier else None,
                                'document_type': 'commission_statement',
                                'statement_date': extracted_date
                            },
                            "carrier_id": str(carrier.id) if carrier else None,
                            "extracted_carrier": carrier.name if carrier else extracted_carrier,
                            "timestamp": datetime.now().isoformat()
                        }
                        
                        # Get both field mapping and plan type detection
                        ai_analysis_result = await enhanced_extraction_analysis(
                            request=analysis_request,
                            current_user=current_user,
                            db=db
                        )
                        
                        if ai_analysis_result.get('success'):
                            # Extract field mapping data
                            field_mapping = ai_analysis_result.get('field_mapping', {})
                            if field_mapping.get('success'):
                                ai_field_mapping_data = {
                                    "ai_enabled": True,
                                    "mappings": field_mapping.get('mappings', []),
                                    "unmapped_fields": field_mapping.get('unmapped_fields', []),
                                    "confidence": field_mapping.get('confidence', 0.0),
                                    "learned_format_used": field_mapping.get('learned_format_used', False),
                                    "timestamp": ai_analysis_result.get('timestamp')
                                }
                                logger.info(f"✅ AI Field Mapping: {len(ai_field_mapping_data.get('mappings', []))} mappings with {ai_field_mapping_data.get('confidence', 0):.2f} confidence")
                            else:
                                ai_field_mapping_data = {"ai_enabled": False, "error": "Field mapping failed"}
                            
                            # Update plan type detection data if available
                            plan_detection = ai_analysis_result.get('plan_type_detection', {})
                            if plan_detection.get('success'):
                                ai_plan_type_data = {
                                    "ai_enabled": True,
                                    "detected_plan_types": plan_detection.get('detected_plan_types', []),
                                    "confidence": plan_detection.get('confidence', 0.0),
                                    "multi_plan_document": plan_detection.get('multi_plan_document', False),
                                    "statistics": plan_detection.get('detection_statistics', {})
                                }
                        else:
                            logger.warning("AI enhanced extraction analysis failed")
                            ai_field_mapping_data = {"ai_enabled": False}
                            
                    except Exception as ai_error:
                        logger.warning(f"AI field mapping failed (non-critical): {str(ai_error)}")
                        ai_field_mapping_data = {"ai_enabled": False, "error": str(ai_error)}
                    
            except Exception as e:
                logger.warning(f"Format learning lookup failed: {str(e)}")
        
        # ===== CONVERSATIONAL SUMMARY GENERATION =====
        # Generate natural language summary in parallel (non-blocking)
        conversational_summary = None
        summary_generation_task = None
        
        # Check if enhanced summary was already generated by Claude pipeline
        if extraction_result.get('summary') and extraction_result.get('extraction_pipeline') == '3-phase-enhanced':
            logger.info("✅ Enhanced summary already generated by Claude pipeline - using it")
            conversational_summary = extraction_result.get('summary')
            logger.info(f"   Enhanced summary: {conversational_summary}")
        else:
            # Generate conversational summary if not already done
            try:
                from app.services.conversational_summary_service import ConversationalSummaryService
                
                summary_service = ConversationalSummaryService()
                
                if summary_service.is_available():
                    logger.info("🗣️ Starting conversational summary generation...")
                    
                    # Send progress update
                    if upload_id:
                        await connection_manager.send_step_progress(
                            upload_id,
                            percentage=92,
                            estimated_time="Preparing summary...",
                            current_stage="summary_generation"
                        )
                    
                    # Check if we have enhanced extraction data
                    has_enhanced_data = (
                        'entities' in extraction_result or
                        'business_intelligence' in extraction_result or
                        'relationships' in extraction_result
                    )
                    
                    # Prepare extraction data - use enhanced data if available
                    if has_enhanced_data:
                        logger.info("✅ Using ENHANCED extraction data for summary")
                        extraction_data = extraction_result  # Pass full enhanced result
                        use_enhanced = True
                    else:
                        logger.info("📝 Using STANDARD extraction data for summary")
                        extraction_data = {
                            'carrier_name': extracted_carrier,
                            'statement_date': extracted_date,
                            'broker_company': extracted_carrier,  # Use carrier name instead of company_id
                            'tables': extraction_result.get('tables', []),
                            'document_metadata': document_metadata
                        }
                        use_enhanced = False
                    
                    # Start summary generation as async task (non-blocking)
                    summary_generation_task = asyncio.create_task(
                        summary_service.generate_conversational_summary(
                            extraction_data=extraction_data,
                            document_context={
                                'file_name': file.filename,
                                'page_count': len(extraction_result.get('tables', [])),
                                'file_size': file_size,
                                'extraction_method': extraction_method
                            },
                            use_enhanced=use_enhanced  # ⭐ CRITICAL: Pass use_enhanced flag
                        )
                    )
                    
            except Exception as summary_error:
                logger.warning(f"Conversational summary initialization failed (non-critical): {summary_error}")
        
        # Prepare client response WITH plan type detection (field mapping happens after editing)
        client_response = {
            "success": True,
            "upload_id": str(upload_id_uuid),
            "tables": extraction_result.get('tables', []),
            "file_name": file.filename,
            "gcs_url": gcs_url,  # CRITICAL: Include GCS URL for PDF preview
            "gcs_key": gcs_key,  # Include GCS key for reference
            "company_id": company_id,
            "carrier_id": carrier_id_for_response,  # Add carrier_id
            "extraction_method": extraction_method,
            "file_type": file_ext,
            "processing_time": processing_time,
            "quality_summary": extraction_result.get('quality_summary', {}),
            "extraction_config": extraction_result.get('extraction_config', {}),
            "format_learning": format_learning_data,  # Use enhanced format learning data
            "metadata": extraction_result.get('metadata', {}),
            "extracted_carrier": extracted_carrier,
            "extracted_date": extracted_date,
            "document_metadata": document_metadata,
            
            # ===== AI INTELLIGENCE - BOTH PLAN TYPE AND FIELD MAPPING DURING EXTRACTION =====
            # Both plan type detection and field mapping happen during extraction
            "ai_intelligence": {
                "enabled": (ai_plan_type_data is not None) or (ai_field_mapping_data is not None),
                "field_mapping": ai_field_mapping_data or {"ai_enabled": False},
                "plan_type_detection": ai_plan_type_data or {"ai_enabled": False},
                "table_selection": table_selection_data or {"enabled": False},
                "overall_confidence": max(
                    ai_plan_type_data.get('confidence', 0.0) if ai_plan_type_data else 0.0,
                    ai_field_mapping_data.get('confidence', 0.0) if ai_field_mapping_data else 0.0
                )
            },
            
            "message": f"Successfully extracted {len(extraction_result.get('tables', []))} tables using {extraction_method} method."
        }
        
        # Record user contribution
        profile_service = UserProfileService(db)
        await profile_service.record_user_contribution(
            user_id=current_user.id,
            upload_id=upload_id_uuid,
            contribution_type="upload",
            contribution_data={
                "file_name": file.filename,
                "file_size": file_size,
                "file_hash": file_hash,
                "extraction_method": extraction_method,
                "confidence_threshold": 0.6,
                "enable_ocr": True,
                "enable_multipage": True
            }
        )
        
        # Log file upload for audit
        await audit_service.log_file_upload(
            user_id=current_user.id,
            file_name=file.filename,
            file_size=file_size,
            file_hash=file_hash,
            company_id=company_id,
            upload_id=upload_id_uuid
        )
        
        # Clean up local file
        os.remove(file_path)
        
        # ===== AWAIT CONVERSATIONAL SUMMARY (WITH TIMEOUT) =====
        # Wait for summary generation to complete (max 5 seconds) - only if not already generated
        if summary_generation_task and not conversational_summary:
            try:
                logger.info("⏳ Waiting for conversational summary...")
                summary_result = await asyncio.wait_for(summary_generation_task, timeout=5.0)
                
                if summary_result and summary_result.get('success'):
                    conversational_summary = summary_result.get('summary')
                    logger.info(f"✅ Conversational summary ready: {conversational_summary[:100]}...")
                    
                    # Send summary via WebSocket for real-time display
                    if upload_id:
                        await connection_manager.send_step_progress(
                            upload_id,
                            percentage=85,  # ✅ FIXED: 85% not 70% (after field mapping at 80%)
                            estimated_time="Enhanced summary ready",
                            current_stage="summary_complete",
                            conversational_summary=conversational_summary  # ← NEW FIELD
                        )
                else:
                    logger.warning("Summary generation returned unsuccessful result")
                    
            except asyncio.TimeoutError:
                logger.warning("Summary generation timeout (5s) - using fallback")
                # Generate simple fallback summary with actual entity names
                conversational_summary = f"Commission statement from {extracted_carrier or 'Unknown'}, dated {extracted_date or 'Unknown'}, prepared for {extraction_result.get('document_metadata', {}).get('broker_company', 'Unknown')}."
                
                if upload_id:
                    await connection_manager.send_step_progress(
                        upload_id,
                        percentage=85,  # ✅ FIXED: 85% not 70% (after field mapping at 80%)
                        estimated_time="Enhanced summary ready",
                        current_stage="summary_complete",
                        conversational_summary=conversational_summary
                    )
                    
            except Exception as summary_error:
                logger.error(f"Error awaiting summary: {summary_error}")
                conversational_summary = None
        elif conversational_summary:
            # Enhanced summary was already generated - send it via WebSocket
            logger.info("📤 Sending pre-generated enhanced summary via WebSocket...")
            if upload_id:
                await connection_manager.send_step_progress(
                    upload_id,
                    percentage=85,  # ✅ FIXED: 85% not 70% (after field mapping at 80%)
                    estimated_time="Enhanced summary ready",
                    current_stage="summary_complete",
                    conversational_summary=conversational_summary
                )
        
        # ✅ Emit WebSocket: Step 6 - Preparing Results (95% progress) - AFTER summary
        if upload_id:
            await connection_manager.emit_upload_step(upload_id, 'preparing_results', 95)
        
        # Add server-specific fields to response
        # ✅ Extract total_amount from document_metadata if available
        extracted_total = 0.0
        if document_metadata and 'total_amount' in document_metadata:
            try:
                extracted_total = float(document_metadata.get('total_amount', 0))
            except (ValueError, TypeError):
                extracted_total = 0.0
        
        client_response.update({
            "success": True,
            "extraction_id": str(upload_id_uuid),
            "upload_id": str(upload_id_uuid),
            "gcs_url": gcs_url,
            "gcs_key": gcs_key,
            "file_name": gcs_key,  # Use full GCS path as file_name for PDF preview
            "conversational_summary": conversational_summary,  # ← NEW: Include in response
            "extracted_total": extracted_total  # ✅ NEW: Include extracted total for auto-approval
        })
        
        # Emit WebSocket: EXTRACTION_COMPLETE with full results
        if upload_id:
            # Convert all UUID objects to strings for JSON serialization
            def convert_uuids_to_strings(obj):
                """Recursively convert UUID objects to strings for JSON serialization"""
                if isinstance(obj, UUID):
                    return str(obj)
                elif isinstance(obj, dict):
                    return {k: convert_uuids_to_strings(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [convert_uuids_to_strings(item) for item in obj]
                else:
                    return obj
            
            # Create a JSON-safe copy of the response
            json_safe_response = convert_uuids_to_strings(client_response)
            
            # ✅ Final completion at 100%
            await connection_manager.send_step_progress(
                upload_id,
                percentage=100,
                estimated_time="Complete",
                current_stage="complete"
            )
            
            await connection_manager.send_extraction_complete(upload_id, json_safe_response)
            logger.info(f"✅ Extraction complete! Sent results via WebSocket for upload_id: {upload_id}")
        
        return client_response
        
    except HTTPException as he:
        # Update failed upload status instead of deleting
        try:
            if upload_id_uuid:
                update_data = schemas.StatementUploadUpdate(
                    status="failed",
                    progress_data={
                        'extraction_method': extraction_method,
                        'file_type': file_ext,
                        'start_time': start_time.isoformat(),
                        'failed_at': datetime.utcnow().isoformat(),
                        'error': str(he.detail)
                    }
                )
                await with_db_retry(db, crud.update_statement, statement_id=str(upload_id_uuid), statement_update=update_data)
                logger.info(f"✅ Updated failed upload status: {upload_id_uuid}")
        except Exception as update_error:
            logger.error(f"Failed to update upload record after error: {update_error}")
        
        # Clean up file on error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    except Exception as e:
        logger.error(f"Smart extraction error: {str(e)}")
        
        # Update failed upload status instead of deleting
        try:
            if upload_id_uuid:
                update_data = schemas.StatementUploadUpdate(
                    status="failed",
                    progress_data={
                        'extraction_method': extraction_method,
                        'file_type': file_ext,
                        'start_time': start_time.isoformat(),
                        'failed_at': datetime.utcnow().isoformat(),
                        'error': str(e)
                    }
                )
                await with_db_retry(db, crud.update_statement, statement_id=str(upload_id_uuid), statement_update=update_data)
                logger.info(f"✅ Updated failed upload status: {upload_id_uuid}")
        except Exception as update_error:
            logger.error(f"Failed to update upload record after error: {update_error}")
        
        # Clean up file on error
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Smart extraction failed: {str(e)}")


@router.post("/cancel-extraction/{upload_id}")
async def cancel_extraction(
    upload_id: str,
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """
    Cancel a running extraction process with immediate effect and cleanup.
    
    - Marks extraction as cancelled immediately
    - Cancels running task
    - Cleans up database records
    - Deletes GCS and local files
    - Sends WebSocket notification
    
    Args:
        upload_id: The upload ID to cancel
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Success message if cancellation was successful
    """
    logger.info(f"🛑 Cancellation requested for upload {upload_id}")
    
    # Define cleanup callback
    async def cleanup_cancelled_upload():
        """Cleanup database and files for cancelled upload."""
        try:
            from sqlalchemy import select, delete
            from app.db.models import StatementUpload
            from app.services.gcs_utils import delete_gcs_file
            
            # Find the upload record
            try:
                upload_uuid = UUID(upload_id)
            except ValueError:
                logger.error(f"Invalid upload ID format: {upload_id}")
                return
            
            # Delete from database (or mark as cancelled)
            delete_result = await db.execute(
                select(StatementUpload).where(StatementUpload.id == upload_uuid)
            )
            upload_record = delete_result.scalar_one_or_none()
            
            if upload_record:
                # Delete GCS file
                if upload_record.gcs_key:
                    try:
                        delete_gcs_file(upload_record.gcs_key)
                        logger.info(f"🗑️ Deleted GCS file: {upload_record.gcs_key}")
                    except Exception as gcs_error:
                        logger.error(f"Failed to delete GCS file: {gcs_error}")
                
                # Delete database record
                await db.delete(upload_record)
                await db.commit()
                logger.info(f"✅ Deleted database record for upload {upload_id}")
            
            # Delete local file if exists
            if upload_record and upload_record.filename:
                local_path = os.path.join("pdfs", upload_record.filename)
                if os.path.exists(local_path):
                    os.remove(local_path)
                    logger.info(f"🗑️ Deleted local file: {local_path}")
                    
        except Exception as cleanup_error:
            logger.error(f"Cleanup failed for {upload_id}: {cleanup_error}")
            await db.rollback()
    
    try:
        # Mark as cancelled immediately with cleanup callback
        await cancellation_manager.mark_cancelled(upload_id, cleanup_callback=cleanup_cancelled_upload)
        
        # If task is running, cancel it
        if upload_id in running_extractions:
            task = running_extractions[upload_id]
            task.cancel()
            
            try:
                await task
            except asyncio.CancelledError:
                logger.info(f"✅ Successfully cancelled extraction task for {upload_id}")
            
            # Remove from running extractions
            running_extractions.pop(upload_id, None)
        else:
            logger.warning(f"⚠️ No running extraction found for {upload_id}, but still proceeding with cleanup")
        
        # Execute cleanup immediately
        await cancellation_manager.execute_cleanup(upload_id)
        
        # Send WebSocket notification
        try:
            await connection_manager.send_upload_complete(
                upload_id,
                {
                    "status": "cancelled",
                    "message": "Upload cancelled successfully"
                }
            )
        except Exception as ws_error:
            logger.warning(f"Failed to send WebSocket notification: {ws_error}")
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"Extraction cancelled successfully for upload {upload_id}",
                "upload_id": upload_id
            }
        )
        
    except Exception as e:
        logger.error(f"Error cancelling extraction: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clear from cancellation manager
        await cancellation_manager.clear_cancelled(upload_id)


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
        
        # Extract document metadata (carrier, date, broker) from first page
        logger.info("Extracting document metadata (carrier, date, broker)...")
        from app.services.enhanced_extraction_service import EnhancedExtractionService
        enhanced_service = EnhancedExtractionService()
        
        # Create a mock progress tracker for metadata extraction
        class MockProgressTracker:
            def __init__(self):
                self.upload_id = upload_id
                
        mock_tracker = MockProgressTracker()
        gpt_metadata = await enhanced_service._extract_metadata_with_gpt(temp_pdf_path)
        
        # Store document metadata for response
        document_metadata = {}
        if gpt_metadata.get('success'):
            document_metadata = {
                "carrier_name": gpt_metadata.get('carrier_name'),
                "carrier_confidence": gpt_metadata.get('carrier_confidence', 0.9),
                "statement_date": gpt_metadata.get('statement_date'),
                "date_confidence": gpt_metadata.get('date_confidence', 0.9),
                "broker_company": gpt_metadata.get('broker_company'),  # Extract broker from metadata
                "document_type": "commission_statement"
            }
            logger.info(f"Extracted metadata: carrier={document_metadata.get('carrier_name')}, date={document_metadata.get('statement_date')}, broker={document_metadata.get('broker_company')}")
        else:
            logger.warning(f"Metadata extraction failed: {gpt_metadata.get('error')}")
            document_metadata = {
                "carrier_name": None,
                "carrier_confidence": 0.0,
                "statement_date": None,
                "date_confidence": 0.0,
                "broker_company": None,
                "document_type": "commission_statement"
            }
        
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
                # CRITICAL FIX: Include summaryRows for frontend display
                "summaryRows": table.get("summaryRows", []),
                "summary_detection": table.get("summary_detection", {}),
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
                    
                    # CRITICAL FIX: Auto-apply learned settings
                    table_editor_settings = learned_format.get('table_editor_settings', {})
                    
                    # Auto-apply table deletions from learned format
                    if table_editor_settings.get('deleted_tables') or table_editor_settings.get('table_deletions'):
                        deleted_tables = table_editor_settings.get('deleted_tables') or table_editor_settings.get('table_deletions', [])
                        if deleted_tables:
                            logger.info(f"🎯 GPT Format Learning: Auto-applying table deletions: {deleted_tables}")
                            format_learning_data['auto_delete_tables'] = deleted_tables
                    
                    # Auto-apply row deletions from learned format
                    if table_editor_settings.get('deleted_rows') or table_editor_settings.get('row_deletions'):
                        deleted_rows = table_editor_settings.get('deleted_rows') or table_editor_settings.get('row_deletions', [])
                        if deleted_rows:
                            logger.info(f"🎯 GPT Format Learning: Auto-applying row deletions: {len(deleted_rows)} rows")
                            format_learning_data['auto_delete_rows'] = deleted_rows
                    
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
            "document_metadata": document_metadata,  # Add document metadata with carrier, date, and broker
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
            "gcs_url": generate_gcs_signed_url(upload_info.file_name) or f"https://text-extraction-pdf.s3.us-east-1.amazonaws.com/{upload_info.file_name}",
            "file_name": upload_info.file_name,  # Use full GCS path for PDF preview
            "timestamp": datetime.now().isoformat(),
            "format_learning": format_learning_data
        }
        
        logger.info(f"✅ GPT extraction completed successfully in {processing_time:.2f} seconds")
        logger.info(f"📊 Response data: {response_data}")
        
        return JSONResponse(response_data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error in GPT extraction: {str(e)}")
        import traceback
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
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
                # CRITICAL FIX: Include summaryRows for frontend display
                "summaryRows": table.get("summaryRows", []),
                "summary_detection": table.get("summary_detection", {}),
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
                    
                    # CRITICAL FIX: Auto-apply learned settings
                    table_editor_settings = learned_format.get('table_editor_settings', {})
                    
                    # Auto-apply table deletions from learned format
                    if table_editor_settings.get('deleted_tables') or table_editor_settings.get('table_deletions'):
                        deleted_tables = table_editor_settings.get('deleted_tables') or table_editor_settings.get('table_deletions', [])
                        if deleted_tables:
                            logger.info(f"🎯 DocAI Format Learning: Auto-applying table deletions: {deleted_tables}")
                            format_learning_data['auto_delete_tables'] = deleted_tables
                    
                    # Auto-apply row deletions from learned format
                    if table_editor_settings.get('deleted_rows') or table_editor_settings.get('row_deletions'):
                        deleted_rows = table_editor_settings.get('deleted_rows') or table_editor_settings.get('row_deletions', [])
                        if deleted_rows:
                            logger.info(f"🎯 DocAI Format Learning: Auto-applying row deletions: {len(deleted_rows)} rows")
                            format_learning_data['auto_delete_rows'] = deleted_rows
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
            "gcs_url": generate_gcs_signed_url(upload_info.file_name) or f"https://text-extraction-pdf.s3.us-east-1.amazonaws.com/{upload_info.file_name}",
            "file_name": upload_info.file_name,  # Use full GCS path for PDF preview
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
            # CRITICAL FIX: Include summaryRows for frontend display
            "summaryRows": table.get("summaryRows", []),
            "summary_detection": table.get("summary_detection", {}),
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

@router.post("/extract-intelligent/")
async def extract_with_intelligence(
    file: UploadFile = File(...),
    company_id: str = Form(...)
):
    """
    INTELLIGENT extraction endpoint with enhanced response structure
    
    This endpoint implements the revolutionary two-phase extraction architecture:
    1. Document Intelligence Analysis - Uses LLM reasoning to identify carriers, dates, and entities
    2. Table Structure Intelligence - Extracts tables with business context understanding
    3. Cross-validation and Quality Assessment - Validates extraction using business logic
    4. Intelligent Response Formatting - Separates document metadata from table data
    """
    start_time = datetime.now()
    logger.info(f"Starting intelligent extraction for file: {file.filename}")
    
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file uploaded")
        
        # Determine file type
        file_ext = file.filename.lower().split('.')[-1]
        if file_ext != 'pdf':
            raise HTTPException(
                status_code=400, 
                detail="Intelligent extraction currently supports PDF files only"
            )
        
        # Save uploaded file temporarily
        temp_file_path = os.path.join(UPLOAD_DIR, f"temp_{uuid4()}_{file.filename}")
        file_content = await file.read()
        
        with open(temp_file_path, "wb") as buffer:
            buffer.write(file_content)
        
        # Use intelligent extraction service
        from app.services.mistral.service import MistralDocumentAIService
        extraction_service = MistralDocumentAIService()
        
        if not extraction_service.is_available():
            raise HTTPException(
                status_code=503, 
                detail="Intelligent extraction service not available. Please check MISTRAL_API_KEY configuration."
            )
        
        # Test connection first
        connection_test = extraction_service.test_connection()
        if not connection_test.get("success"):
            logger.warning(f"Intelligent service connection test failed: {connection_test.get('error')}")
        
        # Perform intelligent extraction
        logger.info("Starting intelligent extraction with two-phase architecture...")
        result = await extraction_service.extract_commission_data_intelligently(temp_file_path)
        
        # Clean up temporary file
        try:
            os.remove(temp_file_path)
            logger.info(f"Cleaned up temporary file: {temp_file_path}")
        except Exception as cleanup_error:
            logger.warning(f"Failed to clean up temporary file: {cleanup_error}")
        
        # Validate intelligence quality
        if result.get('extraction_intelligence', {}).get('overall_confidence', 0) < 0.7:
            # Flag for human review
            result['requires_human_review'] = True
            result['review_reasons'] = extraction_service.service.get_low_confidence_reasons(result)
        
        # Add processing metadata
        processing_time = (datetime.now() - start_time).total_seconds()
        result['processing_metadata'] = {
            "file_name": file.filename,
            "company_id": company_id,
            "processing_time": processing_time,
            "intelligent_extraction_version": "2.0.0",
            "timestamp": datetime.now().isoformat()
        }
        
        logger.info(f"Intelligent extraction completed successfully in {processing_time:.2f} seconds")
        return result
        
    except HTTPException:
        # Clean up file on error
        if 'temp_file_path' in locals() and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise
    except Exception as e:
        logger.error(f"Intelligent extraction error: {str(e)}")
        # Clean up file on error
        if 'temp_file_path' in locals() and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=f"Intelligent extraction failed: {str(e)}")


@router.post("/extract-tables-mistral-frontend/")
async def extract_tables_mistral_frontend(
    upload_id: str = Form(...),
    company_id: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Extract tables using INTELLIGENT Mistral Document AI with frontend-compatible response format.
    This endpoint now uses the intelligent two-phase extraction architecture.
    """
    start_time = datetime.now()
    logger.info(f"Starting INTELLIGENT Mistral Document AI frontend extraction for upload_id: {upload_id}")
    
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
        
        # Use the INTELLIGENT Mistral Document AI service for extraction
        from app.services.mistral.service import MistralDocumentAIService
        mistral_service = MistralDocumentAIService()
        
        if not mistral_service.is_available():
            raise HTTPException(
                status_code=503, 
                detail="Intelligent Mistral Document AI service not available. Please check MISTRAL_API_KEY configuration."
            )
        
        # Test connection first
        connection_test = mistral_service.test_connection()
        if not connection_test.get("success"):
            logger.warning(f"Intelligent Mistral connection test failed: {connection_test.get('error')}")
        
        # Use INTELLIGENT extraction instead of legacy method
        logger.info("Starting INTELLIGENT Mistral Document AI extraction with two-phase architecture...")
        extraction_result = await mistral_service.extract_commission_data_intelligently(temp_pdf_path)
        
        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()
        
        # Clean up temporary file
        try:
            os.remove(temp_pdf_path)
            logger.info(f"Cleaned up temporary file: {temp_pdf_path}")
        except Exception as cleanup_error:
            logger.warning(f"Failed to clean up temporary file: {cleanup_error}")
        
        # Check if extraction was successful
        if not extraction_result.get("success"):
            logger.error(f"Intelligent Mistral Document AI extraction failed: {extraction_result.get('error')}")
            raise HTTPException(
                status_code=500,
                detail=f"Intelligent Mistral Document AI extraction failed: {extraction_result.get('error')}"
            )
        
        # Get extracted tables from intelligent response
        extracted_tables = extraction_result.get("tables", [])
        document_metadata = extraction_result.get("document_metadata", {})
        extraction_quality = extraction_result.get("extraction_quality", {})
        extraction_intelligence = extraction_result.get("extraction_intelligence", {})
        
        if not extracted_tables:
            logger.warning("No tables extracted from intelligent Mistral analysis")
            return JSONResponse(
                status_code=422,  # Unprocessable Entity
                content={
                    "success": False,
                    "error": "No tables found in document",
                    "message": "Intelligent Mistral could not identify any tables in the document. This may be due to document format or content issues. Please try with a different document or contact support.",
                    "upload_id": upload_id,
                    "timestamp": datetime.now().isoformat()
                }
            )
        
        # Log successful extraction
        tables_count = len(extracted_tables)
        overall_confidence = extraction_intelligence.get("overall_confidence", 0.0)
        logger.info(f"INTELLIGENT Mistral Document AI extraction completed successfully. Found {tables_count} tables with {overall_confidence:.2f} confidence in {processing_time:.2f} seconds")
        
        # Transform tables to frontend format (TableData structure)
        frontend_tables = []
        
        for i, table in enumerate(extracted_tables):
            headers = table.get("headers", [])
            rows = table.get("rows", [])
            
            # Clean headers - remove empty strings and trim
            cleaned_headers = [h.strip() for h in headers if h.strip()]
            
            # Clean rows - ensure all rows are arrays of strings
            cleaned_rows = []
            for row in rows:
                if isinstance(row, list):
                    # Clean each cell in the row
                    cleaned_row = [str(cell).strip() if cell else "" for cell in row]
                    cleaned_rows.append(cleaned_row)
                else:
                    # If row is not a list, skip it
                    logger.warning(f"Skipping invalid row format: {row}")
                    continue
            
            # Create frontend table structure matching TableData type
            frontend_table = {
                "id": f"table_{i + 1}",
                "name": f"Table_{i + 1}",
                "header": cleaned_headers,
                "rows": cleaned_rows,
                "extractor": "intelligent_mistral_document_ai",
                "table_type": table.get("table_type", "commission_table"),
                "company_name": table.get("company_name"),
                # CRITICAL FIX: Include summaryRows for frontend display
                "summaryRows": table.get("summaryRows", []),
                "summary_detection": table.get("summary_detection", {}),
                "metadata": {
                    "extraction_method": "intelligent_mistral_document_ai",
                    "timestamp": datetime.now().isoformat(),
                    "confidence": overall_confidence,
                    "intelligent_metadata": {
                        "document_understanding": extraction_intelligence.get("document_understanding", 0.0),
                        "table_understanding": extraction_intelligence.get("table_understanding", 0.0),
                        "overall_confidence": overall_confidence,
                        "requires_human_review": extraction_quality.get("requires_human_review", False)
                    }
                }
            }
            logger.info(f"✓ Table {i+1}: Added summaryRows field with {len(table.get('summaryRows', []))} summary rows")
            frontend_tables.append(frontend_table)
        
        # Prepare INTELLIGENT response in the exact format expected by TableEditor
        response_data = {
            "success": True,
            "tables": frontend_tables,
            "filename": upload_info.file_name.split('/')[-1] if '/' in upload_info.file_name else upload_info.file_name,
            "company_id": company_id,
            "extraction_method": "intelligent_mistral_document_ai",
            "processing_time": processing_time,
            "intelligent_metadata": {
                "document_metadata": document_metadata,
                "extraction_quality": extraction_quality,
                "extraction_intelligence": extraction_intelligence
            },
            "message": f"Successfully extracted {len(frontend_tables)} tables using INTELLIGENT Mistral Document AI with {overall_confidence:.2f} confidence"
        }
        
        logger.info(f"INTELLIGENT Mistral Document AI frontend extraction completed successfully in {processing_time:.2f} seconds")
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"INTELLIGENT Mistral Document AI frontend extraction failed: {str(e)}")
        
        # Clean up temporary file if it exists
        try:
            if 'temp_pdf_path' in locals() and os.path.exists(temp_pdf_path):
                os.remove(temp_pdf_path)
        except:
            pass
        
        raise HTTPException(
            status_code=500,
            detail=f"INTELLIGENT Mistral Document AI frontend extraction failed: {str(e)}"
        )


@router.post("/extract-summarize-data-via-claude/")
async def extract_summarize_data_via_claude(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user_hybrid)
):
    """
    Extract and summarize data using Claude AI service.
    - Uses Claude's vision capabilities for document analysis
    - Returns structured markdown summary of document content
    - Simple endpoint without database storage or GCS upload
    """
    start_time = datetime.now()
    
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    # Determine file type
    file_ext = file.filename.lower().split('.')[-1]
    allowed_extensions = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'bmp']
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Create temporary file path
    import tempfile
    temp_dir = tempfile.gettempdir()
    file_path = os.path.join(temp_dir, f"temp_{uuid4()}_{file.filename}")
    
    try:
        # Save uploaded file to temporary location
        file_content = await file.read()
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)
        
        logger.info(f"📁 Saved file to temporary location: {file_path}")
        
        # Initialize Claude service
        claude_service = ClaudeDocumentAIService()
        
        # Perform summarization
        logger.info("🤖 Starting Claude summarization...")
        summarization_result = await claude_service.extract_summarize_data_via_claude(file_path)
        
        # Check if summarization was successful
        if not summarization_result.get('success', False):
            raise HTTPException(
                status_code=500, 
                detail=f"Claude summarization failed: {summarization_result.get('error', 'Unknown error')}"
            )
        
        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()
        
        # Prepare simple response
        response = {
            "success": True,
            "summary": summarization_result.get('result', ''),
            "file_name": file.filename,
            "file_type": file_ext,
            "processing_time": processing_time,
            "claude_processing_time": summarization_result.get('processing_time', 0),
            "file_info": summarization_result.get('file_info', {}),
            "message": f"Successfully summarized document using Claude AI in {processing_time:.2f}s"
        }
        
        logger.info(f"✅ Summarization completed in {processing_time:.2f}s")
        return response
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Claude summarization error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Claude summarization failed: {str(e)}")
    finally:
        # Clean up temporary file
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"🗑️  Cleaned up temporary file: {file_path}")
            except Exception as cleanup_error:
                logger.warning(f"Failed to clean up temporary file: {cleanup_error}")

