from .models import Company, CompanyFieldMapping
from .schemas import CompanyCreate, CompanyFieldMappingCreate, StatementUpload
from sqlalchemy.dialects.postgresql import insert as pg_insert
from datetime import datetime
from sqlalchemy.future import select
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
    rejection_reason: str = None
):
    from app.db.models import StatementUpload
    upload = await db.get(StatementUpload, upload_id)
    if not upload:
        raise Exception("Upload not found")

    upload.final_data = final_data
    upload.status = status
    upload.rejection_reason = rejection_reason
    upload.mapping_used = field_config  # optional
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
