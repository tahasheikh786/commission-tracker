from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.services.table_detector_textract import TextractTableExtractor
from app.config import get_db
import os
import shutil
from datetime import datetime
from uuid import uuid4
from app.services.s3_utils import upload_file_to_s3, get_s3_file_url

router = APIRouter(tags=["extract"])

UPLOAD_DIR = "pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)
detector = TextractTableExtractor()

@router.post("/extract-tables/")
async def extract_tables(
    file: UploadFile = File(...),
    company_id: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    company = await crud.get_company_by_id(db, company_id)
    if not company:
        os.remove(file_path)
        raise HTTPException(status_code=404, detail="Company not found")

    s3_key = f"statements/{company_id}/{file.filename}"
    s3_url = None
    try:
        # Upload to S3
        uploaded = upload_file_to_s3(file_path, s3_key)
        if not uploaded:
            raise HTTPException(status_code=500, detail="Failed to upload file to S3.")
        s3_url = get_s3_file_url(s3_key)

        # Returns an array of cleaned tables
        tables = detector.extract_tables_from_pdf(file_path)
        if not tables:
            raise HTTPException(status_code=400, detail="No tables found in the uploaded PDF.")

        upload_id = uuid4()
        db_upload = schemas.StatementUpload(
            id=upload_id,
            company_id=company.id,
            file_name=file.filename,
            uploaded_at=datetime.utcnow(),
            status="success",
            raw_data=tables,  # store as list of tables
            mapping_used=None
        )
        # Store s3_key or s3_url in file_name for now (or add a new field if needed)
        db_upload.file_name = s3_key
        await crud.save_statement_upload(db, db_upload)
    finally:
        os.remove(file_path)

    # Return upload_id along with tables and s3_url!
    return {
        "tables": tables,
        "upload_id": str(upload_id),
        "file_name": file.filename,
        "s3_url": s3_url,
        "s3_key": s3_key
    }
