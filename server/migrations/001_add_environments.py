"""Add environments table and environment_id to related tables

Revision ID: 001
Revises: 
Create Date: 2025-10-27

This migration adds:
1. environments table with CASCADE delete
2. environment_id to statement_uploads with CASCADE delete
3. environment_id to earned_commissions with CASCADE delete
4. environment_id to edited_tables with CASCADE delete
5. Updates unique constraints for earned_commissions
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

def upgrade():
    # Create environments table
    op.create_table(
        'environments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.UniqueConstraint('company_id', 'name', name='uq_company_environment_name')
    )
    
    # Add environment_id to statement_uploads
    op.add_column('statement_uploads', 
        sa.Column('environment_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        'fk_statement_uploads_environment_id',
        'statement_uploads', 'environments',
        ['environment_id'], ['id'],
        ondelete='CASCADE'
    )
    
    # Add environment_id to earned_commissions
    op.add_column('earned_commissions', 
        sa.Column('environment_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        'fk_earned_commissions_environment_id',
        'earned_commissions', 'environments',
        ['environment_id'], ['id'],
        ondelete='CASCADE'
    )
    
    # Drop old unique constraint on earned_commissions if it exists
    try:
        op.drop_constraint('uq_carrier_client_date_user_commission', 'earned_commissions', type_='unique')
    except:
        pass  # Constraint might not exist
    
    # Add new unique constraint with environment_id
    op.create_unique_constraint(
        'uq_carrier_client_date_user_env_commission',
        'earned_commissions',
        ['carrier_id', 'client_name', 'statement_date', 'user_id', 'environment_id']
    )
    
    # Add environment_id to edited_tables
    op.add_column('edited_tables', 
        sa.Column('environment_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        'fk_edited_tables_environment_id',
        'edited_tables', 'environments',
        ['environment_id'], ['id'],
        ondelete='CASCADE'
    )
    
    # Update edited_tables upload_id foreign key to include CASCADE delete
    try:
        op.drop_constraint('edited_tables_upload_id_fkey', 'edited_tables', type_='foreignkey')
        op.create_foreign_key(
            'edited_tables_upload_id_fkey',
            'edited_tables', 'statement_uploads',
            ['upload_id'], ['id'],
            ondelete='CASCADE'
        )
    except:
        pass  # Foreign key might already have CASCADE

def downgrade():
    # Remove environment_id from edited_tables
    op.drop_constraint('fk_edited_tables_environment_id', 'edited_tables', type_='foreignkey')
    op.drop_column('edited_tables', 'environment_id')
    
    # Remove environment_id from earned_commissions
    op.drop_constraint('uq_carrier_client_date_user_env_commission', 'earned_commissions', type_='unique')
    op.create_unique_constraint(
        'uq_carrier_client_date_user_commission',
        'earned_commissions',
        ['carrier_id', 'client_name', 'statement_date', 'user_id']
    )
    op.drop_constraint('fk_earned_commissions_environment_id', 'earned_commissions', type_='foreignkey')
    op.drop_column('earned_commissions', 'environment_id')
    
    # Remove environment_id from statement_uploads
    op.drop_constraint('fk_statement_uploads_environment_id', 'statement_uploads', type_='foreignkey')
    op.drop_column('statement_uploads', 'environment_id')
    
    # Drop environments table
    op.drop_table('environments')

