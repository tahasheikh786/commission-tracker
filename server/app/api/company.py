from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.config import get_db
from typing import List
from pydantic import BaseModel

class CompanyIds(BaseModel):
    company_ids: List[str]

router = APIRouter()

@router.get("/companies/", response_model=List[schemas.Company])
async def list_companies(db: AsyncSession = Depends(get_db)):
    return await crud.get_all_companies(db)

@router.post("/companies/", response_model=schemas.Company)
async def create_company(company: schemas.CompanyCreate, db: AsyncSession = Depends(get_db)):
    db_company = await crud.get_company_by_name(db, name=company.name)
    if db_company:
        raise HTTPException(status_code=400, detail="Company already exists")
    return await crud.create_company(db, company)

@router.delete("/companies/{company_id}")
async def delete_company(company_id: str, db: AsyncSession = Depends(get_db)):
    company = await crud.get_company_by_id(db, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    await crud.delete_company(db, company_id)
    return {"message": "Company deleted successfully"}

@router.delete("/companies/")
async def delete_multiple_companies(request: CompanyIds, db: AsyncSession = Depends(get_db)):
    company_ids = request.company_ids
    for company_id in company_ids:
        try:
            await crud.delete_company(db, company_id)
        except Exception as e:
            return {"error": f"Failed to delete company with ID {company_id}: {str(e)}"}
    return {"message": "Selected companies deleted successfully"}
