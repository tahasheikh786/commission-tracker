from .models import Company, CompanyFieldMapping, CompanyConfiguration, DatabaseField, PlanType, Extraction, EditedTable, StatementUpload as StatementUploadModel, CarrierFormatLearning, SummaryRowPattern, EarnedCommission
from .schemas import CompanyCreate, CompanyFieldMappingCreate, StatementUpload, DatabaseFieldCreate, DatabaseFieldUpdate, PlanTypeCreate, PlanTypeUpdate, ExtractionCreate, StatementUploadCreate, StatementUploadUpdate, PendingFile, CarrierFormatLearningCreate, CarrierFormatLearningUpdate, EarnedCommissionCreate, EarnedCommissionUpdate
from sqlalchemy.dialects.postgresql import insert as pg_insert
from datetime import datetime
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from uuid import UUID
from typing import List, Optional, Dict, Any
from decimal import Decimal

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

async def get_company_configuration(db, company_id):
    """
    Get company configuration (field_config, plan_types, table_names).
    """
    result = await db.execute(
        select(CompanyConfiguration)
        .where(CompanyConfiguration.company_id == company_id)
    )
    return result.scalar_one_or_none()

async def save_company_configuration(db, company_id, field_config=None, plan_types=None, table_names=None):
    """
    Upsert company configuration.
    """
    now = datetime.utcnow()
    
    # Check if configuration exists
    existing_config = await get_company_configuration(db, company_id)
    
    if existing_config:
        # Update existing configuration
        if field_config is not None:
            existing_config.field_config = field_config
        if plan_types is not None:
            existing_config.plan_types = plan_types
        if table_names is not None:
            existing_config.table_names = table_names
        existing_config.updated_at = now
        await db.commit()
        await db.refresh(existing_config)
        return existing_config
    else:
        # Create new configuration
        new_config = CompanyConfiguration(
            company_id=company_id,
            field_config=field_config,
            plan_types=plan_types,
            table_names=table_names,
            created_at=now,
            updated_at=now
        )
        db.add(new_config)
        await db.commit()
        await db.refresh(new_config)
        return new_config


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
    try:
        # Convert string to UUID if needed
        if isinstance(company_id, str):
            company_id = UUID(company_id)
        result = await db.execute(select(Company).where(Company.id == company_id))
        return result.scalar_one_or_none()
    except ValueError:
        # Invalid UUID format
        return None

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
    plan_types: list = None,
    selected_statement_date: dict = None
):
    """
    Save statement review with updated status tracking.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        return None
    
    print(f"💾 Saving statement review: upload_id={upload_id}, status={status}")
    print(f"📋 Field config being saved: {field_config}")
    print(f"📊 Final data rows: {len(final_data) if final_data else 0}")
    
    # Update the upload with final data
    db_upload.final_data = final_data
    db_upload.status = status
    db_upload.current_step = 'completed'
    db_upload.field_config = field_config
    db_upload.rejection_reason = rejection_reason
    db_upload.plan_types = plan_types
    db_upload.selected_statement_date = selected_statement_date
    db_upload.completed_at = datetime.utcnow()
    db_upload.last_updated = datetime.utcnow()
    
    await db.commit()
    await db.refresh(db_upload)
    
    # If the statement is approved, process commission data
    if status == "Approved":
        print(f"✅ Statement approved, processing commission data...")
        await process_commission_data_from_statement(db, db_upload)
    
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
            AND table_name IN ('company_field_mappings', 'edited_tables', 'statement_uploads', 'extractions', 'company_configurations', 'carrier_format_learning')
        """))
        existing_tables = {row[0] for row in result.fetchall()}
        
        # Delete related data first (cascade delete)
        # Delete company configurations
        if 'company_configurations' in existing_tables:
            await db.execute(
                text("DELETE FROM company_configurations WHERE company_id = :company_id"),
                {"company_id": company_id}
            )
        
        # Delete carrier format learning
        if 'carrier_format_learning' in existing_tables:
            await db.execute(
                text("DELETE FROM carrier_format_learning WHERE company_id = :company_id"),
                {"company_id": company_id}
            )
        
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
    try:
        # Convert string to UUID if needed
        if isinstance(statement_id, str):
            statement_id = UUID(statement_id)
        result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == statement_id))
        return result.scalar_one_or_none()
    except ValueError:
        # Invalid UUID format
        return None

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
        
        # Remove this upload from earned commission records
        await remove_upload_from_earned_commissions(db, statement_id)
        
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

async def update_upload_tables(db: AsyncSession, upload_id: str, tables_data: list, selected_statement_date: Optional[Dict[str, Any]] = None):
    """
    Update upload tables with progress tracking and selected statement date.
    """
    print(f"🎯 CRUD: update_upload_tables called for upload_id: {upload_id}")
    print(f"🎯 CRUD: Tables data length: {len(tables_data) if tables_data else 0}")
    print(f"🎯 CRUD: Selected statement date: {selected_statement_date}")
    
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        print(f"🎯 CRUD: Upload not found for ID: {upload_id}")
        return None
    
    print(f"🎯 CRUD: Found upload, updating with tables and statement date")
    
    db_upload.raw_data = tables_data
    db_upload.current_step = 'table_editor'
    db_upload.last_updated = datetime.utcnow()
    
    # Save selected statement date if provided
    if selected_statement_date:
        db_upload.selected_statement_date = selected_statement_date
        print(f"🎯 CRUD: Saved selected statement date to database: {selected_statement_date}")
        print(f"🎯 CRUD: Statement date type: {type(selected_statement_date)}")
        print(f"🎯 CRUD: Statement date keys: {list(selected_statement_date.keys()) if isinstance(selected_statement_date, dict) else 'Not a dict'}")
    else:
        print(f"🎯 CRUD: No selected statement date provided")
    
    # Save in progress_data
    if not db_upload.progress_data:
        db_upload.progress_data = {}
    
    db_upload.progress_data['extraction'] = {
        'tables': tables_data,
        'table_count': len(tables_data)
    }
    
    # Also save selected statement date in progress data
    if selected_statement_date:
        db_upload.progress_data['table_editor'] = {
            'selected_statement_date': selected_statement_date
        }
        print(f"🎯 CRUD: Also saved statement date to progress_data")
    
    await db.commit()
    await db.refresh(db_upload)
    
    print(f"🎯 CRUD: Successfully updated upload {upload_id} with tables and statement date")
    print(f"🎯 CRUD: Final selected_statement_date in database: {db_upload.selected_statement_date}")
    
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
    """
    Initialize default plan types if they don't exist.
    """
    default_plan_types = [
        {"display_name": "Medical", "description": "Medical insurance plans"},
        {"display_name": "Dental", "description": "Dental insurance plans"},
        {"display_name": "Vision", "description": "Vision insurance plans"},
        {"display_name": "Life", "description": "Life insurance plans"},
        {"display_name": "Disability", "description": "Disability insurance plans"},
        {"display_name": "Supplemental", "description": "Supplemental insurance plans"},
    ]
    
    for plan_type_data in default_plan_types:
        existing = await get_plan_type_by_display_name(db, plan_type_data["display_name"])
        if not existing:
            plan_type = PlanTypeCreate(**plan_type_data)
            await create_plan_type(db, plan_type)

# Carrier Format Learning CRUD operations
async def save_carrier_format_learning(db: AsyncSession, format_learning: CarrierFormatLearningCreate):
    """
    Save or update carrier format learning data.
    """
    now = datetime.utcnow()
    
    # Check if format already exists for this company
    existing_format = await get_carrier_format_by_signature(db, format_learning.company_id, format_learning.format_signature)
    
    if existing_format:
        # Update existing format
        existing_format.usage_count += 1
        existing_format.last_used = now
        existing_format.updated_at = now
        
        # Update fields if provided
        if format_learning.header_patterns is not None:
            existing_format.header_patterns = format_learning.header_patterns
        if format_learning.column_types is not None:
            existing_format.column_types = format_learning.column_types
        if format_learning.column_patterns is not None:
            existing_format.column_patterns = format_learning.column_patterns
        if format_learning.sample_values is not None:
            existing_format.sample_values = format_learning.sample_values
        if format_learning.table_structure is not None:
            existing_format.table_structure = format_learning.table_structure
        if format_learning.data_quality_metrics is not None:
            existing_format.data_quality_metrics = format_learning.data_quality_metrics
        if format_learning.field_mapping is not None:
            existing_format.field_mapping = format_learning.field_mapping
        
        await db.commit()
        await db.refresh(existing_format)
        return existing_format
    else:
        # Create new format
        new_format = CarrierFormatLearning(
            company_id=format_learning.company_id,
            format_signature=format_learning.format_signature,
            headers=format_learning.headers,
            header_patterns=format_learning.header_patterns,
            column_types=format_learning.column_types,
            column_patterns=format_learning.column_patterns,
            sample_values=format_learning.sample_values,
            table_structure=format_learning.table_structure,
            data_quality_metrics=format_learning.data_quality_metrics,
            field_mapping=format_learning.field_mapping,
            confidence_score=format_learning.confidence_score,
            usage_count=format_learning.usage_count,
            last_used=now,
            created_at=now,
            updated_at=now
        )
        db.add(new_format)
        await db.commit()
        await db.refresh(new_format)
        return new_format

async def get_carrier_format_by_signature(db: AsyncSession, company_id: UUID, format_signature: str):
    """
    Get carrier format learning by company ID and format signature.
    """
    result = await db.execute(
        select(CarrierFormatLearning)
        .where(CarrierFormatLearning.company_id == company_id)
        .where(CarrierFormatLearning.format_signature == format_signature)
    )
    return result.scalar_one_or_none()

async def get_carrier_formats_for_company(db: AsyncSession, company_id: UUID):
    """
    Get all carrier format learning records for a company.
    """
    result = await db.execute(
        select(CarrierFormatLearning)
        .where(CarrierFormatLearning.company_id == company_id)
        .order_by(CarrierFormatLearning.last_used.desc())
    )
    return result.scalars().all()

async def find_best_matching_format(db: AsyncSession, company_id: UUID, headers: List[str], table_structure: dict):
    """
    Find the best matching format for given headers and structure.
    """
    # Get all formats for this company
    formats = await get_carrier_formats_for_company(db, company_id)
    
    best_match = None
    best_score = 0
    
    for format_record in formats:
        # Calculate similarity score
        header_similarity = calculate_header_similarity(headers, format_record.headers)
        structure_similarity = calculate_structure_similarity(table_structure, format_record.table_structure)
        
        # Combined score (weighted average)
        total_score = (header_similarity * 0.7) + (structure_similarity * 0.3)
        
        if total_score > best_score and total_score > 0.8:  # Minimum threshold
            best_score = total_score
            best_match = format_record
    
    return best_match, best_score

def calculate_header_similarity(headers1: List[str], headers2: List[str]) -> float:
    """
    Calculate similarity between two header lists.
    """
    if not headers1 or not headers2:
        return 0.0
    
    # Normalize headers
    headers1_normalized = [h.lower().strip() for h in headers1]
    headers2_normalized = [h.lower().strip() for h in headers2]
    
    # Find common headers
    common_headers = set(headers1_normalized) & set(headers2_normalized)
    
    # Calculate Jaccard similarity
    union_headers = set(headers1_normalized) | set(headers2_normalized)
    
    if not union_headers:
        return 0.0
    
    return len(common_headers) / len(union_headers)

def calculate_structure_similarity(structure1: dict, structure2: dict) -> float:
    """
    Calculate similarity between two table structures.
    """
    if not structure1 or not structure2:
        return 0.0
    
    # Compare key structural elements
    score = 0.0
    comparisons = 0
    
    # Compare column count
    if 'column_count' in structure1 and 'column_count' in structure2:
        col_diff = abs(structure1['column_count'] - structure2['column_count'])
        max_cols = max(structure1['column_count'], structure2['column_count'])
        if max_cols > 0:
            score += 1.0 - (col_diff / max_cols)
        comparisons += 1
    
    # Compare row count (if available)
    if 'typical_row_count' in structure1 and 'typical_row_count' in structure2:
        row_diff = abs(structure1['typical_row_count'] - structure2['typical_row_count'])
        max_rows = max(structure1['typical_row_count'], structure2['typical_row_count'])
        if max_rows > 0:
            score += 1.0 - (row_diff / max_rows)
        comparisons += 1
    
    return score / comparisons if comparisons > 0 else 0.0


# Summary Row Pattern CRUD operations
async def save_summary_row_pattern(db: AsyncSession, pattern_data: dict) -> SummaryRowPattern:
    """
    Save a new summary row pattern or update existing one.
    """
    now = datetime.utcnow()
    
    # Check if pattern already exists
    existing_pattern = await db.execute(
        select(SummaryRowPattern).where(
            SummaryRowPattern.company_id == pattern_data['company_id'],
            SummaryRowPattern.table_signature == pattern_data['table_signature']
        )
    )
    existing_pattern = existing_pattern.scalar_one_or_none()
    
    if existing_pattern:
        # Update existing pattern
        existing_pattern.column_patterns = pattern_data['column_patterns']
        existing_pattern.row_characteristics = pattern_data['row_characteristics']
        existing_pattern.sample_rows = pattern_data['sample_rows']
        existing_pattern.usage_count += 1
        existing_pattern.last_used = now
        existing_pattern.updated_at = now
        await db.commit()
        await db.refresh(existing_pattern)
        return existing_pattern
    else:
        # Create new pattern
        new_pattern = SummaryRowPattern(
            company_id=pattern_data['company_id'],
            pattern_name=pattern_data['pattern_name'],
            table_signature=pattern_data['table_signature'],
            column_patterns=pattern_data['column_patterns'],
            row_characteristics=pattern_data['row_characteristics'],
            sample_rows=pattern_data['sample_rows'],
            confidence_score=pattern_data.get('confidence_score', 80),
            usage_count=1,
            last_used=now,
            created_at=now,
            updated_at=now
        )
        db.add(new_pattern)
        await db.commit()
        await db.refresh(new_pattern)
        return new_pattern


async def get_summary_row_patterns_for_company(db: AsyncSession, company_id: str) -> List[SummaryRowPattern]:
    """
    Get all summary row patterns for a company.
    """
    result = await db.execute(
        select(SummaryRowPattern)
        .where(SummaryRowPattern.company_id == company_id)
        .order_by(SummaryRowPattern.last_used.desc())
    )
    return result.scalars().all()


async def get_summary_row_pattern_by_signature(db: AsyncSession, company_id: str, table_signature: str) -> Optional[SummaryRowPattern]:
    """
    Get a specific summary row pattern by table signature.
    """
    result = await db.execute(
        select(SummaryRowPattern).where(
            SummaryRowPattern.company_id == company_id,
            SummaryRowPattern.table_signature == table_signature
        )
    )
    return result.scalar_one_or_none()


async def delete_summary_row_pattern(db: AsyncSession, pattern_id: str, company_id: str) -> bool:
    """
    Delete a summary row pattern.
    """
    pattern = await db.execute(
        select(SummaryRowPattern).where(
            SummaryRowPattern.id == pattern_id,
            SummaryRowPattern.company_id == company_id
        )
    )
    pattern = pattern.scalar_one_or_none()
    
    if pattern:
        await db.delete(pattern)
        await db.commit()
        return True
    
    return False

async def create_earned_commission(db: AsyncSession, commission: EarnedCommissionCreate):
    """Create a new earned commission record."""
    db_commission = EarnedCommission(
        carrier_id=commission.carrier_id,
        client_name=commission.client_name,
        invoice_total=commission.invoice_total,
        commission_earned=commission.commission_earned,
        statement_count=commission.statement_count,
        upload_ids=commission.upload_ids,
        statement_date=commission.statement_date,
        statement_month=commission.statement_month,
        statement_year=commission.statement_year,
        jan_commission=commission.jan_commission,
        feb_commission=commission.feb_commission,
        mar_commission=commission.mar_commission,
        apr_commission=commission.apr_commission,
        may_commission=commission.may_commission,
        jun_commission=commission.jun_commission,
        jul_commission=commission.jul_commission,
        aug_commission=commission.aug_commission,
        sep_commission=commission.sep_commission,
        oct_commission=commission.oct_commission,
        nov_commission=commission.nov_commission,
        dec_commission=commission.dec_commission
    )
    db.add(db_commission)
    await db.commit()
    await db.refresh(db_commission)
    return db_commission

async def get_earned_commission_by_carrier_and_client(db: AsyncSession, carrier_id: UUID, client_name: str):
    """Get earned commission record by carrier and client name."""
    result = await db.execute(
        select(EarnedCommission).where(
            EarnedCommission.carrier_id == carrier_id,
            EarnedCommission.client_name == client_name
        )
    )
    return result.scalar_one_or_none()

async def update_earned_commission(db: AsyncSession, commission_id: UUID, update_data: EarnedCommissionUpdate):
    """Update an earned commission record."""
    result = await db.execute(select(EarnedCommission).where(EarnedCommission.id == commission_id))
    db_commission = result.scalar_one_or_none()
    
    if not db_commission:
        return None
    
    update_dict = update_data.dict(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(db_commission, field, value)
    
    db_commission.last_updated = datetime.utcnow()
    await db.commit()
    await db.refresh(db_commission)
    return db_commission

async def upsert_earned_commission(db: AsyncSession, carrier_id: UUID, client_name: str, invoice_total: float, commission_earned: float, statement_date: datetime = None, statement_month: int = None, statement_year: int = None, upload_id: str = None):
    """Upsert earned commission data - create if not exists, update if exists."""
    existing = await get_earned_commission_by_carrier_and_client(db, carrier_id, client_name)
    
    if existing:
        # Update existing record - convert to Decimal for proper arithmetic
        existing_invoice = float(existing.invoice_total) if existing.invoice_total else 0
        existing_commission = float(existing.commission_earned) if existing.commission_earned else 0
        
        # Prepare update data
        update_data = EarnedCommissionUpdate(
            invoice_total=existing_invoice + invoice_total,
            commission_earned=existing_commission + commission_earned,
            statement_count=existing.statement_count + 1
        )
        
        # Update upload_ids if provided
        if upload_id:
            existing_upload_ids = existing.upload_ids or []
            if upload_id not in existing_upload_ids:
                existing_upload_ids.append(upload_id)
                update_data.upload_ids = existing_upload_ids
        
        # Update monthly breakdown if statement date is provided
        if statement_month and statement_year:
            month_columns = {
                1: 'jan_commission', 2: 'feb_commission', 3: 'mar_commission',
                4: 'apr_commission', 5: 'may_commission', 6: 'jun_commission',
                7: 'jul_commission', 8: 'aug_commission', 9: 'sep_commission',
                10: 'oct_commission', 11: 'nov_commission', 12: 'dec_commission'
            }
            
            if statement_month in month_columns:
                current_month_value = getattr(existing, month_columns[statement_month], 0) or 0
                new_month_value = float(current_month_value) + commission_earned
                setattr(update_data, month_columns[statement_month], new_month_value)
        
        result = await update_earned_commission(db, existing.id, update_data)
        return result
    else:
        # Create new record
        commission_data = EarnedCommissionCreate(
            carrier_id=carrier_id,
            client_name=client_name,
            invoice_total=invoice_total,
            commission_earned=commission_earned,
            statement_count=1,
            statement_date=statement_date,
            statement_month=statement_month,
            statement_year=statement_year,
            upload_ids=[upload_id] if upload_id else []
        )
        
        # Set monthly breakdown if statement date is provided
        if statement_month and statement_year:
            month_columns = {
                1: 'jan_commission', 2: 'feb_commission', 3: 'mar_commission',
                4: 'apr_commission', 5: 'may_commission', 6: 'jun_commission',
                7: 'jul_commission', 8: 'aug_commission', 9: 'sep_commission',
                10: 'oct_commission', 11: 'nov_commission', 12: 'dec_commission'
            }
            
            if statement_month in month_columns:
                setattr(commission_data, month_columns[statement_month], commission_earned)
        
        return await create_earned_commission(db, commission_data)

async def get_earned_commissions_by_carrier(db: AsyncSession, carrier_id: UUID):
    """Get all earned commission records for a specific carrier."""
    result = await db.execute(
        select(EarnedCommission)
        .where(EarnedCommission.carrier_id == carrier_id)
        .order_by(EarnedCommission.client_name.asc())
    )
    return result.scalars().all()

async def get_all_earned_commissions(db: AsyncSession):
    """Get all earned commission records with carrier names."""
    result = await db.execute(
        select(EarnedCommission, Company.name.label('carrier_name'))
        .join(Company, EarnedCommission.carrier_id == Company.id)
        .order_by(Company.name.asc(), EarnedCommission.client_name.asc())
    )
    return result.all()


async def get_commission_record(db: AsyncSession, carrier_id: str, client_name: str, statement_date: datetime):
    """Get commission record by carrier, client, and statement date."""
    result = await db.execute(
        select(EarnedCommission).where(
            EarnedCommission.carrier_id == carrier_id,
            EarnedCommission.client_name == client_name,
            EarnedCommission.statement_date == statement_date
        )
    )
    return result.scalar_one_or_none()

async def remove_upload_from_earned_commissions(db: AsyncSession, upload_id: str):
    """Remove an upload from earned commission records and recalculate totals."""
    try:
        # Find all earned commission records that contain this upload_id
        # Use proper JSON array operations for PostgreSQL
        result = await db.execute(
            select(EarnedCommission).where(
                EarnedCommission.upload_ids.isnot(None)
            )
        )
        commission_records = result.scalars().all()
        
        # Filter records that contain the upload_id
        records_to_update = []
        for commission in commission_records:
            if commission.upload_ids and upload_id in commission.upload_ids:
                records_to_update.append(commission)
        
        for commission in records_to_update:
            # Remove this upload_id from the upload_ids list
            if commission.upload_ids and upload_id in commission.upload_ids:
                commission.upload_ids.remove(upload_id)
                
                # If no more uploads contribute to this record, delete it
                if not commission.upload_ids:
                    await db.delete(commission)
                    print(f"Deleted commission record {commission.id} as no uploads remain")
                else:
                    # Recalculate totals based on remaining uploads
                    # For now, we'll just decrement the statement count
                    # In a more sophisticated implementation, you might want to recalculate from the actual data
                    commission.statement_count = max(0, commission.statement_count - 1)
                    commission.last_updated = datetime.utcnow()
                    print(f"Updated commission record {commission.id}, removed upload {upload_id}")
        
        await db.commit()
        print(f"Successfully removed upload {upload_id} from {len(records_to_update)} commission records")
        
    except Exception as e:
        await db.rollback()
        print(f"Error removing upload from earned commissions: {e}")
        raise


async def create_commission_record(db: AsyncSession, commission: EarnedCommissionCreate):
    """Create a new commission record with monthly breakdown."""
    return await create_earned_commission(db, commission)


async def update_commission_record(db: AsyncSession, record_id: UUID, invoice_total: float, commission_earned: float, statement_month: int, statement_year: int):
    """Update commission record with new data."""
    result = await db.execute(select(EarnedCommission).where(EarnedCommission.id == record_id))
    db_commission = result.scalar_one_or_none()
    
    if not db_commission:
        return None
    
    # Update basic fields
    db_commission.invoice_total = invoice_total
    db_commission.commission_earned = commission_earned
    db_commission.statement_month = statement_month
    db_commission.statement_year = statement_year
    db_commission.last_updated = datetime.utcnow()
    
    # Update the appropriate month column
    month_columns = {
        1: 'jan_commission', 2: 'feb_commission', 3: 'mar_commission',
        4: 'apr_commission', 5: 'may_commission', 6: 'jun_commission',
        7: 'jul_commission', 8: 'aug_commission', 9: 'sep_commission',
        10: 'oct_commission', 11: 'nov_commission', 12: 'dec_commission'
    }
    
    if statement_month in month_columns:
        setattr(db_commission, month_columns[statement_month], commission_earned)
    
    await db.commit()
    await db.refresh(db_commission)
    return db_commission

async def process_commission_data_from_statement(db: AsyncSession, statement_upload: StatementUploadModel):
    """Process commission data from an approved statement and update earned commission records."""
    if not statement_upload.final_data or not statement_upload.field_config:
        print(f"Missing final_data or field_config: final_data={bool(statement_upload.final_data)}, field_config={bool(statement_upload.field_config)}")
        return None
    
    # Validate data structure
    if not isinstance(statement_upload.final_data, list):
        print(f"Invalid final_data structure: expected list, got {type(statement_upload.final_data)}")
        return None
    
    if len(statement_upload.final_data) == 0:
        print("Empty final_data list")
        return None
    
    # Check if data structure is correct (should be array of objects, not arrays)
    first_table = statement_upload.final_data[0]
    if not isinstance(first_table, dict) or 'rows' not in first_table:
        print(f"Invalid table structure in final_data: {type(first_table)}")
        return None
    
    if not first_table['rows'] or len(first_table['rows']) == 0:
        print("No rows in first table")
        return None
    
    first_row = first_table['rows'][0]
    if not isinstance(first_row, dict):
        print(f"Invalid row structure: expected dict, got {type(first_row)}")
        print("This indicates the data was not properly mapped. Please re-upload the statement.")
        return None
    
    # Get statement date from the upload
    statement_date = None
    statement_month = None
    statement_year = None
    
    print(f"🎯 Commission Processing: Checking for selected statement date")
    print(f"🎯 Commission Processing: selected_statement_date from upload: {statement_upload.selected_statement_date}")
    
    if statement_upload.selected_statement_date:
        print(f"🎯 Commission Processing: Found selected statement date in upload")
        try:
            # Parse the selected statement date - check both 'date' and 'date_value' keys
            date_str = statement_upload.selected_statement_date.get('date') or statement_upload.selected_statement_date.get('date_value')
            print(f"🎯 Commission Processing: Extracted date string: {date_str}")
            
            if date_str:
                print(f"🎯 Commission Processing: Attempting to parse date: {date_str}")
                # Try to parse as ISO format first
                try:
                    statement_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    print(f"🎯 Commission Processing: Successfully parsed as ISO format: {statement_date}")
                except ValueError:
                    print(f"🎯 Commission Processing: ISO format failed, trying parse_statement_date")
                    # If ISO format fails, try to parse using the parse_statement_date function
                    from app.api.mapping import parse_statement_date
                    statement_date = parse_statement_date(date_str)
                    if not statement_date:
                        raise ValueError(f"Could not parse date: {date_str}")
                    print(f"🎯 Commission Processing: Successfully parsed with parse_statement_date: {statement_date}")
                
                statement_month = statement_date.month
                statement_year = statement_date.year
                print(f"🎯 Commission Processing: Using statement date: {statement_date} (month: {statement_month}, year: {statement_year})")
            else:
                print(f"🎯 Commission Processing: No date string found in selected_statement_date")
        except Exception as e:
            print(f"🎯 Commission Processing: Error parsing statement date: {e}")
            # Fall back to current date if parsing fails
            statement_date = datetime.utcnow()
            statement_month = statement_date.month
            statement_year = statement_date.year
            print(f"🎯 Commission Processing: Falling back to current date: {statement_date}")
    else:
        print(f"🎯 Commission Processing: No statement date selected, using current date")
        statement_date = datetime.utcnow()
        statement_month = statement_date.month
        statement_year = statement_date.year
        print(f"🎯 Commission Processing: Using current date: {statement_date}")
    
    # Find the field mappings for Client Name and Commission Earned
    client_name_field = None
    commission_earned_field = None
    invoice_total_field = None
    
    print(f"Processing field_config: {statement_upload.field_config}")
    
    # Look for these specific database fields in the field_config
    for field in statement_upload.field_config:
        if isinstance(field, dict):
            field_name = field.get('field', '')
            field_label = field.get('label', '')
            
            print(f"Checking field: {field_name} -> {field_label}")
            
            # Check for company/client name fields
            if (field_name.lower() in ['company name', 'client name', 'companyname', 'clientname'] or 
                field_label.lower() in ['company name', 'client name', 'companyname', 'clientname'] or
                'company' in field_name.lower() or 'company' in field_label.lower() or
                'client' in field_name.lower() or 'client' in field_label.lower()):
                client_name_field = field_label
                print(f"Found client name field: {client_name_field}")
            
            # Check for commission earned fields
            elif (field_name.lower() in ['commission earned', 'commissionearned', 'commission_earned'] or 
                  field_label.lower() in ['commission earned', 'commissionearned', 'commission_earned'] or
                  'commission' in field_name.lower() and 'earned' in field_name.lower() or
                  'commission' in field_label.lower() and 'earned' in field_label.lower()):
                commission_earned_field = field_label
                print(f"Found commission earned field: {commission_earned_field}")
            
            # Check for invoice total fields
            elif (field_name.lower() in ['invoice total', 'invoicetotal', 'invoice_total', 'premium amount', 'premiumamount'] or 
                  field_label.lower() in ['invoice total', 'invoicetotal', 'invoice_total', 'premium amount', 'premiumamount'] or
                  'invoice' in field_name.lower() and 'total' in field_name.lower() or
                  'invoice' in field_label.lower() and 'total' in field_label.lower() or
                  'premium' in field_name.lower() and 'amount' in field_name.lower() or
                  'premium' in field_label.lower() and 'amount' in field_label.lower()):
                invoice_total_field = field_label
                print(f"Found invoice total field: {invoice_total_field}")
    
    # If we didn't find the fields, try alternative field names
    if not client_name_field:
        for field in statement_upload.field_config:
            if isinstance(field, dict):
                field_name = field.get('field', '').lower()
                field_label = field.get('label', '').lower()
                
                # Try alternative client name patterns
                if any(keyword in field_name or keyword in field_label for keyword in ['group', 'employer', 'organization']):
                    client_name_field = field.get('label', '')
                    print(f"Found alternative client name field: {client_name_field}")
                    break
    
    if not commission_earned_field:
        for field in statement_upload.field_config:
            if isinstance(field, dict):
                field_name = field.get('field', '').lower()
                field_label = field.get('label', '').lower()
                
                # Try alternative commission patterns
                if any(keyword in field_name or keyword in field_label for keyword in ['commission', 'earned', 'paid', 'amount']):
                    commission_earned_field = field.get('label', '')
                    print(f"Found alternative commission field: {commission_earned_field}")
                    break
    
    if not client_name_field or not commission_earned_field:
        print(f"Missing required fields: client_name_field={client_name_field}, commission_earned_field={commission_earned_field}")
        print(f"Available fields in field_config: {[f.get('label', '') for f in statement_upload.field_config if isinstance(f, dict)]}")
        # If we don't have the required field mappings, skip processing
        return None
    
    print(f"Processing {len(statement_upload.final_data)} rows with fields: client={client_name_field}, commission={commission_earned_field}, invoice={invoice_total_field}")
    print(f"Final data sample: {statement_upload.final_data[:2] if statement_upload.final_data else 'No data'}")
    
    # Process each row in the final_data
    for table in statement_upload.final_data:
        if not isinstance(table, dict) or 'rows' not in table:
            continue
            
        for row in table['rows']:
            if isinstance(row, dict):
                client_name = row.get(client_name_field, '').strip()
                commission_earned_str = str(row.get(commission_earned_field, '0')).strip()
                invoice_total_str = str(row.get(invoice_total_field or commission_earned_field, '0')).strip()
                
                if not client_name:
                    continue
                
                print(f"Processing row: client={client_name}, commission={commission_earned_str}, invoice={invoice_total_str}")
                
                # Convert string values to float, handling various formats including negative values in parentheses
                try:
                    # Handle negative values in parentheses
                    commission_earned_str_clean = commission_earned_str.replace('$', '').replace(',', '')
                    invoice_total_str_clean = invoice_total_str.replace('$', '').replace(',', '')
                    
                    # Check if values are negative (in parentheses)
                    commission_is_negative = commission_earned_str_clean.startswith('(') and commission_earned_str_clean.endswith(')')
                    invoice_is_negative = invoice_total_str_clean.startswith('(') and invoice_total_str_clean.endswith(')')
                    
                    # Remove parentheses and convert to float
                    commission_earned = float(commission_earned_str_clean.replace('(', '').replace(')', ''))
                    invoice_total = float(invoice_total_str_clean.replace('(', '').replace(')', ''))
                    
                    # Apply negative sign if values were in parentheses
                    if commission_is_negative:
                        commission_earned = -commission_earned
                    if invoice_is_negative:
                        invoice_total = -invoice_total
                except (ValueError, TypeError):
                    commission_earned = 0
                    invoice_total = 0
                
                # Process all commission data (including negative adjustments)
                if commission_earned != 0:
                    print(f"Upserting commission data: client={client_name}, commission={commission_earned}, invoice={invoice_total}")
                    # Upsert the commission data
                    await upsert_earned_commission(
                        db, 
                        statement_upload.company_id, 
                        client_name, 
                        invoice_total, 
                        commission_earned,
                        statement_date,
                        statement_month,
                        statement_year,
                        str(statement_upload.id)
                    )
    
    print("Commission data processing completed successfully")
    return True

