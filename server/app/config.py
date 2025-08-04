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
    raise ValueError("No database URL configured! Set either RENDER_DB_KEY or SUPABASE_DB_KEY")

engine = create_async_engine(
    DATABASE_URL,
    connect_args={
        "statement_cache_size": 0,
        # Database timeout settings for long-running operations
        "server_settings": {
            "statement_timeout": "600000",  # 10 minutes in milliseconds
            "idle_in_transaction_session_timeout": "600000",  # 10 minutes
        }
    },
    # SQLAlchemy pool settings for long-running operations
    pool_pre_ping=True,
    pool_recycle=3600,  # Recycle connections every hour
    pool_timeout=60,    # Wait up to 60 seconds for a connection
    max_overflow=10,    # Allow up to 10 extra connections
)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
