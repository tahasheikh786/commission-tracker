from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, and_, or_, cast, Text
from app.db import crud, schemas
from app.config import get_db
from app.db.models import StatementUpload, Company, EarnedCommission, User
from app.dependencies.auth_dependencies import get_current_user_hybrid
from typing import List, Dict, Any, Optional
from uuid import UUID
from decimal import Decimal
from datetime import datetime

router = APIRouter(prefix="/api")

@router.get("/dashboard/stats")
async def get_dashboard_stats(
    environment_id: Optional[UUID] = Query(None, description="Filter by environment ID"),
    view_mode: Optional[str] = Query("my_data", description="View mode: my_data or all_data"),
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """
    Get dashboard statistics:
    - My Data: Shows only current user's data (can be filtered by environment)
    - All Data: Shows all data from users in the same company/organization
    """
    try:
        # Build conditions based on view mode
        base_conditions = []
        
        if view_mode == "all_data":
            # Show all data from the same company (organization)
            if current_user.company_id:
                users_in_company_result = await db.execute(
                    select(User.id).where(User.company_id == current_user.company_id)
                )
                user_ids_in_company = [row[0] for row in users_in_company_result.all()]
                if user_ids_in_company:
                    base_conditions.append(StatementUpload.user_id.in_(user_ids_in_company))
                else:
                    base_conditions.append(StatementUpload.user_id == None)
            else:
                base_conditions.append(StatementUpload.user_id == current_user.id)
        else:
            # My Data: Show only user's own data
            base_conditions.append(StatementUpload.user_id == current_user.id)
        
        # Add environment filter if provided (for both My Data and All Data views)
        if environment_id:
            base_conditions.append(StatementUpload.environment_id == environment_id)
        
        # CRITICAL FIX: Only count statements with valid statuses (Approved or needs_review)
        VALID_STATUSES = ['Approved', 'needs_review']
        
        # Legacy variables for backward compatibility
        user_condition = and_(*base_conditions) if base_conditions else True
        environment_condition = True  # Already handled in base_conditions
        
        # Get total statements count - ONLY finalized statements
        total_statements_result = await db.execute(
            select(func.count(StatementUpload.id))
            .where(and_(
                user_condition,
                StatementUpload.status.in_(VALID_STATUSES)  # Only count finalized statements
            ))
        )
        total_statements = total_statements_result.scalar() or 0

        # Get total carriers count - ONLY from finalized statements
        # NOTE: Use COALESCE to support both old (company_id) and new (carrier_id) data
        # CRITICAL FIX: Exclude user companies (companies that have users) from carrier count
        # CRITICAL FIX: Only count carriers from finalized statements
        # Get distinct carrier IDs first
        if view_mode == "all_data":
            # All Data: Count all unique carriers from users in the same company
            carrier_ids_result = await db.execute(
                select(func.distinct(
                    func.coalesce(StatementUpload.carrier_id, StatementUpload.company_id)
                ))
                .where(and_(
                    user_condition,
                    StatementUpload.status.in_(VALID_STATUSES)  # Only count from finalized statements
                ))
            )
        else:
            # My Data: Count only carriers the user has worked with
            carrier_ids_result = await db.execute(
                select(func.distinct(
                    func.coalesce(StatementUpload.carrier_id, StatementUpload.company_id)
                ))
                .where(and_(
                    user_condition,
                    StatementUpload.status.in_(VALID_STATUSES)  # Only count from finalized statements
                ))
            )
        
        # Filter out user companies (companies that have users)
        all_carrier_ids = [row[0] for row in carrier_ids_result.all() if row[0] is not None]
        
        if all_carrier_ids:
            # Count only companies that have NO users (i.e., are actual carriers)
            carrier_check_result = await db.execute(
                select(Company.id)
                .outerjoin(User, Company.id == User.company_id)
                .where(Company.id.in_(all_carrier_ids))
                .where(User.id.is_(None))  # Only companies with no users (carriers)
            )
            actual_carriers = carrier_check_result.scalars().all()
            total_carriers = len(actual_carriers)
        else:
            total_carriers = 0

        # CRITICAL FIX: Get pending reviews count - only needs_review status
        # Removed 'extracted', 'success' as those are intermediate states that shouldn't be shown
        pending_query = select(func.count(StatementUpload.id)).where(
            and_(
                StatementUpload.status == 'needs_review',  # Only needs_review status
                user_condition,
                environment_condition
            )
        )
        pending_reviews_result = await db.execute(pending_query)
        pending_reviews = pending_reviews_result.scalar() or 0

        # Get approved statements count - only Approved status
        approved_query = select(func.count(StatementUpload.id)).where(
            and_(
                StatementUpload.status == 'Approved',  # Only Approved status
                user_condition,
                environment_condition
            )
        )
        approved_statements_result = await db.execute(approved_query)
        approved_statements = approved_statements_result.scalar() or 0

        # CRITICAL FIX: Rejected statements are no longer stored in DB
        # Set to 0 as we only keep Approved and needs_review
        rejected_statements = 0

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
async def get_all_statements(
    environment_id: Optional[UUID] = Query(None, description="Filter by environment ID"),
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """Get all statements with company information - automatically filters by user data for regular users
    
    CRITICAL: Only returns statements with status 'Approved' or 'needs_review'.
    Pending/processing statements are NOT shown to users.
    """
    try:
        # For admin users, show all statements. For regular users, show only their statements
        is_admin = current_user.role == 'admin'
        
        # CRITICAL FIX: Only show completed statements (Approved or needs_review)
        # Don't show pending, processing, or any other intermediate statuses
        VALID_STATUSES = ['Approved', 'needs_review']
        
        # Build query with user filter
        query = select(StatementUpload, Company.name.label('company_name'))
        query = query.join(Company, StatementUpload.company_id == Company.id)
        
        # CRITICAL: Filter by valid statuses only
        query = query.where(StatementUpload.status.in_(VALID_STATUSES))
        
        # Apply user filter - admin sees all, regular users see only their data
        if not is_admin:
            query = query.where(StatementUpload.user_id == current_user.id)
        
        # Add environment filter if provided
        if environment_id:
            query = query.where(StatementUpload.environment_id == environment_id)
        
        query = query.order_by(StatementUpload.uploaded_at.desc())
        
        result = await db.execute(query)
        statements = result.all()
        
        formatted_statements = []
        for statement, company_name in statements:
            formatted_statements.append({
                "id": str(statement.id),
                "file_name": statement.file_name,
                "gcs_key": statement.file_name,  # file_name IS the gcs_key
                "company_name": company_name,
                "status": statement.status,
                "uploaded_at": statement.uploaded_at.isoformat() if statement.uploaded_at else None,
                "last_updated": statement.last_updated.isoformat() if statement.last_updated else None,
                "completed_at": statement.completed_at.isoformat() if statement.completed_at else None,
                "rejection_reason": statement.rejection_reason,
                "plan_types": statement.plan_types,
                "raw_data": statement.raw_data,
                "edited_tables": statement.edited_tables,
                "final_data": statement.final_data,
                "selected_statement_date": statement.selected_statement_date
            })
        
        return formatted_statements
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching statements: {str(e)}")

@router.get("/dashboard/statements/{status}")
async def get_statements_by_status(
    status: str,
    environment_id: Optional[UUID] = Query(None, description="Filter by environment ID"),
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """Get statements filtered by status - automatically filters by user data
    
    CRITICAL: Only returns finalized statements ('Approved' or 'needs_review').
    Status mapping:
    - 'approved' -> 'Approved' status in DB
    - 'pending' -> 'needs_review' status in DB (awaiting manual review)
    - 'rejected' -> NOT SUPPORTED (we don't store rejected statements)
    
    Pending/processing uploads are NOT shown in ANY view.
    """
    try:
        # CRITICAL FIX: Only allow approved and pending (needs_review) statuses
        # Removed 'rejected' as we don't store rejected statements
        if status not in ['approved', 'pending']:
            raise HTTPException(status_code=400, detail="Invalid status. Must be 'approved' or 'pending'")
        
        # For admin users, show all statements. For regular users, show only their statements
        is_admin = current_user.role == 'admin'
        
        # CRITICAL FIX: Map frontend status to ONLY finalized database statuses
        # 'pending' means needs_review (awaiting manual approval)
        # 'approved' means Approved (auto or manually approved)
        status_mapping = {
            'pending': ['needs_review'],  # Only needs_review, NOT extracted/success/processing
            'approved': ['Approved'],      # Only Approved status
        }
        
        db_statuses = status_mapping.get(status, [])
        
        query = select(StatementUpload, Company.name.label('company_name'))
        query = query.join(Company, StatementUpload.company_id == Company.id)
        query = query.where(StatementUpload.status.in_(db_statuses))
        
        # Apply user filter - admin sees all, regular users see only their data
        if not is_admin:
            query = query.where(StatementUpload.user_id == current_user.id)
        
        # Add environment filter if provided
        if environment_id:
            query = query.where(StatementUpload.environment_id == environment_id)
        
        query = query.order_by(StatementUpload.uploaded_at.desc())
        
        result = await db.execute(query)
        statements = result.all()
        
        formatted_statements = []
        for statement, company_name in statements:
            formatted_statements.append({
                "id": str(statement.id),
                "file_name": statement.file_name,
                "gcs_key": statement.file_name,  # file_name IS the gcs_key
                "company_name": company_name,
                "status": statement.status,
                "uploaded_at": statement.uploaded_at.isoformat() if statement.uploaded_at else None,
                "last_updated": statement.last_updated.isoformat() if statement.last_updated else None,
                "completed_at": statement.completed_at.isoformat() if statement.completed_at else None,
                "rejection_reason": statement.rejection_reason,
                "plan_types": statement.plan_types,
                "raw_data": statement.raw_data,
                "edited_tables": statement.edited_tables,
                "final_data": statement.final_data,
                "selected_statement_date": statement.selected_statement_date
            })
        
        return formatted_statements
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching statements: {str(e)}")

@router.get("/dashboard/carriers")
async def get_carriers_with_statement_counts(
    environment_id: Optional[UUID] = Query(None, description="Filter by environment ID"),
    view_mode: Optional[str] = Query("my_data", description="View mode: my_data or all_data"),
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """
    Get carriers with their statement counts:
    - My Data: Shows only carriers the user has uploaded statements for (can be filtered by environment)
    - All Data: Shows all carriers with data from users in the same company/organization
    """
    try:
        # Base query setup
        # CRITICAL FIX: Only count statements with valid statuses (Approved or needs_review)
        VALID_STATUSES = ['Approved', 'needs_review']
        
        query = select(
            Company.id,
            Company.name,
            func.count(StatementUpload.id).label('statement_count')
        ).outerjoin(StatementUpload, and_(
            or_(
                Company.id == StatementUpload.carrier_id,
                and_(
                    Company.id == StatementUpload.company_id,
                    StatementUpload.carrier_id.is_(None)
                )
            ),
            StatementUpload.status.in_(VALID_STATUSES)  # Only count finalized statements
        ))
        
        # Apply filter based on view mode
        if view_mode == "all_data":
            # Show carriers with data from all users in the same company
            if current_user.company_id:
                users_in_company_result = await db.execute(
                    select(User.id).where(User.company_id == current_user.company_id)
                )
                user_ids_in_company = [row[0] for row in users_in_company_result.all()]
                if user_ids_in_company:
                    query = query.where(
                        or_(
                            StatementUpload.user_id.in_(user_ids_in_company),
                            StatementUpload.id.is_(None)  # Include carriers with no statements
                        )
                    )
            else:
                # User has no company, show only their carriers
                query = query.where(
                    or_(
                        StatementUpload.user_id == current_user.id,
                        StatementUpload.id.is_(None)
                    )
                )
        else:
            # My Data: Show only carriers the user has worked with
            query = query.where(
                or_(
                    StatementUpload.user_id == current_user.id,
                    StatementUpload.id.is_(None)  # Include carriers with no statements (optional)
                )
            )
        
        # Add environment filter if provided (for both My Data and All Data views)
        if environment_id:
            query = query.where(
                or_(
                    StatementUpload.environment_id == environment_id,
                    StatementUpload.id.is_(None)
                )
            )
        
        result = await db.execute(
            query.group_by(Company.id, Company.name).order_by(Company.name)
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
async def get_statements_by_carrier(
    carrier_id: UUID,
    environment_id: Optional[UUID] = Query(None, description="Filter by environment ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get all statements for a specific carrier
    
    CRITICAL: Only returns statements with status 'Approved' or 'needs_review'.
    Pending/processing statements are NOT shown to users.
    """
    try:
        # Get carrier name
        carrier_result = await db.execute(
            select(Company.name).where(Company.id == carrier_id)
        )
        carrier_name = carrier_result.scalar()
        
        if not carrier_name:
            raise HTTPException(status_code=404, detail="Carrier not found")
        
        # CRITICAL FIX: Only show completed statements (Approved or needs_review)
        VALID_STATUSES = ['Approved', 'needs_review']
        
        # Get statements for this carrier
        # NOTE: Support both old (company_id) and new (carrier_id) format
        query = select(StatementUpload).where(
            and_(
                or_(
                    StatementUpload.carrier_id == carrier_id,
                    and_(
                        StatementUpload.company_id == carrier_id,
                        StatementUpload.carrier_id.is_(None)
                    )
                ),
                StatementUpload.status.in_(VALID_STATUSES)  # Only finalized statements
            )
        )
        
        # Add environment filter if provided
        if environment_id:
            query = query.where(StatementUpload.environment_id == environment_id)
        
        result = await db.execute(query.order_by(StatementUpload.uploaded_at.desc()))
        statements = result.scalars().all()
        
        formatted_statements = []
        for statement in statements:
            formatted_statements.append({
                "id": str(statement.id),
                "file_name": statement.file_name,
                "gcs_key": statement.file_name,  # file_name IS the gcs_key
                "company_name": carrier_name,
                "status": statement.status,
                "uploaded_at": statement.uploaded_at.isoformat() if statement.uploaded_at else None,
                "last_updated": statement.last_updated.isoformat() if statement.last_updated else None,
                "completed_at": statement.completed_at.isoformat() if statement.completed_at else None,
                "rejection_reason": statement.rejection_reason,
                "plan_types": statement.plan_types,
                "raw_data": statement.raw_data,
                "edited_tables": statement.edited_tables,
                "final_data": statement.final_data,
                "selected_statement_date": statement.selected_statement_date,
                "field_mapping": statement.field_mapping,
                # ✅ Include automation/validation metadata
                "automated_approval": statement.automated_approval,
                "automation_timestamp": statement.automation_timestamp.isoformat() if statement.automation_timestamp else None,
                "total_amount_match": statement.total_amount_match,
                "extracted_total": float(statement.extracted_total) if statement.extracted_total else None,
                "calculated_total": float(statement.calculated_total) if statement.calculated_total else None,
                "extracted_invoice_total": float(statement.extracted_invoice_total) if statement.extracted_invoice_total else None
            })
        
        return formatted_statements
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching carrier statements: {str(e)}")

@router.get("/dashboard/carriers/{carrier_id}/statements/{status}")
async def get_statements_by_carrier_and_status(
    carrier_id: UUID,
    status: str,
    environment_id: Optional[UUID] = Query(None, description="Filter by environment ID"),
    db: AsyncSession = Depends(get_db)
):
    """Get statements for a specific carrier filtered by status
    
    CRITICAL: Only returns finalized statements ('Approved' or 'needs_review').
    Status mapping:
    - 'approved' -> 'Approved' status in DB
    - 'pending' -> 'needs_review' status in DB (awaiting manual review)
    """
    try:
        # CRITICAL FIX: Only allow approved and pending (needs_review) statuses
        if status not in ['approved', 'pending']:
            raise HTTPException(status_code=400, detail="Invalid status. Must be 'approved' or 'pending'")
        
        # Get carrier name
        carrier_result = await db.execute(
            select(Company.name).where(Company.id == carrier_id)
        )
        carrier_name = carrier_result.scalar()
        
        if not carrier_name:
            raise HTTPException(status_code=404, detail="Carrier not found")
        
        # CRITICAL FIX: Map frontend status to ONLY finalized database statuses
        status_mapping = {
            'pending': ['needs_review'],  # Only needs_review, NOT extracted/success/processing
            'approved': ['Approved'],      # Only Approved status
        }
        
        db_statuses = status_mapping.get(status, [])
        
        # Get statements for this carrier with status filter
        # NOTE: Support both old (company_id) and new (carrier_id) format
        query = select(StatementUpload).where(
            and_(
                or_(
                    StatementUpload.carrier_id == carrier_id,
                    and_(
                        StatementUpload.company_id == carrier_id,
                        StatementUpload.carrier_id.is_(None)
                    )
                ),
                StatementUpload.status.in_(db_statuses)  # Only finalized statements
            )
        )
        
        # Add environment filter if provided
        if environment_id:
            query = query.where(StatementUpload.environment_id == environment_id)
        
        result = await db.execute(query.order_by(StatementUpload.uploaded_at.desc()))
        statements = result.scalars().all()
        
        formatted_statements = []
        for statement in statements:
            formatted_statements.append({
                "id": str(statement.id),
                "file_name": statement.file_name,
                "gcs_key": statement.file_name,  # file_name IS the gcs_key
                "company_name": carrier_name,
                "status": statement.status,
                "uploaded_at": statement.uploaded_at.isoformat() if statement.uploaded_at else None,
                "last_updated": statement.last_updated.isoformat() if statement.last_updated else None,
                "completed_at": statement.completed_at.isoformat() if statement.completed_at else None,
                "rejection_reason": statement.rejection_reason,
                "plan_types": statement.plan_types,
                "raw_data": statement.raw_data,
                "edited_tables": statement.edited_tables,
                "final_data": statement.final_data,
                "selected_statement_date": statement.selected_statement_date,
                "field_mapping": statement.field_mapping,
                # ✅ Include automation/validation metadata
                "automated_approval": statement.automated_approval,
                "automation_timestamp": statement.automation_timestamp.isoformat() if statement.automation_timestamp else None,
                "total_amount_match": statement.total_amount_match,
                "extracted_total": float(statement.extracted_total) if statement.extracted_total else None,
                "calculated_total": float(statement.calculated_total) if statement.calculated_total else None,
                "extracted_invoice_total": float(statement.extracted_invoice_total) if statement.extracted_invoice_total else None
            })
        
        return formatted_statements
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching carrier statements: {str(e)}")

@router.get("/companies/user-specific")
async def get_user_specific_companies(
    environment_id: Optional[UUID] = Query(None, description="Filter by environment ID"),
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """Get carriers that the current user has worked with"""
    try:
        # Get carriers that the user has uploaded statements for
        # NOTE: Support both old (company_id) and new (carrier_id) format
        # Old format: carrier stored in company_id, carrier_id is NULL
        # New format: carrier stored in carrier_id
        
        # Get all unique carrier IDs from both old and new format
        query = select(
            func.coalesce(StatementUpload.carrier_id, StatementUpload.company_id).label('carrier_id')
        ).where(StatementUpload.user_id == current_user.id)
        
        # Add environment filter if provided
        if environment_id:
            query = query.where(StatementUpload.environment_id == environment_id)
        
        user_carriers_result = await db.execute(query.distinct())
        user_carrier_ids = [row[0] for row in user_carriers_result.all() if row[0] is not None]
        
        if not user_carrier_ids:
            return []
        
        # Get company details for user's carriers
        companies_result = await db.execute(
            select(Company.id, Company.name)
            .where(Company.id.in_(user_carrier_ids))
            .order_by(Company.name.asc())
        )
        
        companies = []
        for company_id, company_name in companies_result.all():
            companies.append({
                "id": str(company_id),
                "name": company_name
            })
        
        return companies

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching user-specific companies: {str(e)}")

@router.get("/companies/user-specific/{company_id}/statements")
async def get_user_specific_company_statements(
    company_id: UUID,
    environment_id: Optional[UUID] = Query(None, description="Filter by environment ID"),
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """Get statements for a specific carrier that the current user has uploaded"""
    try:
        # CRITICAL: Only return statements with valid persistent statuses
        from app.constants.statuses import VALID_PERSISTENT_STATUSES
        
        # Get statements for this carrier that the user has uploaded
        # NOTE: Support both old (company_id) and new (carrier_id) format
        query = select(StatementUpload).where(
            and_(
                or_(
                    StatementUpload.carrier_id == company_id,
                    and_(
                        StatementUpload.company_id == company_id,
                        StatementUpload.carrier_id.is_(None)
                    )
                ),
                StatementUpload.user_id == current_user.id,
                StatementUpload.status.in_(VALID_PERSISTENT_STATUSES)  # CRITICAL STATUS FILTER
            )
        )
        
        # Add environment filter if provided
        if environment_id:
            query = query.where(StatementUpload.environment_id == environment_id)
        
        statements_result = await db.execute(query.order_by(StatementUpload.uploaded_at.desc()))
        
        statements = statements_result.scalars().all()
        
        formatted_statements = []
        for statement in statements:
            formatted_statements.append({
                "id": str(statement.id),
                "file_name": statement.file_name,
                "gcs_key": statement.file_name,  # file_name IS the gcs_key
                "uploaded_at": statement.uploaded_at.isoformat() if statement.uploaded_at else None,
                "status": statement.status,
                "carrier_id": str(statement.carrier_id) if statement.carrier_id else None,  # Include carrier_id
                "rejection_reason": statement.rejection_reason,
                "selected_statement_date": statement.selected_statement_date,
                "plan_types": statement.plan_types,  # ✅ FIX: Include plan_types for consistency
                "final_data": statement.final_data,
                "edited_tables": statement.edited_tables,  # Include edited tables for preview
                "field_config": statement.field_config,
                "raw_data": statement.raw_data,
                "field_mapping": statement.field_mapping,  # Include field mapping for review
                # ✅ NEW: Include automation/validation metadata
                "automated_approval": statement.automated_approval,
                "automation_timestamp": statement.automation_timestamp.isoformat() if statement.automation_timestamp else None,
                "total_amount_match": statement.total_amount_match,
                "extracted_total": float(statement.extracted_total) if statement.extracted_total else None,
                "calculated_total": float(statement.calculated_total) if statement.calculated_total else None,
                "extracted_invoice_total": float(statement.extracted_invoice_total) if statement.extracted_invoice_total else None
            })
        
        return formatted_statements

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching user-specific company statements: {str(e)}")

@router.get("/dashboard/earned-commissions")
async def get_all_earned_commissions(
    year: Optional[int] = None,
    environment_id: Optional[UUID] = Query(None, description="Filter by environment ID"),
    view_mode: Optional[str] = Query("my_data", description="View mode: my_data or all_data"),
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """
    Get earned commission data with proper My Data vs All Data logic:
    - My Data: Shows only current user's data (can be filtered by environment)
    - All Data: Shows all data from users in the same company/organization
    """
    try:
        # Build base query
        query = select(EarnedCommission, Company.name.label('carrier_name')).join(
            Company, EarnedCommission.carrier_id == Company.id
        )
        
        # Apply filter based on view mode
        if view_mode == "all_data":
            # Show all data from the same company (organization)
            if current_user.company_id:
                # Get all users from the same company
                users_in_company_result = await db.execute(
                    select(User.id).where(User.company_id == current_user.company_id)
                )
                user_ids_in_company = [row[0] for row in users_in_company_result.all()]
                if user_ids_in_company:
                    query = query.where(EarnedCommission.user_id.in_(user_ids_in_company))
                else:
                    # No users in company, return empty result
                    query = query.where(EarnedCommission.user_id == None)
            else:
                # User has no company, show only their data
                query = query.where(EarnedCommission.user_id == current_user.id)
        else:
            # My Data: Show only user's own data
            query = query.where(EarnedCommission.user_id == current_user.id)
        
        # Apply year filter if provided
        if year is not None:
            query = query.where(EarnedCommission.statement_year == year)
        
        # Apply environment filter if provided (for both My Data and All Data views)
        if environment_id is not None:
            query = query.where(EarnedCommission.environment_id == environment_id)
        
        query = query.order_by(Company.name, EarnedCommission.client_name)
        
        result = await db.execute(query)
        commissions = result.all()
        
        # Get statement counts per carrier from StatementUpload table (approved only)
        # CRITICAL FIX: For non-admin users, count only their statements
        carrier_statement_counts = {}
        unique_carrier_ids = list(set(commission.carrier_id for commission, _ in commissions))
        
        for carrier_id in unique_carrier_ids:
            statement_conditions = [
                or_(
                    StatementUpload.carrier_id == carrier_id,
                    and_(
                        StatementUpload.company_id == carrier_id,
                        StatementUpload.carrier_id.is_(None)
                    )
                ),
                StatementUpload.status.in_(['completed', 'Approved'])
            ]
            
            # Apply filter based on view mode
            if view_mode == "all_data":
                # Show all data from the same company (organization)
                if current_user.company_id:
                    # Get all users from the same company (reuse from earlier)
                    users_in_company_result = await db.execute(
                        select(User.id).where(User.company_id == current_user.company_id)
                    )
                    user_ids_in_company = [row[0] for row in users_in_company_result.all()]
                    if user_ids_in_company:
                        statement_conditions.append(StatementUpload.user_id.in_(user_ids_in_company))
                    else:
                        statement_conditions.append(StatementUpload.user_id == None)
                else:
                    statement_conditions.append(StatementUpload.user_id == current_user.id)
            else:
                # My Data: Show only user's own data
                statement_conditions.append(StatementUpload.user_id == current_user.id)
            
            # Apply environment filter if provided (for both My Data and All Data views)
            if environment_id is not None:
                statement_conditions.append(StatementUpload.environment_id == environment_id)
            
            count_result = await db.execute(
                select(func.count(StatementUpload.id))
                .where(and_(*statement_conditions))
            )
            carrier_statement_counts[carrier_id] = count_result.scalar() or 0
        
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
                "upload_ids": commission.upload_ids or [],
                "approved_statement_count": carrier_statement_counts.get(commission.carrier_id, 0),
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
                "upload_ids": commission.upload_ids or [],
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
async def get_earned_commission_stats(
    year: Optional[int] = None,
    environment_id: Optional[UUID] = Query(None, description="Filter by environment ID"),
    view_mode: Optional[str] = Query("my_data", description="View mode: my_data or all_data"),
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """
    Get earned commission statistics with proper My Data vs All Data logic:
    - My Data: Shows only current user's data (can be filtered by environment)
    - All Data: Shows all data from users in the same company/organization
    """
    try:
        # Build base conditions
        base_conditions = []
        if year is not None:
            base_conditions.append(EarnedCommission.statement_year == year)
        
        # Apply filter based on view mode
        if view_mode == "all_data":
            # Show all data from the same company (organization)
            if current_user.company_id:
                # Get all users from the same company
                users_in_company_result = await db.execute(
                    select(User.id).where(User.company_id == current_user.company_id)
                )
                user_ids_in_company = [row[0] for row in users_in_company_result.all()]
                if user_ids_in_company:
                    base_conditions.append(EarnedCommission.user_id.in_(user_ids_in_company))
                else:
                    # No users in company, return empty result
                    base_conditions.append(EarnedCommission.user_id == None)
            else:
                # User has no company, show only their data
                base_conditions.append(EarnedCommission.user_id == current_user.id)
        else:
            # My Data: Show only user's own data
            base_conditions.append(EarnedCommission.user_id == current_user.id)
        
        # Apply environment filter if provided (for both My Data and All Data views)
        if environment_id is not None:
            base_conditions.append(EarnedCommission.environment_id == environment_id)

        # Get total invoice amounts
        if base_conditions:
            total_invoice_result = await db.execute(
                select(func.sum(EarnedCommission.invoice_total))
                .where(and_(*base_conditions))
            )
        else:
            total_invoice_result = await db.execute(
                select(func.sum(EarnedCommission.invoice_total))
            )
        total_invoice = float(total_invoice_result.scalar() or 0)

        # Get total commission earned
        if base_conditions:
            total_commission_result = await db.execute(
                select(func.sum(EarnedCommission.commission_earned))
                .where(and_(*base_conditions))
            )
        else:
            total_commission_result = await db.execute(
                select(func.sum(EarnedCommission.commission_earned))
            )
        total_commission = float(total_commission_result.scalar() or 0)

        # Get total carriers with commission data
        if base_conditions:
            total_carriers_result = await db.execute(
                select(func.count(func.distinct(EarnedCommission.carrier_id)))
                .where(and_(*base_conditions))
            )
        else:
            total_carriers_result = await db.execute(
                select(func.count(func.distinct(EarnedCommission.carrier_id)))
            )
        total_carriers = total_carriers_result.scalar() or 0

        # Get total companies/clients (normalized names)
        if base_conditions:
            total_companies_result = await db.execute(
                select(func.count(func.distinct(func.lower(func.trim(EarnedCommission.client_name)))))
                .where(and_(*base_conditions))
            )
        else:
            total_companies_result = await db.execute(
                select(func.count(func.distinct(func.lower(func.trim(EarnedCommission.client_name)))))
            )
        total_companies = total_companies_result.scalar() or 0

        # For statement counts, we need to apply the same view_mode logic but to StatementUpload
        statement_conditions = [StatementUpload.status.in_(['completed', 'Approved'])]
        if year is not None:
            # Note: This would require a statement_year field in StatementUpload
            # For now, just count all approved statements
            pass
        
        # Apply view mode filter for statements
        if view_mode == "all_data":
            if current_user.company_id:
                users_in_company_result_stmt = await db.execute(
                    select(User.id).where(User.company_id == current_user.company_id)
                )
                user_ids_in_company_stmt = [row[0] for row in users_in_company_result_stmt.all()]
                if user_ids_in_company_stmt:
                    statement_conditions.append(StatementUpload.user_id.in_(user_ids_in_company_stmt))
                else:
                    statement_conditions.append(StatementUpload.user_id == None)
            else:
                statement_conditions.append(StatementUpload.user_id == current_user.id)
        else:
            statement_conditions.append(StatementUpload.user_id == current_user.id)
        
        # Apply environment filter for statements (for both My Data and All Data views)
        if environment_id is not None:
            statement_conditions.append(StatementUpload.environment_id == environment_id)
        
        total_statements_result = await db.execute(
            select(func.count(StatementUpload.id))
            .where(and_(*statement_conditions))
        )
        total_statements = total_statements_result.scalar() or 0

        return {
            "total_invoice": total_invoice,
            "total_commission": total_commission,
            "total_carriers": total_carriers,
            "total_companies": total_companies,
            "total_statements": total_statements
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching earned commission stats: {str(e)}")

@router.get("/earned-commission/global/stats")
async def get_global_earned_commission_stats(
    year: Optional[int] = None, 
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """Get global earned commission statistics (all data) - requires admin or explicit permission"""
    try:
        # For now, allow all authenticated users to view global data
        # In production, you might want to add additional permission checks
        
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

        # Get total companies/clients (normalized names)
        if year is not None:
            total_companies_result = await db.execute(
                select(func.count(func.distinct(func.lower(func.trim(EarnedCommission.client_name)))))
                .where(EarnedCommission.statement_year == year)
            )
        else:
            total_companies_result = await db.execute(
                select(func.count(func.distinct(func.lower(func.trim(EarnedCommission.client_name)))))
            )
        total_companies = total_companies_result.scalar() or 0

        # Get total approved statements count from StatementUpload table
        total_statements_result = await db.execute(
            select(func.count(StatementUpload.id))
            .where(StatementUpload.status.in_(['completed', 'Approved']))
        )
        total_statements = total_statements_result.scalar() or 0

        return {
            "total_invoice": total_invoice,
            "total_commission": total_commission,
            "total_carriers": total_carriers,
            "total_companies": total_companies,
            "total_statements": total_statements
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching global earned commission stats: {str(e)}")

@router.get("/earned-commission/global/data")
async def get_global_earned_commissions(
    year: Optional[int] = None, 
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """Get global earned commission data (all data) - requires admin or explicit permission"""
    try:
        # For now, allow all authenticated users to view global data
        # In production, you might want to add additional permission checks
        
        # Get all earned commissions (global data)
        commissions = await crud.get_all_earned_commissions(db, year=year)
        
        # Get statement counts per carrier from StatementUpload table (approved only)
        carrier_statement_counts = {}
        unique_carrier_ids = list(set(commission.carrier_id for commission, _ in commissions))
        
        for carrier_id in unique_carrier_ids:
            count_result = await db.execute(
                select(func.count(StatementUpload.id))
                .where(
                    and_(
                        or_(
                            StatementUpload.carrier_id == carrier_id,
                            and_(
                                StatementUpload.company_id == carrier_id,
                                StatementUpload.carrier_id.is_(None)
                            )
                        ),
                        StatementUpload.status.in_(['completed', 'Approved'])
                    )
                )
            )
            carrier_statement_counts[carrier_id] = count_result.scalar() or 0
        
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
                "upload_ids": commission.upload_ids or [],
                "approved_statement_count": carrier_statement_counts.get(commission.carrier_id, 0),
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
        raise HTTPException(status_code=500, detail=f"Error fetching global earned commission data: {str(e)}")

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

        # CRITICAL FIX: Only count commission records that have valid upload_ids
        # This excludes orphaned records from deleted statements
        base_conditions = [
            EarnedCommission.carrier_id == carrier_id,
            EarnedCommission.upload_ids.isnot(None),
            cast(EarnedCommission.upload_ids, Text) != '[]'  # Exclude empty arrays (cast JSON to text for comparison)
        ]
        
        # Get total invoice amounts for this carrier
        total_invoice_result = await db.execute(
            select(func.sum(EarnedCommission.invoice_total))
            .where(and_(*base_conditions))
        )
        total_invoice = float(total_invoice_result.scalar() or 0)

        # Get total commission earned for this carrier
        total_commission_result = await db.execute(
            select(func.sum(EarnedCommission.commission_earned))
            .where(and_(*base_conditions))
        )
        total_commission = float(total_commission_result.scalar() or 0)

        # Get total companies for this carrier
        total_companies_result = await db.execute(
            select(func.count(func.distinct(EarnedCommission.client_name)))
            .where(and_(*base_conditions))
        )
        total_companies = total_companies_result.scalar() or 0

        # Get total statements (unique uploaded files) for this carrier
        # Collect all upload_ids from all records and count unique ones
        upload_ids_result = await db.execute(
            select(EarnedCommission.upload_ids)
            .where(and_(*base_conditions))
        )
        all_upload_ids = set()
        for row in upload_ids_result.all():
            if row[0]:  # upload_ids field
                all_upload_ids.update(row[0])
        total_statements = len(all_upload_ids)

        return {
            "carrier_name": carrier_name,
            "total_invoice": total_invoice,
            "total_commission": total_commission,
            "total_companies": total_companies,
            "total_statements": total_statements
        }
    except Exception as e:
        raise

@router.get("/earned-commission/carrier/user-specific/{carrier_id}/stats")
async def get_user_specific_carrier_earned_commission_stats(
    carrier_id: UUID, 
    year: Optional[int] = None,
    month: Optional[int] = None,
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """Get earned commission statistics for a specific carrier, filtered by user's uploaded statements
    
    Args:
        carrier_id: UUID of the carrier
        year: Optional year filter (e.g., 2025)
        month: Optional month filter (1-12)
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Statistics for the carrier including total invoice, commission, companies, and statements
    """
    try:
        # Get carrier name
        carrier_result = await db.execute(
            select(Company.name).where(Company.id == carrier_id)
        )
        carrier_name = carrier_result.scalar()
        
        if not carrier_name:
            raise HTTPException(status_code=404, detail="Carrier not found")

        # Check if user has uploaded statements for this carrier
        # NOTE: Support both old (company_id) and new (carrier_id) format
        user_carrier_check = await db.execute(
            select(func.count(StatementUpload.id))
            .where(
                and_(
                    or_(
                        StatementUpload.carrier_id == carrier_id,
                        and_(
                            StatementUpload.company_id == carrier_id,
                            StatementUpload.carrier_id.is_(None)
                        )
                    ),
                    StatementUpload.user_id == current_user.id
                )
            )
        )
        user_has_statements = user_carrier_check.scalar() > 0

        if not user_has_statements:
            # User has no statements for this carrier, return zeros
            return {
                "carrier_name": carrier_name,
                "total_invoice": 0.0,
                "total_commission": 0.0,
                "total_companies": 0,
                "total_statements": 0
            }

        # Build query with proper user filtering using the new user_id field
        query_conditions = [
            EarnedCommission.carrier_id == carrier_id,
            EarnedCommission.user_id == current_user.id
        ]
        
        # Add year filter if provided
        if year is not None:
            query_conditions.append(EarnedCommission.statement_year == year)
        
        # Add month filter if provided
        if month is not None:
            query_conditions.append(EarnedCommission.statement_month == month)
        
        # Get all earned commissions for this carrier with filters
        earned_commissions_result = await db.execute(
            select(EarnedCommission)
            .where(and_(*query_conditions))
        )
        earned_commissions = earned_commissions_result.scalars().all()

        # Calculate totals directly
        total_invoice = sum(float(commission.invoice_total or 0) for commission in earned_commissions)
        total_commission = sum(float(commission.commission_earned or 0) for commission in earned_commissions)

        # Get unique companies from user's commission data
        unique_companies = set(commission.client_name for commission in earned_commissions if commission.client_name)
        total_companies = len(unique_companies)
        
        # Get user's statement count for this carrier
        statement_count_result = await db.execute(
            select(func.count(StatementUpload.id))
            .where(
                and_(
                    or_(
                        StatementUpload.carrier_id == carrier_id,
                        and_(
                            StatementUpload.company_id == carrier_id,
                            StatementUpload.carrier_id.is_(None)
                        )
                    ),
                    StatementUpload.user_id == current_user.id
                )
            )
        )
        total_statements = statement_count_result.scalar() or 0

        return {
            "carrier_name": carrier_name,
            "total_invoice": total_invoice,
            "total_commission": total_commission,
            "total_companies": total_companies,
            "total_statements": total_statements,
            "filters_applied": {
                "year": year,
                "month": month
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching user-specific carrier stats: {str(e)}")

@router.get("/earned-commission/carriers")
async def get_carriers_with_commission_data(
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """Get carriers with earned commission data - user-specific for regular users, global for admins"""
    try:
        # For admin users, show all carriers. For regular users, show only carriers they've worked with
        is_admin = current_user.role == 'admin'
        
        # Build query with proper user filtering using the new user_id field
        query = select(
            Company.id, 
            Company.name, 
            func.sum(EarnedCommission.commission_earned).label('total_commission')
        ).join(
            EarnedCommission, Company.id == EarnedCommission.carrier_id
        )
        
        # Add user filter for non-admin users - now using the user_id field directly
        if not is_admin:
            query = query.where(EarnedCommission.user_id == current_user.id)
        
        query = query.group_by(Company.id, Company.name).order_by(
            func.sum(EarnedCommission.commission_earned).desc()
        )
        
        result = await db.execute(query)
        
        carriers = []
        for row in result.all():
            carrier_id = row.id
            
            # Count statements for this carrier
            statement_count_query = select(func.count(StatementUpload.id)).where(
                func.coalesce(StatementUpload.carrier_id, StatementUpload.company_id) == carrier_id
            )
            
            # Add user filter for non-admin users
            if not is_admin:
                statement_count_query = statement_count_query.where(StatementUpload.user_id == current_user.id)
            
            statement_count_result = await db.execute(statement_count_query)
            statement_count = statement_count_result.scalar() or 0
            
            carriers.append({
                "id": str(row.id),
                "name": row.name,
                "total_commission": float(row.total_commission or 0),
                "statement_count": int(statement_count)
            })
        
        return carriers
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching carriers with commission data: {str(e)}")

@router.get("/earned-commission/carriers-detailed")
async def get_carriers_with_detailed_commission_data(
    year: int = None,
    environment_id: Optional[UUID] = Query(None, description="Filter by environment ID"),
    view_mode: Optional[str] = Query("my_data", description="View mode: my_data or all_data"),
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """
    Get carriers with detailed commission data including statement counts:
    - My Data: Shows only carriers the user has commission data for (can be filtered by environment)
    - All Data: Shows all carriers with data from users in the same company/organization
    """
    try:
        # Build base query
        commission_query = select(
            Company.id,
            Company.name,
            func.sum(EarnedCommission.commission_earned).label('total_commission')
        ).join(EarnedCommission, Company.id == EarnedCommission.carrier_id)
        
        # Apply filter based on view mode
        if view_mode == "all_data":
            # Show all data from the same company (organization)
            if current_user.company_id:
                users_in_company_result = await db.execute(
                    select(User.id).where(User.company_id == current_user.company_id)
                )
                user_ids_in_company = [row[0] for row in users_in_company_result.all()]
                if user_ids_in_company:
                    commission_query = commission_query.where(EarnedCommission.user_id.in_(user_ids_in_company))
                else:
                    commission_query = commission_query.where(EarnedCommission.user_id == None)
            else:
                commission_query = commission_query.where(EarnedCommission.user_id == current_user.id)
        else:
            # My Data: Show only user's own data
            commission_query = commission_query.where(EarnedCommission.user_id == current_user.id)
        
        # Filter by year if provided
        if year:
            commission_query = commission_query.where(EarnedCommission.statement_year == year)
        
        # Apply environment filter if provided (for both My Data and All Data views)
        if environment_id:
            commission_query = commission_query.where(EarnedCommission.environment_id == environment_id)
        
        commission_query = commission_query.group_by(Company.id, Company.name).order_by(
            func.sum(EarnedCommission.commission_earned).desc()
        )
        
        result = await db.execute(commission_query)
        
        carriers = []
        for row in result.all():
            carrier_id = row.id
            
            # Count statements for this carrier
            statement_count_query = select(func.count(StatementUpload.id)).where(
                func.coalesce(StatementUpload.carrier_id, StatementUpload.company_id) == carrier_id
            )
            
            # Apply filter based on view mode
            if view_mode == "all_data":
                if current_user.company_id:
                    statement_count_query = statement_count_query.where(StatementUpload.user_id.in_(user_ids_in_company))
                else:
                    statement_count_query = statement_count_query.where(StatementUpload.user_id == current_user.id)
            else:
                statement_count_query = statement_count_query.where(StatementUpload.user_id == current_user.id)
            
            # Apply environment filter if provided (for both My Data and All Data views)
            if environment_id:
                statement_count_query = statement_count_query.where(StatementUpload.environment_id == environment_id)
            
            statement_count_result = await db.execute(statement_count_query)
            statement_count = statement_count_result.scalar() or 0
            
            carriers.append({
                "id": str(carrier_id),
                "name": row.name,
                "total_commission": float(row.total_commission or 0),
                "statement_count": int(statement_count)
            })
        
        return carriers
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching detailed carriers commission data: {str(e)}")

@router.get("/earned-commission/carrier/{carrier_id}/data")
async def get_carrier_commission_data(
    carrier_id: UUID, 
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed commission data for a specific carrier - user-specific for regular users"""
    try:
        # Get carrier name
        carrier_result = await db.execute(
            select(Company.name).where(Company.id == carrier_id)
        )
        carrier_name = carrier_result.scalar()
        
        if not carrier_name:
            raise HTTPException(status_code=404, detail="Carrier not found")

        # Get commission data for this carrier with proper user filtering using the new user_id field
        is_admin = current_user.role == 'admin'
        
        query = select(EarnedCommission).where(EarnedCommission.carrier_id == carrier_id)
        
        # Add user filter for non-admin users - now using the user_id field directly
        if not is_admin:
            query = query.where(EarnedCommission.user_id == current_user.id)
        
        query = query.order_by(EarnedCommission.client_name.asc())
        
        result = await db.execute(query)
        all_commissions = result.scalars().all()
        
        commission_data = []
        for row in all_commissions:
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
async def get_all_commission_data(
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """Get all commission data across all carriers - user-specific for regular users, global for admins"""
    try:
        # Build query with proper user filtering using the new user_id field
        is_admin = current_user.role == 'admin'
        
        query = select(
            EarnedCommission, 
            Company.name.label('carrier_name')
        ).join(
            Company, EarnedCommission.carrier_id == Company.id
        )
        
        # Add user filter for non-admin users - now using the user_id field directly
        if not is_admin:
            query = query.where(EarnedCommission.user_id == current_user.id)
        
        query = query.order_by(Company.name.asc(), EarnedCommission.client_name.asc())
        
        result = await db.execute(query)
        all_results = result.all()
        
        commission_data = []
        for row in all_results:
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
        
        # Check for duplicate company name if client_name is being updated
        if 'client_name' in update_data and update_data['client_name'] != commission.client_name:
            new_client_name = update_data['client_name'].strip()
            
            # Check if another record exists with the same name for this carrier
            existing_result = await db.execute(
                select(EarnedCommission).where(
                    EarnedCommission.carrier_id == commission.carrier_id,
                    EarnedCommission.client_name == new_client_name,
                    EarnedCommission.id != commission_id
                )
            )
            existing_commission = existing_result.scalar_one_or_none()
            
            if existing_commission:
                # Return information about the existing record for merge confirmation
                return {
                    "requires_merge_confirmation": True,
                    "existing_record": {
                        "id": str(existing_commission.id),
                        "client_name": existing_commission.client_name,
                        "invoice_total": float(existing_commission.invoice_total) if existing_commission.invoice_total else 0,
                        "commission_earned": float(existing_commission.commission_earned) if existing_commission.commission_earned else 0,
                        "statement_count": existing_commission.statement_count or 0,
                        "last_updated": existing_commission.last_updated.isoformat() if existing_commission.last_updated else None
                    },
                    "new_data": {
                        "client_name": new_client_name,
                        "invoice_total": update_data.get('invoice_total', 0),
                        "commission_earned": update_data.get('commission_earned', 0)
                    }
                }
        
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

@router.post("/earned-commission/merge")
async def merge_commission_records(merge_data: dict, db: AsyncSession = Depends(get_db)):
    """Merge two commission records"""
    try:
        source_id = UUID(merge_data['source_id'])
        target_id = UUID(merge_data['target_id'])
        
        # Get both records
        source_result = await db.execute(select(EarnedCommission).where(EarnedCommission.id == source_id))
        source_commission = source_result.scalar_one_or_none()
        
        target_result = await db.execute(select(EarnedCommission).where(EarnedCommission.id == target_id))
        target_commission = target_result.scalar_one_or_none()
        
        if not source_commission or not target_commission:
            raise HTTPException(status_code=404, detail="One or both commission records not found")
        
        # Merge data into target record
        # Merge invoice totals
        if source_commission.invoice_total:
            target_invoice = float(target_commission.invoice_total) if target_commission.invoice_total else 0
            source_invoice = float(source_commission.invoice_total)
            target_commission.invoice_total = target_invoice + source_invoice
        
        # Merge commission earned
        if source_commission.commission_earned:
            target_commission_val = float(target_commission.commission_earned) if target_commission.commission_earned else 0
            source_commission_val = float(source_commission.commission_earned)
            target_commission.commission_earned = target_commission_val + source_commission_val
        
        # Merge statement count
        target_commission.statement_count = (target_commission.statement_count or 0) + (source_commission.statement_count or 0)
        
        # Merge upload_ids
        if source_commission.upload_ids:
            target_upload_ids = target_commission.upload_ids or []
            for upload_id in source_commission.upload_ids:
                if upload_id not in target_upload_ids:
                    target_upload_ids.append(upload_id)
            target_commission.upload_ids = target_upload_ids
        
        # Merge monthly commissions
        month_columns = [
            'jan_commission', 'feb_commission', 'mar_commission', 'apr_commission',
            'may_commission', 'jun_commission', 'jul_commission', 'aug_commission',
            'sep_commission', 'oct_commission', 'nov_commission', 'dec_commission'
        ]
        
        for month_col in month_columns:
            if hasattr(source_commission, month_col) and getattr(source_commission, month_col):
                target_value = float(getattr(target_commission, month_col) or 0)
                source_value = float(getattr(source_commission, month_col))
                setattr(target_commission, month_col, target_value + source_value)
        
        # Update target record timestamp
        target_commission.last_updated = datetime.utcnow()
        
        # Delete source record
        await db.delete(source_commission)
        
        await db.commit()
        await db.refresh(target_commission)
        
        return {
            "success": True,
            "message": f"Successfully merged records. Source record deleted, target record updated.",
            "merged_record": {
                "id": str(target_commission.id),
                "client_name": target_commission.client_name,
                "invoice_total": float(target_commission.invoice_total) if target_commission.invoice_total else 0,
                "commission_earned": float(target_commission.commission_earned) if target_commission.commission_earned else 0,
                "statement_count": target_commission.statement_count,
                "last_updated": target_commission.last_updated.isoformat() if target_commission.last_updated else None
            }
        }
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error merging commission records: {str(e)}")

@router.get("/earned-commission/companies-aggregated")
async def get_companies_aggregated(
    year: Optional[int] = None,
    carrier_id: Optional[UUID] = Query(None, description="Filter by specific carrier"),
    environment_id: Optional[UUID] = Query(None, description="Filter by environment ID"),
    view_mode: Optional[str] = Query("my_data", description="View mode: my_data or all_data"),
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """
    Get companies with aggregated commission data across all carriers.
    Each company appears only once with:
    - Total commission across all carriers (or filtered carrier)
    - List of associated carriers
    - Monthly breakdown aggregated across carriers
    """
    try:
        # Build base query conditions
        base_conditions = []
        
        # Apply view mode filter
        if view_mode == "all_data":
            if current_user.company_id:
                users_in_company_result = await db.execute(
                    select(User.id).where(User.company_id == current_user.company_id)
                )
                user_ids_in_company = [row[0] for row in users_in_company_result.all()]
                if user_ids_in_company:
                    base_conditions.append(EarnedCommission.user_id.in_(user_ids_in_company))
                else:
                    base_conditions.append(EarnedCommission.user_id == None)
            else:
                base_conditions.append(EarnedCommission.user_id == current_user.id)
        else:
            # My Data: Show only user's own data
            base_conditions.append(EarnedCommission.user_id == current_user.id)
        
        # Apply year filter
        if year is not None:
            base_conditions.append(EarnedCommission.statement_year == year)
        
        # Apply environment filter
        if environment_id is not None:
            base_conditions.append(EarnedCommission.environment_id == environment_id)
        
        # Apply carrier filter if provided
        if carrier_id is not None:
            base_conditions.append(EarnedCommission.carrier_id == carrier_id)
        
        # Get all commission records with carrier names
        query = select(
            EarnedCommission,
            Company.name.label('carrier_name')
        ).join(
            Company, EarnedCommission.carrier_id == Company.id
        )
        
        if base_conditions:
            query = query.where(and_(*base_conditions))
        
        result = await db.execute(query)
        all_records = result.all()
        
        # Group by company name
        company_data = {}
        for record, carrier_name in all_records:
            client_name = record.client_name
            
            if client_name not in company_data:
                company_data[client_name] = {
                    'client_name': client_name,
                    'carrier_ids': set(),
                    'carrier_names': set(),
                    'invoice_total': 0,
                    'commission_earned': 0,
                    'statement_count': 0,
                    'upload_ids': set(),
                    'monthly_breakdown': {
                        'jan': 0, 'feb': 0, 'mar': 0, 'apr': 0,
                        'may': 0, 'jun': 0, 'jul': 0, 'aug': 0,
                        'sep': 0, 'oct': 0, 'nov': 0, 'dec': 0
                    },
                    'last_updated': None,
                    'created_at': None
                }
            
            # Add carrier info
            company_data[client_name]['carrier_ids'].add(str(record.carrier_id))
            company_data[client_name]['carrier_names'].add(carrier_name)
            
            # Aggregate financial data
            company_data[client_name]['invoice_total'] += float(record.invoice_total or 0)
            company_data[client_name]['commission_earned'] += float(record.commission_earned or 0)
            company_data[client_name]['statement_count'] += record.statement_count or 0
            
            # Aggregate upload IDs
            if record.upload_ids:
                company_data[client_name]['upload_ids'].update(record.upload_ids)
            
            # Aggregate monthly data
            month_mapping = {
                'jan_commission': 'jan', 'feb_commission': 'feb', 'mar_commission': 'mar',
                'apr_commission': 'apr', 'may_commission': 'may', 'jun_commission': 'jun',
                'jul_commission': 'jul', 'aug_commission': 'aug', 'sep_commission': 'sep',
                'oct_commission': 'oct', 'nov_commission': 'nov', 'dec_commission': 'dec'
            }
            
            for db_col, month in month_mapping.items():
                value = getattr(record, db_col) or 0
                company_data[client_name]['monthly_breakdown'][month] += float(value)
            
            # Update timestamps (use most recent)
            if record.last_updated:
                if not company_data[client_name]['last_updated'] or record.last_updated > company_data[client_name]['last_updated']:
                    company_data[client_name]['last_updated'] = record.last_updated
            
            if record.created_at:
                if not company_data[client_name]['created_at'] or record.created_at < company_data[client_name]['created_at']:
                    company_data[client_name]['created_at'] = record.created_at
        
        # Convert to list format
        companies = []
        for client_name, data in company_data.items():
            companies.append({
                'id': f"{client_name}_{list(data['carrier_ids'])[0]}",  # Composite ID for frontend
                'client_name': client_name,
                'carrier_ids': list(data['carrier_ids']),
                'carrier_names': list(data['carrier_names']),
                'carrier_count': len(data['carrier_ids']),
                'invoice_total': data['invoice_total'],
                'commission_earned': data['commission_earned'],
                'statement_count': data['statement_count'],
                'upload_ids': list(data['upload_ids']),
                'monthly_breakdown': data['monthly_breakdown'],
                'last_updated': data['last_updated'].isoformat() if data['last_updated'] else None,
                'created_at': data['created_at'].isoformat() if data['created_at'] else None,
                'statement_year': year,
                'approved_statement_count': data['statement_count']  # For compatibility
            })
        
        # Sort by commission earned (descending)
        companies.sort(key=lambda x: x['commission_earned'], reverse=True)
        
        return companies
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching aggregated companies data: {str(e)}")

 