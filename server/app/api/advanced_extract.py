from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.services.advanced_table_extractor_simple import AdvancedTableExtractor
from app.services.quality_assessor import CommissionStatementValidator
from app.services.extraction_config import get_config, create_custom_config
from app.config import get_db
import os
import shutil
from datetime import datetime
from uuid import uuid4
from app.services.s3_utils import upload_file_to_s3, get_s3_file_url
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/advanced", tags=["advanced-extract"])

UPLOAD_DIR = "pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Initialize services
extractor = AdvancedTableExtractor()
validator = CommissionStatementValidator()

@router.post("/extract-tables/")
async def advanced_extract_tables(
    file: UploadFile = File(...),
    company_id: str = Form(...),
    config_type: str = Form("default"),
    quality_threshold: float = Form(0.6),
    enable_validation: bool = Form(True),
    background_tasks: BackgroundTasks = None
):
    """
    Advanced table extraction with AI-powered preprocessing and quality assessment
    """
    logger.info(f"Starting advanced extraction for {file.filename}")
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    # Get extraction configuration
    try:
        config = get_config(config_type)
    except Exception as e:
        logger.warning(f"Invalid config type {config_type}, using default: {e}")
        config = get_config("default")
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    try:
        # Save uploaded file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Get company info
        db = next(get_db())
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
        
        # Extract tables with advanced system
        logger.info("Starting advanced table extraction...")
        tables = extractor.extract_tables_from_pdf(file_path)
        
        if not tables:
            raise HTTPException(
                status_code=400, 
                detail="No tables found in the uploaded PDF. Try adjusting extraction parameters."
            )
        
        # Quality assessment and validation
        validated_tables = []
        quality_summary = {
            "total_tables": len(tables),
            "valid_tables": 0,
            "average_quality_score": 0.0,
            "overall_confidence": "LOW",
            "issues_found": [],
            "recommendations": []
        }
        
        all_issues = []
        all_recommendations = []
        quality_scores = []
        
        for i, table in enumerate(tables):
            logger.info(f"Validating table {i+1}/{len(tables)}")
            
            if enable_validation:
                validation_result = validator.validate_table(table)
                
                # Use corrected data if available
                final_table = validation_result.corrected_data or table.get('rows', [])
                
                table_metrics = validation_result.quality_metrics
                quality_scores.append(table_metrics.overall_score)
                
                if table_metrics.overall_score >= quality_threshold:
                    quality_summary["valid_tables"] += 1
                
                # Add table with quality metrics
                validated_table = {
                    "header": table.get('header', []),
                    "rows": final_table,
                    "metadata": {
                        **table.get('metadata', {}),
                        "quality_metrics": {
                            "overall_score": table_metrics.overall_score,
                            "completeness": table_metrics.completeness,
                            "consistency": table_metrics.consistency,
                            "accuracy": table_metrics.accuracy,
                            "structure_quality": table_metrics.structure_quality,
                            "data_quality": table_metrics.data_quality,
                            "confidence_level": table_metrics.confidence_level,
                            "is_valid": validation_result.is_valid
                        },
                        "validation_warnings": validation_result.warnings or []
                    }
                }
                
                all_issues.extend(table_metrics.issues)
                all_recommendations.extend(table_metrics.recommendations)
            else:
                # Skip validation, use original table
                validated_table = table
                quality_summary["valid_tables"] += 1
            
            validated_tables.append(validated_table)
        
        # Calculate overall quality metrics
        if quality_scores:
            quality_summary["average_quality_score"] = sum(quality_scores) / len(quality_scores)
            quality_summary["overall_confidence"] = validator._determine_confidence_level(
                quality_summary["average_quality_score"]
            )
        
        # Remove duplicate issues and recommendations
        quality_summary["issues_found"] = list(set(all_issues))
        quality_summary["recommendations"] = list(set(all_recommendations))
        
        # Save to database
        upload_id = uuid4()
        db_upload = schemas.StatementUpload(
            id=upload_id,
            company_id=company.id,
            file_name=s3_key,
            uploaded_at=datetime.utcnow(),
            status="success" if quality_summary["valid_tables"] > 0 else "partial_success",
            raw_data=validated_tables,
            mapping_used=None,
            field_config={
                "extraction_config": config_type,
                "quality_threshold": quality_threshold,
                "validation_enabled": enable_validation
            }
        )
        
        await crud.save_statement_upload(db, db_upload)
        
        # Background task for detailed analysis
        if background_tasks:
            background_tasks.add_task(
                perform_detailed_analysis, 
                upload_id, 
                validated_tables, 
                quality_summary
            )
        
        logger.info(f"Advanced extraction completed. Found {len(validated_tables)} tables.")
        
        return {
            "tables": validated_tables,
            "upload_id": str(upload_id),
            "file_name": file.filename,
            "s3_url": s3_url,
            "s3_key": s3_key,
            "quality_summary": quality_summary,
            "extraction_config": {
                "config_type": config_type,
                "quality_threshold": quality_threshold,
                "validation_enabled": enable_validation
            }
        }
        
    except Exception as e:
        logger.error(f"Advanced extraction failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")
    
    finally:
        # Clean up temporary file
        if os.path.exists(file_path):
            os.remove(file_path)

@router.post("/extract-with-custom-config/")
async def extract_with_custom_config(
    file: UploadFile = File(...),
    company_id: str = Form(...),
    dpi: int = Form(300),
    header_similarity_threshold: float = Form(0.85),
    quality_threshold: float = Form(0.6),
    enable_validation: bool = Form(True)
):
    """
    Extract tables with custom configuration parameters
    """
    # Create custom configuration
    custom_config = create_custom_config(
        dpi=dpi,
        header_similarity_threshold=header_similarity_threshold,
        min_quality_score=quality_threshold
    )
    
    # Update extractor with custom config
    extractor.header_similarity_threshold = custom_config.header_similarity_threshold
    extractor.column_similarity_threshold = custom_config.column_similarity_threshold
    
    # Use the same extraction logic
    return await advanced_extract_tables(
        file=file,
        company_id=company_id,
        config_type="custom",
        quality_threshold=quality_threshold,
        enable_validation=enable_validation
    )

@router.get("/quality-report/{upload_id}")
async def get_quality_report(
    upload_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get detailed quality report for a specific upload
    """
    upload = await crud.get_statement_upload_by_id(db, upload_id)
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    if not upload.raw_data:
        raise HTTPException(status_code=400, detail="No data available for analysis")
    
    # Generate detailed quality report
    detailed_report = generate_detailed_quality_report(upload.raw_data)
    
    return {
        "upload_id": upload_id,
        "file_name": upload.file_name,
        "uploaded_at": upload.uploaded_at,
        "status": upload.status,
        "detailed_quality_report": detailed_report
    }

def generate_detailed_quality_report(tables: List[Dict]) -> Dict[str, Any]:
    """
    Generate detailed quality report for tables
    """
    if not tables:
        return {"error": "No tables to analyze"}
    
    report = {
        "summary": {
            "total_tables": len(tables),
            "total_rows": 0,
            "total_columns": 0,
            "average_quality_score": 0.0
        },
        "table_details": [],
        "common_issues": [],
        "data_patterns": {},
        "recommendations": []
    }
    
    all_quality_scores = []
    all_issues = []
    all_recommendations = []
    
    for i, table in enumerate(tables):
        header = table.get('header', [])
        rows = table.get('rows', [])
        metadata = table.get('metadata', {})
        quality_metrics = metadata.get('quality_metrics', {})
        
        table_detail = {
            "table_index": i,
            "header": header,
            "row_count": len(rows),
            "column_count": len(header),
            "quality_metrics": quality_metrics,
            "issues": quality_metrics.get('issues', []),
            "recommendations": quality_metrics.get('recommendations', [])
        }
        
        report["table_details"].append(table_detail)
        report["summary"]["total_rows"] += len(rows)
        report["summary"]["total_columns"] = max(report["summary"]["total_columns"], len(header))
        
        if quality_metrics.get('overall_score'):
            all_quality_scores.append(quality_metrics['overall_score'])
        
        all_issues.extend(quality_metrics.get('issues', []))
        all_recommendations.extend(quality_metrics.get('recommendations', []))
    
    # Calculate summary metrics
    if all_quality_scores:
        report["summary"]["average_quality_score"] = sum(all_quality_scores) / len(all_quality_scores)
    
    # Find common issues
    issue_counts = {}
    for issue in all_issues:
        issue_counts[issue] = issue_counts.get(issue, 0) + 1
    
    report["common_issues"] = [
        {"issue": issue, "count": count, "percentage": count / len(tables) * 100}
        for issue, count in sorted(issue_counts.items(), key=lambda x: x[1], reverse=True)
    ]
    
    # Generate recommendations
    report["recommendations"] = list(set(all_recommendations))
    
    return report

async def perform_detailed_analysis(upload_id: str, tables: List[Dict], quality_summary: Dict):
    """
    Background task for detailed analysis of extracted tables
    """
    try:
        logger.info(f"Starting detailed analysis for upload {upload_id}")
        
        # Perform additional analysis here
        # This could include:
        # - Data pattern recognition
        # - Anomaly detection
        # - Commission calculation validation
        # - Historical comparison
        
        logger.info(f"Detailed analysis completed for upload {upload_id}")
        
    except Exception as e:
        logger.error(f"Detailed analysis failed for upload {upload_id}: {str(e)}")

@router.get("/extraction-configs")
async def get_available_configs():
    """
    Get available extraction configurations
    """
    from app.services.extraction_config import CONFIGURATIONS
    
    configs = {}
    for name, config in CONFIGURATIONS.items():
        configs[name] = {
            "dpi": config.dpi,
            "header_similarity_threshold": config.header_similarity_threshold,
            "min_quality_score": config.min_quality_score,
            "description": get_config_description(name)
        }
    
    return {"configurations": configs}

def get_config_description(config_name: str) -> str:
    """
    Get description for configuration type
    """
    descriptions = {
        "default": "Balanced configuration for most commission statements",
        "high_quality": "Optimized for high-quality PDFs with clear table structures",
        "low_quality": "Enhanced preprocessing for low-quality or scanned documents",
        "multi_page": "Specialized for multi-page tables with repeating headers",
        "complex_structure": "For complex table layouts with irregular structures"
    }
    return descriptions.get(config_name, "Custom configuration") 