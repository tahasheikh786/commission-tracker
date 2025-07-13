from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.config import get_db
from typing import List

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
