from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from app.db import crud, schemas
from app.config import get_db
from app.db.models import StatementUpload, Company, EarnedCommission
from typing import List, Dict, Any, Optional
from uuid import UUID
from decimal import Decimal
from datetime import datetime

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

@router.get("/dashboard/carriers/{carrier_id}/statements")
async def get_statements_by_carrier(carrier_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get all statements for a specific carrier"""
    try:
        # Get carrier name
        carrier_result = await db.execute(
            select(Company.name).where(Company.id == carrier_id)
        )
        carrier_name = carrier_result.scalar()
        
        if not carrier_name:
            raise HTTPException(status_code=404, detail="Carrier not found")
        
        # Get statements for this carrier
        result = await db.execute(
            select(StatementUpload)
            .join(Company, StatementUpload.company_id == Company.id)
            .where(Company.id == carrier_id)
            .order_by(StatementUpload.uploaded_at.desc())
        )
        statements = result.scalars().all()
        
        formatted_statements = []
        for statement in statements:
            formatted_statements.append({
                "id": str(statement.id),
                "file_name": statement.file_name,
                "company_name": carrier_name,
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
        raise HTTPException(status_code=500, detail=f"Error fetching carrier statements: {str(e)}")

@router.get("/dashboard/carriers/{carrier_id}/statements/{status}")
async def get_statements_by_carrier_and_status(
    carrier_id: UUID, 
    status: str, 
    db: AsyncSession = Depends(get_db)
):
    """Get statements for a specific carrier filtered by status"""
    try:
        if status not in ['pending', 'approved', 'rejected']:
            raise HTTPException(status_code=400, detail="Invalid status. Must be pending, approved, or rejected")
        
        # Get carrier name
        carrier_result = await db.execute(
            select(Company.name).where(Company.id == carrier_id)
        )
        carrier_name = carrier_result.scalar()
        
        if not carrier_name:
            raise HTTPException(status_code=404, detail="Carrier not found")
        
        # Map frontend status to database statuses
        status_mapping = {
            'pending': ['extracted', 'success', 'pending'],
            'approved': ['completed', 'Approved'],
            'rejected': ['rejected']
        }
        
        db_statuses = status_mapping.get(status, [])
        
        # Get statements for this carrier with status filter
        result = await db.execute(
            select(StatementUpload)
            .join(Company, StatementUpload.company_id == Company.id)
            .where(Company.id == carrier_id)
            .where(StatementUpload.status.in_(db_statuses))
            .order_by(StatementUpload.uploaded_at.desc())
        )
        statements = result.scalars().all()
        
        formatted_statements = []
        for statement in statements:
            formatted_statements.append({
                "id": str(statement.id),
                "file_name": statement.file_name,
                "company_name": carrier_name,
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
        raise HTTPException(status_code=500, detail=f"Error fetching carrier statements: {str(e)}")

@router.get("/dashboard/earned-commissions")
async def get_all_earned_commissions(year: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    """Get all earned commission data with carrier names, optionally filtered by year"""
    try:
        commissions = await crud.get_all_earned_commissions(db, year=year)
        
        formatted_commissions = []
        for commission, carrier_name in commissions:
            formatted_commissions.append({
                "id": str(commission.id),
                "carrier_id": str(commission.carrier_id),
                "carrier_name": carrier_name,
                "client_name": commission.client_name,
                "invoice_total": float(commission.invoice_total),
                "commission_earned": float(commission.commission_earned),
                "statement_count": commission.statement_count,
                "statement_date": commission.statement_date.isoformat() if commission.statement_date else None,
                "statement_month": commission.statement_month,
                "statement_year": commission.statement_year,
                "monthly_breakdown": {
                    "jan": float(commission.jan_commission),
                    "feb": float(commission.feb_commission),
                    "mar": float(commission.mar_commission),
                    "apr": float(commission.apr_commission),
                    "may": float(commission.may_commission),
                    "jun": float(commission.jun_commission),
                    "jul": float(commission.jul_commission),
                    "aug": float(commission.aug_commission),
                    "sep": float(commission.sep_commission),
                    "oct": float(commission.oct_commission),
                    "nov": float(commission.nov_commission),
                    "dec": float(commission.dec_commission)
                },
                "last_updated": commission.last_updated.isoformat() if commission.last_updated else None,
                "created_at": commission.created_at.isoformat() if commission.created_at else None
            })
        
        return formatted_commissions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching earned commissions: {str(e)}")

@router.get("/dashboard/carriers/{carrier_id}/earned-commissions")
async def get_earned_commissions_by_carrier(carrier_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get earned commission data for a specific carrier"""
    try:
        # Verify carrier exists
        carrier_result = await db.execute(
            select(Company.name).where(Company.id == carrier_id)
        )
        carrier_name = carrier_result.scalar()
        
        if not carrier_name:
            raise HTTPException(status_code=404, detail="Carrier not found")
        
        commissions = await crud.get_earned_commissions_by_carrier(db, carrier_id)
        
        formatted_commissions = []
        for commission in commissions:
            formatted_commissions.append({
                "id": str(commission.id),
                "carrier_id": str(commission.carrier_id),
                "carrier_name": carrier_name,
                "client_name": commission.client_name,
                "invoice_total": float(commission.invoice_total),
                "commission_earned": float(commission.commission_earned),
                "statement_count": commission.statement_count,
                "statement_date": commission.statement_date.isoformat() if commission.statement_date else None,
                "statement_month": commission.statement_month,
                "statement_year": commission.statement_year,
                "monthly_breakdown": {
                    "jan": float(commission.jan_commission),
                    "feb": float(commission.feb_commission),
                    "mar": float(commission.mar_commission),
                    "apr": float(commission.apr_commission),
                    "may": float(commission.may_commission),
                    "jun": float(commission.jun_commission),
                    "jul": float(commission.jul_commission),
                    "aug": float(commission.aug_commission),
                    "sep": float(commission.sep_commission),
                    "oct": float(commission.oct_commission),
                    "nov": float(commission.nov_commission),
                    "dec": float(commission.dec_commission)
                },
                "last_updated": commission.last_updated.isoformat() if commission.last_updated else None,
                "created_at": commission.created_at.isoformat() if commission.created_at else None
            })
        
        return formatted_commissions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching carrier earned commissions: {str(e)}")

@router.get("/dashboard/earned-commissions/years")
async def get_available_years(db: AsyncSession = Depends(get_db)):
    """Get all available years for earned commission data"""
    try:
        result = await db.execute(
            select(EarnedCommission.statement_year)
            .where(EarnedCommission.statement_year.isnot(None))
            .distinct()
            .order_by(EarnedCommission.statement_year.desc())
        )
        years = [row[0] for row in result.all() if row[0] is not None]
        return {"years": years}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching available years: {str(e)}")

@router.get("/dashboard/earned-commissions/summary")
async def get_earned_commissions_summary(db: AsyncSession = Depends(get_db)):
    """Get summary statistics for earned commissions"""
    try:
        commissions = await crud.get_all_earned_commissions(db)
        
        total_commission = sum(float(commission.commission_earned) for commission, _ in commissions)
        total_invoice = sum(float(commission.invoice_total) for commission, _ in commissions)
        total_clients = len(set(commission.client_name for commission, _ in commissions))
        total_carriers = len(set(commission.carrier_id for commission, _ in commissions))
        
        return {
            "total_commission_earned": total_commission,
            "total_invoice_amount": total_invoice,
            "total_clients": total_clients,
            "total_carriers": total_carriers,
            "total_records": len(commissions)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching earned commissions summary: {str(e)}")

@router.get("/earned-commission/stats")
async def get_earned_commission_stats(year: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    """Get overall earned commission statistics, optionally filtered by year"""
    try:
        # Get total invoice amounts
        if year is not None:
            total_invoice_result = await db.execute(
                select(func.sum(EarnedCommission.invoice_total))
                .where(EarnedCommission.statement_year == year)
            )
        else:
            total_invoice_result = await db.execute(
                select(func.sum(EarnedCommission.invoice_total))
            )
        total_invoice = float(total_invoice_result.scalar() or 0)

        # Get total commission earned
        if year is not None:
            total_commission_result = await db.execute(
                select(func.sum(EarnedCommission.commission_earned))
                .where(EarnedCommission.statement_year == year)
            )
        else:
            total_commission_result = await db.execute(
                select(func.sum(EarnedCommission.commission_earned))
            )
        total_commission = float(total_commission_result.scalar() or 0)

        # Get total carriers with commission data
        if year is not None:
            total_carriers_result = await db.execute(
                select(func.count(func.distinct(EarnedCommission.carrier_id)))
                .where(EarnedCommission.statement_year == year)
            )
        else:
            total_carriers_result = await db.execute(
                select(func.count(func.distinct(EarnedCommission.carrier_id)))
            )
        total_carriers = total_carriers_result.scalar() or 0

        # Get total companies/clients
        if year is not None:
            total_companies_result = await db.execute(
                select(func.count(func.distinct(EarnedCommission.client_name)))
                .where(EarnedCommission.statement_year == year)
            )
        else:
            total_companies_result = await db.execute(
                select(func.count(func.distinct(EarnedCommission.client_name)))
            )
        total_companies = total_companies_result.scalar() or 0

        return {
            "total_invoice": total_invoice,
            "total_commission": total_commission,
            "total_carriers": total_carriers,
            "total_companies": total_companies
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching earned commission stats: {str(e)}")

@router.get("/earned-commission/carrier/{carrier_id}/stats")
async def get_carrier_earned_commission_stats(carrier_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get earned commission statistics for a specific carrier"""
    try:
        # Get carrier name
        carrier_result = await db.execute(
            select(Company.name).where(Company.id == carrier_id)
        )
        carrier_name = carrier_result.scalar()
        
        if not carrier_name:
            raise HTTPException(status_code=404, detail="Carrier not found")

        # Get total invoice amounts for this carrier
        total_invoice_result = await db.execute(
            select(func.sum(EarnedCommission.invoice_total))
            .where(EarnedCommission.carrier_id == carrier_id)
        )
        total_invoice = float(total_invoice_result.scalar() or 0)

        # Get total commission earned for this carrier
        total_commission_result = await db.execute(
            select(func.sum(EarnedCommission.commission_earned))
            .where(EarnedCommission.carrier_id == carrier_id)
        )
        total_commission = float(total_commission_result.scalar() or 0)

        # Get total companies for this carrier
        total_companies_result = await db.execute(
            select(func.count(func.distinct(EarnedCommission.client_name)))
            .where(EarnedCommission.carrier_id == carrier_id)
        )
        total_companies = total_companies_result.scalar() or 0

        # Get total statements for this carrier
        total_statements_result = await db.execute(
            select(func.sum(EarnedCommission.statement_count))
            .where(EarnedCommission.carrier_id == carrier_id)
        )
        total_statements = total_statements_result.scalar() or 0

        return {
            "carrier_name": carrier_name,
            "total_invoice": total_invoice,
            "total_commission": total_commission,
            "total_companies": total_companies,
            "total_statements": total_statements
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching carrier earned commission stats: {str(e)}")

@router.get("/earned-commission/carriers")
async def get_carriers_with_commission_data(db: AsyncSession = Depends(get_db)):
    """Get all carriers that have earned commission data"""
    try:
        result = await db.execute(
            select(Company.id, Company.name, func.sum(EarnedCommission.commission_earned).label('total_commission'))
            .join(EarnedCommission, Company.id == EarnedCommission.carrier_id)
            .group_by(Company.id, Company.name)
            .order_by(Company.name.asc())
        )
        
        carriers = []
        for row in result.all():
            carriers.append({
                "id": str(row.id),
                "name": row.name,
                "total_commission": float(row.total_commission or 0)
            })
        
        return carriers
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching carriers with commission data: {str(e)}")

@router.get("/earned-commission/carrier/{carrier_id}/data")
async def get_carrier_commission_data(carrier_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get detailed commission data for a specific carrier"""
    try:
        # Get carrier name
        carrier_result = await db.execute(
            select(Company.name).where(Company.id == carrier_id)
        )
        carrier_name = carrier_result.scalar()
        
        if not carrier_name:
            raise HTTPException(status_code=404, detail="Carrier not found")

        # Get commission data for this carrier
        result = await db.execute(
            select(EarnedCommission)
            .where(EarnedCommission.carrier_id == carrier_id)
            .order_by(EarnedCommission.client_name.asc())
        )
        
        commission_data = []
        for row in result.scalars().all():
            commission_data.append({
                "id": str(row.id),
                "client_name": row.client_name,
                "invoice_total": float(row.invoice_total or 0),
                "commission_earned": float(row.commission_earned or 0),
                "statement_count": row.statement_count,
                "last_updated": row.last_updated.isoformat() if row.last_updated else None,
                "created_at": row.created_at.isoformat() if row.created_at else None
            })
        
        return {
            "carrier_name": carrier_name,
            "commission_data": commission_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching carrier commission data: {str(e)}")

@router.get("/earned-commission/all-data")
async def get_all_commission_data(db: AsyncSession = Depends(get_db)):
    """Get all commission data across all carriers"""
    try:
        result = await db.execute(
            select(EarnedCommission, Company.name.label('carrier_name'))
            .join(Company, EarnedCommission.carrier_id == Company.id)
            .order_by(Company.name.asc(), EarnedCommission.client_name.asc())
        )
        
        commission_data = []
        for row in result.all():
            commission_data.append({
                "id": str(row.EarnedCommission.id),
                "carrier_name": row.carrier_name,
                "client_name": row.EarnedCommission.client_name,
                "invoice_total": float(row.EarnedCommission.invoice_total or 0),
                "commission_earned": float(row.EarnedCommission.commission_earned or 0),
                "statement_count": row.EarnedCommission.statement_count,
                "last_updated": row.EarnedCommission.last_updated.isoformat() if row.EarnedCommission.last_updated else None,
                "created_at": row.EarnedCommission.created_at.isoformat() if row.EarnedCommission.created_at else None
            })
        
        return commission_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching all commission data: {str(e)}")

@router.put("/earned-commission/{commission_id}")
async def update_commission_data(commission_id: UUID, update_data: dict, db: AsyncSession = Depends(get_db)):
    """Update commission data for a specific record"""
    try:
        # Get the commission record
        result = await db.execute(
            select(EarnedCommission).where(EarnedCommission.id == commission_id)
        )
        commission = result.scalar_one_or_none()
        
        if not commission:
            raise HTTPException(status_code=404, detail="Commission record not found")
        
        # Update the fields
        if 'client_name' in update_data:
            commission.client_name = update_data['client_name']
        if 'invoice_total' in update_data:
            commission.invoice_total = Decimal(str(update_data['invoice_total']))
        if 'commission_earned' in update_data:
            commission.commission_earned = Decimal(str(update_data['commission_earned']))
        
        # Update the last_updated timestamp
        commission.last_updated = datetime.utcnow()
        
        await db.commit()
        await db.refresh(commission)
        
        return {
            "id": str(commission.id),
            "client_name": commission.client_name,
            "invoice_total": float(commission.invoice_total),
            "commission_earned": float(commission.commission_earned),
            "statement_count": commission.statement_count,
            "last_updated": commission.last_updated.isoformat() if commission.last_updated else None,
            "created_at": commission.created_at.isoformat() if commission.created_at else None
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating commission data: {str(e)}")

 