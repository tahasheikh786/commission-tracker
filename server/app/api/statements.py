from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.config import get_db
from typing import List
from uuid import UUID
from pydantic import BaseModel
from fastapi.responses import FileResponse
import os

router = APIRouter()

class DeleteStatementsRequest(BaseModel):
    statement_ids: List[UUID]

@router.get("/companies/{company_id}/statements/", response_model=List[schemas.StatementReview])
async def get_statements_for_company(company_id: UUID, db: AsyncSession = Depends(get_db)):
    """Returns all uploads/statements for a given company (carrier)"""
    statements = await crud.get_statements_for_company(db, company_id)
    return statements

# In your CRUD:
async def get_statements_for_company(db, company_id):
    from app.db.models import StatementUpload
    result = await db.execute(
        select(StatementUpload)
        .where(StatementUpload.company_id == company_id)
        .order_by(StatementUpload.uploaded_at.desc())
    )
    return result.scalars().all()

@router.get("/pdfs/{file_name}")
async def get_pdf(file_name: str):
    file_path = os.path.join("pdfs", file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, media_type="application/pdf", filename=file_name)

@router.delete("/companies/{company_id}/statements/{statement_id}")
async def delete_statement(statement_id: str, db: AsyncSession = Depends(get_db)):
    statement = await crud.get_statement_by_id(db, statement_id)
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    await crud.delete_statement(db, statement_id)
    return {"message": "Statement deleted successfully"}

@router.delete("/companies/{company_id}/statements/")
async def delete_multiple_statements(
    company_id: UUID,
    request: DeleteStatementsRequest,
    db: AsyncSession = Depends(get_db)
):
    statement_ids = request.statement_ids
    for statement_id in statement_ids:
        statement = await crud.get_statement_by_id(db, str(statement_id))
        if not statement:
            continue
        await crud.delete_statement(db, str(statement_id))
    return {"message": "Selected statements deleted successfully"}
