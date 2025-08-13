from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.config import get_db
from app.utils.db_retry import with_db_retry
from app.services.format_learning_service import FormatLearningService
from typing import List, Dict, Any

router = APIRouter()
format_learning_service = FormatLearningService()

# --- New Pydantic schema for mapping config ---
from pydantic import BaseModel

class MappingConfig(BaseModel):
    mapping: Dict[str, str]
    plan_types: List[str] = []
    table_names: List[str] = []
    field_config: List[Dict[str, str]] = []
    table_data: List[List[str]] = []  # Add table data for learning
    headers: List[str] = []  # Add headers for learning

@router.get("/companies/{company_id}/mapping/", response_model=MappingConfig)
async def get_company_mapping(company_id: str, db: AsyncSession = Depends(get_db)):
    # Fetch mapping from company_field_mappings table with retry
    mapping_rows = await with_db_retry(db, crud.get_company_mappings, company_id=company_id)
    mapping = {row.display_name: row.column_name for row in mapping_rows}
    
    # Fetch company configuration (field_config, plan_types, table_names) with retry
    company_config = await with_db_retry(db, crud.get_company_configuration, company_id=company_id)
    
    # Use company configuration if available, otherwise fall back to defaults
    plan_types = company_config.plan_types if company_config and company_config.plan_types else []
    table_names = company_config.table_names if company_config and company_config.table_names else []
    
    # Get field_config from company configuration if available, otherwise return empty list for new carriers
    if company_config and company_config.field_config:
        field_config = company_config.field_config
    else:
        # For new carriers with no existing configuration, return empty field_config
        # This allows the frontend to start with empty fields and let users add them manually
        field_config = []
    
    return MappingConfig(
        mapping=mapping,
        plan_types=plan_types,
        table_names=table_names,
        field_config=field_config
    )

@router.post("/companies/{company_id}/mapping/")
async def update_company_mapping(company_id: str, config: MappingConfig, db: AsyncSession = Depends(get_db)):
    # Save field mapping to company_field_mappings table with retry
    for display_name, column_name in config.mapping.items():
        mapping_obj = schemas.CompanyFieldMappingCreate(
            company_id=company_id,
            display_name=display_name,
            column_name=column_name,
        )
        await with_db_retry(db, crud.save_company_mapping, mapping=mapping_obj)
    
    # Save field_config, plan_types, and table_names to company_configurations table with retry
    await with_db_retry(
        db, 
        crud.save_company_configuration,
        company_id=company_id, 
        field_config=config.field_config,
        plan_types=config.plan_types,
        table_names=config.table_names
    )
    
    # Learn from the processed file if table data is provided
    if config.table_data and config.headers and config.mapping:
        try:
            await format_learning_service.learn_from_processed_file(
                db=db,
                company_id=company_id,
                table_data=config.table_data,
                headers=config.headers,
                field_mapping=config.mapping,
                confidence_score=80  # Default confidence score
            )
        except Exception as e:
            # Log error but don't fail the mapping save
            print(f"Error learning from processed file: {e}")
    
    return {"ok": True}
