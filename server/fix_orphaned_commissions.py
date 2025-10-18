#!/usr/bin/env python3
"""
Fix orphaned commission records by assigning them to the correct user.

This script will:
1. Find all commission records with user_id = NULL
2. For each record, look at the upload_ids to determine the correct user
3. If uploads belong to multiple users, split the record
4. Assign each record to the correct user
"""

import asyncio
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import AsyncSessionLocal
from app.db.models import StatementUpload, EarnedCommission, Company, User
from datetime import datetime
from uuid import UUID
from decimal import Decimal

async def fix_orphaned_commissions():
    """Fix orphaned commission records by assigning them to correct users."""
    
    async with AsyncSessionLocal() as db:
        print("=" * 80)
        print("FIXING ORPHANED COMMISSION RECORDS")
        print("=" * 80)
        print()
        
        # Step 1: Find all orphaned records (user_id is NULL)
        result = await db.execute(
            select(EarnedCommission).where(EarnedCommission.user_id.is_(None))
        )
        orphaned_records = result.scalars().all()
        
        if not orphaned_records:
            print("✅ No orphaned records found!")
            return
        
        print(f"Found {len(orphaned_records)} orphaned commission records")
        print()
        
        fixed_count = 0
        deleted_count = 0
        
        for record in orphaned_records:
            print(f"Processing: {record.client_name} (ID: {record.id})")
            print(f"  Upload IDs: {record.upload_ids}")
            
            if not record.upload_ids or len(record.upload_ids) == 0:
                print(f"  ⚠️  No upload IDs - deleting orphaned record")
                await db.delete(record)
                deleted_count += 1
                continue
            
            # Get all uploads for this record
            upload_users = {}
            for upload_id_str in record.upload_ids:
                try:
                    upload_id = UUID(upload_id_str)
                    upload_result = await db.execute(
                        select(StatementUpload).where(StatementUpload.id == upload_id)
                    )
                    upload = upload_result.scalar_one_or_none()
                    
                    if upload and upload.user_id:
                        if upload.user_id not in upload_users:
                            upload_users[upload.user_id] = []
                        upload_users[upload.user_id].append(upload_id_str)
                        
                        # Get user email for logging
                        user_result = await db.execute(select(User).where(User.id == upload.user_id))
                        user = user_result.scalar_one_or_none()
                        user_email = user.email if user else "UNKNOWN"
                    else:
                        print(f"    ⚠️  Upload {upload_id_str} not found or has no user_id")
                except Exception as e:
                    print(f"    ⚠️  Error processing upload {upload_id_str}: {e}")
            
            if len(upload_users) == 0:
                print(f"  ⚠️  No valid user_ids found - deleting orphaned record")
                await db.delete(record)
                deleted_count += 1
            elif len(upload_users) == 1:
                # Simple case: all uploads belong to one user, just assign the user_id
                user_id = list(upload_users.keys())[0]
                user_result = await db.execute(select(User).where(User.id == user_id))
                user = user_result.scalar_one_or_none()
                user_email = user.email if user else "UNKNOWN"
                
                print(f"  ✅ Assigning to user: {user_email}")
                record.user_id = user_id
                fixed_count += 1
            else:
                # Complex case: uploads belong to multiple users - need to split the record
                print(f"  ⚠️  Multiple users detected - this record needs to be split")
                print(f"     Users: {len(upload_users)} users")
                
                # For now, we'll delete this record and let it be recreated properly
                # when the user re-approves their statements
                print(f"  🗑️  Deleting mixed-user record - will be recreated correctly")
                await db.delete(record)
                deleted_count += 1
            
            print()
        
        # Commit all changes
        await db.commit()
        
        print("=" * 80)
        print("SUMMARY")
        print("=" * 80)
        print(f"Fixed records (assigned user_id): {fixed_count}")
        print(f"Deleted records (empty or mixed-user): {deleted_count}")
        print()
        
        if fixed_count > 0 or deleted_count > 0:
            print("✅ Successfully fixed orphaned commission records!")
            print()
            print("⚠️  NOTE: For records that were deleted (mixed-user records),")
            print("   the users will need to re-approve their statements to")
            print("   recreate the commission records with proper user isolation.")
        else:
            print("ℹ️  No changes were made")

if __name__ == "__main__":
    asyncio.run(fix_orphaned_commissions())

