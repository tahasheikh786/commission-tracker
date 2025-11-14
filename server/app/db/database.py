from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

# Render PostgreSQL connection (preferred)
RENDER_DB_URL = os.environ.get("RENDER_DB_KEY")

# Fallback to Supabase if Render not configured
SUPABASE_DB_URL = os.environ.get("SUPABASE_DB_KEY")

# Use Render if available, otherwise use Supabase
if RENDER_DB_URL:
    # Ensure we use asyncpg dialect
    if not RENDER_DB_URL.startswith("postgresql+asyncpg://"):
        DATABASE_URL = RENDER_DB_URL.replace("postgresql://", "postgresql+asyncpg://")
    else:
        DATABASE_URL = RENDER_DB_URL
    print("✅ Using Render PostgreSQL database")
elif SUPABASE_DB_URL:
    # Ensure we use asyncpg dialect
    if not SUPABASE_DB_URL.startswith("postgresql+asyncpg://"):
        DATABASE_URL = SUPABASE_DB_URL.replace("postgresql://", "postgresql+asyncpg://")
    else:
        DATABASE_URL = SUPABASE_DB_URL
    print("⚠️  Using Supabase PostgreSQL database (fallback)")
else:
    # For local development, use a default database URL
    DATABASE_URL = "postgresql+asyncpg://user:password@localhost/commission_tracker"
    print("⚠️  Using local database (development mode)")

engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,              # ✅ Increased from 10 to 20 for concurrent processing
    max_overflow=10,           # Allow burst capacity
    pool_timeout=60,           # Wait up to 60s for connection
    pool_recycle=3600,         # ✅ Recycle connections every hour (was 1800 = 30 min)
    pool_pre_ping=True,        # Verify connections before use
    connect_args={
        "statement_cache_size": 0,
        "server_settings": {
            "application_name": "commission_tracker_extraction",
            "statement_timeout": "1800000"  # ✅ 30 min statement timeout (was 10 min)
        },
        "timeout": 60,          # Connection timeout
        "command_timeout": 60   # Command timeout
    },
    echo=False,  # Set to True for debugging SQL queries
)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

# Synchronous version for initialization scripts
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Create synchronous engine for initialization
sync_database_url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
sync_engine = create_engine(sync_database_url)
SyncSessionLocal = sessionmaker(bind=sync_engine)

def get_sync_db():
    return SyncSessionLocal()
