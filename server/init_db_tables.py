#!/usr/bin/env python3
"""
Initialize database tables for the authentication system.
Run this script to create all necessary tables.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.database import sync_engine
from app.db.models import Base
import asyncio

def init_database_tables():
    """Create all database tables."""
    try:
        print("🔧 Creating database tables...")
        
        # Create all tables
        Base.metadata.create_all(bind=sync_engine)
        
        print("✅ Database tables created successfully!")
        print("📋 Created tables:")
        for table_name in Base.metadata.tables.keys():
            print(f"   - {table_name}")
        
    except Exception as e:
        print(f"❌ Error creating database tables: {e}")
        raise

if __name__ == "__main__":
    init_database_tables()
