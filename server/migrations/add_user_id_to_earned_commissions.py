"""Add user_id to earned_commissions for user data isolation

Revision ID: add_user_id_earned_commission
Revises: 
Create Date: 2025-10-17 10:00:00.000000

This migration adds the user_id column to the earned_commissions table
to enable proper data isolation between users. Each user will have their
own commission records per carrier/client/date combination.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

# revision identifiers
revision = 'add_user_id_earned_commission'
down_revision = None  # Update this with the actual previous revision ID if you have one
branch_labels = None
depends_on = None


def upgrade():
    """
    Add user_id column to earned_commissions table and update constraints.
    
    Steps:
    1. Add user_id column (nullable for backward compatibility)
    2. Migrate existing data by setting user_id based on upload_ids
    3. Add foreign key constraint
    4. Drop old unique constraint
    5. Add new unique constraint with user_id
    """
    
    # Step 1: Add user_id column (nullable)
    print("📝 Adding user_id column to earned_commissions...")
    op.add_column('earned_commissions', 
                  sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True))
    
    # Step 2: Migrate existing data
    # Set user_id based on upload_ids by looking up the user from statement_uploads
    print("🔄 Migrating existing data - setting user_id based on upload_ids...")
    
    # Use raw SQL to update existing records
    # This finds the user_id from statement_uploads table using the first upload_id in the array
    connection = op.get_bind()
    
    # First, handle records that have upload_ids
    connection.execute(text("""
        UPDATE earned_commissions ec
        SET user_id = (
            SELECT su.user_id
            FROM statement_uploads su
            WHERE su.id::text = ANY(ec.upload_ids)
            LIMIT 1
        )
        WHERE ec.user_id IS NULL 
        AND ec.upload_ids IS NOT NULL 
        AND jsonb_array_length(ec.upload_ids::jsonb) > 0
    """))
    
    print(f"✅ Migrated existing records with upload_ids")
    
    # Step 3: Add foreign key constraint
    print("🔗 Adding foreign key constraint...")
    op.create_foreign_key(
        'fk_earned_commission_user',
        'earned_commissions',
        'users',
        ['user_id'],
        ['id']
    )
    
    # Step 4: Drop old unique constraint
    print("🗑️  Dropping old unique constraint...")
    try:
        op.drop_constraint('uq_carrier_client_date_commission', 'earned_commissions', type_='unique')
    except Exception as e:
        print(f"⚠️  Could not drop old constraint (may not exist): {e}")
    
    # Step 5: Add new unique constraint with user_id
    print("✅ Adding new unique constraint with user_id...")
    op.create_unique_constraint(
        'uq_carrier_client_date_user_commission',
        'earned_commissions',
        ['carrier_id', 'client_name', 'statement_date', 'user_id']
    )
    
    print("✅ Migration completed successfully!")


def downgrade():
    """
    Rollback the changes.
    
    Steps:
    1. Drop new unique constraint
    2. Add back old unique constraint
    3. Drop foreign key
    4. Drop user_id column
    """
    
    print("⏮️  Rolling back migration...")
    
    # Step 1: Drop new unique constraint
    print("🗑️  Dropping new unique constraint...")
    op.drop_constraint('uq_carrier_client_date_user_commission', 'earned_commissions', type_='unique')
    
    # Step 2: Add back old unique constraint
    print("➕ Re-adding old unique constraint...")
    op.create_unique_constraint(
        'uq_carrier_client_date_commission',
        'earned_commissions',
        ['carrier_id', 'client_name', 'statement_date']
    )
    
    # Step 3: Drop foreign key
    print("🗑️  Dropping foreign key constraint...")
    op.drop_constraint('fk_earned_commission_user', 'earned_commissions', type_='foreignkey')
    
    # Step 4: Drop user_id column
    print("🗑️  Dropping user_id column...")
    op.drop_column('earned_commissions', 'user_id')
    
    print("✅ Rollback completed successfully!")

