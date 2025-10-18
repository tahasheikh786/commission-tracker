#!/usr/bin/env python3
"""
Reset all commission records for Redirect Health.

This script will:
1. Delete ALL commission records for Redirect Health
2. Users will need to re-approve their statements to recreate them properly

This is necessary because existing records were created before the user_id
isolation fix and contain mixed data from multiple users.
"""

import asyncio
from sqlalchemy import select, and_
from app.db.database import AsyncSessionLocal
from app.db.models import EarnedCommission, Company

async def reset_redirect_health_commissions():
    """Delete all commission records for Redirect Health."""
    
    async with AsyncSessionLocal() as db:
        print("=" * 80)
        print("RESET REDIRECT HEALTH COMMISSION RECORDS")
        print("=" * 80)
        print()
        
        # Find Redirect Health carrier
        result = await db.execute(
            select(Company).where(Company.name.ilike('%redirect%health%'))
        )
        redirect_carrier = result.scalar_one_or_none()
        
        if not redirect_carrier:
            print("❌ ERROR: Redirect Health carrier not found!")
            return
        
        print(f"✅ Found Redirect Health: {redirect_carrier.name} (ID: {redirect_carrier.id})")
        print()
        
        # Get all commission records for Redirect Health
        result = await db.execute(
            select(EarnedCommission).where(EarnedCommission.carrier_id == redirect_carrier.id)
        )
        records = result.scalars().all()
        
        print(f"Found {len(records)} commission records for Redirect Health")
        print()
        
        if len(records) == 0:
            print("ℹ️  No records to delete")
            return
        
        # Show what will be deleted
        print("Commission records to be deleted:")
        for record in records:
            print(f"  - Client: {record.client_name}")
            print(f"    Commission: ${float(record.commission_earned or 0):,.2f}")
            print(f"    User ID: {record.user_id}")
            print(f"    Upload IDs: {record.upload_ids}")
            print()
        
        # Ask for confirmation
        print("⚠️  WARNING: This will delete ALL commission records for Redirect Health!")
        print("   Users will need to re-approve their statements to recreate them properly.")
        print()
        response = input("Are you sure you want to continue? (yes/no): ")
        
        if response.lower() != 'yes':
            print("❌ Operation cancelled")
            return
        
        # Delete all records
        print()
        print("Deleting records...")
        for record in records:
            await db.delete(record)
        
        await db.commit()
        
        print()
        print("=" * 80)
        print("SUMMARY")
        print("=" * 80)
        print(f"✅ Deleted {len(records)} commission records")
        print()
        print("⚠️  IMPORTANT: Users should now:")
        print("   1. Go to the Carriers tab")
        print("   2. Select Redirect Health")
        print("   3. Find their approved statements")
        print("   4. The system will automatically recreate commission records")
        print("      with proper user isolation when they view the carrier")
        print()
        print("   OR:")
        print("   1. Re-approve their statements (if you want fresh calculations)")

if __name__ == "__main__":
    asyncio.run(reset_redirect_health_commissions())

