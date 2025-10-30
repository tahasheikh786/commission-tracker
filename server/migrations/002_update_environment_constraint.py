#!/usr/bin/env python3
"""
Database migration script to update environment unique constraint.
This changes the constraint from (company_id, name) to (company_id, created_by, name)
so that different users can have environments with the same name.
"""

import asyncio
import sys
import os

# Add the app directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'app'))

from sqlalchemy import text
from app.config import engine

async def run_migration():
    """Update environment unique constraint to be user-specific."""
    try:
        print("🚀 Starting database migration for user-specific environment names...")
        
        async with engine.begin() as conn:
            # Drop the old constraint
            print("📝 Dropping old unique constraint uq_company_environment_name...")
            await conn.execute(text("""
                ALTER TABLE environments 
                DROP CONSTRAINT IF EXISTS uq_company_environment_name
            """))
            print("✅ Old constraint dropped")
            
            # Add the new constraint
            print("📝 Adding new unique constraint uq_user_environment_name...")
            await conn.execute(text("""
                ALTER TABLE environments 
                ADD CONSTRAINT uq_user_environment_name 
                UNIQUE (company_id, created_by, name)
            """))
            print("✅ New constraint added")
            
        print("✅ Migration completed successfully!")
        print("   - Each user can now create their own environments with any name")
        print("   - Environments are isolated per user within a company")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(run_migration())

