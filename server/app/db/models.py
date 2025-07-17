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
