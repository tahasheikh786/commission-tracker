"""Add invoice total tracking to statement uploads

This migration adds the extracted_invoice_total field to track
the total invoice amount calculated from table data.
"""

from sqlalchemy import text

async def upgrade(conn):
    """Apply the migration"""
    
    # Add extracted_invoice_total field to StatementUpload table
    await conn.execute(text("""
        ALTER TABLE statement_uploads
        ADD COLUMN IF NOT EXISTS extracted_invoice_total NUMERIC(15, 2)
    """))
    
    print("✅ Added extracted_invoice_total field to statement_uploads table")

async def downgrade(conn):
    """Rollback the migration"""
    
    # Remove extracted_invoice_total field from StatementUpload table
    await conn.execute(text("""
        ALTER TABLE statement_uploads
        DROP COLUMN IF EXISTS extracted_invoice_total
    """))
    
    print("✅ Removed extracted_invoice_total field from statement_uploads table")

