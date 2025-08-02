from pydantic import BaseModel
from typing import Any, List, Optional, Dict
from uuid import UUID
from datetime import datetime

class CompanyBase(BaseModel):
    name: str

class CompanyCreate(CompanyBase):
    pass

class Company(CompanyBase):
    id: UUID
    created_at: datetime

    class Config:
        orm_mode = True

class CompanyFieldMappingBase(BaseModel):
    field_key: str
    column_name: str

class CompanyFieldMappingCreate(CompanyFieldMappingBase):
    company_id: UUID

class CompanyFieldMapping(CompanyFieldMappingBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True

class StatementUpload(BaseModel):
    id: UUID
    company_id: UUID
    file_name: str
    uploaded_at: datetime
    status: str
    raw_data: List[Dict[str, Any]]  # <--- Accepts a list of table dicts!
    mapping_used: Optional[dict] = None
    plan_types: Optional[List[str]] = None

    class Config:
        orm_mode = True

class ExtractionCreate(BaseModel):
    company_id: str
    filename: str
    s3_url: str
    total_tables: int
    valid_tables: int
    quality_score: float
    confidence: str
    extraction_metadata: Dict[str, Any]
    quality_metadata: Dict[str, Any]

class Extraction(ExtractionCreate):
    id: UUID
    created_at: datetime

    class Config:
        orm_mode = True

# app/api/schemas.py

class StatementReview(BaseModel):
    id: UUID
    company_id: UUID
    file_name: str
    uploaded_at: datetime
    status: str  # "Approved" | "Rejected"
    final_data: Optional[List[Dict[str, Any]]] = None
    field_config: Optional[List[Dict[str, str]]] = None
    rejection_reason: Optional[str] = None
    plan_types: Optional[List[str]] = None
    raw_data: Optional[List[Dict[str, Any]]] = None  # <-- Add this line

    class Config:
        from_attributes = True  # For Pydantic v2


class MappingConfig(BaseModel):
    mapping: Dict[str, str]
    plan_types: List[str] = []
    table_names: List[str] = []
    field_config: List[Dict[str, str]] = []

class DatabaseFieldBase(BaseModel):
    field_key: str
    display_name: str
    description: Optional[str] = None
    is_active: bool = True

class DatabaseFieldCreate(DatabaseFieldBase):
    pass

class DatabaseFieldUpdate(BaseModel):
    field_key: Optional[str] = None
    display_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class DatabaseField(DatabaseFieldBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


