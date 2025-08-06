from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.config import get_db
from typing import List, Dict, Any

router = APIRouter()

# --- New Pydantic schema for mapping config ---
from pydantic import BaseModel

class MappingConfig(BaseModel):
    mapping: Dict[str, str]
    plan_types: List[str] = []
    table_names: List[str] = []
    field_config: List[Dict[str, str]] = []

@router.get("/companies/{company_id}/mapping/", response_model=MappingConfig)
async def get_company_mapping(company_id: str, db: AsyncSession = Depends(get_db)):
    # Fetch mapping, plan_types, table_names, and field_config for the company
    mapping_rows = await crud.get_company_mappings(db, company_id)
    mapping = {row.display_name: row.column_name for row in mapping_rows}
    
    # For now, fetch the latest StatementUpload for this company to get plan_types, table_names, field_config
    latest_upload = await crud.get_latest_statement_upload_for_company(db, company_id)
    plan_types = latest_upload.plan_types if latest_upload and latest_upload.plan_types else []
    table_names = []
    if latest_upload and latest_upload.raw_data:
        for t in latest_upload.raw_data:
            if isinstance(t, dict) and t.get('name'):
                table_names.append(t['name'])
    
    # Get field_config from database fields instead of upload
    database_fields = await crud.get_all_database_fields(db, active_only=True)
    field_config = [{"field": field.display_name, "label": field.display_name} for field in database_fields]
    
    return MappingConfig(
        mapping=mapping,
        plan_types=plan_types,
        table_names=table_names,
        field_config=field_config
    )

@router.post("/companies/{company_id}/mapping/")
async def update_company_mapping(company_id: str, config: MappingConfig, db: AsyncSession = Depends(get_db)):
    # Save mapping
    for display_name, column_name in config.mapping.items():
        mapping_obj = schemas.CompanyFieldMappingCreate(
            company_id=company_id,
            display_name=display_name,
            column_name=column_name,
        )
        await crud.save_company_mapping(db, mapping_obj)
    # Save plan_types, table_names, and field_config to the latest StatementUpload (or create a new config table if needed)
    await crud.save_company_mapping_config(db, company_id, config.plan_types, config.table_names, config.field_config)
    return {"ok": True}
