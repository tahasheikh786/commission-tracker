from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.db import crud, schemas
from app.config import get_db
from app.dependencies.auth_dependencies import get_current_user_hybrid
from app.db.models import User, StatementUpload, Company
from typing import List
from pydantic import BaseModel

class CompanyIds(BaseModel):
    company_ids: List[str]

class CompanyUpdate(BaseModel):
    name: str

router = APIRouter(prefix="/api")

@router.get("/companies/", response_model=List[schemas.Company])
async def list_companies(
    view_mode: str = "my_data",
    environment_id: str = None,
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """Get carrier companies based on view mode and environment"""
    from sqlalchemy import and_, func, distinct
    
    # Build base query for carriers (companies without users)
    base_query = (
        select(Company)
        .outerjoin(User, Company.id == User.company_id)
        .where(User.id.is_(None))  # Only companies with no users (carriers)
    )
    
    # Filter based on view_mode
    if view_mode == "my_data":
        # Show only carriers where user has uploaded statements
        # Optionally filter by environment_id
        statement_filters = [StatementUpload.user_id == current_user.id]
        if environment_id:
            statement_filters.append(StatementUpload.environment_id == environment_id)
        
        # Get distinct carrier IDs from user's statements
        carrier_subquery = (
            select(distinct(StatementUpload.carrier_id))
            .where(and_(*statement_filters))
        )
        
        base_query = base_query.where(Company.id.in_(carrier_subquery))
    
    elif view_mode == "all_data":
        # Show carriers where anyone in user's company has uploaded statements
        if current_user.company_id:
            # Get all user IDs in the same company
            company_users_subquery = select(User.id).where(User.company_id == current_user.company_id)
            
            # Get distinct carrier IDs from company users' statements
            carrier_subquery = (
                select(distinct(StatementUpload.carrier_id))
                .where(StatementUpload.user_id.in_(company_users_subquery))
            )
            
            base_query = base_query.where(Company.id.in_(carrier_subquery))
    
    base_query = base_query.order_by(Company.name)
    result = await db.execute(base_query)
    companies = result.scalars().all()
    return companies

@router.get("/companies/{company_id}", response_model=schemas.Company)
async def get_company(company_id: str, db: AsyncSession = Depends(get_db)):
    company = await crud.get_company_by_id(db, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company

@router.post("/companies/", response_model=schemas.Company)
async def create_company(company: schemas.CompanyCreate, db: AsyncSession = Depends(get_db)):
    db_company = await crud.get_company_by_name(db, name=company.name)
    if db_company:
        raise HTTPException(status_code=400, detail="Company already exists")
    return await crud.create_company(db, company)

@router.delete("/companies/{company_id}")
async def delete_company(
    company_id: str, 
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    company = await crud.get_company_by_id(db, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # SAFETY CHECK: Prevent deletion of user companies (companies that have users)
    result = await db.execute(
        select(User).where(User.company_id == company_id).limit(1)
    )
    has_users = result.scalar_one_or_none()
    if has_users:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a user company. Only carrier companies can be deleted."
        )
    
    # Check if user has permission to delete this company/carrier
    # Non-admin users can only delete companies where ALL statements belong to them
    if current_user.role != "admin":
        # Get all statements for this carrier
        result = await db.execute(
            select(StatementUpload).where(
                or_(
                    StatementUpload.carrier_id == company_id,
                    StatementUpload.company_id == company_id
                )
            )
        )
        all_statements = result.scalars().all()
        
        # Check if ANY statement belongs to another user
        if all_statements:
            other_user_statements = [s for s in all_statements if str(s.user_id) != str(current_user.id)]
            if other_user_statements:
                raise HTTPException(
                    status_code=403, 
                    detail="You cannot delete a carrier that contains data from other users"
                )
        # If no statements exist, user can delete the empty carrier
    
    await crud.delete_company(db, company_id)
    return {"message": "Company deleted successfully"}

@router.delete("/companies/")
async def delete_multiple_companies(
    request: CompanyIds, 
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    company_ids = request.company_ids
    deleted_count = 0
    errors = []
    
    try:
        for company_id in company_ids:
            try:
                # Check if company exists
                company = await crud.get_company_by_id(db, company_id)
                if not company:
                    errors.append(f"Company with ID {company_id} not found")
                    continue
                
                # SAFETY CHECK: Prevent deletion of user companies (companies that have users)
                user_check = await db.execute(
                    select(User).where(User.company_id == company_id).limit(1)
                )
                has_users = user_check.scalar_one_or_none()
                if has_users:
                    errors.append(f"Cannot delete {company.name} - it is a user company, not a carrier")
                    continue
                
                # Check if user has permission to delete this company/carrier
                # Non-admin users can only delete companies where ALL statements belong to them
                if current_user.role != "admin":
                    # Get all statements for this carrier
                    result = await db.execute(
                        select(StatementUpload).where(
                            or_(
                                StatementUpload.carrier_id == company_id,
                                StatementUpload.company_id == company_id
                            )
                        )
                    )
                    all_statements = result.scalars().all()
                    
                    # Check if ANY statement belongs to another user
                    if all_statements:
                        other_user_statements = [s for s in all_statements if str(s.user_id) != str(current_user.id)]
                        if other_user_statements:
                            errors.append(f"Cannot delete carrier {company_id} - contains data from other users")
                            continue
                    # If no statements exist, user can delete the empty carrier
                
                await crud.delete_company(db, company_id)
                deleted_count += 1
            except Exception as e:
                errors.append(f"Failed to delete company with ID {company_id}: {str(e)}")
        
        if errors:
            # Return error response with 400 status code
            raise HTTPException(
                status_code=400, 
                detail=f"Some deletions failed. Deleted: {deleted_count}, Errors: {errors}"
            )
        
        return {"message": f"Successfully deleted {deleted_count} companies"}
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Return error response with 500 status code for unexpected errors
        raise HTTPException(
            status_code=500, 
            detail=f"Transaction failed: {str(e)}"
        )

@router.patch("/companies/{company_id}", response_model=schemas.Company)
async def update_company(company_id: str, update: CompanyUpdate, db: AsyncSession = Depends(get_db)):
    company = await crud.get_company_by_id(db, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    updated_company = await crud.update_company_name(db, company_id, update.name)
    return updated_company
