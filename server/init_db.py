#!/usr/bin/env python3
"""
Database initialization script to create the plan_types table.
Run this script to create the missing table in your database.
"""

import asyncio
import sys
import os

# Add the app directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.db.models import Base, PlanType
from app.config import engine

async def init_db():
    """Create all tables defined in the models."""
    try:
        print("Creating database tables...")
        
        # Create all tables
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        
        print("✅ Database tables created successfully!")
        
        # Verify the plan_types table was created
        async with engine.begin() as conn:
            from sqlalchemy import text
            result = await conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'plan_types'
                );
            """))
            table_exists = result.scalar()
            
            if table_exists:
                print("✅ plan_types table exists!")
            else:
                print("❌ plan_types table was not created!")
                
    except Exception as e:
        print(f"❌ Error creating database tables: {e}")
        raise

if __name__ == "__main__":
    print("🚀 Initializing database...")
    asyncio.run(init_db())
    print("✨ Database initialization complete!") 