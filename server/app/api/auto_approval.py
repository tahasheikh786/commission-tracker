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
    # CRITICAL: Add all upload metadata since DB record doesn't exist yet
    upload_metadata: Dict[str, Any]  # Contains all data from extraction
    raw_data: list  # The extracted tables
    document_metadata: Dict[str, Any] = {}  # Carrier, date, etc.
    format_learning: Dict[str, Any] = {}  # Format learning data

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
        
        # CRITICAL CHANGE: No DB record exists yet!
        # Get tables from request data instead of DB
        tables = request.raw_data or []
        if not tables:
            raise HTTPException(status_code=400, detail="No tables found in request")
        
        # Verify user has access to this carrier
        carrier = await with_db_retry(db, crud.get_company_by_id, company_id=request.carrier_id)
        if not carrier:
            raise HTTPException(status_code=403, detail="Carrier not found")
        
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
        
        # CRITICAL FIX: Filter out summary tables BEFORE saving to prevent duplicate calculations
        summary_table_types = ['summary_table', 'total_summary', 'vendor_total', 'grand_total', 'summary']
        
        commission_tables = []
        for i, t in enumerate(tables):
            table_type = t.get("table_type", "").lower()
            
            # Skip summary tables
            if table_type in summary_table_types:
                logger.info(f"🔍 Auto-approval: Skipping summary table {i} (type: {table_type}) during save")
                continue
            
            # Also skip tables where ALL rows are marked as summary rows
            summary_rows = set(t.get("summaryRows", []))
            total_rows = len(t.get("rows", []))
            if total_rows > 0 and len(summary_rows) == total_rows:
                logger.info(f"🔍 Auto-approval: Skipping table {i} - all {total_rows} rows are summary rows during save")
                continue
            
            commission_tables.append(t)
        
        logger.info(f"🔍 Auto-approval: Filtered {len(tables)} tables to {len(commission_tables)} commission tables for saving")
        
        # Step 1: Save tables (same as manual flow)
        from app.api.table_editor import save_tables, SaveTablesRequest, TableData
        
        # Convert filtered commission tables to TableData objects
        table_data_list = []
        for table in commission_tables:
            table_data = TableData(
                header=table.get("headers", table.get("header", [])),
                rows=table.get("rows", []),
                name=table.get("name", ""),
                summaryRows=table.get("summaryRows", []),
                extractor=table.get("extractor", ""),
                metadata=table.get("metadata", {})
            )
            table_data_list.append(table_data)
        
        # Get field_mapping from learned format and convert to field_config list
        field_mapping = request.learned_format.get("field_mapping", {})
        logger.info(f"🤖 Auto-approval: Raw field_mapping from learned format: {field_mapping}")
        
        field_config_list = []
        if isinstance(field_mapping, dict):
            field_config_list = [{"field": k, "mapping": v} for k, v in field_mapping.items()]
        elif isinstance(field_mapping, list):
            field_config_list = field_mapping
        
        logger.info(f"🤖 Auto-approval: Using {len(field_config_list)} field mappings from learned format")
        logger.info(f"🤖 Auto-approval: Field config list: {field_config_list}")
        
        # Create SaveTablesRequest object
        save_request = SaveTablesRequest(
            upload_id=request.upload_id,
            tables=table_data_list,
            company_id=request.carrier_id,
            selected_statement_date={"date": request.statement_date},
            extracted_carrier=request.learned_format.get("carrier_name"),
            extracted_date=request.statement_date,
            field_config=field_config_list  # Include field_config for format learning
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
        # Note: field_config_list is already created above from learned format
        # Note: commission_tables was already filtered above in Step 1
        
        # Build approval payload using filtered commission tables from Step 1
        selected_table = commission_tables[0] if commission_tables else {}
        final_data = [{
            "name": t.get("name", f"Table {i+1}"),
            "header": t.get("headers", []) or t.get("header", []),  # ✅ CURSOR FIX: Support both keys
            "rows": t.get("rows", []),
            "summaryRows": t.get("summaryRows", []) or t.get("summary_rows", [])  # ✅ CURSOR FIX: Support both keys
        } for i, t in enumerate(commission_tables)]
        
        # Call approve endpoint (reuse existing logic)
        from app.api.review import approve_statement, ApprovePayload
        
        # Create ApprovePayload object
        # CRITICAL FIX: Include upload_metadata so the approval can create the DB record
        approve_payload = ApprovePayload(
            upload_id=UUID(request.upload_id),
            final_data=final_data,
            field_config=field_config_list,
            plan_types=[],  # Plan types can be detected from learned format if needed
            selected_statement_date={"date": request.statement_date},
            upload_metadata=request.upload_metadata,  # CRITICAL: Pass metadata for DB record creation
            document_metadata=request.document_metadata  # ✅ CRITICAL: Pass document_metadata for total validation
        )
        
        # Call approve_statement with the payload object
        # ✅ CRITICAL FIX: Pass current_user to avoid 'Depends' object error
        approve_response = await approve_statement(approve_payload, db=db, current_user=current_user)
        
        # NOTE: Filename normalization is handled by approve_statement
        # The old filename normalization code that was here has been removed
        # because it referenced an undefined 'upload' variable
        
        # Step 4: Get extracted total from document (from Claude) and calculate from tables
        actual_extracted_total = request.extracted_total
        
        # Convert field_config_list to dict for easier lookup (needed for total calculation and saving)
        field_mapping = {item['field']: item['mapping'] for item in field_config_list if 'field' in item and 'mapping' in item}
        
        # ✅ NEW: Fallback to learned total if extracted_total not provided
        if actual_extracted_total == 0:
            # Try to get from learned format
            table_editor_settings = request.learned_format.get("table_editor_settings", {})
            learned_total = table_editor_settings.get("statement_total_amount", 0)
            
            if learned_total:
                actual_extracted_total = learned_total
                logger.info(f"Using learned total from format: ${actual_extracted_total:.2f}")
            else:
                logger.warning("❌ No extracted total available - cannot validate")
        
        # ✅ Calculate commission from tables (for comparison only)
        calculated_total = 0.0
        commission_field = None
        
        # Find commission field from field mapping
        # ✅ CRITICAL: Be precise - don't match "Commission Rate", only match actual earned commission fields
        commission_field_candidates = [
            "commission earned", "commission_earned",
            "paid amount", "paid_amount", 
            "commission amount", "commission_amount",
            "total commission paid", "earned commission"
        ]
        
        # ✅ Exclude rate/percentage fields - these are NOT commission earned amounts
        excluded_fields = ['commission rate', 'commission_rate', 'rate', 'percentage', 'agent rate', 'agent %', 'agent percent']
        
        for header, mapped in field_mapping.items():
            # Normalize the mapped value: replace spaces/underscores, lowercase
            normalized_mapped = mapped.lower().replace("_", " ").strip()
            
            # Skip if this is a rate/percentage field
            if any(excluded in normalized_mapped for excluded in excluded_fields):
                logger.info(f"  ⏭️ Auto-approval: Skipping rate field: '{header}' -> '{mapped}'")
                continue
            
            # Check if any candidate matches the normalized value
            if any(candidate.replace("_", " ") == normalized_mapped for candidate in commission_field_candidates):
                commission_field = header
                logger.info(f"💰 Auto-approval: Found commission field: '{commission_field}' (mapped to '{mapped}')")
                break
        
        if commission_field:
            logger.info(f"💰 Auto-approval: Calculating total from {len(commission_tables)} table(s)")
            for table_idx, table in enumerate(commission_tables):
                # ✅ CURSOR FIX: Support both "headers" (plural) and "header" (singular) keys
                headers = table.get("headers", []) or table.get("header", [])
                logger.info(f"💰 Auto-approval: Table {table_idx}: Found {len(headers)} headers")
                
                if commission_field in headers:
                    idx = headers.index(commission_field)
                    logger.info(f"💰 Auto-approval: Commission field '{commission_field}' found at index {idx}")
                    
                    # ✅ CURSOR FIX: Support both "summaryRows" (camelCase) and "summary_rows" (snake_case)
                    summary_rows = set(table.get("summaryRows", []) or table.get("summary_rows", []))
                    rows = table.get("rows", [])
                    logger.info(f"💰 Auto-approval: Table has {len(rows)} rows, {len(summary_rows)} summary rows to skip")
                    
                    row_count = 0
                    for row_idx, row in enumerate(rows):
                        # ✅ Skip summary rows when calculating
                        if row_idx in summary_rows:
                            logger.debug(f"💰 Auto-approval: Skipping summary row {row_idx}")
                            continue
                            
                        if idx < len(row):
                            value = str(row[idx]).strip()
                            try:
                                # ✅ Handle negative numbers in parentheses format: ($141.14) = -141.14
                                is_negative = value.startswith('(') and value.endswith(')')
                                if is_negative:
                                    value = value[1:-1]  # Remove parentheses
                                
                                # Remove currency symbols and commas
                                value = value.replace("$", "").replace(",", "").strip()
                                amount = float(value)
                                
                                # Apply negative sign if needed
                                if is_negative:
                                    amount = -amount
                                
                                calculated_total += amount
                                row_count += 1
                                logger.debug(f"💰 Auto-approval: Row {row_idx}: Added ${amount:.2f} (running total: ${calculated_total:.2f})")
                            except Exception as e:
                                logger.warning(f"💰 Auto-approval: Row {row_idx}: Failed to parse value '{row[idx]}': {e}")
                    
                    logger.info(f"💰 Auto-approval: Processed {row_count} data rows from table {table_idx}")
                else:
                    logger.warning(f"💰 Auto-approval: Commission field '{commission_field}' NOT found in table {table_idx} headers: {headers}")
        else:
            logger.error(f"💰 Auto-approval: No commission field identified in field_mapping: {field_mapping}")
        
        # ✅ NEW: Calculate invoice total from tables
        calculated_invoice_total = 0.0
        invoice_field = None
        
        # Find invoice total field from field mapping
        invoice_field_candidates = [
            "invoice total", "invoice_total",
            "total invoice", "total_invoice",
            "premium amount", "premium_amount",
            "premium"
        ]
        
        # ✅ Exclude non-invoice fields
        excluded_invoice_fields = ['stoploss', 'commission', 'paid amount', 'rate']
        
        for header, mapped in field_mapping.items():
            # Normalize the mapped value: replace spaces/underscores, lowercase
            normalized_mapped = mapped.lower().replace("_", " ").strip()
            
            # Skip if this is an excluded field
            if any(excluded in normalized_mapped for excluded in excluded_invoice_fields):
                continue
            
            # Check exact match first for "invoice total"
            if normalized_mapped == "invoice total":
                invoice_field = header
                logger.info(f"💰 Auto-approval: Found invoice field (exact match): '{invoice_field}' (mapped to '{mapped}')")
                break
            
            # Then check other candidates
            if any(candidate.replace("_", " ") == normalized_mapped for candidate in invoice_field_candidates):
                invoice_field = header
                logger.info(f"💰 Auto-approval: Found invoice field: '{invoice_field}' (mapped to '{mapped}')")
                break
        
        if invoice_field:
            logger.info(f"💰 Auto-approval: Calculating invoice total from {len(commission_tables)} table(s)")
            for table_idx, table in enumerate(commission_tables):
                headers = table.get("headers", []) or table.get("header", [])
                
                if invoice_field in headers:
                    idx = headers.index(invoice_field)
                    logger.info(f"💰 Auto-approval: Invoice field '{invoice_field}' found at index {idx}")
                    
                    summary_rows = set(table.get("summaryRows", []) or table.get("summary_rows", []))
                    rows = table.get("rows", [])
                    
                    row_count = 0
                    for row_idx, row in enumerate(rows):
                        # ✅ Skip summary rows when calculating
                        if row_idx in summary_rows:
                            continue
                            
                        if idx < len(row):
                            value = str(row[idx]).strip()
                            try:
                                # ✅ Handle negative numbers in parentheses format: ($627.27) = -627.27
                                is_negative = value.startswith('(') and value.endswith(')')
                                if is_negative:
                                    value = value[1:-1]  # Remove parentheses
                                
                                # Remove currency symbols and commas
                                value = value.replace("$", "").replace(",", "").strip()
                                amount = float(value)
                                
                                # Apply negative sign if needed
                                if is_negative:
                                    amount = -amount
                                
                                calculated_invoice_total += amount
                                row_count += 1
                            except Exception as e:
                                logger.warning(f"💰 Auto-approval: Row {row_idx}: Failed to parse invoice value '{row[idx]}': {e}")
                    
                    logger.info(f"💰 Auto-approval: Processed {row_count} invoice rows from table {table_idx}")
                else:
                    logger.warning(f"💰 Auto-approval: Invoice field '{invoice_field}' NOT found in table {table_idx} headers: {headers}")
        else:
            logger.warning(f"💰 Auto-approval: No invoice field identified in field_mapping: {field_mapping}")
        
        logger.info(f"Total validation:")
        logger.info(f"  - Extracted from file: ${actual_extracted_total:.2f}")
        logger.info(f"  - Calculated from table: ${calculated_total:.2f}")
        logger.info(f"  - Invoice total calculated: ${calculated_invoice_total:.2f}")
        
        # ✅ Validate: Extracted total should match calculated total
        total_validation = {}
        if actual_extracted_total > 0:
            difference = abs(actual_extracted_total - calculated_total)
            difference_percent = (difference / actual_extracted_total) * 100
            
            matches = difference_percent < 5.0  # 5% tolerance
            
            total_validation = {
                "matches": matches,
                "extracted": round(actual_extracted_total, 2),
                "calculated": round(calculated_total, 2),
                "difference": round(difference, 2),
                "difference_percent": round(difference_percent, 2)
            }
            
            logger.info(f"  - Match: {matches} (difference: {difference_percent:.2f}%)")
            
            # ✅ Set needs_review if totals don't match
            needs_review = not matches
        else:
            needs_review = False
            logger.warning("No extracted total - skipping validation")
        
        # ✅ FIX: The DB record was already created by approve_statement() above (line 241)
        # We just need to retrieve it and update it if needed
        from app.db.models import StatementUpload as StatementUploadModel
        from sqlalchemy import select
        
        # Get the upload record that was created by approve_statement
        result = await db.execute(
            select(StatementUploadModel).where(StatementUploadModel.id == UUID(request.upload_id))
        )
        db_upload = result.scalar_one_or_none()
        
        if not db_upload:
            raise HTTPException(status_code=500, detail="Upload record not found after approval")
        
        # Update the record with additional auto-approval metadata
        db_upload.automated_approval = True
        db_upload.automation_timestamp = datetime.utcnow()
        db_upload.total_amount_match = total_validation.get("matches", False) if total_validation else None
        # ✅ FIX: extracted_total should be the CALCULATED total from table rows, not AI-extracted from document
        # The comparison is: AI-extracted (actual_extracted_total) vs Calculated (calculated_total)
        db_upload.extracted_total = round(calculated_total, 2) if calculated_total else 0  # This is the sum from table rows
        db_upload.extracted_invoice_total = round(calculated_invoice_total, 2) if calculated_invoice_total else 0
        
        # 🔧 CRITICAL FIX: Update status based on total validation
        # If totals don't match, set status to 'needs_review' instead of 'Approved'
        if needs_review:
            db_upload.status = 'needs_review'
            logger.warning(f"⚠️ Auto-approval: Totals don't match, setting status to 'needs_review' for manual review")
        else:
            # Status is already 'Approved' from approve_statement(), but let's be explicit
            db_upload.status = 'Approved'
            logger.info(f"✅ Auto-approval: Totals match, status remains 'Approved'")
        
        await db.commit()
        await db.refresh(db_upload)
        
        logger.info(f"✅ Updated DB record with auto-approval metadata")
        
        # Record user contribution now that the statement is persisted
        try:
            from app.services.user_profile_service import UserProfileService
            profile_service = UserProfileService(db)
            await profile_service.record_user_contribution(
                user_id=current_user.id,
                upload_id=UUID(request.upload_id),
                contribution_type="auto_approval",
                contribution_data={
                    "file_name": request.upload_metadata.get('file_name') if request.upload_metadata else None,
                    "status": db_upload.status,
                    "auto_approved": True,
                    "carrier_id": request.carrier_id,
                    "statement_date": request.statement_date
                }
            )
            await db.commit()  # Commit the contribution
            logger.info(f"✅ User contribution recorded for auto-approved statement {request.upload_id}")
        except Exception as e:
            logger.warning(f"⚠️ Could not record user contribution: {e}")
            # Don't fail the auto-approval if contribution recording fails
        
        # Emit final progress update with appropriate message based on needs_review status
        if needs_review:
            await connection_manager.send_stage_update(
                request.upload_id, 
                'auto_approval_complete', 
                100, 
                f"⚠️ Auto-processed but needs review - totals don't match!"
            )
        else:
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
            # ✅ FIX: Return both AI-extracted and calculated totals for frontend display
            "ai_extracted_total": round(actual_extracted_total, 2) if actual_extracted_total else 0,  # From document
            "calculated_total": round(calculated_total, 2) if calculated_total else 0,  # From table rows
            "extracted_total": round(calculated_total, 2) if calculated_total else 0  # For backward compatibility
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
