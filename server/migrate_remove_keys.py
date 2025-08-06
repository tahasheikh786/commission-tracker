#!/usr/bin/env python3
"""
Migration script to remove field_key and plan_key columns from database tables.
Run this script to update your existing database schema.
"""

import asyncio
import sys
import os

# Add the app directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.config import engine
from sqlalchemy import text

async def migrate_remove_keys():
    """Remove field_key and plan_key columns from database tables."""
    try:
        print("Starting migration to remove key columns...")
        
        async with engine.begin() as conn:
            # Check if columns exist before trying to remove them
            print("Checking existing columns...")
            
            # Check database_fields table
            result = await conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'database_fields' 
                AND column_name = 'field_key';
            """))
            field_key_exists = result.fetchone()
            
            # Check plan_types table
            result = await conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'plan_types' 
                AND column_name = 'plan_key';
            """))
            plan_key_exists = result.fetchone()
            
            # Remove field_key column if it exists
            if field_key_exists:
                print("Removing field_key column from database_fields table...")
                await conn.execute(text("ALTER TABLE database_fields DROP COLUMN field_key;"))
                print("✅ field_key column removed from database_fields table")
            else:
                print("ℹ️  field_key column does not exist in database_fields table")
            
            # Remove plan_key column if it exists
            if plan_key_exists:
                print("Removing plan_key column from plan_types table...")
                await conn.execute(text("ALTER TABLE plan_types DROP COLUMN plan_key;"))
                print("✅ plan_key column removed from plan_types table")
            else:
                print("ℹ️  plan_key column does not exist in plan_types table")
            
            # Add unique constraint to display_name columns if they don't exist
            print("Adding unique constraints to display_name columns...")
            
            # Check if unique constraint exists on database_fields.display_name
            result = await conn.execute(text("""
                SELECT constraint_name 
                FROM information_schema.table_constraints 
                WHERE table_name = 'database_fields' 
                AND constraint_type = 'UNIQUE' 
                AND constraint_name LIKE '%display_name%';
            """))
            db_field_constraint = result.fetchone()
            
            if not db_field_constraint:
                await conn.execute(text("ALTER TABLE database_fields ADD CONSTRAINT database_fields_display_name_unique UNIQUE (display_name);"))
                print("✅ Added unique constraint to database_fields.display_name")
            else:
                print("ℹ️  Unique constraint already exists on database_fields.display_name")
            
            # Check if unique constraint exists on plan_types.display_name
            result = await conn.execute(text("""
                SELECT constraint_name 
                FROM information_schema.table_constraints 
                WHERE table_name = 'plan_types' 
                AND constraint_type = 'UNIQUE' 
                AND constraint_name LIKE '%display_name%';
            """))
            plan_type_constraint = result.fetchone()
            
            if not plan_type_constraint:
                await conn.execute(text("ALTER TABLE plan_types ADD CONSTRAINT plan_types_display_name_unique UNIQUE (display_name);"))
                print("✅ Added unique constraint to plan_types.display_name")
            else:
                print("ℹ️  Unique constraint already exists on plan_types.display_name")
        
        print("✅ Migration completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during migration: {e}")
        raise

if __name__ == "__main__":
    print("🚀 Starting database migration...")
    asyncio.run(migrate_remove_keys())
    print("✨ Migration complete!") 