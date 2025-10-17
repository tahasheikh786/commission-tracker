"""
Migration script to fix earned_commissions records with NULL user_id.

This script:
1. Finds all earned_commission records with NULL user_id
2. Looks up the corresponding statement_upload to get the correct user_id
3. Updates the earned_commission record with the correct user_id

Run with: python fix_earned_commissions_user_id.py
"""
import asyncio
from sqlalchemy import select, update
from app.db.database import AsyncSessionLocal
from app.db.models import EarnedCommission, StatementUpload

async def fix_user_ids():
    """Fix all earned commission records with NULL user_id"""
    async with AsyncSessionLocal() as db:
        # Get all earned commissions with NULL user_id
        result = await db.execute(
            select(EarnedCommission).where(EarnedCommission.user_id.is_(None))
        )
        commissions_to_fix = result.scalars().all()
        
        print(f"Found {len(commissions_to_fix)} earned commission records with NULL user_id")
        
        if len(commissions_to_fix) == 0:
            print("No records to fix!")
            return
        
        fixed_count = 0
        skipped_count = 0
        
        for commission in commissions_to_fix:
            try:
                # Try to find a statement upload for this carrier
                # We'll use the most recent approved statement from this carrier
                statement_result = await db.execute(
                    select(StatementUpload)
                    .where(StatementUpload.carrier_id == commission.carrier_id)
                    .where(StatementUpload.status.in_(['Approved', 'completed']))
                    .order_by(StatementUpload.uploaded_at.desc())
                    .limit(1)
                )
                statement = statement_result.scalar()
                
                if statement and statement.user_id:
                    # Update the commission with the user_id from the statement
                    await db.execute(
                        update(EarnedCommission)
                        .where(EarnedCommission.id == commission.id)
                        .values(user_id=statement.user_id)
                    )
                    fixed_count += 1
                    print(f"✅ Fixed commission {commission.id} for carrier {commission.carrier_id} with user_id {statement.user_id}")
                else:
                    skipped_count += 1
                    print(f"⚠️  Skipped commission {commission.id} - no matching statement found")
                    
            except Exception as e:
                print(f"❌ Error fixing commission {commission.id}: {e}")
                skipped_count += 1
        
        # Commit all changes
        await db.commit()
        
        print(f"\n=== SUMMARY ===")
        print(f"Total records processed: {len(commissions_to_fix)}")
        print(f"Successfully fixed: {fixed_count}")
        print(f"Skipped: {skipped_count}")

if __name__ == "__main__":
    print("Starting earned_commissions user_id fix...")
    asyncio.run(fix_user_ids())
    print("Done!")

