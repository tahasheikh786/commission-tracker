"""Add total amount tracking to format learning and statement uploads

This migration adds fields for tracking total amounts in learned formats
and automation metadata in statement uploads.
"""

from sqlalchemy import text

async def upgrade(conn):
    """Apply the migration"""
    
    # Add total amount fields to CarrierFormatLearning table
    await conn.execute(text("""
        ALTER TABLE carrier_format_learning
        ADD COLUMN IF NOT EXISTS statement_total_amount NUMERIC(15, 2),
        ADD COLUMN IF NOT EXISTS total_amount_field_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS auto_approved_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_auto_approved_at TIMESTAMP
    """))
    
    # Add automation tracking fields to StatementUpload table
    await conn.execute(text("""
        ALTER TABLE statement_uploads
        ADD COLUMN IF NOT EXISTS automated_approval BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS automation_timestamp TIMESTAMP,
        ADD COLUMN IF NOT EXISTS total_amount_match BOOLEAN,
        ADD COLUMN IF NOT EXISTS extracted_total NUMERIC(15, 2)
    """))
    
    print("✅ Added total amount tracking fields to carrier_format_learning and statement_uploads tables")

async def downgrade(conn):
    """Rollback the migration"""
    
    # Remove fields from CarrierFormatLearning table
    await conn.execute(text("""
        ALTER TABLE carrier_format_learning
        DROP COLUMN IF EXISTS statement_total_amount,
        DROP COLUMN IF EXISTS total_amount_field_name,
        DROP COLUMN IF EXISTS auto_approved_count,
        DROP COLUMN IF EXISTS last_auto_approved_at
    """))
    
    # Remove fields from StatementUpload table
    await conn.execute(text("""
        ALTER TABLE statement_uploads
        DROP COLUMN IF EXISTS automated_approval,
        DROP COLUMN IF EXISTS automation_timestamp,
        DROP COLUMN IF EXISTS total_amount_match,
        DROP COLUMN IF EXISTS extracted_total
    """))
    
    print("✅ Removed total amount tracking fields")
