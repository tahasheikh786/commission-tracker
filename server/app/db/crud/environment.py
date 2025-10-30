"""
Environment CRUD operations
Handles creating, reading, updating, deleting environments
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import Environment
from uuid import UUID
from typing import Optional, List
import logging

logger = logging.getLogger(__name__)

async def get_or_create_default_environment(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID
) -> Environment:
    """
    Get or create a default environment for the user.
    This ensures every user always has at least one environment.
    """
    # Check if user's default environment exists
    result = await db.execute(
        select(Environment).where(
            Environment.company_id == company_id,
            Environment.created_by == user_id,
            Environment.name == "Default"
        )
    )
    default_env = result.scalar_one_or_none()
    
    if not default_env:
        # Create default environment for this user
        default_env = Environment(
            company_id=company_id,
            name="Default",
            created_by=user_id
        )
        db.add(default_env)
        await db.commit()
        await db.refresh(default_env)
        logger.info(f"Created default environment {default_env.id} for user {user_id}")
    else:
        logger.info(f"Found existing default environment {default_env.id} for user {user_id}")
    
    return default_env

async def get_environment_by_id(
    db: AsyncSession,
    environment_id: UUID,
    company_id: UUID,
    user_id: UUID
) -> Optional[Environment]:
    """Get environment by ID, ensuring it belongs to the company and was created by the user."""
    result = await db.execute(
        select(Environment).where(
            Environment.id == environment_id,
            Environment.company_id == company_id,
            Environment.created_by == user_id
        )
    )
    return result.scalar_one_or_none()

async def get_environments_by_company(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID
) -> List[Environment]:
    """Get all environments for a user within a company."""
    result = await db.execute(
        select(Environment).where(
            Environment.company_id == company_id,
            Environment.created_by == user_id
        ).order_by(Environment.created_at)
    )
    return result.scalars().all()

async def create_environment(
    db: AsyncSession,
    company_id: UUID,
    name: str,
    created_by: UUID
) -> Environment:
    """Create a new environment."""
    environment = Environment(
        company_id=company_id,
        name=name,
        created_by=created_by
    )
    db.add(environment)
    await db.commit()
    await db.refresh(environment)
    logger.info(f"Created environment {environment.id} ({name}) for company {company_id}")
    return environment

async def delete_environment(
    db: AsyncSession,
    environment_id: UUID,
    company_id: UUID,
    user_id: UUID
) -> bool:
    """Delete an environment if it belongs to the company and was created by the user."""
    result = await db.execute(
        select(Environment).where(
            Environment.id == environment_id,
            Environment.company_id == company_id,
            Environment.created_by == user_id
        )
    )
    environment = result.scalar_one_or_none()
    
    if not environment:
        return False
    
    await db.delete(environment)
    await db.commit()
    logger.info(f"Deleted environment {environment_id} for user {user_id}")
    return True
