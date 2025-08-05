from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from app.db import crud, schemas
from app.config import get_db
from app.db.models import StatementUpload, Company
from typing import List, Dict, Any
from uuid import UUID

router = APIRouter()

@router.get("/dashboard/stats")
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    """Get dashboard statistics for all cards"""
    try:
        # Get total statements count
        total_statements_result = await db.execute(
            select(func.count(StatementUpload.id))
        )
        total_statements = total_statements_result.scalar() or 0

        # Get total carriers count
        total_carriers_result = await db.execute(
            select(func.count(Company.id))
        )
        total_carriers = total_carriers_result.scalar() or 0

        # Get pending reviews count (extracted and success are considered pending for review)
        pending_reviews_result = await db.execute(
            select(func.count(StatementUpload.id))
            .where(StatementUpload.status.in_(['extracted', 'success']))
        )
        pending_reviews = pending_reviews_result.scalar() or 0

        # Get approved statements count (completed and Approved are considered approved)
        approved_statements_result = await db.execute(
            select(func.count(StatementUpload.id))
            .where(StatementUpload.status.in_(['completed', 'Approved']))
        )
        approved_statements = approved_statements_result.scalar() or 0

        # Get rejected statements count (currently none in database)
        rejected_statements_result = await db.execute(
            select(func.count(StatementUpload.id))
            .where(StatementUpload.status == 'rejected')
        )
        rejected_statements = rejected_statements_result.scalar() or 0

        return {
            "total_statements": total_statements,
            "total_carriers": total_carriers,
            "total_premium": None,  # Coming soon
            "policies_count": None,  # Coming soon
            "pending_reviews": pending_reviews,
            "approved_statements": approved_statements,
            "rejected_statements": rejected_statements
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching dashboard stats: {str(e)}")

@router.get("/dashboard/statements")
async def get_all_statements(db: AsyncSession = Depends(get_db)):
    """Get all statements with company information"""
    try:
        # Get all statements with company info
        result = await db.execute(
            select(StatementUpload, Company.name.label('company_name'))
            .join(Company, StatementUpload.company_id == Company.id)
            .order_by(StatementUpload.uploaded_at.desc())
        )
        statements = result.all()
        
        formatted_statements = []
        for statement, company_name in statements:
            formatted_statements.append({
                "id": str(statement.id),
                "file_name": statement.file_name,
                "company_name": company_name,
                "status": statement.status,
                "uploaded_at": statement.uploaded_at.isoformat() if statement.uploaded_at else None,
                "last_updated": statement.last_updated.isoformat() if statement.last_updated else None,
                "completed_at": statement.completed_at.isoformat() if statement.completed_at else None,
                "rejection_reason": statement.rejection_reason,
                "plan_types": statement.plan_types,
                "raw_data": statement.raw_data,
                "edited_tables": statement.edited_tables,
                "final_data": statement.final_data
            })
        
        return formatted_statements
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching statements: {str(e)}")

@router.get("/dashboard/statements/{status}")
async def get_statements_by_status(status: str, db: AsyncSession = Depends(get_db)):
    """Get statements filtered by status (pending, approved, rejected)"""
    try:
        if status not in ['pending', 'approved', 'rejected']:
            raise HTTPException(status_code=400, detail="Invalid status. Must be pending, approved, or rejected")
        
        # Map frontend status to database statuses
        status_mapping = {
            'pending': ['extracted', 'success'],
            'approved': ['completed', 'Approved'],
            'rejected': ['rejected']
        }
        
        db_statuses = status_mapping.get(status, [])
        
        result = await db.execute(
            select(StatementUpload, Company.name.label('company_name'))
            .join(Company, StatementUpload.company_id == Company.id)
            .where(StatementUpload.status.in_(db_statuses))
            .order_by(StatementUpload.uploaded_at.desc())
        )
        statements = result.all()
        
        formatted_statements = []
        for statement, company_name in statements:
            formatted_statements.append({
                "id": str(statement.id),
                "file_name": statement.file_name,
                "company_name": company_name,
                "status": statement.status,
                "uploaded_at": statement.uploaded_at.isoformat() if statement.uploaded_at else None,
                "last_updated": statement.last_updated.isoformat() if statement.last_updated else None,
                "completed_at": statement.completed_at.isoformat() if statement.completed_at else None,
                "rejection_reason": statement.rejection_reason,
                "plan_types": statement.plan_types,
                "raw_data": statement.raw_data,
                "edited_tables": statement.edited_tables,
                "final_data": statement.final_data
            })
        
        return formatted_statements
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching statements: {str(e)}")

@router.get("/dashboard/carriers")
async def get_carriers_with_statement_counts(db: AsyncSession = Depends(get_db)):
    """Get all carriers with their statement counts"""
    try:
        # Get carriers with statement counts
        result = await db.execute(
            select(
                Company.id,
                Company.name,
                func.count(StatementUpload.id).label('statement_count')
            )
            .outerjoin(StatementUpload, Company.id == StatementUpload.company_id)
            .group_by(Company.id, Company.name)
            .order_by(Company.name)
        )
        carriers = result.all()
        
        formatted_carriers = []
        for carrier_id, name, statement_count in carriers:
            formatted_carriers.append({
                "id": str(carrier_id),
                "name": name,
                "statement_count": statement_count or 0
            })
        
        return formatted_carriers
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching carriers: {str(e)}") 