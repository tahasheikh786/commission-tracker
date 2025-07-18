from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, models, schemas
from app.services.table_detector_textract import TextractTableExtractor
from app.config import get_db
import os
import shutil
from uuid import UUID
from datetime import datetime
from app.services.s3_utils import upload_file_to_s3, get_s3_file_url

router = APIRouter(prefix="/uploads", tags=["uploads"])

UPLOAD_DIR = "pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

detector = TextractTableExtractor()

@router.post("/statement/")
async def upload_statement(
    company_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    s3_key = f"statements/{company_id}/{file.filename}"
    s3_url = None
    try:
        # Upload to S3
        uploaded = upload_file_to_s3(file_path, s3_key)
        if not uploaded:
            raise HTTPException(status_code=500, detail="Failed to upload file to S3.")
        s3_url = get_s3_file_url(s3_key)

        # Extract and clean tables - now returns an array of tables (not merged)
        tables = detector.extract_tables_from_pdf(file_path)

        # Optionally check for no tables found
        if not tables:
            raise HTTPException(status_code=400, detail="No tables found in the uploaded PDF.")

        # Save upload record to DB (adapted for your schemas)
        from uuid import uuid4
        upload_id = uuid4()
        db_upload = schemas.StatementUpload(
            id=upload_id,
            company_id=company_id,
            file_name=file.filename,
            uploaded_at=datetime.utcnow(),
            status="success",
            raw_data=tables,  # store as list of tables
            mapping_used=None
        )
        db_upload.file_name = s3_key
        await crud.save_statement_upload(db, db_upload)
    finally:
        os.remove(file_path)

    return {
        "upload_id": str(upload_id),
        "tables": tables,
        "s3_url": s3_url,
        "s3_key": s3_key
    }
