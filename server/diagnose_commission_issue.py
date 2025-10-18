#!/usr/bin/env python3
"""
Diagnostic script to investigate commission aggregation issues.
This script will check:
1. All statement uploads for Redirect Health
2. All earned commission records for Redirect Health
3. Verify user_id isolation
4. Check for any duplicate or missing aggregations
"""

import asyncio
import sys
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import AsyncSessionLocal
from app.db.models import StatementUpload, EarnedCommission, Company, User
from datetime import datetime

async def diagnose_commission_issue():
    """Diagnose commission aggregation issues."""
    
    async with AsyncSessionLocal() as db:
        print("=" * 80)
        print("COMMISSION AGGREGATION DIAGNOSTIC REPORT")
        print("=" * 80)
        print()
        
        # Step 1: Find Redirect Health carrier
        print("📊 Step 1: Finding Redirect Health carrier...")
        result = await db.execute(
            select(Company).where(Company.name.ilike('%redirect%health%'))
        )
        redirect_carrier = result.scalar_one_or_none()
        
        if not redirect_carrier:
            print("❌ ERROR: Redirect Health carrier not found in database!")
            return
        
        print(f"✅ Found Redirect Health: ID = {redirect_carrier.id}, Name = {redirect_carrier.name}")
        print()
        
        # Step 2: Get all users
        print("📊 Step 2: Getting all users...")
        result = await db.execute(select(User))
        users = result.scalars().all()
        print(f"✅ Found {len(users)} users:")
        for user in users:
            print(f"   - {user.email} (ID: {user.id}, Role: {user.role})")
        print()
        
        # Step 3: Check all statement uploads for Redirect Health
        print("📊 Step 3: Checking statement uploads for Redirect Health...")
        result = await db.execute(
            select(StatementUpload)
            .where(
                and_(
                    StatementUpload.carrier_id == redirect_carrier.id,
                    StatementUpload.status == 'Approved'
                )
            )
            .order_by(StatementUpload.uploaded_at.desc())
        )
        statements = result.scalars().all()
        
        print(f"✅ Found {len(statements)} approved statements for Redirect Health:")
        print()
        
        for i, stmt in enumerate(statements, 1):
            user_result = await db.execute(select(User).where(User.id == stmt.user_id))
            user = user_result.scalar_one_or_none()
            user_email = user.email if user else "UNKNOWN"
            
            # Get statement date
            stmt_date = "UNKNOWN"
            if stmt.selected_statement_date:
                if isinstance(stmt.selected_statement_date, dict):
                    stmt_date = stmt.selected_statement_date.get('date') or stmt.selected_statement_date.get('date_value', 'UNKNOWN')
                else:
                    stmt_date = str(stmt.selected_statement_date)
            
            print(f"   Statement {i}:")
            print(f"      Upload ID: {stmt.id}")
            print(f"      User: {user_email} ({stmt.user_id})")
            print(f"      File: {stmt.file_name}")
            print(f"      Statement Date: {stmt_date}")
            print(f"      Uploaded At: {stmt.uploaded_at}")
            print(f"      Status: {stmt.status}")
            
            # Count rows in final_data
            if stmt.final_data:
                total_rows = sum(len(table.get('rows', [])) for table in stmt.final_data if isinstance(table, dict))
                print(f"      Data Rows: {total_rows}")
            else:
                print(f"      Data Rows: 0 (no final_data)")
            print()
        
        # Step 4: Check earned commission records for Redirect Health
        print("📊 Step 4: Checking earned commission records for Redirect Health...")
        result = await db.execute(
            select(EarnedCommission)
            .where(EarnedCommission.carrier_id == redirect_carrier.id)
            .order_by(EarnedCommission.user_id, EarnedCommission.client_name)
        )
        commissions = result.scalars().all()
        
        print(f"✅ Found {len(commissions)} commission records for Redirect Health:")
        print()
        
        # Group by user
        user_commissions = {}
        for comm in commissions:
            if comm.user_id not in user_commissions:
                user_commissions[comm.user_id] = []
            user_commissions[comm.user_id].append(comm)
        
        for user_id, user_comms in user_commissions.items():
            user_result = await db.execute(select(User).where(User.id == user_id))
            user = user_result.scalar_one_or_none()
            user_email = user.email if user else "UNKNOWN"
            
            print(f"   User: {user_email} ({user_id}):")
            print(f"      Total Records: {len(user_comms)}")
            
            total_commission = sum(float(c.commission_earned or 0) for c in user_comms)
            total_invoice = sum(float(c.invoice_total or 0) for c in user_comms)
            
            print(f"      Total Commission: ${total_commission:,.2f}")
            print(f"      Total Invoice: ${total_invoice:,.2f}")
            print()
            
            for comm in user_comms:
                print(f"         Client: {comm.client_name}")
                print(f"         Commission: ${float(comm.commission_earned or 0):,.2f}")
                print(f"         Invoice: ${float(comm.invoice_total or 0):,.2f}")
                print(f"         Statement Count: {comm.statement_count}")
                print(f"         Statement Date: {comm.statement_date}")
                print(f"         Upload IDs: {comm.upload_ids}")
                print()
        
        # Step 5: Check for orphaned commission records (user_id is NULL)
        print("📊 Step 5: Checking for orphaned commission records (no user_id)...")
        result = await db.execute(
            select(EarnedCommission)
            .where(
                and_(
                    EarnedCommission.carrier_id == redirect_carrier.id,
                    EarnedCommission.user_id.is_(None)
                )
            )
        )
        orphaned = result.scalars().all()
        
        if orphaned:
            print(f"⚠️  WARNING: Found {len(orphaned)} orphaned commission records without user_id!")
            for comm in orphaned:
                print(f"   - Client: {comm.client_name}, Commission: ${float(comm.commission_earned or 0):,.2f}")
            print()
        else:
            print("✅ No orphaned records found")
            print()
        
        # Step 6: Check for data isolation issues
        print("📊 Step 6: Checking for potential data isolation issues...")
        
        # Check if multiple users have records for the same client and date
        result = await db.execute(
            select(
                EarnedCommission.client_name,
                EarnedCommission.statement_date,
                func.count(EarnedCommission.user_id.distinct()).label('user_count')
            )
            .where(EarnedCommission.carrier_id == redirect_carrier.id)
            .group_by(EarnedCommission.client_name, EarnedCommission.statement_date)
            .having(func.count(EarnedCommission.user_id.distinct()) > 1)
        )
        
        multi_user_records = result.all()
        
        if multi_user_records:
            print(f"⚠️  Found {len(multi_user_records)} client/date combinations with multiple users:")
            for record in multi_user_records:
                print(f"   - Client: {record.client_name}, Date: {record.statement_date}, Users: {record.user_count}")
            print()
        else:
            print("✅ No data isolation issues detected - each client/date belongs to only one user")
            print()
        
        # Summary
        print("=" * 80)
        print("SUMMARY")
        print("=" * 80)
        print(f"Total Users: {len(users)}")
        print(f"Total Approved Statements: {len(statements)}")
        print(f"Total Commission Records: {len(commissions)}")
        print(f"Orphaned Records (no user_id): {len(orphaned)}")
        print()
        
        # Check if statement count matches commission records
        if len(statements) > len(commissions):
            print(f"⚠️  ISSUE: {len(statements)} statements but only {len(commissions)} commission records")
            print(f"   Missing: {len(statements) - len(commissions)} commission records")
            print()
            
            # Find which statements don't have corresponding commission records
            statement_upload_ids = {str(stmt.id) for stmt in statements}
            commission_upload_ids = set()
            for comm in commissions:
                if comm.upload_ids:
                    commission_upload_ids.update(comm.upload_ids)
            
            missing_uploads = statement_upload_ids - commission_upload_ids
            if missing_uploads:
                print(f"   Statements without commission records:")
                for upload_id in missing_uploads:
                    stmt = next((s for s in statements if str(s.id) == upload_id), None)
                    if stmt:
                        user_result = await db.execute(select(User).where(User.id == stmt.user_id))
                        user = user_result.scalar_one_or_none()
                        print(f"      - Upload ID: {upload_id}")
                        print(f"        User: {user.email if user else 'UNKNOWN'}")
                        print(f"        File: {stmt.file_name}")
                        print()

if __name__ == "__main__":
    asyncio.run(diagnose_commission_issue())

