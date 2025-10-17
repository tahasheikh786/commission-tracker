"""
Fix incorrectly merged commission records for Redirect Health.

The issue: When user 2 uploaded their statement, their data was merged into user 1's records
instead of creating separate records.

Solution:
1. Delete all Redirect Health earned commission records
2. Re-process both statements to create proper user-isolated records
"""
import asyncio
from sqlalchemy import select, delete
from app.db.database import AsyncSessionLocal
from app.db.models import EarnedCommission, StatementUpload
from app.db import crud
from uuid import UUID
from datetime import datetime

async def fix_redirect_health():
    """Fix Redirect Health commission records"""
    async with AsyncSessionLocal() as db:
        redirect_health_id = UUID('a84b7d7c-2a38-42aa-93ba-677b9696f072')
        
        # Step 1: Get all statements for Redirect Health
        result = await db.execute(
            select(StatementUpload)
            .where(StatementUpload.carrier_id == redirect_health_id)
            .where(StatementUpload.status == 'Approved')
            .order_by(StatementUpload.uploaded_at)
        )
        statements = result.scalars().all()
        
        print(f"Found {len(statements)} approved statements for Redirect Health")
        for stmt in statements:
            print(f"  - {stmt.file_name} (User: {stmt.user_id}, Date: {stmt.selected_statement_date})")
        print()
        
        # Step 2: Delete all earned commission records for Redirect Health
        result = await db.execute(
            select(EarnedCommission)
            .where(EarnedCommission.carrier_id == redirect_health_id)
        )
        old_records = result.scalars().all()
        
        print(f"Deleting {len(old_records)} incorrectly merged commission records...")
        await db.execute(
            delete(EarnedCommission)
            .where(EarnedCommission.carrier_id == redirect_health_id)
        )
        await db.commit()
        print("✅ Deleted all old records")
        print()
        
        # Step 3: Re-process each statement to create separate user-specific records
        for stmt in statements:
            print(f"Processing statement: {stmt.file_name}")
            print(f"  User: {stmt.user_id}")
            print(f"  Statement Date: {stmt.selected_statement_date}")
            
            try:
                # Call the processing function that should now create user-specific records
                await crud.process_commission_data_from_statement(db, stmt)
                print(f"  ✅ Successfully processed")
            except Exception as e:
                print(f"  ❌ Error: {e}")
            print()
        
        await db.commit()
        
        # Step 4: Verify the fix
        print("=== VERIFICATION ===")
        result = await db.execute(
            select(EarnedCommission)
            .where(EarnedCommission.carrier_id == redirect_health_id)
            .order_by(EarnedCommission.user_id, EarnedCommission.statement_date)
        )
        new_records = result.scalars().all()
        
        print(f"Total new records created: {len(new_records)}")
        
        # Group by user
        by_user = {}
        for record in new_records:
            if record.user_id not in by_user:
                by_user[record.user_id] = {
                    'records': [],
                    'total_commission': 0,
                    'total_invoice': 0
                }
            by_user[record.user_id]['records'].append(record)
            by_user[record.user_id]['total_commission'] += float(record.commission_earned or 0)
            by_user[record.user_id]['total_invoice'] += float(record.invoice_total or 0)
        
        for user_id, data in by_user.items():
            print(f"\nUser: {user_id}")
            print(f"  Records: {len(data['records'])}")
            print(f"  Total Commission: ${data['total_commission']:.2f}")
            print(f"  Total Invoice: ${data['total_invoice']:.2f}")
            print(f"  Clients: {[r.client_name for r in data['records']]}")

if __name__ == "__main__":
    print("Starting Redirect Health commission fix...")
    print()
    asyncio.run(fix_redirect_health())
    print()
    print("Done!")

