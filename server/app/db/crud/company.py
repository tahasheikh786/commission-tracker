from ..models import Company, User, StatementUpload
from ..schemas import CompanyCreate
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, func, or_, and_
from uuid import UUID
from typing import Optional, Dict, Any

async def get_company_by_name(db, name: str):
    """
    Get company by name with case-insensitive matching and whitespace trimming.
    This prevents duplicate carriers due to case/spacing differences.
    """
    if not name:
        return None
    
    # Trim whitespace from input
    name = name.strip()
    
    # CRITICAL FIX: Use case-insensitive matching to prevent duplicate carriers
    # e.g., "UnitedHealthcare", "unitedhealthcare", "UNITEDHEALTHCARE" should all match
    result = await db.execute(
        select(Company).where(func.lower(Company.name) == func.lower(name))
    )
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

async def update_company_name(db, company_id: str, new_name: str):
    company = await get_company_by_id(db, company_id)
    if not company:
        raise ValueError(f"Company with ID {company_id} not found")
    
    company.name = new_name
    await db.commit()
    await db.refresh(company)
    return company


async def get_company_role_stats(db: AsyncSession, company_id: UUID) -> Dict[str, Any]:
    """
    Determine how a company record is typically used across the platform.
    Returns counts that indicate whether the company behaves like a broker (has users)
    or as a carrier (referenced as carrier_id on uploads).
    """
    if isinstance(company_id, str):
        try:
            company_id = UUID(company_id)
        except ValueError:
            return {
                "company_id": company_id,
                "user_count": 0,
                "carrier_usage_count": 0,
                "classification": "unknown"
            }
    
    user_count_result = await db.execute(
        select(func.count()).select_from(User).where(User.company_id == company_id)
    )
    user_count = int(user_count_result.scalar() or 0)
    
    carrier_usage_result = await db.execute(
        select(func.count())
        .select_from(StatementUpload)
        .where(
            or_(
                StatementUpload.carrier_id == company_id,
                and_(
                    StatementUpload.company_id == company_id,
                    StatementUpload.carrier_id.is_(None)
                )
            )
        )
    )
    carrier_usage_count = int(carrier_usage_result.scalar() or 0)
    
    if carrier_usage_count > 0 and user_count == 0:
        classification = "carrier"
    elif user_count > 0 and carrier_usage_count == 0:
        classification = "broker"
    elif user_count > 0 and carrier_usage_count > 0:
        classification = "mixed"
    else:
        classification = "unknown"
    
    return {
        "company_id": str(company_id),
        "user_count": user_count,
        "carrier_usage_count": carrier_usage_count,
        "classification": classification
    }


async def get_company_role_by_name(db: AsyncSession, name: str) -> Optional[Dict[str, Any]]:
    """
    Convenience helper to fetch role stats by company name.
    """
    company = await get_company_by_name(db, name)
    if not company:
        return None
    
    stats = await get_company_role_stats(db, company.id)
    stats["company_name"] = company.name
    return stats

async def get_latest_statement_upload_for_company(db, company_id):
    from ..models import StatementUpload as StatementUploadModel
    result = await db.execute(
        select(StatementUploadModel)
        .where(StatementUploadModel.company_id == company_id)
        .order_by(StatementUploadModel.uploaded_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()

async def merge_carriers(db: AsyncSession, source_carrier_id: str, target_carrier_id: str):
    """
    Merge all data from source carrier into target carrier.
    This includes:
    - All statements (statement_uploads)
    - Format learning (carrier_format_learning)
    - Field mappings (company_field_mappings)
    - Configurations (company_configurations)
    - Earned commissions (earned_commissions)
    
    After merging, the source carrier is deleted.
    """
    from ..models import (
        StatementUpload, CarrierFormatLearning, CompanyFieldMapping, 
        CompanyConfiguration, EarnedCommission
    )
    from sqlalchemy import or_, and_, func
    from datetime import datetime
    
    try:
        # Convert string IDs to UUID if needed
        if isinstance(source_carrier_id, str):
            source_carrier_id = UUID(source_carrier_id)
        if isinstance(target_carrier_id, str):
            target_carrier_id = UUID(target_carrier_id)
        
        # Verify both carriers exist
        source_carrier = await get_company_by_id(db, source_carrier_id)
        target_carrier = await get_company_by_id(db, target_carrier_id)
        
        if not source_carrier:
            raise ValueError(f"Source carrier {source_carrier_id} not found")
        if not target_carrier:
            raise ValueError(f"Target carrier {target_carrier_id} not found")
        
        merge_result = {
            "statements_migrated": 0,
            "format_learning_migrated": 0,
            "field_mappings_migrated": 0,
            "configurations_merged": False,
            "earned_commissions_merged": 0
        }
        
        # 1. Migrate all statements from source to target carrier
        # This handles both old format (company_id) and new format (carrier_id)
        statements_result = await db.execute(
            select(StatementUpload).where(
                or_(
                    StatementUpload.carrier_id == source_carrier_id,
                    and_(
                        StatementUpload.company_id == source_carrier_id,
                        StatementUpload.carrier_id.is_(None)
                    )
                )
            )
        )
        statements = statements_result.scalars().all()
        
        for statement in statements:
            statement.carrier_id = target_carrier_id
            statement.company_id = target_carrier_id  # Update both for compatibility
        
        merge_result["statements_migrated"] = len(statements)
        
        # 2. Migrate format learning (keep all unique format signatures)
        format_learning_result = await db.execute(
            select(CarrierFormatLearning).where(
                CarrierFormatLearning.company_id == source_carrier_id
            )
        )
        format_learnings = format_learning_result.scalars().all()
        
        for format_learning in format_learnings:
            # Check if target already has this format signature
            existing_format = await db.execute(
                select(CarrierFormatLearning).where(
                    and_(
                        CarrierFormatLearning.company_id == target_carrier_id,
                        CarrierFormatLearning.format_signature == format_learning.format_signature
                    )
                )
            )
            existing = existing_format.scalar_one_or_none()
            
            if existing:
                # Merge usage counts and keep the more recent one
                existing.usage_count += format_learning.usage_count
                existing.auto_approved_count += format_learning.auto_approved_count
                if format_learning.last_used > existing.last_used:
                    existing.last_used = format_learning.last_used
                if format_learning.last_auto_approved_at and (
                    not existing.last_auto_approved_at or 
                    format_learning.last_auto_approved_at > existing.last_auto_approved_at
                ):
                    existing.last_auto_approved_at = format_learning.last_auto_approved_at
                # Delete the duplicate from source
                await db.delete(format_learning)
            else:
                # Migrate to target carrier
                format_learning.company_id = target_carrier_id
                merge_result["format_learning_migrated"] += 1
        
        # 3. Migrate field mappings (avoid duplicates)
        field_mappings_result = await db.execute(
            select(CompanyFieldMapping).where(
                CompanyFieldMapping.company_id == source_carrier_id
            )
        )
        field_mappings = field_mappings_result.scalars().all()
        
        for mapping in field_mappings:
            # Check if target already has this mapping
            existing_mapping = await db.execute(
                select(CompanyFieldMapping).where(
                    and_(
                        CompanyFieldMapping.company_id == target_carrier_id,
                        CompanyFieldMapping.display_name == mapping.display_name,
                        CompanyFieldMapping.column_name == mapping.column_name
                    )
                )
            )
            existing = existing_mapping.scalar_one_or_none()
            
            if existing:
                # Delete duplicate from source
                await db.delete(mapping)
            else:
                # Migrate to target carrier
                mapping.company_id = target_carrier_id
                merge_result["field_mappings_migrated"] += 1
        
        # 4. Merge configurations (merge field_config, plan_types, table_names)
        source_config_result = await db.execute(
            select(CompanyConfiguration).where(
                CompanyConfiguration.company_id == source_carrier_id
            )
        )
        source_config = source_config_result.scalar_one_or_none()
        
        if source_config:
            target_config_result = await db.execute(
                select(CompanyConfiguration).where(
                    CompanyConfiguration.company_id == target_carrier_id
                )
            )
            target_config = target_config_result.scalar_one_or_none()
            
            if target_config:
                # Merge configurations intelligently
                # Merge field_config (keep unique entries)
                if source_config.field_config:
                    if not target_config.field_config:
                        target_config.field_config = source_config.field_config
                    else:
                        # Merge field configs, preferring target in case of conflicts
                        source_fields = {f.get('field') or f.get('display_name'): f 
                                       for f in source_config.field_config if isinstance(f, dict)}
                        target_fields = {f.get('field') or f.get('display_name'): f 
                                       for f in target_config.field_config if isinstance(f, dict)}
                        
                        for field_key, field_config in source_fields.items():
                            if field_key not in target_fields:
                                target_config.field_config.append(field_config)
                
                # Merge plan_types (keep unique entries)
                if source_config.plan_types:
                    if not target_config.plan_types:
                        target_config.plan_types = source_config.plan_types
                    else:
                        existing_plans = set(target_config.plan_types)
                        for plan in source_config.plan_types:
                            if plan not in existing_plans:
                                target_config.plan_types.append(plan)
                
                # Merge table_names (keep unique entries)
                if source_config.table_names:
                    if not target_config.table_names:
                        target_config.table_names = source_config.table_names
                    else:
                        existing_tables = set(target_config.table_names)
                        for table in source_config.table_names:
                            if table not in existing_tables:
                                target_config.table_names.append(table)
                
                target_config.updated_at = datetime.utcnow()
                await db.delete(source_config)
            else:
                # Target has no config, just migrate source config
                source_config.company_id = target_carrier_id
            
            merge_result["configurations_merged"] = True
        
        # 5. Merge earned commissions (aggregate by client name and statement date)
        earned_commissions_result = await db.execute(
            select(EarnedCommission).where(
                EarnedCommission.carrier_id == source_carrier_id
            )
        )
        earned_commissions = earned_commissions_result.scalars().all()
        
        for source_commission in earned_commissions:
            # Check if target has a commission record for the same client and statement date
            existing_commission_result = await db.execute(
                select(EarnedCommission).where(
                    and_(
                        EarnedCommission.carrier_id == target_carrier_id,
                        EarnedCommission.client_name == source_commission.client_name,
                        EarnedCommission.statement_date == source_commission.statement_date,
                        EarnedCommission.user_id == source_commission.user_id,
                        EarnedCommission.environment_id == source_commission.environment_id
                    )
                )
            )
            existing_commission = existing_commission_result.scalar_one_or_none()
            
            if existing_commission:
                # Merge the commission data
                existing_commission.invoice_total += source_commission.invoice_total
                existing_commission.commission_earned += source_commission.commission_earned
                existing_commission.statement_count += source_commission.statement_count
                
                # Merge upload_ids
                if source_commission.upload_ids:
                    if not existing_commission.upload_ids:
                        existing_commission.upload_ids = source_commission.upload_ids
                    else:
                        existing_commission.upload_ids = list(set(
                            existing_commission.upload_ids + source_commission.upload_ids
                        ))
                
                # Merge monthly breakdowns
                existing_commission.jan_commission += source_commission.jan_commission or 0
                existing_commission.feb_commission += source_commission.feb_commission or 0
                existing_commission.mar_commission += source_commission.mar_commission or 0
                existing_commission.apr_commission += source_commission.apr_commission or 0
                existing_commission.may_commission += source_commission.may_commission or 0
                existing_commission.jun_commission += source_commission.jun_commission or 0
                existing_commission.jul_commission += source_commission.jul_commission or 0
                existing_commission.aug_commission += source_commission.aug_commission or 0
                existing_commission.sep_commission += source_commission.sep_commission or 0
                existing_commission.oct_commission += source_commission.oct_commission or 0
                existing_commission.nov_commission += source_commission.nov_commission or 0
                existing_commission.dec_commission += source_commission.dec_commission or 0
                
                await db.delete(source_commission)
            else:
                # Migrate to target carrier
                source_commission.carrier_id = target_carrier_id
            
            merge_result["earned_commissions_merged"] += 1
        
        # 6. Delete the source carrier
        await db.delete(source_carrier)
        
        # Commit all changes
        await db.commit()
        
        return merge_result
        
    except Exception as e:
        await db.rollback()
        raise ValueError(f"Failed to merge carriers: {str(e)}")
