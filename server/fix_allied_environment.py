"""
Fix Allied Benefit Systems statement and commission data environment mismatch.

The issue: Statement upload was created with carrier's environment instead of user's environment.
This script moves the statement to the correct user environment where the commission data is.
"""
import asyncio
import sys
from app.config import get_db
from sqlalchemy import text
from uuid import UUID

async def fix_allied_environment():
    print("\n" + "="*80)
    print("FIXING ALLIED BENEFIT SYSTEMS ENVIRONMENT MISMATCH")
    print("="*80 + "\n")
    
    async for db in get_db():
        # The IDs from the logs
        upload_id = 'edf974d3-154c-45f1-bb5a-236bdee72df4'
        user_id = 'f6cf1764-5bfc-4352-abd9-81b72b7cf191'
        carrier_id = '7232d630-446d-4d43-b540-cd13c50353be'  # Allied Benefit Systems
        wrong_env_id = 'b7ae8c6c-73c4-4ec6-b43b-ec26d8c9244c'  # Carrier's environment (WRONG)
        correct_env_id = '9f4a7a57-5715-4b1e-98a9-b9901726a485'  # User's environment (CORRECT)
        
        # Step 1: Check current state
        print("📊 STEP 1: Checking current state...")
        
        # Check user
        result = await db.execute(text("""
            SELECT id, email, company_id 
            FROM users 
            WHERE id = :user_id
        """), {"user_id": user_id})
        user = result.fetchone()
        if user:
            print(f"✅ User found: {user[1]} (Company: {user[2]})")
            user_company_id = str(user[2])
        else:
            print("❌ User not found!")
            return
        
        # Check statement upload
        result = await db.execute(text("""
            SELECT id, company_id, carrier_id, user_id, environment_id, file_name, status
            FROM statement_uploads
            WHERE id = :upload_id
        """), {"upload_id": upload_id})
        stmt = result.fetchone()
        if stmt:
            print(f"\n📄 Statement Upload:")
            print(f"   ID: {stmt[0]}")
            print(f"   Company ID: {stmt[1]}")
            print(f"   Carrier ID: {stmt[2]}")
            print(f"   User ID: {stmt[3]}")
            print(f"   Environment ID: {stmt[4]}")
            print(f"   File Name: {stmt[5]}")
            print(f"   Status: {stmt[6]}")
            
            current_company_id = str(stmt[1])
            current_env_id = str(stmt[4])
        else:
            print("❌ Statement upload not found!")
            return
        
        # Check commission data
        result = await db.execute(text("""
            SELECT COUNT(*), environment_id
            FROM earned_commissions
            WHERE carrier_id = :carrier_id
            AND user_id = :user_id
            GROUP BY environment_id
        """), {"carrier_id": carrier_id, "user_id": user_id})
        comm_envs = result.fetchall()
        print(f"\n💰 Commission Data:")
        for row in comm_envs:
            print(f"   {row[0]} records in environment: {row[1]}")
        
        # Step 2: Analyze the problem
        print("\n🔍 STEP 2: Analyzing the problem...")
        
        if current_company_id == carrier_id:
            print(f"❌ PROBLEM: Statement company_id is set to carrier ({carrier_id})")
            print(f"   Should be: User's company ({user_company_id})")
        else:
            print(f"✅ Statement company_id is correct: {current_company_id}")
        
        if current_env_id == wrong_env_id:
            print(f"❌ PROBLEM: Statement environment_id is wrong ({current_env_id})")
            print(f"   Should be: User's environment ({correct_env_id})")
        elif current_env_id == correct_env_id:
            print(f"✅ Statement environment_id is already correct!")
        else:
            print(f"⚠️  Statement environment_id is unexpected: {current_env_id}")
        
        # Step 3: Apply fix
        print("\n🔧 STEP 3: Applying fix...")
        
        # Update statement upload
        await db.execute(text("""
            UPDATE statement_uploads
            SET company_id = :user_company_id,
                environment_id = :correct_env_id
            WHERE id = :upload_id
        """), {
            "user_company_id": user_company_id,
            "correct_env_id": correct_env_id,
            "upload_id": upload_id
        })
        print(f"✅ Updated statement upload:")
        print(f"   company_id: {current_company_id} -> {user_company_id}")
        print(f"   environment_id: {current_env_id} -> {correct_env_id}")
        
        # Update commission data if in wrong environment
        result = await db.execute(text("""
            UPDATE earned_commissions
            SET environment_id = :correct_env_id
            WHERE carrier_id = :carrier_id
            AND user_id = :user_id
            AND environment_id = :wrong_env_id
        """), {
            "correct_env_id": correct_env_id,
            "carrier_id": carrier_id,
            "user_id": user_id,
            "wrong_env_id": wrong_env_id
        })
        rows_updated = result.rowcount
        if rows_updated > 0:
            print(f"✅ Updated {rows_updated} commission records to correct environment")
        else:
            print(f"ℹ️  No commission records needed updating (already in correct environment)")
        
        # Commit changes
        await db.commit()
        print("\n✅ All changes committed!")
        
        # Step 4: Verify fix
        print("\n✅ STEP 4: Verifying fix...")
        
        # Check statement upload again
        result = await db.execute(text("""
            SELECT id, company_id, carrier_id, user_id, environment_id, file_name, status
            FROM statement_uploads
            WHERE id = :upload_id
        """), {"upload_id": upload_id})
        stmt = result.fetchone()
        if stmt:
            print(f"\n📄 Statement Upload (after fix):")
            print(f"   Company ID: {stmt[1]} {'✅' if str(stmt[1]) == user_company_id else '❌'}")
            print(f"   Carrier ID: {stmt[2]} {'✅' if str(stmt[2]) == carrier_id else '❌'}")
            print(f"   Environment ID: {stmt[4]} {'✅' if str(stmt[4]) == correct_env_id else '❌'}")
        
        # Check commission data again
        result = await db.execute(text("""
            SELECT COUNT(*), environment_id
            FROM earned_commissions
            WHERE carrier_id = :carrier_id
            AND user_id = :user_id
            GROUP BY environment_id
        """), {"carrier_id": carrier_id, "user_id": user_id})
        comm_envs = result.fetchall()
        print(f"\n💰 Commission Data (after fix):")
        all_correct = True
        for row in comm_envs:
            is_correct = str(row[1]) == correct_env_id
            status = '✅' if is_correct else '❌'
            print(f"   {row[0]} records in environment: {row[1]} {status}")
            if not is_correct:
                all_correct = False
        
        # Delete the wrong carrier environment if it's empty
        print("\n🧹 STEP 5: Cleaning up wrong environment...")
        result = await db.execute(text("""
            SELECT COUNT(*) FROM statement_uploads WHERE environment_id = :wrong_env_id
        """), {"wrong_env_id": wrong_env_id})
        stmt_count = result.scalar()
        
        result = await db.execute(text("""
            SELECT COUNT(*) FROM earned_commissions WHERE environment_id = :wrong_env_id
        """), {"wrong_env_id": wrong_env_id})
        comm_count = result.scalar()
        
        if stmt_count == 0 and comm_count == 0:
            print(f"✅ Environment {wrong_env_id} is now empty")
            print(f"   Consider deleting it if it's not needed")
            # Optional: Delete the environment
            # await db.execute(text("DELETE FROM environments WHERE id = :wrong_env_id"), {"wrong_env_id": wrong_env_id})
            # await db.commit()
            # print(f"✅ Deleted empty environment")
        else:
            print(f"⚠️  Environment {wrong_env_id} still has data:")
            print(f"   {stmt_count} statement uploads")
            print(f"   {comm_count} commission records")
        
        print("\n" + "="*80)
        print("✅ FIX COMPLETE!")
        print("="*80)
        print("\nThe Allied Benefit Systems statement and commission data should now")
        print("be visible when you refresh the page.")
        print("="*80 + "\n")
        
        break

if __name__ == "__main__":
    asyncio.run(fix_allied_environment())

