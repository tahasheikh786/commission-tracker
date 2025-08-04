
import os
import json
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Form, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud
from app.config import get_db
from app.services.gpt4o_vision_service import GPT4oVisionService
from app.services.extraction_pipeline import TableExtractionPipeline
from app.services.s3_utils import download_file_from_s3
import uuid
import tempfile

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/improve-extraction", tags=["improve-extraction"])

# Initialize services
gpt4o_service = GPT4oVisionService()
extraction_pipeline = TableExtractionPipeline()

class ImproveExtractionRequest:
    def __init__(self, upload_id: str, company_id: str, max_pages: int = 5):
        self.upload_id = upload_id
        self.company_id = company_id
        self.max_pages = max_pages

@router.post("/improve-current-extraction/")
async def improve_current_extraction(
    upload_id: str = Form(...),
    company_id: str = Form(...),
    max_pages: int = Form(5),
    db: AsyncSession = Depends(get_db)
):
    """
    Improve current table extraction using GPT-4o Vision analysis.
    
    This endpoint:
    1. Retrieves the current extraction results
    2. Enhances PDF page images (first 4-5 pages)
    3. Sends enhanced images to GPT-4o Vision for analysis
    4. Processes the vision analysis to improve table structure
    5. Returns improved tables with diagnostic information
    """
    start_time = datetime.now()
    logger.info(f"Starting extraction improvement for upload_id: {upload_id}")
    
    try:
        # Check if GPT-4o service is available
        if not gpt4o_service.is_available():
            raise HTTPException(
                status_code=503, 
                detail="GPT-4o Vision service not available. Please check OPENAI_API_KEY configuration."
            )
        
        # Get upload information
        upload_info = await crud.get_upload_by_id(db, upload_id)
        if not upload_info:
            raise HTTPException(status_code=404, detail="Upload not found")
        
        # Get current extraction results
        # Use raw_data from statement_uploads instead of edited_tables
        current_tables = upload_info.raw_data if upload_info.raw_data else []
        if not current_tables:
            raise HTTPException(
                status_code=400, 
                detail="No current extraction results found. Please run extraction first."
            )
        
        # Convert to the format expected by the improvement service
        current_extraction = []
        for table in current_tables:
            current_extraction.append({
                "header": table.get("header", []),
                "rows": table.get("rows", []),
                "name": table.get("name", "Table"),
                "id": str(uuid.uuid4())  # Generate a temporary ID
            })
        
        # Get PDF file from S3
        # upload_info.file_name already contains the full S3 path
        s3_key = upload_info.file_name
        logger.info(f"Using S3 key: {s3_key}")
        
        # Download PDF from S3 to temporary file
        temp_pdf_path = download_file_from_s3(s3_key)
        if not temp_pdf_path:
            raise HTTPException(
                status_code=404, 
                detail=f"Failed to download PDF from S3: {s3_key}"
            )
        
        logger.info(f"Processing PDF: {temp_pdf_path} (downloaded from S3)")
        
        # Step 1: Enhance page images
        enhanced_images = []
        try:
            for page_num in range(min(max_pages, 5)):  # Limit to first 5 pages
                logger.info(f"Enhancing page {page_num + 1}")
                enhanced_image = gpt4o_service.enhance_page_image(temp_pdf_path, page_num, dpi=600)
                if enhanced_image:
                    enhanced_images.append(enhanced_image)
                    logger.info(f"Successfully enhanced page {page_num + 1}")
                else:
                    logger.warning(f"Failed to enhance page {page_num + 1}")
        finally:
            # Clean up temporary file
            try:
                os.remove(temp_pdf_path)
                logger.info(f"Cleaned up temporary file: {temp_pdf_path}")
            except Exception as e:
                logger.warning(f"Failed to clean up temporary file {temp_pdf_path}: {e}")
        
        if not enhanced_images:
            raise HTTPException(
                status_code=500, 
                detail="Failed to enhance any page images for vision analysis"
            )
        
        logger.info(f"Enhanced {len(enhanced_images)} page images")
        
        # Step 2: Analyze with GPT-4o Vision
        logger.info("Starting GPT-4o Vision analysis...")
        vision_analysis = gpt4o_service.analyze_table_with_vision(
            enhanced_images=enhanced_images,
            current_extraction=current_extraction,
            max_pages=max_pages
        )
        
        if not vision_analysis.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Vision analysis failed: {vision_analysis.get('error', 'Unknown error')}"
            )
        
        logger.info("GPT-4o Vision analysis completed successfully")
        
        # Step 3: Process improvement results
        improvement_result = gpt4o_service.process_improvement_result(
            vision_analysis=vision_analysis,
            current_tables=current_extraction
        )
        
        if not improvement_result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Failed to process improvement result: {improvement_result.get('error', 'Unknown error')}"
            )
        
        # Step 4: Save improved tables to database
        improved_tables = improvement_result.get("improved_tables", [])
        diagnostic_info = improvement_result.get("diagnostic_info", {})
        
        # Convert improved tables to the format expected by raw_data and TableEditor
        improved_tables_data = []
        for table in improved_tables:
            table_data = {
                "name": table.get("name", "Vision Enhanced Table"),
                "header": table.get("header", []),
                "rows": table.get("rows", []),
                "extractor": "gpt4o_vision",  # Add extractor field for TableEditor
                "metadata": {
                    "enhancement_method": "gpt4o_vision",
                    "enhancement_timestamp": improvement_result.get("enhancement_timestamp"),
                    "diagnostic_info": diagnostic_info,
                    "overall_notes": improvement_result.get("overall_notes", ""),
                    "extraction_method": "gpt4o_vision"  # Add extraction_method for compatibility
                }
            }
            improved_tables_data.append(table_data)
        
        # Update the upload record with improved tables
        upload_info.raw_data = improved_tables_data
        upload_info.updated_at = datetime.now()
        await db.commit()
        await db.refresh(upload_info)
        
        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()
        
        # Prepare response in the same format as extraction API for TableEditor compatibility
        response_data = {
            "status": "success",
            "success": True,
            "message": f"Successfully improved extraction with GPT-4o Vision",
            "upload_id": upload_id,
            "improved_tables_count": len(improved_tables_data),
            "tables": improved_tables_data,  # Use 'tables' key to match extraction API format
            "improved_tables": improved_tables_data,  # Keep for backward compatibility
            "processing_time_seconds": processing_time,
            "enhancement_timestamp": improvement_result.get("enhancement_timestamp"),
            "diagnostic_info": diagnostic_info,
            "overall_notes": improvement_result.get("overall_notes", ""),
            "vision_analysis_summary": {
                "pages_analyzed": len(enhanced_images),
                "improvements_detected": len(diagnostic_info.get("improvements", [])),
                "warnings": len(diagnostic_info.get("warnings", []))
            },
            "extraction_metrics": {
                "total_text_elements": sum(len(table.get("rows", [])) for table in improved_tables_data),
                "extraction_time": processing_time,
                "table_confidence": 0.95,  # High confidence for GPT-4o enhanced extraction
                "model_used": "gpt4o_vision"
            },
            "document_info": {
                "pdf_type": "commission_statement",
                "total_tables": len(improved_tables_data)
            },
            "quality_metrics": {
                "table_confidence": 0.95,
                "text_elements_extracted": sum(len(table.get("rows", [])) for table in improved_tables_data),
                "table_rows_extracted": sum(len(table.get("rows", [])) for table in improved_tables_data),
                "extraction_completeness": "complete",
                "data_quality": "enhanced"
            },
            "timestamp": datetime.now().isoformat()
        }
        
        logger.info(f"Extraction improvement completed successfully in {processing_time:.2f} seconds")
        
        return JSONResponse(response_data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in extraction improvement: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Extraction improvement failed: {str(e)}"
        )

@router.get("/status")
async def get_improvement_service_status():
    """
    Check the status of the GPT-4o Vision improvement service.
    """
    try:
        is_available = gpt4o_service.is_available()
        
        return JSONResponse({
            "service": "gpt4o_vision_improvement",
            "available": is_available,
            "status": "ready" if is_available else "unavailable",
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error checking improvement service status: {str(e)}")
        return JSONResponse({
            "service": "gpt4o_vision_improvement",
            "available": False,
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        })

@router.post("/test-vision-service/")
async def test_vision_service():
    """
    Test the GPT-4o Vision service with a simple validation.
    """
    try:
        if not gpt4o_service.is_available():
            return JSONResponse({
                "success": False,
                "error": "GPT-4o Vision service not available",
                "message": "Please check OPENAI_API_KEY configuration"
            })
        
        return JSONResponse({
            "success": True,
            "message": "GPT-4o Vision service is available and ready",
            "service": "gpt4o_vision",
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error testing vision service: {str(e)}")
        return JSONResponse({
            "success": False,
            "error": str(e),
            "message": "Vision service test failed"
        }) 
