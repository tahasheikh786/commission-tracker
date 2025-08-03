from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ["SUPABASE_DB_KEY"]

engine = create_async_engine(
    DATABASE_URL,
    connect_args={
        "statement_cache_size": 0,
        # Supabase timeout settings for long-running operations
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
