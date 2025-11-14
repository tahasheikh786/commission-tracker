from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
from typing import List

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

# Authentication and OTP Configuration
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your-super-secret-jwt-key-change-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))  # 1 hour for better UX
REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
INACTIVITY_TIMEOUT_MINUTES = int(os.environ.get("INACTIVITY_TIMEOUT_MINUTES", "120"))  # 2 hours inactivity timeout for better UX

# Email Configuration
SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
EMAIL_USER = os.environ.get("EMAIL_USER")
EMAIL_PASSWORD = os.environ.get("EMAIL_PASSWORD")

# OTP Configuration
OTP_EXPIRY_MINUTES = int(os.environ.get("OTP_EXPIRY_MINUTES", "10"))
OTP_RATE_LIMIT_PER_HOUR = int(os.environ.get("OTP_RATE_LIMIT_PER_HOUR", "10"))
OTP_MAX_ATTEMPTS = int(os.environ.get("OTP_MAX_ATTEMPTS", "3"))

# Redis Configuration
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

# Domain Whitelisting is handled by the existing AllowedDomain database table
# No environment variable needed - use the admin dashboard to manage domains

# Claude Document AI Configuration (Primary Extraction Method)
CLAUDE_API_KEY = os.environ.get("CLAUDE_API_KEY")
# CRITICAL FIX: Fixed typo in model name (was missing hyphen between 4 and 5)
CLAUDE_MODEL_PRIMARY = os.environ.get("CLAUDE_MODEL_PRIMARY", "claude-sonnet-4-5-20250929")
CLAUDE_MODEL_FALLBACK = os.environ.get("CLAUDE_MODEL_FALLBACK", "claude-opus-4-1-20250805")
CLAUDE_MAX_FILE_SIZE = int(os.environ.get("CLAUDE_MAX_FILE_SIZE", "33554432"))  # 32MB in bytes
CLAUDE_MAX_PAGES = int(os.environ.get("CLAUDE_MAX_PAGES", "100"))
CLAUDE_TIMEOUT_SECONDS = int(os.environ.get("CLAUDE_TIMEOUT_SECONDS", "300"))  # 5 minutes
