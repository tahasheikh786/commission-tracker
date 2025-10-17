"""
Add trigger to automatically clean up orphaned commission records
when statement uploads are deleted
"""

import sys
import os
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.config import DATABASE_URL

async def add_cleanup_trigger():
    """Add trigger to clean up orphaned commission records"""
    
    engine = create_async_engine(DATABASE_URL, echo=True)
    
    print("=" * 80)
    print("🔧 Adding Automatic Orphan Cleanup Mechanism")
    print("=" * 80)
    
    async with engine.begin() as conn:
        try:
            # Create function to clean up orphaned records
            print("\n📝 Step 1: Creating cleanup function...")
            await conn.execute(text("""
                CREATE OR REPLACE FUNCTION cleanup_orphaned_commissions()
                RETURNS trigger AS $$
                BEGIN
                    -- Delete commission records where ALL upload_ids no longer exist
                    DELETE FROM earned_commissions ec
                    WHERE NOT EXISTS (
                        SELECT 1 
                        FROM statement_uploads su,
                             json_array_elements_text(ec.upload_ids::json) AS upload_id
                        WHERE su.id::text = upload_id
                    )
                    AND ec.upload_ids IS NOT NULL;
                    
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
            """))
            print("✅ Cleanup function created")
            
            # Create trigger on statement_uploads DELETE
            print("\n📝 Step 2: Dropping old trigger if exists...")
            await conn.execute(text("""
                DROP TRIGGER IF EXISTS trigger_cleanup_orphaned_commissions ON statement_uploads
            """))
            print("✅ Old trigger dropped (if existed)")
            
            print("\n📝 Step 3: Creating new trigger for automatic cleanup...")
            await conn.execute(text("""
                CREATE TRIGGER trigger_cleanup_orphaned_commissions
                AFTER DELETE ON statement_uploads
                FOR EACH STATEMENT
                EXECUTE FUNCTION cleanup_orphaned_commissions()
            """))
            print("✅ Trigger created")
            
            print("\n" + "=" * 80)
            print("✅ Automatic Orphan Cleanup Mechanism Added!")
            print("=" * 80)
            print("\n💡 How it works:")
            print("  1. When statement uploads are deleted")
            print("  2. The trigger automatically checks earned_commissions")
            print("  3. Removes records where all upload_ids are invalid")
            print("  4. Prevents orphaned commission data")
            print("\n✅ No more orphaned records!")
            
        except Exception as e:
            print(f"\n❌ Failed: {e}")
            raise
    
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(add_cleanup_trigger())

