from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.config import get_db
from typing import List

router = APIRouter()

@router.get("/companies/{company_id}/mapping/", response_model=List[schemas.CompanyFieldMapping])
async def get_company_mapping(company_id: str, db: AsyncSession = Depends(get_db)):
    return await crud.get_company_mappings(db, company_id)

@router.post("/companies/{company_id}/mapping/")
async def update_company_mapping(company_id: str, mapping: dict, db: AsyncSession = Depends(get_db)):
    # mapping: {field_key: column_name, ...}
    results = []
    for field_key, column_name in mapping.items():
        mapping_obj = schemas.CompanyFieldMappingCreate(
            company_id=company_id,
            field_key=field_key,
            column_name=column_name,
        )
        results.append(await crud.save_company_mapping(db, mapping_obj))
    return {"ok": True}
