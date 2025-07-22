from .models import Company, CompanyFieldMapping, DatabaseField
from .schemas import CompanyCreate, CompanyFieldMappingCreate, StatementUpload, DatabaseFieldCreate, DatabaseFieldUpdate
from sqlalchemy.dialects.postgresql import insert as pg_insert
from datetime import datetime
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

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
        field_key=mapping.field_key,
        column_name=mapping.column_name,
        created_at=now,
        updated_at=now,
    ).on_conflict_do_update(
        index_elements=['company_id', 'field_key'],
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
    from app.db.models import StatementUpload as StatementUploadModel
    db_upload = StatementUploadModel(
        id=upload.id,
        company_id=upload.company_id,
        file_name=upload.file_name,
        uploaded_at=upload.uploaded_at,
        status=upload.status,
        raw_data=upload.raw_data,
        mapping_used=upload.mapping_used
    )
    db.add(db_upload)
    await db.commit()
    await db.refresh(db_upload)
    return db_upload

async def get_company_by_id(db, company_id):
    from app.db.models import Company
    result = await db.execute(select(Company).where(Company.id == company_id))
    return result.scalar_one_or_none()

async def save_statement_review(
    db, *,
    upload_id: UUID,
    final_data,
    status: str,
    field_config,
    rejection_reason: str = None,
    plan_types: list = None
):
    from app.db.models import StatementUpload
    upload = await db.get(StatementUpload, upload_id)
    if not upload:
        raise Exception("Upload not found")

    upload.final_data = final_data
    upload.status = status
    upload.rejection_reason = rejection_reason
    upload.mapping_used = field_config  # optional
    if plan_types is not None:
        upload.plan_types = plan_types
    await db.commit()
    await db.refresh(upload)
    return upload

async def get_all_statement_reviews(db):
    from app.db.models import StatementUpload, Company
    stmt = (
        select(StatementUpload, Company.name)
        .join(Company, StatementUpload.company_id == Company.id)
        .where(StatementUpload.status.in_(["Approved", "Rejected"]))
    )
    result = await db.execute(stmt)
    return [
        {
            **row[0].__dict__,
            "company_name": row[1]
        }
        for row in result.all()
    ]

async def get_statements_for_company(db, company_id):
    """Returns all uploads/statements for a given company (carrier)"""
    from app.db.models import StatementUpload
    result = await db.execute(
        select(StatementUpload)
        .where(StatementUpload.company_id == company_id)
        .order_by(StatementUpload.uploaded_at.desc())
    )
    return result.scalars().all()


async def delete_company(db: AsyncSession, company_id: str):
    # Fetch the company to ensure it exists
    company = await db.execute(select(Company).where(Company.id == company_id))
    company = company.scalar_one_or_none()
    
    if company:
        # Delete the company if found
        await db.delete(company)
        await db.commit()
    else:
        raise Exception(f"Company with ID {company_id} not found.")

# Add missing get_statement_by_id function
async def get_statement_by_id(db: AsyncSession, statement_id: str):
    from app.db.models import StatementUpload
    result = await db.execute(select(StatementUpload).where(StatementUpload.id == statement_id))
    return result.scalar_one_or_none()

# Add missing delete_statement function
async def delete_statement(db: AsyncSession, statement_id: str):
    from app.db.models import StatementUpload
    statement = await get_statement_by_id(db, statement_id)
    if not statement:
        raise Exception(f"Statement with ID {statement_id} not found")
    
    await db.delete(statement)
    await db.commit()

async def update_company_name(db, company_id: str, new_name: str):
    from .models import Company
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise Exception(f"Company with ID {company_id} not found.")
    company.name = new_name
    await db.commit()
    await db.refresh(company)
    return company

async def get_latest_statement_upload_for_company(db, company_id):
    from app.db.models import StatementUpload
    result = await db.execute(
        select(StatementUpload)
        .where(StatementUpload.company_id == company_id)
        .order_by(StatementUpload.uploaded_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()

async def save_company_mapping_config(db, company_id, plan_types, table_names, field_config):
    from app.db.models import StatementUpload
    # Get the latest upload for this company
    result = await db.execute(
        select(StatementUpload)
        .where(StatementUpload.company_id == company_id)
        .order_by(StatementUpload.uploaded_at.desc())
        .limit(1)
    )
    upload = result.scalar_one_or_none()
    if upload:
        upload.plan_types = plan_types
        # Save table names into raw_data if possible
        if upload.raw_data and table_names:
            for i, t in enumerate(upload.raw_data):
                if i < len(table_names):
                    if isinstance(t, dict):
                        t['name'] = table_names[i]
        upload.field_config = field_config
        await db.commit()
        await db.refresh(upload)
    return upload

# Database Field CRUD Operations
async def create_database_field(db: AsyncSession, field: DatabaseFieldCreate):
    """Create a new database field"""
    db_field = DatabaseField(
        field_key=field.field_key,
        display_name=field.display_name,
        description=field.description,
        is_active=field.is_active
    )
    db.add(db_field)
    await db.commit()
    await db.refresh(db_field)
    return db_field

async def get_all_database_fields(db: AsyncSession, active_only: bool = True):
    """Get all database fields, optionally filtered by active status"""
    query = select(DatabaseField)
    if active_only:
        query = query.where(DatabaseField.is_active == 1)
    result = await db.execute(query)
    return result.scalars().all()

async def get_database_field_by_id(db: AsyncSession, field_id: UUID):
    """Get a database field by ID"""
    result = await db.execute(select(DatabaseField).where(DatabaseField.id == field_id))
    return result.scalar_one_or_none()

async def get_database_field_by_key(db: AsyncSession, field_key: str):
    """Get a database field by field_key"""
    result = await db.execute(select(DatabaseField).where(DatabaseField.field_key == field_key))
    return result.scalar_one_or_none()

async def update_database_field(db: AsyncSession, field_id: UUID, field_update: DatabaseFieldUpdate):
    """Update a database field"""
    field = await get_database_field_by_id(db, field_id)
    if not field:
        raise Exception(f"Database field with ID {field_id} not found")
    
    update_data = field_update.dict(exclude_unset=True)
    if 'is_active' in update_data:
        update_data['is_active'] = 1 if update_data['is_active'] else 0
    
    for key, value in update_data.items():
        setattr(field, key, value)
    
    await db.commit()
    await db.refresh(field)
    return field

async def delete_database_field(db: AsyncSession, field_id: UUID):
    """Delete a database field (soft delete by setting is_active to 0)"""
    field = await get_database_field_by_id(db, field_id)
    if not field:
        raise Exception(f"Database field with ID {field_id} not found")
    
    field.is_active = 0
    await db.commit()
    await db.refresh(field)
    return field

async def initialize_default_database_fields(db: AsyncSession):
    """Initialize default database fields if none exist"""
    existing_fields = await get_all_database_fields(db, active_only=False)
    if existing_fields:
        return existing_fields
    
    default_fields = [
        {"field_key": "group_id", "display_name": "Group Id", "description": "Unique identifier for the group"},
        {"field_key": "group_state", "display_name": "Group State", "description": "State where the group is located"},
        {"field_key": "policy_number", "display_name": "Policy Number", "description": "Policy identification number"},
        {"field_key": "client_name", "display_name": "Client Name", "description": "Name of the client or group"},
        {"field_key": "commission_earned", "display_name": "Commission Earned", "description": "Commission amount earned"},
        {"field_key": "premium_total", "display_name": "Premium Total", "description": "Total premium amount"},
        {"field_key": "premium_current_month", "display_name": "Premium Current Month", "description": "Premium for current month"},
        {"field_key": "total_subscribers", "display_name": "Total Subscribers", "description": "Total number of subscribers"},
        {"field_key": "plan_type", "display_name": "Plan Type", "description": "Type of insurance plan"},
        {"field_key": "plan_effective_date", "display_name": "Plan Effective Date", "description": "Date when plan becomes effective"},
        {"field_key": "coverage_period_start", "display_name": "Coverage Period Start", "description": "Start date of coverage period"},
        {"field_key": "coverage_period_end", "display_name": "Coverage Period End", "description": "End date of coverage period"},
        {"field_key": "carrier_name", "display_name": "Carrier Name", "description": "Name of the insurance carrier"},
        {"field_key": "payment_date", "display_name": "Payment Date", "description": "Date of payment"},
        {"field_key": "invoice_total", "display_name": "Invoice Total", "description": "Total invoice amount"},
        {"field_key": "stoploss_total", "display_name": "Stoploss Total", "description": "Total stoploss amount"},
        {"field_key": "commission_rate", "display_name": "Commission Rate", "description": "Commission rate percentage"},
        {"field_key": "total_commission_paid", "display_name": "Total Commission Paid", "description": "Total commission amount paid"},
        {"field_key": "adjustment_amount", "display_name": "Adjustment Amount", "description": "Adjustment amount"},
        {"field_key": "adjustment_type", "display_name": "Adjustment Type", "description": "Type of adjustment"},
        {"field_key": "adjustment_period_start", "display_name": "Adjustment Period Start", "description": "Start date of adjustment period"},
        {"field_key": "adjustment_period_end", "display_name": "Adjustment Period End", "description": "End date of adjustment period"},
        {"field_key": "statement_total_amount", "display_name": "Statement Total Amount", "description": "Total amount on statement"},
        {"field_key": "individual_commission", "display_name": "Individual Commission", "description": "Individual commission amount"}
    ]
    
    created_fields = []
    for field_data in default_fields:
        field = DatabaseField(
            field_key=field_data["field_key"],
            display_name=field_data["display_name"],
            description=field_data["description"],
            is_active=1
        )
        db.add(field)
        created_fields.append(field)
    
    await db.commit()
    for field in created_fields:
        await db.refresh(field)
    
    return created_fields

