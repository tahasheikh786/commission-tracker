"""
Migration to add carrier_id field to statement_uploads table
"""

import asyncio
from sqlalchemy import text
from app.db.database import engine

async def upgrade():
    """Add carrier_id column to statement_uploads table"""
    
    async with engine.begin() as conn:
        # Add carrier_id column
        await conn.execute(text("""
            ALTER TABLE statement_uploads 
            ADD COLUMN carrier_id UUID REFERENCES companies(id)
        """))
        
        print("✅ Added carrier_id column to statement_uploads table")

async def downgrade():
    """Remove carrier_id column from statement_uploads table"""
    
    async with engine.begin() as conn:
        # Remove carrier_id column
        await conn.execute(text("""
            ALTER TABLE statement_uploads 
            DROP COLUMN IF EXISTS carrier_id
        """))
        
        print("✅ Removed carrier_id column from statement_uploads table")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "downgrade":
        asyncio.run(downgrade())
    else:
        asyncio.run(upgrade())
