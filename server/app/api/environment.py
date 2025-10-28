"""
Environment Management API
Handles creating, reading, updating, deleting, and resetting environments
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_
from typing import List
from uuid import UUID
import logging

from app.db.database import get_db
from app.db.models import Environment, User, StatementUpload, EarnedCommission, EditedTable
from app.db.schemas import Environment as EnvironmentSchema, EnvironmentCreate, EnvironmentUpdate
from app.dependencies.auth_dependencies import get_current_user_hybrid as get_current_user
from app.db.crud.environment import (
    get_or_create_default_environment,
    get_environments_by_company,
    create_environment,
    delete_environment as crud_delete_environment,
    get_environment_by_id
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/environments", tags=["Environments"])


@router.post("", response_model=EnvironmentSchema, status_code=status.HTTP_201_CREATED)
async def create_environment_endpoint(
    environment_data: EnvironmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new environment for a company.
    Only users belonging to the company can create environments.
    """
    # Verify user belongs to the company
    if current_user.company_id != environment_data.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only create environments for your own company"
        )
    
    # Use CRUD helper to create environment
    new_environment = await create_environment(
        db=db,
        company_id=environment_data.company_id,
        name=environment_data.name,
        created_by=current_user.id
    )
    
    return new_environment


@router.get("", response_model=List[EnvironmentSchema])
async def list_environments(
    company_id: UUID = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all environments for the current user's company.
    If company_id is provided, filter by that company (user must belong to it).
    Auto-creates a default environment if none exists.
    """
    # Determine which company to query
    target_company_id = company_id if company_id else current_user.company_id
    
    # Verify user has access to this company
    if target_company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view environments for your own company"
        )
    
    # Get environments using CRUD helper
    environments = await get_environments_by_company(db, target_company_id)
    
    # If no environments exist, create a default one
    if not environments:
        logger.info(f"No environments found for company {target_company_id}, creating default environment")
        default_env = await get_or_create_default_environment(
            db=db,
            company_id=target_company_id,
            user_id=current_user.id
        )
        environments = [default_env]
    
    return environments


@router.get("/{environment_id}", response_model=EnvironmentSchema)
async def get_environment(
    environment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get a specific environment by ID.
    User must belong to the environment's company.
    """
    environment = await get_environment_by_id(db, environment_id, current_user.company_id)
    
    if not environment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Environment not found"
        )
    
    return environment


@router.patch("/{environment_id}", response_model=EnvironmentSchema)
async def update_environment(
    environment_id: UUID,
    update_data: EnvironmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update an environment's details (currently only name).
    User must belong to the environment's company.
    """
    result = await db.execute(
        select(Environment).where(Environment.id == environment_id)
    )
    environment = result.scalar_one_or_none()
    
    if not environment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Environment not found"
        )
    
    # Verify user belongs to the environment's company
    if environment.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this environment"
        )
    
    # Update fields
    if update_data.name:
        # Check if new name conflicts with existing environment
        result = await db.execute(
            select(Environment).where(
                and_(
                    Environment.company_id == environment.company_id,
                    Environment.name == update_data.name,
                    Environment.id != environment_id
                )
            )
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Environment '{update_data.name}' already exists for this company"
            )
        
        environment.name = update_data.name
    
    await db.commit()
    await db.refresh(environment)
    
    logger.info(f"Updated environment {environment_id}")
    
    return environment


@router.delete("/{environment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_environment(
    environment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete an environment and all associated data (CASCADE).
    This will delete:
    - All statement_uploads in this environment
    - All earned_commissions in this environment
    - All edited_tables in this environment
    
    User must belong to the environment's company.
    """
    result = await db.execute(
        select(Environment).where(Environment.id == environment_id)
    )
    environment = result.scalar_one_or_none()
    
    if not environment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Environment not found"
        )
    
    # Verify user belongs to the environment's company
    if environment.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this environment"
        )
    
    # Verify user has admin/owner permissions (optional - adjust based on your RBAC)
    if current_user.role not in ['admin', 'owner']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can delete environments"
        )
    
    await db.delete(environment)
    await db.commit()
    
    logger.info(f"Deleted environment {environment_id} and all associated data (CASCADE)")
    
    return None


@router.post("/{environment_id}/reset", status_code=status.HTTP_200_OK)
async def reset_environment(
    environment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Reset an environment by deleting all data but keeping the environment itself.
    This will delete:
    - All statement_uploads in this environment
    - All earned_commissions in this environment
    - All edited_tables in this environment
    
    The environment record itself is preserved for re-use.
    User must belong to the environment's company.
    """
    result = await db.execute(
        select(Environment).where(Environment.id == environment_id)
    )
    environment = result.scalar_one_or_none()
    
    if not environment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Environment not found"
        )
    
    # Verify user belongs to the environment's company
    if environment.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this environment"
        )
    
    # Verify user has admin/owner permissions (optional - adjust based on your RBAC)
    if current_user.role not in ['admin', 'owner']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can reset environments"
        )
    
    # Count items before deletion for logging
    result = await db.execute(
        select(StatementUpload).where(StatementUpload.environment_id == environment_id)
    )
    uploads_count = result.scalars().all()
    
    result = await db.execute(
        select(EarnedCommission).where(EarnedCommission.environment_id == environment_id)
    )
    commissions_count = result.scalars().all()
    
    result = await db.execute(
        select(EditedTable).where(EditedTable.environment_id == environment_id)
    )
    tables_count = result.scalars().all()
    
    # Delete all data in this environment
    await db.execute(
        delete(EditedTable).where(EditedTable.environment_id == environment_id)
    )
    await db.execute(
        delete(EarnedCommission).where(EarnedCommission.environment_id == environment_id)
    )
    await db.execute(
        delete(StatementUpload).where(StatementUpload.environment_id == environment_id)
    )
    
    await db.commit()
    
    logger.info(
        f"Reset environment {environment_id}: deleted {len(uploads_count)} uploads, "
        f"{len(commissions_count)} commissions, {len(tables_count)} tables"
    )
    
    return {
        "message": "Environment reset successfully",
        "deleted_counts": {
            "uploads": len(uploads_count),
            "commissions": len(commissions_count),
            "tables": len(tables_count)
        }
    }


@router.get("/{environment_id}/stats", status_code=status.HTTP_200_OK)
async def get_environment_stats(
    environment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get statistics for an environment (upload count, commission totals, etc.)
    """
    result = await db.execute(
        select(Environment).where(Environment.id == environment_id)
    )
    environment = result.scalar_one_or_none()
    
    if not environment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Environment not found"
        )
    
    # Verify user belongs to the environment's company
    if environment.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this environment"
        )
    
    # Get counts
    result = await db.execute(
        select(StatementUpload).where(StatementUpload.environment_id == environment_id)
    )
    uploads = result.scalars().all()
    
    result = await db.execute(
        select(EarnedCommission).where(EarnedCommission.environment_id == environment_id)
    )
    commissions = result.scalars().all()
    
    # Calculate totals
    total_commission = sum(c.commission_earned for c in commissions)
    total_invoice = sum(c.invoice_total for c in commissions)
    
    approved_uploads = len([u for u in uploads if u.status == 'approved'])
    pending_uploads = len([u for u in uploads if u.status == 'pending'])
    
    return {
        "environment_id": environment_id,
        "environment_name": environment.name,
        "total_uploads": len(uploads),
        "approved_uploads": approved_uploads,
        "pending_uploads": pending_uploads,
        "total_commissions": len(commissions),
        "total_commission_earned": float(total_commission),
        "total_invoice_amount": float(total_invoice)
    }

