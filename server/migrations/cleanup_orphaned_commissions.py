"""
Script to investigate and clean up orphaned commission records
These are records in earned_commissions that have no corresponding statements
"""

import sys
import os
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.config import DATABASE_URL

async def investigate_and_cleanup():
    """Investigate and clean up orphaned commission records"""
    
    # Create async engine
    engine = create_async_engine(
        DATABASE_URL,
        echo=True,  # Show SQL statements
    )
    
    print("=" * 80)
    print("🔍 Investigating Orphaned Commission Records")
    print("=" * 80)
    
    async with engine.begin() as conn:
        try:
            # Step 1: Find Redirect Health records
            print("\n📊 Step 1: Checking Redirect Health commission records...")
            redirect_result = await conn.execute(text("""
                SELECT 
                    ec.id,
                    ec.carrier_id,
                    c.name as carrier_name,
                    ec.client_name,
                    ec.commission_earned,
                    ec.upload_ids,
                    ec.user_id
                FROM earned_commissions ec
                JOIN companies c ON ec.carrier_id = c.id
                WHERE c.name ILIKE '%Redirect Health%'
                ORDER BY ec.commission_earned DESC;
            """))
            redirect_records = redirect_result.fetchall()
            
            print(f"\n📋 Found {len(redirect_records)} Redirect Health commission records:")
            total_redirect_commission = 0
            for record in redirect_records:
                print(f"  - ID: {record.id}, Client: {record.client_name}, Commission: ${record.commission_earned}, Upload IDs: {record.upload_ids}, User ID: {record.user_id}")
                total_redirect_commission += float(record.commission_earned)
            print(f"  💰 Total Redirect Health Commission: ${total_redirect_commission:.2f}")
            
            # Step 2: Find Adrem Administration records
            print("\n📊 Step 2: Checking Adrem Administration commission records...")
            adrem_result = await conn.execute(text("""
                SELECT 
                    ec.id,
                    ec.carrier_id,
                    c.name as carrier_name,
                    ec.client_name,
                    ec.commission_earned,
                    ec.upload_ids,
                    ec.user_id
                FROM earned_commissions ec
                JOIN companies c ON ec.carrier_id = c.id
                WHERE c.name ILIKE '%Adrem%'
                ORDER BY ec.commission_earned DESC;
            """))
            adrem_records = adrem_result.fetchall()
            
            print(f"\n📋 Found {len(adrem_records)} Adrem Administration commission records:")
            total_adrem_commission = 0
            for record in adrem_records:
                print(f"  - ID: {record.id}, Client: {record.client_name}, Commission: ${record.commission_earned}, Upload IDs: {record.upload_ids}, User ID: {record.user_id}")
                total_adrem_commission += float(record.commission_earned)
            print(f"  💰 Total Adrem Commission: ${total_adrem_commission:.2f}")
            
            # Step 3: Check if upload_ids point to existing statements
            print("\n🔍 Step 3: Checking if upload_ids point to existing statements...")
            
            orphaned_redirect_ids = []
            for record in redirect_records:
                if record.upload_ids:
                    # Check if any of the upload_ids exist in statement_uploads
                    check_result = await conn.execute(text("""
                        SELECT COUNT(*) 
                        FROM statement_uploads su,
                             json_array_elements_text(:upload_ids::json) AS upload_id
                        WHERE su.id::text = upload_id
                    """), {"upload_ids": record.upload_ids})
                    count = check_result.scalar()
                    if count == 0:
                        print(f"  ❌ Redirect Health record {record.id} has NO valid statements (orphaned)")
                        orphaned_redirect_ids.append(record.id)
                else:
                    print(f"  ❌ Redirect Health record {record.id} has NO upload_ids (orphaned)")
                    orphaned_redirect_ids.append(record.id)
            
            orphaned_adrem_ids = []
            for record in adrem_records:
                if record.upload_ids:
                    # Check if any of the upload_ids exist in statement_uploads
                    check_result = await conn.execute(text("""
                        SELECT COUNT(*) 
                        FROM statement_uploads su,
                             json_array_elements_text(:upload_ids::json) AS upload_id
                        WHERE su.id::text = upload_id
                    """), {"upload_ids": record.upload_ids})
                    count = check_result.scalar()
                    if count == 0:
                        print(f"  ❌ Adrem record {record.id} has NO valid statements (orphaned)")
                        orphaned_adrem_ids.append(record.id)
                else:
                    print(f"  ❌ Adrem record {record.id} has NO upload_ids (orphaned)")
                    orphaned_adrem_ids.append(record.id)
            
            # Step 4: Delete orphaned records
            total_orphaned = len(orphaned_redirect_ids) + len(orphaned_adrem_ids)
            
            if total_orphaned == 0:
                print("\n✅ No orphaned records found. All commission records have valid statements.")
                return
            
            print(f"\n🗑️  Step 4: Deleting {total_orphaned} orphaned commission records...")
            print(f"  - Redirect Health: {len(orphaned_redirect_ids)} records")
            print(f"  - Adrem Administration: {len(orphaned_adrem_ids)} records")
            
            # Delete Redirect Health orphaned records
            if orphaned_redirect_ids:
                for record_id in orphaned_redirect_ids:
                    await conn.execute(text("""
                        DELETE FROM earned_commissions WHERE id = :record_id
                    """), {"record_id": record_id})
                print(f"  ✅ Deleted {len(orphaned_redirect_ids)} Redirect Health orphaned records")
            
            # Delete Adrem orphaned records
            if orphaned_adrem_ids:
                for record_id in orphaned_adrem_ids:
                    await conn.execute(text("""
                        DELETE FROM earned_commissions WHERE id = :record_id
                    """), {"record_id": record_id})
                print(f"  ✅ Deleted {len(orphaned_adrem_ids)} Adrem orphaned records")
            
            # Step 5: Verify cleanup
            print("\n✅ Step 5: Verifying cleanup...")
            
            redirect_count_result = await conn.execute(text("""
                SELECT COUNT(*) 
                FROM earned_commissions ec
                JOIN companies c ON ec.carrier_id = c.id
                WHERE c.name ILIKE '%Redirect Health%'
            """))
            redirect_count = redirect_count_result.scalar()
            
            adrem_count_result = await conn.execute(text("""
                SELECT COUNT(*) 
                FROM earned_commissions ec
                JOIN companies c ON ec.carrier_id = c.id
                WHERE c.name ILIKE '%Adrem%'
            """))
            adrem_count = adrem_count_result.scalar()
            
            print(f"  - Redirect Health remaining records: {redirect_count}")
            print(f"  - Adrem Administration remaining records: {adrem_count}")
            
            print("\n" + "=" * 80)
            print("✅ Cleanup completed successfully!")
            print("=" * 80)
            print("\nSummary:")
            print(f"  - Deleted {len(orphaned_redirect_ids)} orphaned Redirect Health records")
            print(f"  - Deleted {len(orphaned_adrem_ids)} orphaned Adrem Administration records")
            print(f"  - Total orphaned records removed: {total_orphaned}")
            print("\n💡 These records had commission data but no corresponding statements.")
            print("   This likely happened because statements were deleted but commission records remained.")
            
        except Exception as e:
            print("\n" + "=" * 80)
            print(f"❌ Investigation/cleanup failed: {e}")
            print("=" * 80)
            raise
    
    await engine.dispose()


if __name__ == "__main__":
    print("Starting investigation and cleanup process...\n")
    asyncio.run(investigate_and_cleanup())
    print("\n✅ Script completed!")

