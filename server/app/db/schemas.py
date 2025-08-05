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
    
    # Status Management
    status: str  # pending, approved, rejected, processing
    current_step: str  # upload, table_editor, field_mapper, dashboard, completed
    
    # Progress Data Storage
    progress_data: Optional[Dict[str, Any]] = None
    raw_data: Optional[List[Dict[str, Any]]] = None
    edited_tables: Optional[List[Dict[str, Any]]] = None
    field_mapping: Optional[Dict[str, Any]] = None
    final_data: Optional[List[Dict[str, Any]]] = None
    
    # Metadata
    mapping_used: Optional[Dict[str, Any]] = None
    field_config: Optional[Any] = None  # Can be list or dict to handle both old and new formats
    rejection_reason: Optional[str] = None
    plan_types: Optional[List[str]] = None
    
    # Timestamps
    last_updated: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # User session tracking
    session_id: Optional[str] = None
    auto_save_enabled: bool = True

    class Config:
        orm_mode = True

class StatementUploadCreate(BaseModel):
    company_id: UUID
    file_name: str
    status: str = "pending"
    current_step: str = "upload"
    progress_data: Optional[Dict[str, Any]] = None

class StatementUploadUpdate(BaseModel):
    status: Optional[str] = None
    current_step: Optional[str] = None
    progress_data: Optional[Dict[str, Any]] = None
    raw_data: Optional[List[Dict[str, Any]]] = None
    edited_tables: Optional[List[Dict[str, Any]]] = None
    field_mapping: Optional[Dict[str, Any]] = None
    final_data: Optional[List[Dict[str, Any]]] = None
    field_config: Optional[Any] = None  # Can be list or dict to handle both old and new formats
    rejection_reason: Optional[str] = None
    plan_types: Optional[List[str]] = None
    session_id: Optional[str] = None
    auto_save_enabled: Optional[bool] = None

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
    status: str  # "Approved" | "Rejected" | "Pending"
    current_step: str  # Current step in the process
    final_data: Optional[List[Dict[str, Any]]] = None
    field_config: Optional[Any] = None  # Can be list or dict to handle both old and new formats
    rejection_reason: Optional[str] = None
    plan_types: Optional[List[str]] = None
    raw_data: Optional[List[Dict[str, Any]]] = None
    last_updated: datetime

    class Config:
        from_attributes = True  # For Pydantic v2

class PendingFile(BaseModel):
    id: UUID
    company_id: UUID
    file_name: str
    uploaded_at: datetime
    current_step: str
    last_updated: datetime
    progress_summary: Optional[str] = None  # Human-readable summary of progress

    class Config:
        orm_mode = True

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


