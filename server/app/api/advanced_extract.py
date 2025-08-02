import os
import tempfile
import logging
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from app.services.extraction_pipeline import TableExtractionPipeline
from app.services.extraction_utils import transform_pipeline_response_to_client_format

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the extraction pipeline
pipeline = TableExtractionPipeline()

# Create router
router = APIRouter(prefix="/advanced", tags=["advanced-extract"])


class HealthResponse(BaseModel):
    status: str
    extractors: dict
    timestamp: str
    pipeline_version: str


@router.get("/", response_model=dict)
async def root():
    """
    Root endpoint with API information.
    """
    return {
        "message": "Advanced PDF Table Extraction API",
        "version": "2.0.0",
        "pipeline_version": "2.0",
        "endpoints": {
            "extract_tables": "POST /advanced/api/v1/extraction/extract-tables/",
            "health": "GET /advanced/health",
            "docs": "GET /docs"
        },
        "features": [
            "Intelligent PDF type detection",
            "Docling for complex table structures",
            "Google Document AI for scanned PDFs",
            "Comprehensive logging and metadata",
            "Multi-page table stitching",
            "Multi-row header support",
            "Merged cell handling",
            "Borderless table detection",
            "Advanced OCR with 600 DPI"
        ]
    }


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint with extractor status and pipeline information.
    """
    extractor_status = pipeline.get_extractor_status()
    
    # Check if any extractors are available
    available_extractors = [name for name, status in extractor_status.items() if status.get("available", False)]
    
    if available_extractors:
        status = "healthy"
    elif extractor_status:
        status = "degraded"
    else:
        status = "unhealthy"
    
    return HealthResponse(
        status=status,
        extractors=extractor_status,
        timestamp=datetime.now().isoformat(),
        pipeline_version="2.0"
    )


@router.post("/api/v1/extraction/extract-tables/")
async def extract_tables_v1(
    file: UploadFile = File(...),
    output_format: Optional[str] = Form("json"),
    table_index: Optional[int] = Form(None),
    force_extractor: Optional[str] = Form(None)
):
    """
    Extract tables from uploaded PDF file.
    
    Args:
        file: PDF file to extract tables from
        output_format: Output format ("json", "csv", "excel")
        table_index: Specific table index to extract (optional)
        force_extractor: Force specific extractor ("docling", "google_docai") (optional)
    """
    start_time = datetime.now()
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    # Validate output format
    valid_formats = ["json", "csv", "excel"]
    if output_format not in valid_formats:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid output_format. Must be one of: {valid_formats}"
        )
    
    # Validate force_extractor if provided
    if force_extractor and force_extractor not in ["docling", "google_docai"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid force_extractor. Must be one of: docling, google_docai"
        )
    
    logger.info(f"Starting extraction for file: {file.filename}, format: {output_format}, force_extractor: {force_extractor}")
    
    # Create temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
        try:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name

            try:
                # Extract tables with optional forced extractor
                if table_index is not None:
                    logger.info(f"Extracting specific table index: {table_index}")
                    result = pipeline.extract_single_table(temp_file_path, table_index, force_extractor)
                else:
                    logger.info("Extracting all tables")
                    result = pipeline.extract_tables(temp_file_path, output_format, force_extractor)
                
                # Clean up temporary file
                os.unlink(temp_file_path)

                # Transform response to client format
                client_response = transform_pipeline_response_to_client_format(result, file.filename)
                
                # Add extraction timing and metadata
                extraction_time = (datetime.now() - start_time).total_seconds()
                client_response["extraction_time_seconds"] = extraction_time
                
                # Add detailed extraction log if available
                if "extraction_log" in result:
                    client_response["extraction_log"] = result["extraction_log"]
                
                # Add pipeline metadata
                if "metadata" in result:
                    client_response["pipeline_metadata"] = result["metadata"]
                
                # Log extraction summary
                logger.info(f"Extraction completed for {file.filename}: {len(client_response.get('table_data', []))} rows extracted in {extraction_time:.2f}s")
                
                return JSONResponse(content=client_response)
                
            except Exception as e:
                # Clean up temporary file on error
                os.unlink(temp_file_path)
                logger.error(f"Extraction failed for {file.filename}: {str(e)}")
                raise HTTPException(status_code=500, detail=f"File processing failed: {str(e)}")
                
        except Exception as e:
            logger.error(f"File handling failed for {file.filename}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"File handling failed: {str(e)}")


@router.post("/extract-tables")
async def extract_tables(
    file: UploadFile = File(...),
    output_format: Optional[str] = Form("json"),
    table_index: Optional[int] = Form(None)
):
    """Legacy endpoint (redirects to v1)."""
    return await extract_tables_v1(file, output_format, table_index) 