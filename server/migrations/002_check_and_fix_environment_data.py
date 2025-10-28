"""
Migration script to check and fix earned_commission records missing environment_id.

This script:
1. Identifies earned_commission records without environment_id
2. Attempts to backfill environment_id from the associated statement_uploads
3. Reports on any orphaned records that can't be fixed
"""
import asyncio
import sys
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update, and_, func
from uuid import UUID
import os
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.append(str(Path(__file__).parent.parent))

from app.db.models import EarnedCommission, StatementUpload, User, Environment
from app.config import DATABASE_URL

async def check_earned_commission_data(session: AsyncSession):
    """Check earned_commission data for environment_id issues."""
    
    print("=" * 80)
    print("EARNED COMMISSION DATA CHECK")
    print("=" * 80)
    
    # Count total earned commission records
    total_result = await session.execute(select(func.count(EarnedCommission.id)))
    total_count = total_result.scalar()
    print(f"\n📊 Total earned commission records: {total_count}")
    
    # Count records without environment_id
    no_env_result = await session.execute(
        select(func.count(EarnedCommission.id))
        .where(EarnedCommission.environment_id.is_(None))
    )
    no_env_count = no_env_result.scalar()
    print(f"⚠️  Records without environment_id: {no_env_count}")
    
    # Count records with environment_id
    with_env_result = await session.execute(
        select(func.count(EarnedCommission.id))
        .where(EarnedCommission.environment_id.isnot(None))
    )
    with_env_count = with_env_result.scalar()
    print(f"✅ Records with environment_id: {with_env_count}")
    
    # Count records without user_id
    no_user_result = await session.execute(
        select(func.count(EarnedCommission.id))
        .where(EarnedCommission.user_id.is_(None))
    )
    no_user_count = no_user_result.scalar()
    print(f"⚠️  Records without user_id: {no_user_count}")
    
    # Get sample of records without environment_id
    if no_env_count > 0:
        print(f"\n📋 Sample records without environment_id (first 5):")
        sample_result = await session.execute(
            select(EarnedCommission)
            .where(EarnedCommission.environment_id.is_(None))
            .limit(5)
        )
        sample_records = sample_result.scalars().all()
        
        for i, record in enumerate(sample_records, 1):
            print(f"\n  {i}. ID: {record.id}")
            print(f"     Client: {record.client_name}")
            print(f"     Carrier ID: {record.carrier_id}")
            print(f"     User ID: {record.user_id}")
            print(f"     Commission: ${record.commission_earned}")
            print(f"     Upload IDs: {record.upload_ids}")
    
    return {
        'total': total_count,
        'no_env': no_env_count,
        'with_env': with_env_count,
        'no_user': no_user_count
    }

async def check_statement_upload_data(session: AsyncSession):
    """Check statement_upload data."""
    
    print("\n" + "=" * 80)
    print("STATEMENT UPLOAD DATA CHECK")
    print("=" * 80)
    
    # Count total statement uploads
    total_result = await session.execute(select(func.count(StatementUpload.id)))
    total_count = total_result.scalar()
    print(f"\n📊 Total statement uploads: {total_count}")
    
    # Count uploads without environment_id
    no_env_result = await session.execute(
        select(func.count(StatementUpload.id))
        .where(StatementUpload.environment_id.is_(None))
    )
    no_env_count = no_env_result.scalar()
    print(f"⚠️  Uploads without environment_id: {no_env_count}")
    
    # Count uploads with environment_id
    with_env_result = await session.execute(
        select(func.count(StatementUpload.id))
        .where(StatementUpload.environment_id.isnot(None))
    )
    with_env_count = with_env_result.scalar()
    print(f"✅ Uploads with environment_id: {with_env_count}")
    
    # Get sample of uploads with environment_id
    if with_env_count > 0:
        print(f"\n📋 Sample uploads with environment_id (first 3):")
        sample_result = await session.execute(
            select(StatementUpload, Environment.name)
            .join(Environment, StatementUpload.environment_id == Environment.id, isouter=True)
            .where(StatementUpload.environment_id.isnot(None))
            .limit(3)
        )
        sample_records = sample_result.all()
        
        for i, (upload, env_name) in enumerate(sample_records, 1):
            print(f"\n  {i}. Upload ID: {upload.id}")
            print(f"     File: {upload.file_name}")
            print(f"     Environment: {env_name} ({upload.environment_id})")
            print(f"     User ID: {upload.user_id}")
            print(f"     Status: {upload.status}")
    
    return {
        'total': total_count,
        'no_env': no_env_count,
        'with_env': with_env_count
    }

async def fix_earned_commission_environment_ids(session: AsyncSession, dry_run: bool = True):
    """
    Attempt to backfill environment_id for earned_commission records.
    
    Strategy:
    1. Find earned_commission records without environment_id
    2. For each record, find associated statement_uploads using upload_ids
    3. If statement_upload has environment_id, use it for the earned_commission
    4. Update the earned_commission record
    """
    
    print("\n" + "=" * 80)
    print("FIXING EARNED COMMISSION ENVIRONMENT IDS")
    print("=" * 80)
    print(f"\nMode: {'DRY RUN (no changes)' if dry_run else 'LIVE (will update database)'}")
    
    # Get all earned_commission records without environment_id
    result = await session.execute(
        select(EarnedCommission)
        .where(EarnedCommission.environment_id.is_(None))
    )
    records_to_fix = result.scalars().all()
    
    print(f"\n📊 Found {len(records_to_fix)} records to potentially fix")
    
    fixed_count = 0
    unfixable_count = 0
    
    for record in records_to_fix:
        if not record.upload_ids or len(record.upload_ids) == 0:
            print(f"⚠️  Record {record.id} has no upload_ids - cannot determine environment")
            unfixable_count += 1
            continue
        
        # Get the first upload_id and find its environment
        first_upload_id = record.upload_ids[0]
        
        try:
            upload_uuid = UUID(first_upload_id)
            upload_result = await session.execute(
                select(StatementUpload)
                .where(StatementUpload.id == upload_uuid)
            )
            upload = upload_result.scalar_one_or_none()
            
            if upload and upload.environment_id:
                print(f"✅ Record {record.id} ({record.client_name}) -> Environment {upload.environment_id}")
                
                if not dry_run:
                    record.environment_id = upload.environment_id
                    fixed_count += 1
                else:
                    fixed_count += 1  # Count for dry run
            else:
                if upload:
                    print(f"⚠️  Record {record.id} - Statement upload {first_upload_id} has no environment_id")
                else:
                    print(f"⚠️  Record {record.id} - Statement upload {first_upload_id} not found")
                unfixable_count += 1
                
        except Exception as e:
            print(f"❌ Error processing record {record.id}: {e}")
            unfixable_count += 1
    
    if not dry_run and fixed_count > 0:
        await session.commit()
        print(f"\n💾 Committed {fixed_count} updates to database")
    
    print(f"\n📊 Summary:")
    print(f"   ✅ Fixed: {fixed_count}")
    print(f"   ⚠️  Unfixable: {unfixable_count}")
    
    return {
        'fixed': fixed_count,
        'unfixable': unfixable_count
    }

async def main():
    """Main migration function."""
    
    # Create async engine
    engine = create_async_engine(DATABASE_URL, echo=False)
    
    # Create async session
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as session:
        # Check for command line arguments
        import sys
        dry_run = True
        
        if "--apply" in sys.argv:
            dry_run = False
        
        # Check current state
        ec_stats = await check_earned_commission_data(session)
        su_stats = await check_statement_upload_data(session)
        
        # Ask if user wants to fix
        if ec_stats['no_env'] > 0:
            print("\n" + "=" * 80)
            print("RECOMMENDATIONS")
            print("=" * 80)
            print("\nOptions:")
            print("1. Run in DRY RUN mode first to see what would be changed")
            print("2. Run in LIVE mode to actually update the database")
            print("3. Manually delete old records without environment_id")
            
            print("\n⚠️  WARNING: This script will attempt to backfill environment_id from statement_uploads")
            print("   This may not be accurate if statements were uploaded before environments existed.")
            
            # Run based on command line flag
            if dry_run:
                print("\n🔍 Running in DRY RUN mode...")
            else:
                print("\n💾 Running in LIVE mode - applying changes...")
            fix_stats = await fix_earned_commission_environment_ids(session, dry_run=dry_run)
            
            print("\n" + "=" * 80)
            print("NEXT STEPS")
            print("=" * 80)
            print("\nTo apply these changes, run:")
            print(f"  python migrations/002_check_and_fix_environment_data.py --apply")
            print("\nOr to clean up unfixable records:")
            print(f"  python migrations/002_check_and_fix_environment_data.py --clean")
        else:
            print("\n✅ All earned_commission records have environment_id set!")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())

