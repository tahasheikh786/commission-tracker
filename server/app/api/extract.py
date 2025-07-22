from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.services.advanced_table_extractor_simple import AdvancedTableExtractor
from app.services.quality_assessor import CommissionStatementValidator
from app.services.extraction_config import get_config
from app.config import get_db
import os
import shutil
from datetime import datetime
from uuid import uuid4
from app.services.s3_utils import upload_file_to_s3, get_s3_file_url
import logging

router = APIRouter(tags=["extract"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = "pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Use advanced extraction by default
extractor = AdvancedTableExtractor()
validator = CommissionStatementValidator()

@router.post("/extract-tables/")
async def extract_tables(
    file: UploadFile = File(...),
    company_id: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Default table extraction using advanced AI-powered system
    """
    logger.info(f"Starting advanced extraction for {file.filename}")
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    # Get default extraction configuration
    config = get_config("default")
    
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
            
            validation_result = validator.validate_table(table)
            
            # Use corrected data if available
            final_table = validation_result.corrected_data or table.get('rows', [])
            
            table_metrics = validation_result.quality_metrics
            quality_scores.append(table_metrics.overall_score)
            
            if table_metrics.overall_score >= config.min_quality_score:
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
                        "is_valid": validation_result.is_valid,
                        "issues": validation_result.quality_metrics.issues,
                        "recommendations": validation_result.quality_metrics.recommendations
                    }
                }
            }
            
            validated_tables.append(validated_table)
            all_issues.extend(validation_result.quality_metrics.issues)
            all_recommendations.extend(validation_result.quality_metrics.recommendations)
        
        # Calculate overall quality metrics
        if quality_scores:
            quality_summary["average_quality_score"] = sum(quality_scores) / len(quality_scores)
            
            if quality_summary["average_quality_score"] >= 0.8:
                quality_summary["overall_confidence"] = "VERY_HIGH"
            elif quality_summary["average_quality_score"] >= 0.6:
                quality_summary["overall_confidence"] = "HIGH"
            elif quality_summary["average_quality_score"] >= 0.4:
                quality_summary["overall_confidence"] = "MEDIUM"
            else:
                quality_summary["overall_confidence"] = "LOW"
        
        quality_summary["issues_found"] = list(set(all_issues))
        quality_summary["recommendations"] = list(set(all_recommendations))

        upload_id = uuid4()
        db_upload = schemas.StatementUpload(
            id=upload_id,
            company_id=company.id,
            file_name=file.filename,
            uploaded_at=datetime.utcnow(),
            status="success",
            raw_data=validated_tables,  # store validated tables with quality metrics
            mapping_used=None
        )
        # Store s3_key or s3_url in file_name for now (or add a new field if needed)
        db_upload.file_name = s3_key
        await crud.save_statement_upload(db, db_upload)
        
    finally:
        os.remove(file_path)

    # Return upload_id along with tables, quality summary, and s3_url
    return {
        "tables": validated_tables,
        "upload_id": str(upload_id),
        "file_name": file.filename,
        "s3_url": s3_url,
        "s3_key": s3_key,
        "quality_summary": quality_summary,
        "extraction_config": {
            "dpi": config.dpi,
            "header_similarity_threshold": config.header_similarity_threshold,
            "min_quality_score": config.min_quality_score,
            "description": "Default AI-powered extraction"
        }
    }
