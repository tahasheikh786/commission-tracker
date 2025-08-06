from .models import Company, CompanyFieldMapping, DatabaseField, PlanType, Extraction, EditedTable, StatementUpload as StatementUploadModel
from .schemas import CompanyCreate, CompanyFieldMappingCreate, StatementUpload, DatabaseFieldCreate, DatabaseFieldUpdate, PlanTypeCreate, PlanTypeUpdate, ExtractionCreate, StatementUploadCreate, StatementUploadUpdate, PendingFile
from sqlalchemy.dialects.postgresql import insert as pg_insert
from datetime import datetime
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from uuid import UUID
from typing import List, Optional

async def get_company_by_name(db, name: str):
    result = await db.execute(select(Company).where(Company.name == name))
    return result.scalar_one_or_none()

async def create_company(db, company: CompanyCreate):
    db_company = Company(name=company.name)
    db.add(db_company)
    await db.commit()
    await db.refresh(db_company)
    return db_company

async def get_all_companies(db):
    result = await db.execute(select(Company))
    return result.scalars().all()


async def save_company_mapping(db, mapping):
    """
    Upsert company field mapping.
    """
    now = datetime.utcnow()
    stmt = pg_insert(CompanyFieldMapping).values(
        company_id=mapping.company_id,
        display_name=mapping.display_name,
        column_name=mapping.column_name,
        created_at=now,
        updated_at=now,
    ).on_conflict_do_update(
        index_elements=['company_id', 'display_name'],
        set_={
            "column_name": mapping.column_name,
            "updated_at": now
        }
    ).returning(CompanyFieldMapping)
    result = await db.execute(stmt)
    await db.commit()
    return result.fetchone()


async def get_company_mappings(db, company_id):
    result = await db.execute(select(CompanyFieldMapping).where(CompanyFieldMapping.company_id == company_id))
    return result.scalars().all()


# crud.py

async def save_statement_upload(db, upload: StatementUpload):
    db_upload = StatementUploadModel(
        id=upload.id,
        company_id=upload.company_id,
        file_name=upload.file_name,
        uploaded_at=upload.uploaded_at,
        status=upload.status,
        current_step=upload.current_step,
        raw_data=upload.raw_data,
        mapping_used=upload.mapping_used,
        last_updated=upload.last_updated or datetime.utcnow()
    )
    db.add(db_upload)
    await db.commit()
    await db.refresh(db_upload)
    return db_upload

async def get_company_by_id(db, company_id):
    result = await db.execute(select(Company).where(Company.id == company_id))
    return result.scalar_one_or_none()

async def create_extraction(db, extraction: ExtractionCreate):
    """
    Create a new extraction record.
    """
    # Convert quality_score from float (0-1) to integer (0-100)
    quality_score_int = int(extraction.quality_score * 100)
    
    db_extraction = Extraction(
        company_id=extraction.company_id,
        filename=extraction.filename,
        s3_url=extraction.s3_url,
        total_tables=extraction.total_tables,
        valid_tables=extraction.valid_tables,
        quality_score=quality_score_int,
        confidence=extraction.confidence,
        extraction_metadata=extraction.extraction_metadata,
        quality_metadata=extraction.quality_metadata
    )
    db.add(db_extraction)
    await db.commit()
    await db.refresh(db_extraction)
    return db_extraction

# Pending Functionality CRUD Operations

async def create_statement_upload(db: AsyncSession, upload: StatementUploadCreate) -> StatementUploadModel:
    """
    Create a new statement upload with pending status.
    """
    db_upload = StatementUploadModel(
        company_id=upload.company_id,
        file_name=upload.file_name,
        status=upload.status,
        current_step=upload.current_step,
        progress_data=upload.progress_data,
        uploaded_at=datetime.utcnow(),
        last_updated=datetime.utcnow()
    )
    db.add(db_upload)
    await db.commit()
    await db.refresh(db_upload)
    return db_upload

async def update_statement_upload(db: AsyncSession, upload_id: UUID, update_data: StatementUploadUpdate) -> Optional[StatementUploadModel]:
    """
    Update statement upload with progress data and status changes.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        return None
    
    # Update fields if provided
    update_dict = update_data.dict(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(db_upload, field, value)
    
    # Update last_updated timestamp
    db_upload.last_updated = datetime.utcnow()
    
    # Set completed_at if status is approved or rejected
    if update_data.status in ['approved', 'rejected']:
        db_upload.completed_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(db_upload)
    return db_upload

async def get_pending_files_for_company(db: AsyncSession, company_id: UUID) -> List[PendingFile]:
    """
    Get all pending files for a specific company.
    """
    result = await db.execute(
        select(StatementUploadModel).where(
            StatementUploadModel.company_id == company_id,
            StatementUploadModel.status == 'pending'
        ).order_by(StatementUploadModel.last_updated.desc())
    )
    uploads = result.scalars().all()
    
    pending_files = []
    for upload in uploads:
        # Create human-readable progress summary
        progress_summary = get_progress_summary(upload.current_step, upload.progress_data)
        
        pending_file = PendingFile(
            id=upload.id,
            company_id=upload.company_id,
            file_name=upload.file_name,
            uploaded_at=upload.uploaded_at,
            current_step=upload.current_step,
            last_updated=upload.last_updated,
            progress_summary=progress_summary
        )
        pending_files.append(pending_file)
    
    return pending_files

async def get_statement_upload_by_id(db: AsyncSession, upload_id: UUID) -> Optional[StatementUploadModel]:
    """
    Get statement upload by ID with all progress data.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    return result.scalar_one_or_none()

async def save_progress_data(db: AsyncSession, upload_id: UUID, step: str, data: dict, session_id: Optional[str] = None) -> bool:
    """
    Save progress data for a specific step.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        return False
    
    # Update progress data
    if not db_upload.progress_data:
        db_upload.progress_data = {}
    
    db_upload.progress_data[step] = data
    db_upload.current_step = step
    db_upload.last_updated = datetime.utcnow()
    
    if session_id:
        db_upload.session_id = session_id
    
    await db.commit()
    return True

async def get_progress_data(db: AsyncSession, upload_id: UUID, step: str) -> Optional[dict]:
    """
    Get progress data for a specific step.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload or not db_upload.progress_data:
        return None
    
    return db_upload.progress_data.get(step)

async def resume_upload_session(db: AsyncSession, upload_id: UUID) -> Optional[dict]:
    """
    Resume an upload session with all saved progress data.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload or db_upload.status != 'pending':
        return None
    
    return {
        'id': db_upload.id,
        'company_id': db_upload.company_id,
        'file_name': db_upload.file_name,
        'current_step': db_upload.current_step,
        'progress_data': db_upload.progress_data,
        'raw_data': db_upload.raw_data,
        'edited_tables': db_upload.edited_tables,
        'field_mapping': db_upload.field_mapping,
        'field_config': db_upload.field_config,
        'last_updated': db_upload.last_updated
    }

async def delete_pending_upload(db: AsyncSession, upload_id: UUID) -> bool:
    """
    Delete a pending upload.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload or db_upload.status != 'pending':
        return False
    
    await db.delete(db_upload)
    await db.commit()
    return True

def get_progress_summary(current_step: str, progress_data: Optional[dict]) -> str:
    """
    Generate a human-readable summary of the current progress.
    """
    step_descriptions = {
        'upload': 'File uploaded, ready for processing',
        'table_editor': 'Tables extracted, ready for editing',
        'field_mapper': 'Tables edited, ready for field mapping',
        'dashboard': 'Field mapping completed, ready for review',
        'completed': 'Processing completed'
    }
    
    base_description = step_descriptions.get(current_step, f'At step: {current_step}')
    
    if progress_data:
        if current_step == 'table_editor' and 'tables' in progress_data:
            table_count = len(progress_data['tables'])
            return f'{base_description} ({table_count} tables)'
        elif current_step == 'field_mapper' and 'mapping' in progress_data:
            mapped_fields = len(progress_data['mapping'])
            return f'{base_description} ({mapped_fields} fields mapped)'
    
    return base_description

async def save_statement_review(
    db, *,
    upload_id,
    final_data,
    status: str,
    field_config,
    rejection_reason: str = None,
    plan_types: list = None
):
    """
    Save statement review with updated status tracking.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        return None
    
    # Update the upload with final data
    db_upload.final_data = final_data
    db_upload.status = status
    db_upload.current_step = 'completed'
    db_upload.field_config = field_config
    db_upload.rejection_reason = rejection_reason
    db_upload.plan_types = plan_types
    db_upload.completed_at = datetime.utcnow()
    db_upload.last_updated = datetime.utcnow()
    
    await db.commit()
    await db.refresh(db_upload)
    return db_upload

async def get_all_statement_reviews(db):
    """
    Get all statement reviews with pending files included.
    """
    result = await db.execute(
        select(StatementUploadModel).order_by(StatementUploadModel.last_updated.desc())
    )
    return result.scalars().all()

async def get_statements_for_company(db, company_id):
    """
    Get all statements for a company including pending files.
    """
    result = await db.execute(
        select(StatementUploadModel).where(StatementUploadModel.company_id == company_id)
        .order_by(StatementUploadModel.last_updated.desc())
    )
    return result.scalars().all()

async def delete_company(db: AsyncSession, company_id: str):
    # Fetch the company to ensure it exists
    company = await get_company_by_id(db, company_id)
    if not company:
        raise ValueError(f"Company with ID {company_id} not found")
    
    try:
        # Check which tables exist before trying to delete from them
        result = await db.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('company_field_mappings', 'edited_tables', 'statement_uploads', 'extractions')
        """))
        existing_tables = {row[0] for row in result.fetchall()}
        
        # Delete related data first (cascade delete)
        # Delete company field mappings
        if 'company_field_mappings' in existing_tables:
            await db.execute(
                text("DELETE FROM company_field_mappings WHERE company_id = :company_id"),
                {"company_id": company_id}
            )
        
        # Delete edited tables (only if table exists)
        if 'edited_tables' in existing_tables:
            await db.execute(
                text("DELETE FROM edited_tables WHERE company_id = :company_id"),
                {"company_id": company_id}
            )
        
        # Delete statement uploads
        if 'statement_uploads' in existing_tables:
            await db.execute(
                text("DELETE FROM statement_uploads WHERE company_id = :company_id"),
                {"company_id": company_id}
            )
        
        # Delete extractions
        if 'extractions' in existing_tables:
            await db.execute(
                text("DELETE FROM extractions WHERE company_id = :company_id"),
                {"company_id": company_id}
            )
        
        # Finally delete the company
        await db.delete(company)
        
        # Commit the transaction
        await db.commit()
        return True
    except Exception as e:
        await db.rollback()
        raise ValueError(f"Failed to delete company: {str(e)}")

async def get_statement_by_id(db: AsyncSession, statement_id: str):
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == statement_id))
    return result.scalar_one_or_none()

async def delete_statement(db: AsyncSession, statement_id: str):
    statement = await get_statement_by_id(db, statement_id)
    if not statement:
        raise ValueError(f"Statement with ID {statement_id} not found")
    
    try:
        # Check if edited_tables table exists before trying to delete from it
        result = await db.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'edited_tables'
        """))
        edited_tables_exists = result.fetchone() is not None
        
        # Delete related edited tables first (only if table exists)
        if edited_tables_exists:
            await db.execute(
                text("DELETE FROM edited_tables WHERE upload_id = :upload_id"),
                {"upload_id": statement_id}
            )
        
        # Delete the statement
        await db.delete(statement)
        await db.commit()
        return True
    except Exception as e:
        await db.rollback()
        raise ValueError(f"Failed to delete statement: {str(e)}")

async def update_company_name(db, company_id: str, new_name: str):
    company = await get_company_by_id(db, company_id)
    if not company:
        raise ValueError(f"Company with ID {company_id} not found")
    
    company.name = new_name
    await db.commit()
    await db.refresh(company)
    return company

async def get_latest_statement_upload_for_company(db, company_id):
    result = await db.execute(
        select(StatementUploadModel)
        .where(StatementUploadModel.company_id == company_id)
        .order_by(StatementUploadModel.uploaded_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()

async def save_company_mapping_config(db, company_id, plan_types, table_names, field_config):
    """
    Save company mapping configuration with progress tracking.
    """
    # Find the latest upload for this company
    latest_upload = await get_latest_statement_upload_for_company(db, company_id)
    
    if latest_upload:
        # Update the upload with mapping configuration
        latest_upload.field_config = field_config
        latest_upload.plan_types = plan_types
        latest_upload.current_step = 'field_mapper'
        latest_upload.last_updated = datetime.utcnow()
        
        # Save mapping data in progress_data
        if not latest_upload.progress_data:
            latest_upload.progress_data = {}
        
        latest_upload.progress_data['field_mapper'] = {
            'plan_types': plan_types,
            'table_names': table_names,
            'field_config': field_config
        }
        
        await db.commit()
        await db.refresh(latest_upload)
        return latest_upload
    
    return None

async def create_database_field(db: AsyncSession, field: DatabaseFieldCreate):
    """
    Create a new database field.
    """
    db_field = DatabaseField(
        display_name=field.display_name,
        description=field.description,
        is_active=field.is_active
    )
    db.add(db_field)
    await db.commit()
    await db.refresh(db_field)
    return db_field

async def get_all_database_fields(db: AsyncSession, active_only: bool = True):
    """
    Get all database fields, optionally filtered by active status.
    """
    query = select(DatabaseField)
    if active_only:
        query = query.where(DatabaseField.is_active == 1)
    result = await db.execute(query)
    return result.scalars().all()

async def get_database_field_by_id(db: AsyncSession, field_id: UUID):
    """
    Get database field by ID.
    """
    result = await db.execute(select(DatabaseField).where(DatabaseField.id == field_id))
    return result.scalar_one_or_none()

async def get_database_field_by_display_name(db: AsyncSession, display_name: str):
    """
    Get database field by display name.
    """
    result = await db.execute(select(DatabaseField).where(DatabaseField.display_name == display_name))
    return result.scalar_one_or_none()

async def update_database_field(db: AsyncSession, field_id: UUID, field_update: DatabaseFieldUpdate):
    """
    Update database field.
    """
    db_field = await get_database_field_by_id(db, field_id)
    if not db_field:
        return None
    
    update_data = {}
    if field_update.display_name is not None:
        update_data["display_name"] = field_update.display_name
    if field_update.description is not None:
        update_data["description"] = field_update.description
    if field_update.is_active is not None:
        update_data["is_active"] = field_update.is_active
    
    for field, value in update_data.items():
        setattr(db_field, field, value)
    
    db_field.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(db_field)
    return db_field

async def delete_database_field(db: AsyncSession, field_id: UUID):
    """
    Delete database field (soft delete by setting is_active to 0).
    """
    db_field = await get_database_field_by_id(db, field_id)
    if not db_field:
        return False
    
    db_field.is_active = 0
    db_field.updated_at = datetime.utcnow()
    await db.commit()
    return True

async def initialize_default_database_fields(db: AsyncSession):
    """
    Initialize default database fields if none exist.
    """
    existing_fields = await get_all_database_fields(db, active_only=False)
    if existing_fields:
        return existing_fields
    
    default_fields = [
        {"display_name": "Company Name", "description": "Name of the company"},
        {"display_name": "Group Id", "description": "Unique identifier for the group"},
        {"display_name": "Policy Number", "description": "Policy identification number"},
        {"display_name": "Commission Earned", "description": "Commission amount earned"},
        {"display_name": "Commission Rate", "description": "Commission rate percentage"},
        {"display_name": "Total Commission Paid", "description": "Total commission amount paid"},
        {"display_name": "Individual Commission", "description": "Individual commission amount"}
    ]
    
    created_fields = []
    for field_data in default_fields:
        field = DatabaseFieldCreate(**field_data)
        created_field = await create_database_field(db, field)
        created_fields.append(created_field)
    
    return created_fields

async def save_edited_tables(db: AsyncSession, tables_data: list):
    """
    Save edited tables with progress tracking.
    """
    if not tables_data:
        return None
    
    # Get the upload_id from the first table
    upload_id = tables_data[0].get('upload_id')
    if not upload_id:
        return None
    
    # Update the upload with edited tables
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        return None
    
    db_upload.edited_tables = tables_data
    db_upload.current_step = 'table_editor'
    db_upload.last_updated = datetime.utcnow()
    
    # Save in progress_data
    if not db_upload.progress_data:
        db_upload.progress_data = {}
    
    db_upload.progress_data['table_editor'] = {
        'tables': tables_data,
        'table_count': len(tables_data)
    }
    
    await db.commit()
    await db.refresh(db_upload)
    return db_upload

async def get_edited_tables(db: AsyncSession, upload_id: str):
    """
    Get edited tables for an upload.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        return None
    
    return db_upload.edited_tables

async def update_upload_tables(db: AsyncSession, upload_id: str, tables_data: list):
    """
    Update upload tables with progress tracking.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        return None
    
    db_upload.raw_data = tables_data
    db_upload.current_step = 'table_editor'
    db_upload.last_updated = datetime.utcnow()
    
    # Save in progress_data
    if not db_upload.progress_data:
        db_upload.progress_data = {}
    
    db_upload.progress_data['extraction'] = {
        'tables': tables_data,
        'table_count': len(tables_data)
    }
    
    await db.commit()
    await db.refresh(db_upload)
    return db_upload

async def delete_edited_tables(db: AsyncSession, upload_id: str):
    """
    Delete edited tables for an upload.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        return False
    
    db_upload.edited_tables = None
    
    # Remove from progress_data
    if db_upload.progress_data and 'table_editor' in db_upload.progress_data:
        del db_upload.progress_data['table_editor']
    
    await db.commit()
    return True

async def get_upload_by_id(db: AsyncSession, upload_id: str):
    """
    Get upload by ID with all progress data.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    return result.scalar_one_or_none()



# Plan Types CRUD operations
async def create_plan_type(db: AsyncSession, plan_type: PlanTypeCreate):
    db_plan_type = PlanType(
        display_name=plan_type.display_name,
        description=plan_type.description,
        is_active=1 if plan_type.is_active else 0
    )
    db.add(db_plan_type)
    await db.commit()
    await db.refresh(db_plan_type)
    return db_plan_type

async def get_all_plan_types(db: AsyncSession, active_only: bool = True):
    query = select(PlanType)
    if active_only:
        query = query.where(PlanType.is_active == 1)
    result = await db.execute(query)
    plan_types = result.scalars().all()
    return [
        {
            "id": str(pt.id),
            "display_name": pt.display_name,
            "description": pt.description,
            "is_active": bool(pt.is_active),
            "created_at": pt.created_at,
            "updated_at": pt.updated_at
        }
        for pt in plan_types
    ]

async def get_plan_type_by_id(db: AsyncSession, plan_type_id: UUID):
    result = await db.execute(select(PlanType).where(PlanType.id == plan_type_id))
    pt = result.scalar_one_or_none()
    if pt:
        return {
            "id": str(pt.id),
            "display_name": pt.display_name,
            "description": pt.description,
            "is_active": bool(pt.is_active),
            "created_at": pt.created_at,
            "updated_at": pt.updated_at
        }
    return None

async def get_plan_type_by_display_name(db: AsyncSession, display_name: str):
    result = await db.execute(select(PlanType).where(PlanType.display_name == display_name))
    return result.scalar_one_or_none()

async def update_plan_type(db: AsyncSession, plan_type_id: UUID, plan_type_update: PlanTypeUpdate):
    result = await db.execute(select(PlanType).where(PlanType.id == plan_type_id))
    db_plan_type = result.scalar_one_or_none()
    
    if not db_plan_type:
        return None
    
    update_data = {}
    if plan_type_update.display_name is not None:
        update_data["display_name"] = plan_type_update.display_name
    if plan_type_update.description is not None:
        update_data["description"] = plan_type_update.description
    if plan_type_update.is_active is not None:
        update_data["is_active"] = 1 if plan_type_update.is_active else 0
    
    for key, value in update_data.items():
        setattr(db_plan_type, key, value)
    
    db_plan_type.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(db_plan_type)
    
    return {
        "id": str(db_plan_type.id),
        "display_name": db_plan_type.display_name,
        "description": db_plan_type.description,
        "is_active": bool(db_plan_type.is_active),
        "created_at": db_plan_type.created_at,
        "updated_at": db_plan_type.updated_at
    }

async def delete_plan_type(db: AsyncSession, plan_type_id: UUID):
    result = await db.execute(select(PlanType).where(PlanType.id == plan_type_id))
    db_plan_type = result.scalar_one_or_none()
    
    if not db_plan_type:
        return False
    
    # Soft delete by setting is_active to 0
    db_plan_type.is_active = 0
    db_plan_type.updated_at = datetime.utcnow()
    await db.commit()
    return True

async def initialize_default_plan_types(db: AsyncSession):
    default_plan_types = [
        {"display_name": "Medical", "description": "Medical insurance plans"},
        {"display_name": "Dental", "description": "Dental insurance plans"},
        {"display_name": "Vision", "description": "Vision insurance plans"},
        {"display_name": "Life", "description": "Life insurance plans"},
        {"display_name": "Disability", "description": "Disability insurance plans"},
        {"display_name": "Other", "description": "Other insurance plans"}
    ]
    
    created_plan_types = []
    for plan_type_data in default_plan_types:
        # Check if plan type already exists
        existing = await get_plan_type_by_display_name(db, plan_type_data["display_name"])
        if not existing:
            plan_type = PlanTypeCreate(**plan_type_data)
            created_plan_type = await create_plan_type(db, plan_type)
            created_plan_types.append(created_plan_type)
    
    return created_plan_types

