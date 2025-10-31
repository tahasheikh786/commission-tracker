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
    # First check if ANY Default environment exists for the company
    # This handles the current production constraint: UNIQUE(company_id, name)
    result = await db.execute(
        select(Environment).where(
            Environment.company_id == company_id,
            Environment.name == "Default"
        )
    )
    default_env = result.scalar_one_or_none()
    
    if not default_env:
        # No Default environment exists for the company, create one
        try:
            default_env = Environment(
                company_id=company_id,
                name="Default",
                created_by=user_id
            )
            db.add(default_env)
            await db.commit()
            await db.refresh(default_env)
            logger.info(f"Created default environment {default_env.id} for company {company_id} by user {user_id}")
        except Exception as e:
            # If we get a unique constraint error, another user created it concurrently
            logger.warning(f"Failed to create default environment: {e}")
            await db.rollback()
            
            # Try to fetch it again
            result = await db.execute(
                select(Environment).where(
                    Environment.company_id == company_id,
                    Environment.name == "Default"
                )
            )
            default_env = result.scalar_one_or_none()
            
            if not default_env:
                # If still not found, raise the original error
                raise
    else:
        logger.info(f"Found existing default environment {default_env.id} for company {company_id}")
    
    # Note: With the current production constraint, all users in a company share the same Default environment
    # This will change once migration 002_update_environment_constraint.py is run
    
    return default_env

async def get_environment_by_id(
    db: AsyncSession,
    environment_id: UUID,
    company_id: UUID,
    user_id: UUID
) -> Optional[Environment]:
    """Get environment by ID, ensuring it belongs to the company."""
    # First try to get environment created by the user
    result = await db.execute(
        select(Environment).where(
            Environment.id == environment_id,
            Environment.company_id == company_id,
            Environment.created_by == user_id
        )
    )
    env = result.scalar_one_or_none()
    
    if env:
        return env
    
    # If not found and it's a Default environment, check if it's the shared company Default
    # This handles the current production constraint where Default is shared
    result = await db.execute(
        select(Environment).where(
            Environment.id == environment_id,
            Environment.company_id == company_id,
            Environment.name == "Default"
        )
    )
    env = result.scalar_one_or_none()
    
    if env:
        logger.info(f"User {user_id} accessing shared Default environment {env.id} for company {company_id}")
    
    return env

async def get_environments_by_company(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID
) -> List[Environment]:
    """Get all environments for a user within a company."""
    # TODO: After migration 002 is applied, this should filter by created_by
    # For now, with the current production constraint, we need to show all company environments
    # but prioritize user's own environments
    
    # Get all environments for the company
    result = await db.execute(
        select(Environment).where(
            Environment.company_id == company_id
        ).order_by(
            # Order by creation date
            Environment.created_at
        )
    )
    environments = result.scalars().all()
    
    # If the user has no environments but company has a Default, include it
    user_envs = [env for env in environments if env.created_by == user_id]
    if not user_envs:
        # Include the company's Default environment if it exists
        default_env = next((env for env in environments if env.name == "Default"), None)
        if default_env:
            return [default_env]
        return []
    
    return user_envs

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
