"""
Standalone migration script to add user_id to earned_commissions table
This script can be run directly with: python migrations/run_add_user_id_migration.py
"""

import sys
import os
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy import text
from app.config import DATABASE_URL

async def run_migration():
    """Run the migration to add user_id to earned_commissions"""
    
    # Create async engine
    engine = create_async_engine(
        DATABASE_URL,
        echo=True,  # Show SQL statements
    )
    
    print("=" * 80)
    print("🚀 Starting migration: Add user_id to earned_commissions")
    print("=" * 80)
    
    async with engine.begin() as conn:
        try:
            # Step 1: Add user_id column (nullable)
            print("\n📝 Step 1: Adding user_id column to earned_commissions...")
            await conn.execute(text("""
                ALTER TABLE earned_commissions 
                ADD COLUMN IF NOT EXISTS user_id UUID;
            """))
            print("✅ user_id column added")
            
            # Step 2: Migrate existing data
            print("\n🔄 Step 2: Migrating existing data - setting user_id based on upload_ids...")
            result = await conn.execute(text("""
                UPDATE earned_commissions ec
                SET user_id = (
                    SELECT su.user_id
                    FROM statement_uploads su, 
                         json_array_elements_text(ec.upload_ids::json) AS upload_id
                    WHERE su.id::text = upload_id
                    LIMIT 1
                )
                WHERE ec.user_id IS NULL 
                AND ec.upload_ids IS NOT NULL
            """))
            rows_updated = result.rowcount
            print(f"✅ Migrated {rows_updated} existing records with upload_ids")
            
            # Step 3: Add foreign key constraint
            print("\n🔗 Step 3: Adding foreign key constraint...")
            try:
                await conn.execute(text("""
                    ALTER TABLE earned_commissions
                    ADD CONSTRAINT fk_earned_commission_user
                    FOREIGN KEY (user_id) REFERENCES users(id);
                """))
                print("✅ Foreign key constraint added")
            except Exception as e:
                if "already exists" in str(e):
                    print("⚠️  Foreign key constraint already exists, skipping")
                else:
                    raise
            
            # Step 4: Drop old unique constraint if it exists
            print("\n🗑️  Step 4: Dropping old unique constraint...")
            try:
                await conn.execute(text("""
                    ALTER TABLE earned_commissions
                    DROP CONSTRAINT IF EXISTS uq_carrier_client_date_commission;
                """))
                print("✅ Old constraint dropped")
            except Exception as e:
                print(f"⚠️  Could not drop old constraint: {e}")
            
            # Step 5: Add new unique constraint with user_id
            print("\n✅ Step 5: Adding new unique constraint with user_id...")
            try:
                await conn.execute(text("""
                    ALTER TABLE earned_commissions
                    ADD CONSTRAINT uq_carrier_client_date_user_commission
                    UNIQUE (carrier_id, client_name, statement_date, user_id);
                """))
                print("✅ New unique constraint added")
            except Exception as e:
                if "already exists" in str(e):
                    print("⚠️  Constraint already exists, skipping")
                else:
                    raise
            
            print("\n" + "=" * 80)
            print("✅ Migration completed successfully!")
            print("=" * 80)
            print("\nSummary:")
            print(f"  - Added user_id column to earned_commissions")
            print(f"  - Migrated {rows_updated} existing records")
            print(f"  - Added foreign key constraint")
            print(f"  - Updated unique constraint to include user_id")
            print("\n✅ Database is now ready with proper user data isolation!")
            
        except Exception as e:
            print("\n" + "=" * 80)
            print(f"❌ Migration failed: {e}")
            print("=" * 80)
            raise
    
    await engine.dispose()


if __name__ == "__main__":
    print("Starting migration process...\n")
    asyncio.run(run_migration())
    print("\n✅ Migration script completed!")

