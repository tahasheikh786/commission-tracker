from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.config import get_db
from typing import List
from uuid import UUID

router = APIRouter()

@router.get("/database-fields/", response_model=List[schemas.DatabaseField])
async def get_database_fields(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db)
):
    """Get all database fields"""
    try:
        fields = await crud.get_all_database_fields(db, active_only=active_only)
        return fields
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/database-fields/{field_id}", response_model=schemas.DatabaseField)
async def get_database_field(
    field_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific database field by ID"""
    try:
        field = await crud.get_database_field_by_id(db, field_id)
        if not field:
            raise HTTPException(status_code=404, detail="Database field not found")
        return field
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/database-fields/", response_model=schemas.DatabaseField)
async def create_database_field(
    field: schemas.DatabaseFieldCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new database field"""
    try:
        # Check if field_key already exists
        existing_field = await crud.get_database_field_by_key(db, field.field_key)
        if existing_field:
            raise HTTPException(status_code=400, detail="Field key already exists")
        
        created_field = await crud.create_database_field(db, field)
        return created_field
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/database-fields/{field_id}", response_model=schemas.DatabaseField)
async def update_database_field(
    field_id: UUID,
    field_update: schemas.DatabaseFieldUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a database field"""
    try:
        # Check if field_key is being updated and if it already exists
        if field_update.field_key:
            existing_field = await crud.get_database_field_by_key(db, field_update.field_key)
            if existing_field and existing_field.id != field_id:
                raise HTTPException(status_code=400, detail="Field key already exists")
        
        updated_field = await crud.update_database_field(db, field_id, field_update)
        return updated_field
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/database-fields/{field_id}")
async def delete_database_field(
    field_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Delete a database field (soft delete)"""
    try:
        await crud.delete_database_field(db, field_id)
        return {"message": "Database field deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/database-fields/initialize/")
async def initialize_database_fields(db: AsyncSession = Depends(get_db)):
    """Initialize default database fields"""
    try:
        fields = await crud.initialize_default_database_fields(db)
        return {"message": f"Initialized {len(fields)} database fields", "fields": fields}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 