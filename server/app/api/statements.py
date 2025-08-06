from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.config import get_db
from typing import List
from uuid import UUID
from pydantic import BaseModel
from fastapi.responses import FileResponse, RedirectResponse
import os
from app.services.s3_utils import get_s3_file_url, generate_presigned_url
from urllib.parse import unquote

router = APIRouter()

class DeleteStatementsRequest(BaseModel):
    statement_ids: List[UUID]

@router.get("/companies/{company_id}/statements/", response_model=List[schemas.StatementReview])
async def get_statements_for_company(company_id: UUID, db: AsyncSession = Depends(get_db)):
    """Returns all uploads/statements for a given company (carrier)"""
    statements = await crud.get_statements_for_company(db, company_id)
    # Convert ORM objects to StatementReview, including raw_data
    return [schemas.StatementReview.model_validate(s) for s in statements]

# In your CRUD:
async def get_statements_for_company(db, company_id):
    from app.db.models import StatementUpload
    result = await db.execute(
        select(StatementUpload)
        .where(StatementUpload.company_id == company_id)
        .order_by(StatementUpload.uploaded_at.desc())
    )
    return result.scalars().all()

@router.get("/pdfs/{file_path:path}")
async def get_pdf(file_path: str):
    file_path = unquote(file_path)
    print(f"PDF request received for file_path: {file_path}")
    
    if file_path.startswith("statements/"):
        print(f"Generating presigned URL for S3 file: {file_path}")
        presigned_url = generate_presigned_url(file_path)
        if not presigned_url:
            print(f"Failed to generate presigned URL for: {file_path}")
            raise HTTPException(status_code=404, detail="Could not generate S3 presigned URL")
        print(f"Redirecting to presigned URL: {presigned_url}")
        return RedirectResponse(presigned_url)
    
    local_path = os.path.join("pdfs", file_path)
    print(f"Checking local path: {local_path}")
    if not os.path.exists(local_path):
        print(f"Local file not found: {local_path}")
        raise HTTPException(status_code=404, detail="File not found")
    
    print(f"Serving local file: {local_path}")
    return FileResponse(local_path, media_type="application/pdf", headers={"Content-Disposition": "inline"})


@router.delete("/companies/{company_id}/statements/{statement_id}")
async def delete_statement(statement_id: str, db: AsyncSession = Depends(get_db)):
    try:
        statement = await crud.get_statement_by_id(db, statement_id)
        if not statement:
            raise HTTPException(status_code=404, detail="Statement not found")
        await crud.delete_statement(db, statement_id)
        return {"message": "Statement deleted successfully"}
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Return error response with 500 status code for unexpected errors
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to delete statement: {str(e)}"
        )

@router.delete("/companies/{company_id}/statements/")
async def delete_multiple_statements(
    company_id: UUID,
    request: DeleteStatementsRequest,
    db: AsyncSession = Depends(get_db)
):
    statement_ids = request.statement_ids
    deleted_count = 0
    errors = []
    
    try:
        for statement_id in statement_ids:
            try:
                statement = await crud.get_statement_by_id(db, str(statement_id))
                if not statement:
                    errors.append(f"Statement with ID {statement_id} not found")
                    continue
                await crud.delete_statement(db, str(statement_id))
                deleted_count += 1
            except Exception as e:
                errors.append(f"Failed to delete statement with ID {statement_id}: {str(e)}")
        
        if errors:
            # Return error response with 400 status code
            raise HTTPException(
                status_code=400, 
                detail=f"Some deletions failed. Deleted: {deleted_count}, Errors: {errors}"
            )
        
        return {"message": f"Successfully deleted {deleted_count} statements"}
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Return error response with 500 status code for unexpected errors
        raise HTTPException(
            status_code=500, 
            detail=f"Transaction failed: {str(e)}"
        )

@router.get("/statements/presigned-url/")
def get_presigned_pdf_url(s3_key: str):
    url = generate_presigned_url(s3_key)
    print(url)
    print(s3_key)
    if not url:
        raise HTTPException(status_code=404, detail="Could not generate presigned URL")
    return {"url": url}
