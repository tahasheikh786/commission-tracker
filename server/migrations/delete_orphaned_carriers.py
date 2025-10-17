"""
Script to delete all commission records for Redirect Health and Adrem Administration
These carriers have commission data but no actual statements (orphaned data)
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

async def delete_orphaned_carriers():
    """Delete all commission records for orphaned carriers"""
    
    # Create async engine
    engine = create_async_engine(
        DATABASE_URL,
        echo=True,  # Show SQL statements
    )
    
    print("=" * 80)
    print("🗑️  Deleting Orphaned Commission Records")
    print("=" * 80)
    
    async with engine.begin() as conn:
        try:
            # Step 1: Count Redirect Health records
            print("\n📊 Step 1: Counting Redirect Health records...")
            redirect_count_result = await conn.execute(text("""
                SELECT COUNT(*), SUM(commission_earned) 
                FROM earned_commissions ec
                JOIN companies c ON ec.carrier_id = c.id
                WHERE c.name ILIKE '%Redirect Health%'
            """))
            redirect_data = redirect_count_result.fetchone()
            redirect_count = redirect_data[0] if redirect_data else 0
            redirect_total = redirect_data[1] if redirect_data else 0
            print(f"  📋 Found {redirect_count} Redirect Health records")
            print(f"  💰 Total commission: ${redirect_total:.2f}")
            
            # Step 2: Count Adrem Administration records
            print("\n📊 Step 2: Counting Adrem Administration records...")
            adrem_count_result = await conn.execute(text("""
                SELECT COUNT(*), SUM(commission_earned) 
                FROM earned_commissions ec
                JOIN companies c ON ec.carrier_id = c.id
                WHERE c.name ILIKE '%Adrem%'
            """))
            adrem_data = adrem_count_result.fetchone()
            adrem_count = adrem_data[0] if adrem_data else 0
            adrem_total = adrem_data[1] if adrem_data else 0
            print(f"  📋 Found {adrem_count} Adrem Administration records")
            print(f"  💰 Total commission: ${adrem_total:.2f}")
            
            total_records = redirect_count + adrem_count
            total_commission = redirect_total + adrem_total
            
            if total_records == 0:
                print("\n✅ No records found to delete")
                return
            
            print(f"\n⚠️  About to delete {total_records} records totaling ${total_commission:.2f}")
            
            # Step 3: Delete Redirect Health records
            print("\n🗑️  Step 3: Deleting Redirect Health records...")
            redirect_delete = await conn.execute(text("""
                DELETE FROM earned_commissions
                WHERE carrier_id IN (
                    SELECT id FROM companies WHERE name ILIKE '%Redirect Health%'
                )
            """))
            print(f"  ✅ Deleted {redirect_delete.rowcount} Redirect Health records")
            
            # Step 4: Delete Adrem Administration records
            print("\n🗑️  Step 4: Deleting Adrem Administration records...")
            adrem_delete = await conn.execute(text("""
                DELETE FROM earned_commissions
                WHERE carrier_id IN (
                    SELECT id FROM companies WHERE name ILIKE '%Adrem%'
                )
            """))
            print(f"  ✅ Deleted {adrem_delete.rowcount} Adrem Administration records")
            
            # Step 5: Verify deletion
            print("\n✅ Step 5: Verifying deletion...")
            
            verify_redirect = await conn.execute(text("""
                SELECT COUNT(*) FROM earned_commissions ec
                JOIN companies c ON ec.carrier_id = c.id
                WHERE c.name ILIKE '%Redirect Health%'
            """))
            redirect_remaining = verify_redirect.scalar()
            
            verify_adrem = await conn.execute(text("""
                SELECT COUNT(*) FROM earned_commissions ec
                JOIN companies c ON ec.carrier_id = c.id
                WHERE c.name ILIKE '%Adrem%'
            """))
            adrem_remaining = verify_adrem.scalar()
            
            print(f"  - Redirect Health remaining records: {redirect_remaining}")
            print(f"  - Adrem Administration remaining records: {adrem_remaining}")
            
            print("\n" + "=" * 80)
            print("✅ Deletion completed successfully!")
            print("=" * 80)
            print("\nSummary:")
            print(f"  - Deleted {redirect_delete.rowcount} Redirect Health records (${redirect_total:.2f})")
            print(f"  - Deleted {adrem_delete.rowcount} Adrem Administration records (${adrem_total:.2f})")
            print(f"  - Total records removed: {redirect_delete.rowcount + adrem_delete.rowcount}")
            print(f"  - Total commission removed: ${total_commission:.2f}")
            print("\n💡 These records had commission data but no corresponding statement uploads.")
            print("   They were orphaned when statements were deleted from the system.")
            
        except Exception as e:
            print("\n" + "=" * 80)
            print(f"❌ Deletion failed: {e}")
            print("=" * 80)
            raise
    
    await engine.dispose()


if __name__ == "__main__":
    print("⚠️  WARNING: This will permanently delete commission records for:")
    print("  - Redirect Health")
    print("  - Adrem Administration")
    print("\nStarting deletion process...\n")
    asyncio.run(delete_orphaned_carriers())
    print("\n✅ Script completed!")

