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

    class Config:
        from_attributes = True  # For Pydantic v2


