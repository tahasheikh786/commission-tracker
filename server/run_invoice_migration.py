#!/usr/bin/env python3
"""
Database migration script to add extracted_invoice_total column to statement_uploads table.
"""

import asyncio
import sys
import os

# Add the app directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from sqlalchemy import text
from app.config import engine

async def run_migration():
    """Apply database migration for invoice total tracking."""
    try:
        print("🚀 Starting database migration for invoice total tracking...")
        
        async with engine.begin() as conn:
            # Add extracted_invoice_total field to statement_uploads
            print("📝 Adding extracted_invoice_total column to statement_uploads...")
            await conn.execute(text("""
                ALTER TABLE statement_uploads
                ADD COLUMN IF NOT EXISTS extracted_invoice_total NUMERIC(15, 2)
            """))
            print("✅ Added extracted_invoice_total column")
            
        print("\n✨ Migration completed successfully!")
        
        # Verify the migration
        print("\n📊 Verifying column...")
        async with engine.begin() as conn:
            result = await conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_name = 'statement_uploads' 
                    AND column_name = 'extracted_invoice_total'
                );
            """))
            if result.scalar():
                print("✅ statement_uploads.extracted_invoice_total column exists")
            else:
                print("❌ statement_uploads.extracted_invoice_total column not found")
        
        print("\n🎉 Invoice total tracking is now ready to use!")
        
    except Exception as e:
        print(f"\n❌ Error running migration: {e}")
        import traceback
        traceback.print_exc()
        raise

if __name__ == "__main__":
    asyncio.run(run_migration())

