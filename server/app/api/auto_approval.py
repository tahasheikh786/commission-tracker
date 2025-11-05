from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import get_db
from app.dependencies.auth_dependencies import get_current_user_hybrid
from app.db.models import User
from typing import Dict, Any
from pydantic import BaseModel
from uuid import UUID
import logging
from datetime import datetime
from app.services.websocket_service import connection_manager

router = APIRouter(prefix="/api/auto-approve", tags=["auto-approval"])
logger = logging.getLogger(__name__)

class AutoApprovalRequest(BaseModel):
    upload_id: str
    carrier_id: str
    learned_format: Dict[str, Any]
    extracted_total: float
    statement_date: str

@router.post("/process")
async def auto_approve_statement(
    request: AutoApprovalRequest,
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """
    Automatically approve a statement based on learned format.
    This endpoint performs all the steps that would normally be done manually:
    1. Apply learned field mappings
    2. Apply learned table corrections (deleted rows/tables)
    3. Calculate commission data
    4. Validate total amount
    5. Save to database
    6. Update format learning usage count
    """
    try:
        logger.info(f"Auto-approval started for upload {request.upload_id}")
        
        # Import services
        from app.services.format_learning_service import FormatLearningService
        from app.db import crud, schemas
        from app.db.crud.carrier_format_learning import update_carrier_format_learning
        from app.utils.db_retry import with_db_retry
        from datetime import datetime
        
        # Emit progress update
        await connection_manager.send_stage_update(
            request.upload_id, 
            'auto_approval_started', 
            10, 
            f"🤖 Starting automated approval for carrier: {request.learned_format.get('carrier_name', 'Unknown')}"
        )
        
        # Get upload record
        upload = await with_db_retry(db, crud.get_upload_by_id, upload_id=request.upload_id)
        if not upload:
            raise HTTPException(status_code=404, detail="Upload not found")
        
        # Verify upload belongs to current user or user has access
        if upload.user_id != current_user.id:
            # Check if user has access to this carrier
            carrier = await with_db_retry(db, crud.get_company_by_id, company_id=request.carrier_id)
            if not carrier:
                raise HTTPException(status_code=403, detail="Access denied")
        
        # Get tables from upload
        tables = upload.raw_data or []
        if not tables:
            raise HTTPException(status_code=400, detail="No tables found in upload")
        
        # Emit progress update
        await connection_manager.send_stage_update(
            request.upload_id, 
            'applying_format', 
            20, 
            "📋 Applying learned format settings..."
        )
        
        # Apply learned format settings
        learned_settings = request.learned_format.get("table_editor_settings", {})
        
        # Apply table deletions
        deleted_tables = learned_settings.get("deleted_tables", []) or learned_settings.get("table_deletions", [])
        if deleted_tables:
            tables = [t for i, t in enumerate(tables) if i not in deleted_tables]
            logger.info(f"Auto-applied table deletions: {len(deleted_tables)} tables removed")
        
        # Apply row deletions to remaining tables
        deleted_rows = learned_settings.get("deleted_rows", []) or learned_settings.get("row_deletions", [])
        if deleted_rows:
            for table in tables:
                rows = table.get("rows", [])
                table["rows"] = [r for i, r in enumerate(rows) if i not in deleted_rows]
            logger.info(f"Auto-applied row deletions: {len(deleted_rows)} rows removed")
        
        # Emit progress update
        await connection_manager.send_stage_update(
            request.upload_id, 
            'saving_tables', 
            40, 
            "💾 Saving processed tables..."
        )
        
        # Step 1: Save tables (same as manual flow)
        from app.api.table_editor import save_tables, SaveTablesRequest, TableData
        
        # Convert raw tables to TableData objects
        table_data_list = []
        for table in tables:
            table_data = TableData(
                header=table.get("headers", table.get("header", [])),
                rows=table.get("rows", []),
                name=table.get("name", ""),
                summaryRows=table.get("summaryRows", []),
                extractor=table.get("extractor", ""),
                metadata=table.get("metadata", {})
            )
            table_data_list.append(table_data)
        
        # Create SaveTablesRequest object
        save_request = SaveTablesRequest(
            upload_id=request.upload_id,
            tables=table_data_list,
            company_id=request.carrier_id,
            selected_statement_date={"date": request.statement_date},
            extracted_carrier=request.learned_format.get("carrier_name"),
            extracted_date=request.statement_date
        )
        
        # Call save_tables with the request object
        save_response = await save_tables(save_request, db=db)
        
        # Emit progress update
        await connection_manager.send_stage_update(
            request.upload_id, 
            'updating_format', 
            60, 
            "🎓 Updating format learning statistics..."
        )
        
        # Step 2: Format learning - increment usage count and update last auto-approved timestamp
        format_service = FormatLearningService()
        
        # Update format learning record
        try:
            # Get the format signature from the learned format
            format_signature = request.learned_format.get("format_signature")
            if format_signature:
                # Update usage count and auto-approval statistics
                await update_carrier_format_learning(
                    db,
                    company_id=request.carrier_id,
                    format_signature=format_signature,
                    updates={
                        "usage_count": request.learned_format.get("usage_count", 1) + 1,
                        "auto_approved_count": (request.learned_format.get("auto_approved_count", 0) or 0) + 1,
                        "last_auto_approved_at": datetime.utcnow(),
                        "last_used": datetime.utcnow()
                    }
                )
                logger.info(f"Updated format learning usage count for signature: {format_signature}")
        except Exception as e:
            logger.warning(f"Failed to update format learning usage count: {e}")
        
        # Emit progress update
        await connection_manager.send_stage_update(
            request.upload_id, 
            'approving_statement', 
            80, 
            "✅ Finalizing approval..."
        )
        
        # Step 3: Apply field mappings and approve
        field_mapping = request.learned_format.get("field_mapping", {})
        
        # Build approval payload
        selected_table = tables[0] if tables else {}
        final_data = [{
            "name": t.get("name", f"Table {i+1}"),
            "header": t.get("header", []),
            "rows": t.get("rows", []),
            "summaryRows": t.get("summaryRows", [])
        } for i, t in enumerate(tables)]
        
        # Call approve endpoint (reuse existing logic)
        from app.api.review import approve_statement, ApprovePayload
        
        # Convert field_mapping dict to list of dicts (if it's a dict)
        field_config_list = []
        if isinstance(field_mapping, dict):
            field_config_list = [{"field": k, "mapping": v} for k, v in field_mapping.items()]
        else:
            field_config_list = field_mapping
        
        # Create ApprovePayload object
        approve_payload = ApprovePayload(
            upload_id=UUID(request.upload_id),
            final_data=final_data,
            field_config=field_config_list,
            plan_types=[],  # Plan types can be detected from learned format if needed
            selected_statement_date={"date": request.statement_date}
        )
        
        # Call approve_statement with the payload object
        approve_response = await approve_statement(approve_payload, db=db)
        
        # Step 4: Calculate total from tables if not provided
        actual_extracted_total = request.extracted_total
        
        # If extracted_total is 0, try to calculate from tables
        if actual_extracted_total == 0 and tables:
            logger.info("Extracted total is 0, attempting to calculate from tables...")
            try:
                # Get field mapping to find commission field
                commission_field = None
                for header, mapped in field_mapping.items():
                    if mapped.lower() in ['commission earned', 'paid amount', 'commission amount', 'total commission']:
                        commission_field = header
                        break
                
                if commission_field:
                    total_amount = 0.0
                    for table in tables:
                        headers = table.get("header", [])
                        if commission_field in headers:
                            idx = headers.index(commission_field)
                            for row in table.get("rows", []):
                                if idx < len(row):
                                    value = str(row[idx]).replace('$', '').replace(',', '').strip()
                                    try:
                                        amount = float(value)
                                        total_amount += amount
                                    except:
                                        pass
                    
                    if total_amount > 0:
                        actual_extracted_total = total_amount
                        logger.info(f"Calculated total from tables: ${actual_extracted_total:.2f}")
            except Exception as e:
                logger.warning(f"Failed to calculate total from tables: {e}")
        
        # Validate total amount
        learned_format = request.learned_format
        table_editor_settings = learned_format.get("table_editor_settings", {})
        learned_total = table_editor_settings.get("statement_total_amount", 0) or learned_format.get("learned_total_amount", 0)
        total_validation = {}
        
        # Round both values to 2 decimal places for comparison to avoid floating point issues
        if learned_total > 0 and actual_extracted_total > 0:
            # Round to 2 decimal places
            learned_total_rounded = round(learned_total, 2)
            extracted_total_rounded = round(actual_extracted_total, 2)
            
            # Calculate percentage difference
            diff_percent = abs(extracted_total_rounded - learned_total_rounded) / learned_total_rounded * 100
            matches = diff_percent <= 5.0  # 5% tolerance
            
            total_validation = {
                "matches": matches,
                "extracted": extracted_total_rounded,
                "expected": learned_total_rounded,
                "difference": abs(extracted_total_rounded - learned_total_rounded),
                "difference_percent": diff_percent
            }
            logger.info(f"Total validation: extracted=${extracted_total_rounded:.2f}, expected=${learned_total_rounded:.2f}, matches={matches}")
        
        # Only mark for review if we have validation data and it doesn't match
        # If no learned total exists, we don't require review based on total
        needs_review = False
        if learned_total > 0 and total_validation:
            needs_review = not total_validation.get("matches", False)
            logger.info(f"Total validation required review: {needs_review}")
        else:
            logger.info(f"No total validation performed - learned_total: {learned_total}, has_validation: {bool(total_validation)}")
        
        # Update upload with automation metadata
        from app.db.schemas import StatementUploadUpdate
        
        update_data = StatementUploadUpdate(
            status="approved" if not needs_review else "needs_review",
            automated_approval=True,  # Set to True for boolean
            automation_timestamp=datetime.utcnow(),
            total_amount_match=True if total_validation.get("matches", False) else False,
            extracted_total=round(actual_extracted_total, 2) if actual_extracted_total else 0,
        )
        
        await with_db_retry(
            db, 
            crud.update_statement_upload, 
            upload_id=request.upload_id,
            update_data=update_data
        )
        
        # Emit final progress update
        await connection_manager.send_stage_update(
            request.upload_id, 
            'auto_approval_complete', 
            100, 
            f"✨ Auto-approval completed successfully!"
        )
        
        logger.info(f"Auto-approval completed for upload {request.upload_id}")
        
        # Get carrier name from table editor settings
        table_editor_settings = request.learned_format.get("table_editor_settings", {})
        carrier_name = table_editor_settings.get("carrier_name") or table_editor_settings.get("corrected_carrier_name")
        
        return {
            "success": True,
            "message": "Statement automatically approved",
            "upload_id": request.upload_id,
            "needs_review": needs_review,
            "total_validation": total_validation,
            "carrier_name": carrier_name,
            "statement_date": request.statement_date,
            "total_amount_match": total_validation.get("matches", False) if total_validation else None,
            "extracted_total": round(actual_extracted_total, 2) if actual_extracted_total else 0
        }
        
    except Exception as e:
        logger.error(f"Auto-approval failed: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        
        # Emit error message
        await connection_manager.send_error(
            request.upload_id,
            f"Auto-approval failed: {str(e)}"
        )
        
        raise HTTPException(status_code=500, detail=f"Auto-approval failed: {str(e)}")
