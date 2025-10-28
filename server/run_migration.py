#!/usr/bin/env python3
"""
Database migration script to add environments table and environment_id columns.
This applies the changes from migrations/001_add_environments.py
"""

import asyncio
import sys
import os

# Add the app directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from sqlalchemy import text
from app.config import engine

async def run_migration():
    """Apply database migration for environments feature."""
    try:
        print("🚀 Starting database migration for environments...")
        
        async with engine.begin() as conn:
            # 1. Create environments table
            print("📝 Creating environments table...")
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS environments (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    company_id UUID NOT NULL,
                    name VARCHAR NOT NULL,
                    created_at TIMESTAMP DEFAULT now() NOT NULL,
                    created_by UUID NOT NULL,
                    CONSTRAINT fk_environments_company_id FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                    CONSTRAINT fk_environments_created_by FOREIGN KEY (created_by) REFERENCES users(id),
                    CONSTRAINT uq_company_environment_name UNIQUE (company_id, name)
                )
            """))
            print("✅ Environments table created")
            
            # 2. Add environment_id to statement_uploads
            print("📝 Adding environment_id to statement_uploads...")
            await conn.execute(text("""
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='statement_uploads' AND column_name='environment_id'
                    ) THEN
                        ALTER TABLE statement_uploads 
                        ADD COLUMN environment_id UUID;
                        
                        ALTER TABLE statement_uploads
                        ADD CONSTRAINT fk_statement_uploads_environment_id 
                        FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE;
                    END IF;
                END $$;
            """))
            print("✅ Added environment_id to statement_uploads")
            
            # 3. Add environment_id to earned_commissions
            print("📝 Adding environment_id to earned_commissions...")
            await conn.execute(text("""
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='earned_commissions' AND column_name='environment_id'
                    ) THEN
                        ALTER TABLE earned_commissions 
                        ADD COLUMN environment_id UUID;
                        
                        ALTER TABLE earned_commissions
                        ADD CONSTRAINT fk_earned_commissions_environment_id 
                        FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE;
                    END IF;
                END $$;
            """))
            print("✅ Added environment_id to earned_commissions")
            
            # 4. Update unique constraint on earned_commissions
            print("📝 Updating unique constraint on earned_commissions...")
            await conn.execute(text("""
                DO $$ 
                BEGIN 
                    -- Drop old constraint if it exists
                    IF EXISTS (
                        SELECT 1 FROM pg_constraint 
                        WHERE conname = 'uq_carrier_client_date_user_commission'
                    ) THEN
                        ALTER TABLE earned_commissions 
                        DROP CONSTRAINT uq_carrier_client_date_user_commission;
                    END IF;
                    
                    -- Create new constraint if it doesn't exist
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint 
                        WHERE conname = 'uq_carrier_client_date_user_env_commission'
                    ) THEN
                        ALTER TABLE earned_commissions
                        ADD CONSTRAINT uq_carrier_client_date_user_env_commission 
                        UNIQUE (carrier_id, client_name, statement_date, user_id, environment_id);
                    END IF;
                END $$;
            """))
            print("✅ Updated unique constraint on earned_commissions")
            
            # 5. Add environment_id to edited_tables
            print("📝 Adding environment_id to edited_tables...")
            await conn.execute(text("""
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='edited_tables' AND column_name='environment_id'
                    ) THEN
                        ALTER TABLE edited_tables 
                        ADD COLUMN environment_id UUID;
                        
                        ALTER TABLE edited_tables
                        ADD CONSTRAINT fk_edited_tables_environment_id 
                        FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE;
                    END IF;
                END $$;
            """))
            print("✅ Added environment_id to edited_tables")
            
            # 6. Update edited_tables foreign key for CASCADE delete
            print("📝 Updating edited_tables upload_id foreign key...")
            await conn.execute(text("""
                DO $$ 
                BEGIN 
                    -- Drop old constraint if it exists without CASCADE
                    IF EXISTS (
                        SELECT 1 FROM pg_constraint c
                        JOIN pg_class t ON c.conrelid = t.oid
                        WHERE c.conname = 'edited_tables_upload_id_fkey' 
                        AND t.relname = 'edited_tables'
                        AND c.confdeltype != 'c'  -- 'c' is CASCADE
                    ) THEN
                        ALTER TABLE edited_tables 
                        DROP CONSTRAINT edited_tables_upload_id_fkey;
                        
                        ALTER TABLE edited_tables
                        ADD CONSTRAINT edited_tables_upload_id_fkey 
                        FOREIGN KEY (upload_id) REFERENCES statement_uploads(id) ON DELETE CASCADE;
                    END IF;
                END $$;
            """))
            print("✅ Updated edited_tables foreign key")
            
        print("\n📊 Creating Default environments for existing companies...")
        async with engine.begin() as conn:
            # Get all companies
            result = await conn.execute(text("""
                SELECT DISTINCT u.company_id 
                FROM users u
                WHERE u.company_id IS NOT NULL
            """))
            companies = result.fetchall()
            
            for (company_id,) in companies:
                # Check if Default environment already exists for this company
                env_result = await conn.execute(text("""
                    SELECT id FROM environments 
                    WHERE company_id = :company_id AND name = 'Default'
                """), {"company_id": company_id})
                
                existing_env = env_result.fetchone()
                
                if not existing_env:
                    # Get first user from this company to set as creator
                    user_result = await conn.execute(text("""
                        SELECT id FROM users 
                        WHERE company_id = :company_id 
                        LIMIT 1
                    """), {"company_id": company_id})
                    creator_user = user_result.fetchone()
                    
                    if creator_user:
                        # Create Default environment
                        await conn.execute(text("""
                            INSERT INTO environments (company_id, name, created_by)
                            VALUES (:company_id, 'Default', :created_by)
                        """), {"company_id": company_id, "created_by": creator_user[0]})
                        print(f"✅ Created Default environment for company {company_id}")
                    else:
                        print(f"⚠️ No users found for company {company_id}, skipping Default environment creation")
                else:
                    print(f"ℹ️ Default environment already exists for company {company_id}")
        
        print("\n📊 Assigning NULL uploads to Default environments...")
        async with engine.begin() as conn:
            # Assign NULL environment_id uploads to Default environment
            result = await conn.execute(text("""
                WITH default_envs AS (
                    SELECT e.id as env_id, e.company_id
                    FROM environments e
                    WHERE e.name = 'Default'
                )
                UPDATE statement_uploads su
                SET environment_id = de.env_id
                FROM default_envs de
                JOIN users u ON u.company_id = de.company_id
                WHERE su.user_id = u.id 
                  AND su.environment_id IS NULL
                RETURNING su.id
            """))
            updated_uploads = result.fetchall()
            print(f"✅ Assigned {len(updated_uploads)} uploads to Default environments")
        
        print("\n📊 Assigning NULL earned_commissions to Default environments...")
        async with engine.begin() as conn:
            # Assign NULL environment_id earned_commissions to Default environment
            result = await conn.execute(text("""
                WITH default_envs AS (
                    SELECT e.id as env_id, e.company_id
                    FROM environments e
                    WHERE e.name = 'Default'
                )
                UPDATE earned_commissions ec
                SET environment_id = de.env_id
                FROM default_envs de
                JOIN users u ON u.company_id = de.company_id
                WHERE ec.user_id = u.id 
                  AND ec.environment_id IS NULL
                RETURNING ec.id
            """))
            updated_commissions = result.fetchall()
            print(f"✅ Assigned {len(updated_commissions)} earned_commissions to Default environments")
        
        print("\n📊 Assigning NULL edited_tables to Default environments...")
        async with engine.begin() as conn:
            # Assign NULL environment_id edited_tables to Default environment
            result = await conn.execute(text("""
                WITH default_envs AS (
                    SELECT e.id as env_id, e.company_id
                    FROM environments e
                    WHERE e.name = 'Default'
                )
                UPDATE edited_tables et
                SET environment_id = de.env_id
                FROM statement_uploads su
                JOIN users u ON u.id = su.user_id
                JOIN default_envs de ON de.company_id = u.company_id
                WHERE et.upload_id = su.id 
                  AND et.environment_id IS NULL
                RETURNING et.id
            """))
            updated_tables = result.fetchall()
            print(f"✅ Assigned {len(updated_tables)} edited_tables to Default environments")
            
        print("\n✨ Migration completed successfully!")
        print("\n📊 Verifying tables...")
        
        # Verify the migration
        async with engine.begin() as conn:
            # Check environments table
            result = await conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'environments'
                );
            """))
            if result.scalar():
                print("✅ environments table exists")
            else:
                print("❌ environments table not found")
            
            # Check environment_id columns
            for table in ['statement_uploads', 'earned_commissions', 'edited_tables']:
                result = await conn.execute(text(f"""
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_name = '{table}' AND column_name = 'environment_id'
                    );
                """))
                if result.scalar():
                    print(f"✅ {table}.environment_id column exists")
                else:
                    print(f"❌ {table}.environment_id column not found")
        
        print("\n🎉 All environment features are now ready to use!")
        
    except Exception as e:
        print(f"\n❌ Error running migration: {e}")
        import traceback
        traceback.print_exc()
        raise

if __name__ == "__main__":
    asyncio.run(run_migration())

