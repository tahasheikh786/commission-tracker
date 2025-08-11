"""REST API for table extraction pipeline."""

import asyncio
import tempfile
import time
from typing import List, Dict, Any, Optional
from pathlib import Path
import json
import traceback

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field
import uvicorn

from ..pipeline.extraction_pipeline import ExtractionPipeline, ExtractionOptions, TableExtractionResult
from ..utils.config import Config, get_config
from ..utils.logging_utils import get_logger
from ..utils.validation import DocumentValidator


# Request/Response Models
class ExtractionRequest(BaseModel):
    """Request model for table extraction."""
    enable_ocr: bool = True
    enable_multipage: bool = True
    confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    max_tables_per_page: int = Field(default=10, ge=1, le=50)
    output_format: str = Field(default="json", pattern="^(json|csv|xlsx)$")
    include_raw_data: bool = False
    enable_quality_checks: bool = True


class ExtractionResponse(BaseModel):
    """Response model for table extraction."""
    success: bool
    tables: List[Dict[str, Any]]
    metadata: Dict[str, Any]
    confidence_scores: Dict[str, float]
    processing_time: float
    warnings: List[str] = []
    errors: List[str] = []
    document_path: str = ""


class BatchExtractionRequest(BaseModel):
    """Request model for batch extraction."""
    options: ExtractionRequest = ExtractionRequest()


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str
    uptime: float
    stats: Dict[str, Any]


class ErrorResponse(BaseModel):
    """Error response model."""
    error: str
    detail: str
    timestamp: float


# Initialize config first
config = get_config()

# Global variables
app = FastAPI(
    title="Table Extraction API",
    description="Advanced table extraction pipeline with ML models",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.api.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pipeline: ExtractionPipeline = None
logger = None
start_time = time.time()


def get_pipeline() -> ExtractionPipeline:
    """Dependency to get pipeline instance."""
    return pipeline


def get_config_dep() -> Config:
    """Dependency to get config instance."""
    return config


@app.on_event("startup")
async def startup_event():
    """Initialize application on startup."""
    global pipeline, logger
    
    logger = get_logger(__name__, config)
    
    logger.logger.info("Starting Table Extraction API...")
    
    # Initialize pipeline
    try:
        pipeline = ExtractionPipeline(config)
        logger.logger.info("Pipeline initialized successfully")
    except Exception as e:
        logger.logger.error(f"Failed to initialize pipeline: {e}")
        raise
    
    logger.logger.info(f"API started on {config.api.host}:{config.api.port}")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    if logger:
        logger.logger.info("Shutting down Table Extraction API...")


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler."""
    if logger:
        logger.logger.error(f"Unhandled exception: {exc}")
        logger.logger.error(traceback.format_exc())
    
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error="Internal Server Error",
            detail=str(exc),
            timestamp=time.time()
        ).dict()
    )


@app.get("/", response_model=Dict[str, str])
async def root():
    """Root endpoint."""
    return {
        "message": "Table Extraction API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health", response_model=HealthResponse)
async def health_check(pipeline: ExtractionPipeline = Depends(get_pipeline)):
    """Health check endpoint."""
    uptime = time.time() - start_time
    stats = pipeline.get_statistics()
    
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        uptime=uptime,
        stats=stats
    )


@app.post("/extract", response_model=ExtractionResponse)
async def extract_tables(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    enable_ocr: bool = True,
    enable_multipage: bool = True,
    confidence_threshold: float = 0.5,
    max_tables_per_page: int = 10,
    output_format: str = "json",
    include_raw_data: bool = False,
    enable_quality_checks: bool = True,
    pipeline: ExtractionPipeline = Depends(get_pipeline),
    config: Config = Depends(get_config_dep)
):
    """Extract tables from uploaded document."""
    
    # Log API request
    logger.log_api_request(
        "/extract",
        "POST",
        file_size=file.size if hasattr(file, 'size') else None
    )
    
    start_time = time.time()
    
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file uploaded")
        
        # Check file extension
        file_path = Path(file.filename)
        if file_path.suffix.lower() not in config.api.allowed_extensions:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type: {file_path.suffix}"
            )
        
        # Create extraction options
        options = ExtractionOptions(
            enable_ocr=enable_ocr,
            enable_multipage=enable_multipage,
            confidence_threshold=confidence_threshold,
            max_tables_per_page=max_tables_per_page,
            output_format=output_format,
            include_raw_data=include_raw_data,
            enable_quality_checks=enable_quality_checks
        )
        
        # Save uploaded file
        with tempfile.NamedTemporaryFile(
            delete=False, 
            suffix=file_path.suffix,
            prefix="extraction_"
        ) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        # Schedule cleanup
        def cleanup_temp_file():
            try:
                Path(temp_file_path).unlink(missing_ok=True)
            except Exception as e:
                logger.logger.warning(f"Failed to cleanup temp file: {e}")
        
        background_tasks.add_task(cleanup_temp_file)
        
        # Validate file size
        if len(content) > config.api.max_file_size:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size: {config.api.max_file_size} bytes"
            )
        
        # Extract tables
        result = await pipeline.extract_tables(temp_file_path, options)
        
        # Log API response
        response_time = time.time() - start_time
        logger.log_api_response("/extract", 200, response_time)
        
        return ExtractionResponse(
            success=len(result.errors) == 0,
            tables=result.tables,
            metadata=result.metadata,
            confidence_scores=result.confidence_scores,
            processing_time=result.processing_time,
            warnings=result.warnings,
            errors=result.errors,
            document_path=file.filename
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Extraction failed: {str(e)}"
        logger.logger.error(error_msg)
        logger.logger.error(traceback.format_exc())
        
        response_time = time.time() - start_time
        logger.log_api_response("/extract", 500, response_time)
        
        raise HTTPException(status_code=500, detail=error_msg)


@app.post("/extract-tables/")
async def extract_tables_legacy(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    company_id: str = "",
    pipeline: ExtractionPipeline = Depends(get_pipeline),
    config: Config = Depends(get_config_dep)
):
    """Extract tables from uploaded document (legacy endpoint for frontend compatibility)."""
    
    # Log API request
    logger.log_api_request(
        "/extract-tables/",
        "POST",
        file_size=file.size if hasattr(file, 'size') else None
    )
    
    start_time = time.time()
    
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file uploaded")
        
        # Check file extension
        file_path = Path(file.filename)
        if file_path.suffix.lower() not in config.api.allowed_extensions:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type: {file_path.suffix}"
            )
        
        # Create extraction options with advanced features enabled
        options = ExtractionOptions(
            enable_ocr=True,
            enable_multipage=True,
            confidence_threshold=0.5,
            max_tables_per_page=10,
            output_format="json",
            include_raw_data=False,
            enable_quality_checks=True,
            enable_advanced_tableformer=False,  # Disable for stability
            enable_ensemble_ocr=True,
            enable_financial_processing=True,
            enable_advanced_metrics=True
        )
        
        # Save uploaded file
        with tempfile.NamedTemporaryFile(
            delete=False, 
            suffix=file_path.suffix,
            prefix="extraction_"
        ) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        # Schedule cleanup
        def cleanup_temp_file():
            try:
                Path(temp_file_path).unlink(missing_ok=True)
            except Exception as e:
                logger.logger.warning(f"Failed to cleanup temp file: {e}")
        
        background_tasks.add_task(cleanup_temp_file)
        
        # Validate file size
        if len(content) > config.api.max_file_size:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size: {config.api.max_file_size} bytes"
            )
        
        # Extract tables
        result = await pipeline.extract_tables(temp_file_path, options)
        
        # Convert to frontend-expected format
        frontend_tables = []
        for table in result.tables:
            # Transform backend format to frontend format
            headers = table.get('headers', [])
            rows_data = table.get('rows', [])
            
            # Ensure we have proper headers
            if not headers and rows_data:
                # Generate column headers if missing
                max_cols = max(len(row) for row in rows_data) if rows_data else 0
                headers = [f"Column {i+1}" for i in range(max_cols)]
            
            frontend_table = {
                "header": headers,
                "rows": rows_data,
                "name": table.get('name', f"Table {len(frontend_tables) + 1}"),
                "id": str(table.get('id', len(frontend_tables) + 1)),
                "extractor": "advanced_pipeline",
                "metadata": {
                    "extraction_method": "advanced",
                    "confidence": table.get('confidence', 1.0),
                    "row_count": table.get('row_count', len(rows_data)),
                    "column_count": table.get('column_count', len(headers)),
                    "quality_metrics": {
                        "overall_score": table.get('confidence', 1.0),
                        "completeness": 1.0,
                        "consistency": 1.0,
                        "accuracy": table.get('confidence', 1.0),
                        "structure_quality": 1.0,
                        "data_quality": 1.0,
                        "confidence_level": "high" if table.get('confidence', 1.0) > 0.8 else "medium",
                        "is_valid": True
                    },
                    "validation_warnings": [],
                    "financial_metadata": table.get('financial_metadata')
                }
            }
            frontend_tables.append(frontend_table)
        
        # Log API response
        response_time = time.time() - start_time
        logger.log_api_response("/extract-tables/", 200, response_time)
        
        # Return in frontend-expected format
        return {
            "tables": frontend_tables,
            "upload_id": f"upload_{int(time.time())}",
            "s3_key": file.filename,
            "quality_summary": {
                "total_tables": len(frontend_tables),
                "avg_confidence": sum(t.get('metadata', {}).get('confidence', 1.0) for t in frontend_tables) / len(frontend_tables) if frontend_tables else 0,
                "processing_time": response_time,
                "warnings": result.warnings,
                "errors": result.errors
            },
            "extraction_config": {
                "method": "advanced_pipeline",
                "ocr_enabled": True,
                "multipage_enabled": True,
                "financial_processing": True
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Extraction failed: {str(e)}"
        logger.logger.error(error_msg)
        logger.logger.error(traceback.format_exc())
        
        response_time = time.time() - start_time
        logger.log_api_response("/extract-tables/", 500, response_time)
        
        raise HTTPException(status_code=500, detail=error_msg)


@app.post("/extract/batch", response_model=List[ExtractionResponse])
async def extract_tables_batch(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    request: BatchExtractionRequest = BatchExtractionRequest(),
    pipeline: ExtractionPipeline = Depends(get_pipeline),
    config: Config = Depends(get_config_dep)
):
    """Extract tables from multiple documents."""
    
    logger.log_api_request(
        "/extract/batch",
        "POST",
        file_size=sum(getattr(f, 'size', 0) for f in files)
    )
    
    start_time = time.time()
    
    try:
        if len(files) > 10:  # Limit batch size
            raise HTTPException(
                status_code=400,
                detail="Too many files. Maximum batch size: 10"
            )
        
        # Create extraction options
        options = ExtractionOptions(**request.options.dict())
        
        # Process files
        temp_files = []
        results = []
        
        for file in files:
            try:
                # Save uploaded file
                with tempfile.NamedTemporaryFile(
                    delete=False,
                    suffix=Path(file.filename).suffix,
                    prefix="batch_extraction_"
                ) as temp_file:
                    content = await file.read()
                    temp_file.write(content)
                    temp_files.append(temp_file.name)
                
                # Extract tables
                result = await pipeline.extract_tables(temp_file.name, options)
                
                response = ExtractionResponse(
                    success=len(result.errors) == 0,
                    tables=result.tables,
                    metadata=result.metadata,
                    confidence_scores=result.confidence_scores,
                    processing_time=result.processing_time,
                    warnings=result.warnings,
                    errors=result.errors,
                    document_path=file.filename
                )
                results.append(response)
                
            except Exception as e:
                error_response = ExtractionResponse(
                    success=False,
                    tables=[],
                    metadata={},
                    confidence_scores={},
                    processing_time=0.0,
                    errors=[str(e)],
                    document_path=file.filename
                )
                results.append(error_response)
        
        # Schedule cleanup
        def cleanup_temp_files():
            for temp_path in temp_files:
                try:
                    Path(temp_path).unlink(missing_ok=True)
                except Exception as e:
                    logger.logger.warning(f"Failed to cleanup temp file: {e}")
        
        background_tasks.add_task(cleanup_temp_files)
        
        response_time = time.time() - start_time
        logger.log_api_response("/extract/batch", 200, response_time)
        
        return results
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Batch extraction failed: {str(e)}"
        logger.logger.error(error_msg)
        
        response_time = time.time() - start_time
        logger.log_api_response("/extract/batch", 500, response_time)
        
        raise HTTPException(status_code=500, detail=error_msg)


@app.get("/stats", response_model=Dict[str, Any])
async def get_statistics(pipeline: ExtractionPipeline = Depends(get_pipeline)):
    """Get pipeline statistics."""
    return pipeline.get_statistics()


@app.get("/config", response_model=Dict[str, Any])
async def get_configuration(config: Config = Depends(get_config_dep)):
    """Get current configuration (excluding sensitive data)."""
    config_dict = {
        'processing': {
            'max_image_size': config.processing.max_image_size,
            'confidence_threshold': config.processing.confidence_threshold,
            'enable_multipage': config.processing.enable_multipage,
            'output_format': config.processing.output_format,
            'enable_ocr': config.processing.enable_ocr,
            'ocr_languages': config.processing.ocr_languages
        },
        'models': {
            'ocr_engine': config.models.ocr_engine,
            'device': config.models.device,
            'batch_size': config.models.batch_size
        },
        'api': {
            'max_file_size': config.api.max_file_size,
            'allowed_extensions': config.api.allowed_extensions
        }
    }
    return config_dict


@app.post("/validate", response_model=Dict[str, Any])
async def validate_document(
    file: UploadFile = File(...),
    config: Config = Depends(get_config_dep)
):
    """Validate document without processing."""
    try:
        # Save file temporarily for validation
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=Path(file.filename).suffix
        ) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        # Validate
        validator = DocumentValidator(config.api.max_file_size)
        result = validator.validate_file(temp_file_path)
        
        # Cleanup
        Path(temp_file_path).unlink(missing_ok=True)
        
        return {
            'is_valid': result.is_valid,
            'errors': result.errors,
            'warnings': result.warnings,
            'metadata': result.metadata
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def create_app(config_path: Optional[str] = None) -> FastAPI:
    """Create FastAPI application with configuration."""
    global config
    
    if config_path:
        config = get_config(config_path)
    else:
        config = get_config()
    
    return app


def run_server(
    config_path: Optional[str] = None,
    host: Optional[str] = None,
    port: Optional[int] = None,
    workers: Optional[int] = None
):
    """Run the API server."""
    global config
    
    if config_path:
        config = get_config(config_path)
    else:
        config = get_config()
    
    # Override with provided parameters
    host = host or config.api.host
    port = port or config.api.port
    workers = workers or config.api.workers
    
    uvicorn.run(
        "src.api.rest_api:app",
        host=host,
        port=port,
        workers=workers,
        reload=config.debug,
        log_level=config.logging.level.lower()
    )


if __name__ == "__main__":
    run_server()
