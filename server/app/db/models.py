from sqlalchemy import (
    Column, String, Integer, Text, TIMESTAMP, JSON, ForeignKey, DateTime, text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
import uuid

Base = declarative_base()

class Company(Base):
    __tablename__ = 'companies'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, server_default=text('now()'), nullable=False)

class CompanyFieldMapping(Base):
    __tablename__ = 'company_field_mappings'
    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey('companies.id'), nullable=False)
    field_key = Column(String, nullable=False)
    column_name = Column(String, nullable=False)
    created_at = Column(TIMESTAMP)
    updated_at = Column(TIMESTAMP)

class StatementUpload(Base):
    __tablename__ = 'statement_uploads'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey('companies.id'), nullable=False)
    file_name = Column(Text)
    uploaded_at = Column(TIMESTAMP)
    status = Column(String)
    raw_data = Column(JSON)
    mapping_used = Column(JSON)
    final_data = Column(JSON)  # <--- Add this if missing!
    field_config = Column(JSON) # <--- (Optional, if you want field_config too)
    rejection_reason = Column(Text)  # <--- Add this if missing!
    plan_types = Column(JSON)  # Store list of plan types (Medical, Dental, etc)

class Extraction(Base):
    __tablename__ = 'extractions'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(String, nullable=False)  # Using string for flexibility
    filename = Column(String, nullable=False)
    s3_url = Column(String, nullable=False)
    total_tables = Column(Integer, nullable=False)
    valid_tables = Column(Integer, nullable=False)
    quality_score = Column(Integer, nullable=False)  # Store as integer (0-100)
    confidence = Column(String, nullable=False)
    extraction_metadata = Column(JSON)
    quality_metadata = Column(JSON)
    created_at = Column(DateTime, server_default=text('now()'), nullable=False)

class DatabaseField(Base):
    __tablename__ = 'database_fields'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    field_key = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=False)
    description = Column(Text)
    is_active = Column(Integer, default=1)  # 1 for active, 0 for inactive
    created_at = Column(DateTime, server_default=text('now()'), nullable=False)
    updated_at = Column(DateTime, server_default=text('now()'), onupdate=text('now()'), nullable=False)

class EditedTable(Base):
    __tablename__ = 'edited_tables'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    upload_id = Column(UUID(as_uuid=True), ForeignKey('statement_uploads.id'), nullable=False)
    company_id = Column(UUID(as_uuid=True), ForeignKey('companies.id'), nullable=False)
    name = Column(String, nullable=False)
    header = Column(JSON, nullable=False)  # Array of column names
    rows = Column(JSON, nullable=False)    # Array of arrays (table data)
    created_at = Column(DateTime, server_default=text('now()'), nullable=False)
    updated_at = Column(DateTime, server_default=text('now()'), onupdate=text('now()'), nullable=False)
