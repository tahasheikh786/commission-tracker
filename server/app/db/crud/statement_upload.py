from ..models import StatementUpload as StatementUploadModel
from ..schemas import StatementUpload, StatementUploadCreate, StatementUploadUpdate, PendingFile
from sqlalchemy.future import select
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from uuid import UUID
from typing import List, Optional, Dict, Any
from app.constants.statuses import VALID_PERSISTENT_STATUSES, is_valid_persistent_status
import logging

logger = logging.getLogger(__name__)

async def save_statement_upload(db, upload: StatementUpload):
    """
    Save a statement upload to the database.
    
    CRITICAL: Only statements with valid persistent statuses are saved.
    This prevents orphaned/ghost records from appearing in the database.
    
    Args:
        db: Database session
        upload: StatementUpload object to save
        
    Returns:
        Saved StatementUploadModel if status is valid, None otherwise
    """
    # CRITICAL STATUS GATE: Only persist if status is Approved or needs_review
    if not is_valid_persistent_status(upload.status):
        logger.warning(
            f"❌ REJECTED: Attempted to save upload {upload.id} with invalid status '{upload.status}'. "
            f"Only {VALID_PERSISTENT_STATUSES} are allowed to be persisted to the database."
        )
        return None
    
    logger.info(f"✅ Saving statement upload {upload.id} with valid status: {upload.status}")
    
    db_upload = StatementUploadModel(
        id=upload.id,
        company_id=upload.company_id,
        carrier_id=upload.carrier_id,  # CRITICAL FIX: Include carrier_id when saving
        user_id=upload.user_id,
        environment_id=upload.environment_id,  # Include environment_id for multi-environment support
        file_name=upload.file_name,
        file_hash=upload.file_hash,
        file_size=upload.file_size,
        uploaded_at=upload.uploaded_at,
        status=upload.status,
        current_step=upload.current_step,
        raw_data=upload.raw_data,
        mapping_used=upload.mapping_used,
        last_updated=upload.last_updated or datetime.utcnow()
    )
    db.add(db_upload)
    await db.commit()
    await db.refresh(db_upload)
    return db_upload

async def create_statement_upload(db: AsyncSession, upload: StatementUploadCreate) -> Optional[StatementUploadModel]:
    """
    Create a new statement upload in the database.
    
    CRITICAL: This function should ONLY be called after approval/review determination.
    Only statements with valid persistent statuses (Approved, needs_review) are created.
    
    DEPRECATED USAGE: Do not use this for "pending" or "processing" statuses.
    Those states should exist only in-memory during the upload flow.
    
    Args:
        db: Database session
        upload: StatementUploadCreate object
        
    Returns:
        Created StatementUploadModel if status is valid, None otherwise
    """
    # CRITICAL STATUS GATE: Only persist if status is Approved or needs_review
    if not is_valid_persistent_status(upload.status):
        logger.warning(
            f"❌ REJECTED: Attempted to create upload with invalid status '{upload.status}'. "
            f"Only {VALID_PERSISTENT_STATUSES} are allowed to be persisted to the database. "
            f"Pending/Processing states should NOT use this function."
        )
        return None
    
    logger.info(f"✅ Creating statement upload with valid status: {upload.status}")
    
    db_upload = StatementUploadModel(
        company_id=upload.company_id,
        carrier_id=upload.carrier_id,  # Include carrier_id from schema
        user_id=upload.user_id,
        environment_id=upload.environment_id,  # Include environment_id for multi-environment support
        file_name=upload.file_name,
        file_hash=upload.file_hash,
        file_size=upload.file_size,
        status=upload.status,
        current_step=upload.current_step,
        progress_data=upload.progress_data,
        uploaded_at=datetime.utcnow(),
        last_updated=datetime.utcnow()
    )
    db.add(db_upload)
    await db.commit()
    await db.refresh(db_upload)
    return db_upload

async def update_statement_upload(db: AsyncSession, upload_id: UUID, update_data: StatementUploadUpdate) -> Optional[StatementUploadModel]:
    """
    Update statement upload with progress data and status changes.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        return None
    
    # Update fields if provided
    update_dict = update_data.dict(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(db_upload, field, value)
    
    # Update last_updated timestamp
    db_upload.last_updated = datetime.utcnow()
    
    # Set completed_at if status is approved or rejected
    if update_data.status in ['approved', 'rejected']:
        db_upload.completed_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(db_upload)
    return db_upload

async def get_pending_files_for_company(db: AsyncSession, company_id: UUID) -> List[PendingFile]:
    """
    Get all pending files for a specific company.
    """
    result = await db.execute(
        select(StatementUploadModel).where(
            StatementUploadModel.company_id == company_id,
            StatementUploadModel.status == 'pending'
        ).order_by(StatementUploadModel.last_updated.desc())
    )
    uploads = result.scalars().all()
    
    pending_files = []
    for upload in uploads:
        # Create human-readable progress summary
        progress_summary = get_progress_summary(upload.current_step, upload.progress_data)
        
        pending_file = PendingFile(
            id=upload.id,
            company_id=upload.company_id,
            file_name=upload.file_name,
            uploaded_at=upload.uploaded_at,
            current_step=upload.current_step,
            last_updated=upload.last_updated,
            progress_summary=progress_summary
        )
        pending_files.append(pending_file)
    
    return pending_files

async def get_pending_files_for_company_by_user(db: AsyncSession, company_id: UUID, user_id: UUID) -> List[PendingFile]:
    """
    Get all pending files for a specific company filtered by user.
    """
    result = await db.execute(
        select(StatementUploadModel).where(
            StatementUploadModel.company_id == company_id,
            StatementUploadModel.user_id == user_id,
            StatementUploadModel.status == 'pending'
        ).order_by(StatementUploadModel.last_updated.desc())
    )
    uploads = result.scalars().all()
    
    pending_files = []
    for upload in uploads:
        # Create human-readable progress summary
        progress_summary = get_progress_summary(upload.current_step, upload.progress_data)
        
        pending_file = PendingFile(
            id=upload.id,
            company_id=upload.company_id,
            file_name=upload.file_name,
            uploaded_at=upload.uploaded_at,
            current_step=upload.current_step,
            last_updated=upload.last_updated,
            progress_summary=progress_summary
        )
        pending_files.append(pending_file)
    
    return pending_files

async def get_statement_upload_by_id(db: AsyncSession, upload_id: UUID) -> Optional[StatementUploadModel]:
    """
    Get statement upload by ID with all progress data.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    return result.scalar_one_or_none()

async def save_progress_data(db: AsyncSession, upload_id: UUID, step: str, data: dict, session_id: Optional[str] = None) -> bool:
    """
    Save progress data for a specific step.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        return False
    
    # Update progress data
    if not db_upload.progress_data:
        db_upload.progress_data = {}
    
    db_upload.progress_data[step] = data
    db_upload.current_step = step
    db_upload.last_updated = datetime.utcnow()
    
    if session_id:
        db_upload.session_id = session_id
    
    await db.commit()
    return True

async def get_progress_data(db: AsyncSession, upload_id: UUID, step: str) -> Optional[dict]:
    """
    Get progress data for a specific step.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload or not db_upload.progress_data:
        return None
    
    return db_upload.progress_data.get(step)

async def resume_upload_session(db: AsyncSession, upload_id: UUID) -> Optional[dict]:
    """
    Resume an upload session with all saved progress data.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload or db_upload.status != 'pending':
        return None
    
    return {
        'id': db_upload.id,
        'company_id': db_upload.company_id,
        'file_name': db_upload.file_name,
        'current_step': db_upload.current_step,
        'progress_data': db_upload.progress_data,
        'raw_data': db_upload.raw_data,
        'edited_tables': db_upload.edited_tables,
        'field_mapping': db_upload.field_mapping,
        'field_config': db_upload.field_config,
        'last_updated': db_upload.last_updated
    }

async def delete_pending_upload(db: AsyncSession, upload_id: UUID) -> bool:
    """
    Delete a pending upload.
    """
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload or db_upload.status != 'pending':
        return False
    
    await db.delete(db_upload)
    await db.commit()
    return True

async def save_statement_review(
    db, *,
    upload_id,
    final_data,
    status: str,
    field_config,
    rejection_reason: str = None,
    plan_types: list = None,
    selected_statement_date: dict = None,
    upload_metadata: dict = None,  # CRITICAL: Add metadata for creating new records
    current_user_id = None,  # NEW: Pass current user ID for record creation
    current_environment_id = None,  # NEW: Pass environment ID for record creation
    document_metadata: dict = None  # ✅ NEW: For total amount validation
):
    """
    Save statement review with updated status tracking.
    
    CRITICAL CHANGE: Now CREATES the DB record if it doesn't exist.
    Records are only created during approval (Approved or needs_review status).
    
    STATUS VALIDATION: Only Approved or needs_review statuses are persisted.
    """
    # CRITICAL STATUS GATE: Validate status before any database operations
    if not is_valid_persistent_status(status):
        logger.error(
            f"❌ REJECTED: Attempted to save statement review for upload {upload_id} with invalid status '{status}'. "
            f"Only {VALID_PERSISTENT_STATUSES} are allowed to be persisted to the database."
        )
        return None
    
    logger.info(f"✅ Saving statement review for upload {upload_id} with valid status: {status}")
    
    # Convert string to UUID if needed
    try:
        if isinstance(upload_id, str):
            upload_id_uuid = UUID(upload_id)
        else:
            upload_id_uuid = upload_id
    except (ValueError, AttributeError):
        logger.error(f"💾 Invalid upload_id format: {upload_id}")
        return None
    
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id_uuid))
    db_upload = result.scalar_one_or_none()
    
    # CRITICAL CHANGE: CREATE record if it doesn't exist
    if not db_upload:
        print(f"💾 Upload not found for ID: {upload_id_uuid} - Creating new record")
        
        if not upload_metadata:
            print(f"❌ Cannot create record without upload_metadata!")
            return None
        
        # Create new record with provided metadata
        # NOTE: datetime is already imported at the top of the file
        
        # Parse uploaded_at and convert to timezone-naive UTC datetime
        uploaded_at_value = datetime.utcnow()
        if upload_metadata.get('uploaded_at'):
            try:
                parsed_dt = datetime.fromisoformat(upload_metadata.get('uploaded_at').replace('Z', '+00:00'))
                # Convert to UTC and remove timezone info (database expects timezone-naive)
                uploaded_at_value = parsed_dt.replace(tzinfo=None) if parsed_dt.tzinfo else parsed_dt
            except (ValueError, AttributeError) as e:
                logger.warning(f"⚠️ Could not parse uploaded_at '{upload_metadata.get('uploaded_at')}': {e}")
                uploaded_at_value = datetime.utcnow()
        
        # CRITICAL FIX: Use current_user_id and current_environment_id if provided
        # This ensures the record is associated with the user who approved it
        user_id_to_use = current_user_id
        if not user_id_to_use and upload_metadata and upload_metadata.get('user_id'):
            user_id_to_use = UUID(upload_metadata.get('user_id'))
        
        # CRITICAL: ALWAYS use user's default environment, NEVER accept environment_id from metadata
        # This prevents environment mismatches and ensures all uploads go to the default environment
        environment_id_to_use = None
        user_company_id = None  # The user's actual company (NOT the carrier)
        if user_id_to_use:
            try:
                from app.db.crud.environment import get_or_create_default_environment
                # CRITICAL: ALWAYS get user's company_id from the users table
                # NEVER trust upload_metadata.company_id as it might be the carrier_id
                result_user_company = await db.execute(
                    text("SELECT company_id FROM users WHERE id = :user_id"),
                    {"user_id": str(user_id_to_use)}
                )
                row = result_user_company.fetchone()
                if row:
                    user_company_id = row[0]
                    logger.info(f"✅ Retrieved user's company_id {user_company_id} from users table for user {user_id_to_use}")
                
                if user_company_id and user_id_to_use:
                    # ALWAYS get/create the default environment for this user in their company
                    default_env = await get_or_create_default_environment(db, user_company_id, user_id_to_use)
                    environment_id_to_use = default_env.id
                    logger.info(f"✅ ALWAYS using user's default environment_id {environment_id_to_use} for consistency")
            except Exception as e:
                logger.error(f"❌ Could not get default environment: {e}")
        
        # Safeguard: Log if someone tried to pass a different environment_id
        if current_environment_id and current_environment_id != environment_id_to_use:
            logger.warning(f"⚠️  Ignoring passed environment_id {current_environment_id}, using default {environment_id_to_use}")
        if upload_metadata and upload_metadata.get('environment_id') and UUID(upload_metadata.get('environment_id')) != environment_id_to_use:
            logger.warning(f"⚠️  Ignoring metadata environment_id {upload_metadata.get('environment_id')}, using default {environment_id_to_use}")
        
        # CRITICAL FIX: Use user_company_id from users table, NOT from upload_metadata
        # upload_metadata.company_id might be the carrier_id due to frontend confusion
        db_upload = StatementUploadModel(
            id=upload_id_uuid,
            company_id=user_company_id,  # FIXED: Use user's actual company from users table
            carrier_id=UUID(upload_metadata.get('carrier_id')) if upload_metadata.get('carrier_id') else None,
            user_id=user_id_to_use,
            environment_id=environment_id_to_use,
            file_name=upload_metadata.get('file_name', ''),
            file_hash=upload_metadata.get('file_hash'),
            file_size=upload_metadata.get('file_size'),
            uploaded_at=uploaded_at_value,
            status=status,  # Will be set below
            current_step='review',
            raw_data=upload_metadata.get('raw_data', []),
            last_updated=datetime.utcnow()
        )
        db.add(db_upload)
        print(f"✅ Created new DB record for upload {upload_id_uuid}")
    
    print(f"💾 Saving statement review: upload_id={upload_id_uuid}, status={status}")
    print(f"📋 Field config being saved: {field_config}")
    print(f"📊 Final data rows: {len(final_data) if final_data else 0}")
    print(f"📅 Selected statement date being saved: {selected_statement_date}")
    
    # DEBUG: Log summaryRows being saved
    if final_data:
        for idx, table in enumerate(final_data):
            if isinstance(table, dict):
                summary_rows = table.get('summaryRows', [])
                print(f"🔍 DEBUG Saving table {idx} '{table.get('name', 'unknown')}': summaryRows={summary_rows}, type={type(summary_rows)}")
    
    # CRITICAL FIX: Normalize summaryRows to always be a list
    # Frontend might send {} for empty summaryRows which breaks validation
    if final_data:
        for table in final_data:
            if isinstance(table, dict):
                summary_rows = table.get('summaryRows')
                # Convert {} or any non-list to []
                if not isinstance(summary_rows, list):
                    if summary_rows == {} or summary_rows is None:
                        table['summaryRows'] = []
                        print(f"🔧 Normalized summaryRows from {type(summary_rows)} to [] for table '{table.get('name', 'unknown')}'")
                    elif isinstance(summary_rows, set):
                        table['summaryRows'] = list(summary_rows)
                        print(f"🔧 Converted summaryRows from set to list for table '{table.get('name', 'unknown')}'")
    
    # CRITICAL FIX: Extract field_mapping from field_config for review modal
    # field_mapping is a simple dict mapping source fields to target fields
    # This is used by the review modal to load saved mappings instead of calling AI
    field_mapping = {}
    if field_config:
        for item in field_config:
            if isinstance(item, dict):
                # ✅ UNIFIED FORMAT: {'field': 'Company Name', 'mapping': 'Client Name'}
                # Support legacy formats for backward compatibility:
                # - Old format 1: {'field': 'Company Name', 'label': 'Client Name'}
                # - Old format 2: {'display_name': 'Client Name', 'source_field': 'Company Name'}
                
                # Priority 1: New unified format (field + mapping)
                source_field = item.get('field')
                target_field = item.get('mapping')
                
                # Priority 2: Legacy format (source_field + display_name)
                if not source_field:
                    source_field = item.get('source_field')
                if not target_field:
                    target_field = item.get('display_name')
                
                # Priority 3: Old format (field + label)
                if not target_field:
                    target_field = item.get('label')
                
                if source_field and target_field:
                    field_mapping[source_field] = target_field
        
        print(f"📝 Extracted field_mapping with {len(field_mapping)} mappings: {field_mapping}")
    
    # ✅ CRITICAL FIX: Calculate extracted_total from final_data for approved statements
    # This ensures the dropdown shows commission details even for manually approved statements
    extracted_total = None
    total_amount_match = None
    
    if status == "Approved" and final_data and field_mapping:
        print(f"💰 Calculating extracted_total for manual approval...")
        print(f"💰 field_mapping keys: {list(field_mapping.keys())}")
        print(f"💰 Number of tables in final_data: {len(final_data)}")
        
        # Find the commission field from field_mapping
        # ✅ CRITICAL: Be precise - don't match "Commission Rate", only match actual earned commission fields
        commission_field_candidates = [
            'commission earned', 'commission_earned', 'total commission paid',
            'paid amount', 'paid_amount', 'amount paid', 'commission amount', 'earned commission'
        ]
        
        # ✅ Exclude rate/percentage fields - these are NOT commission earned amounts
        excluded_fields = ['commission rate', 'commission_rate', 'rate', 'percentage', 'agent rate', 'agent %']
        
        commission_source_field = None
        
        # ✅ FIRST: Try exact match for "Commission Earned" or "Paid Amount"
        for source_field, target_field in field_mapping.items():
            normalized_target = str(target_field).lower().strip()
            if normalized_target in ['commission earned', 'paid amount', 'commission amount']:
                commission_source_field = source_field
                print(f"💰 Found commission field (EXACT MATCH): {source_field} -> {target_field}")
                break
        
        # If no exact match, search with exclusions
        if not commission_source_field:
            for source_field, target_field in field_mapping.items():
                normalized_target = str(target_field).lower().strip()
                
                print(f"  🔍 Checking: '{source_field}' -> '{target_field}' (normalized: '{normalized_target}')")
                
                # Skip if this is a rate/percentage field
                if any(excluded in normalized_target for excluded in excluded_fields):
                    print(f"  ⏭️ Skipping rate field: {source_field} -> {target_field}")
                    continue
                
                # Check if it matches commission candidates
                if any(candidate in normalized_target or normalized_target in candidate 
                       for candidate in commission_field_candidates):
                    commission_source_field = source_field
                    print(f"💰 Found commission field: {source_field} -> {target_field}")
                    break
        
        print(f"💰 Final commission_source_field: {commission_source_field}")
        
        if commission_source_field:
            calculated_total = 0
            
            # Calculate total from final_data
            for table_idx, table in enumerate(final_data):
                if not isinstance(table, dict):
                    continue
                    
                headers = table.get('header') or table.get('headers', [])
                rows = table.get('rows', [])
                summary_rows_set = set(table.get('summaryRows', []))
                
                print(f"  📊 Table {table_idx}: {len(headers)} headers, {len(rows)} rows")
                print(f"  📋 Headers: {headers}")
                if rows:
                    print(f"  📋 First row sample: {rows[0]}")
                
                # Find commission column index
                commission_col_idx = -1
                if commission_source_field in headers:
                    commission_col_idx = headers.index(commission_source_field)
                else:
                    # Try case-insensitive match
                    for idx, header in enumerate(headers):
                        if header and header.lower() == commission_source_field.lower():
                            commission_col_idx = idx
                            break
                
                if commission_col_idx == -1:
                    print(f"  ⚠️ Table {table_idx}: Commission column '{commission_source_field}' not found in headers: {headers}")
                    continue
                
                print(f"  💰 Table {table_idx}: Commission column '{commission_source_field}' at index {commission_col_idx}")
                
                # Sum non-summary rows
                table_total = 0
                processed_count = 0
                for row_idx, row in enumerate(rows):
                    if row_idx in summary_rows_set:
                        print(f"    Row {row_idx}: SKIPPED (summary row)")
                        continue
                    
                    # ✅ CRITICAL FIX: Support both DICT and LIST row formats
                    raw_value = None
                    if isinstance(row, dict):
                        # Row is a dictionary - access by key (field name)
                        raw_value = row.get(commission_source_field)
                        print(f"    Row {row_idx}: [DICT] raw_value = '{raw_value}' (type: {type(raw_value)})")
                    elif isinstance(row, list) and len(row) > commission_col_idx:
                        # Row is a list - access by index
                        raw_value = row[commission_col_idx]
                        print(f"    Row {row_idx}: [LIST] raw_value = '{raw_value}' (type: {type(raw_value)})")
                    
                    if raw_value is None or raw_value == '':
                        print(f"    Row {row_idx}: SKIPPED (empty value)")
                        continue
                    
                    # Parse numeric value
                    try:
                        if isinstance(raw_value, (int, float)):
                            numeric_value = float(raw_value)
                        elif isinstance(raw_value, str):
                            # ✅ Handle negative numbers in parentheses format: ($141.14) = -141.14
                            value_str = raw_value.strip()
                            is_negative = value_str.startswith('(') and value_str.endswith(')')
                            if is_negative:
                                value_str = value_str[1:-1]  # Remove parentheses
                            
                            cleaned = value_str.replace('$', '').replace(',', '').strip()
                            numeric_value = float(cleaned) if cleaned else 0
                            
                            # Apply negative sign if needed
                            if is_negative:
                                numeric_value = -numeric_value
                        else:
                            numeric_value = 0
                        
                        if numeric_value != 0:
                            table_total += numeric_value
                            calculated_total += numeric_value
                            processed_count += 1
                            print(f"    Row {row_idx}: Added ${numeric_value:.2f} (running total: ${calculated_total:.2f})")
                        else:
                            print(f"    Row {row_idx}: Value is zero, skipped")
                    except (ValueError, TypeError) as e:
                        print(f"    Row {row_idx}: FAILED to parse '{raw_value}': {e}")
                        continue
                
                print(f"  ✅ Table {table_idx} total: ${table_total:.2f}")
            
            extracted_total = round(calculated_total, 2)
            
            # ✅ CRITICAL FIX: Compare with AI-extracted total from document_metadata
            ai_extracted_total = None
            if document_metadata and 'total_amount' in document_metadata:
                try:
                    ai_extracted_total = float(document_metadata['total_amount'])
                    print(f"💰 AI-extracted total from document: ${ai_extracted_total:.2f}")
                except (ValueError, TypeError):
                    print(f"⚠️ Could not parse AI-extracted total: {document_metadata.get('total_amount')}")
            
            # Compare totals with 5% tolerance
            if ai_extracted_total is not None and ai_extracted_total > 0:
                difference = abs(ai_extracted_total - extracted_total)
                difference_percent = (difference / ai_extracted_total) * 100
                total_amount_match = difference_percent < 5.0  # 5% tolerance
                
                print(f"💰 Total comparison:")
                print(f"   - AI extracted from document: ${ai_extracted_total:.2f}")
                print(f"   - Calculated from table rows: ${extracted_total:.2f}")
                print(f"   - Difference: ${difference:.2f} ({difference_percent:.2f}%)")
                print(f"   - Match: {total_amount_match}")
                
                # ⚠️ IMPORTANT: If totals don't match, change status to needs_review
                if not total_amount_match:
                    print(f"⚠️ TOTAL MISMATCH DETECTED! Changing status from '{status}' to 'needs_review'")
                    status = 'needs_review'
            else:
                # No AI-extracted total available - assume match
                total_amount_match = True
                print(f"⚠️ No AI-extracted total available for comparison - assuming match")
            
            print(f"💰 Final extracted_total: ${extracted_total:.2f}")
        else:
            print(f"⚠️ No commission field found in field_mapping")
    
    # ✅ NEW: Calculate invoice total for manual approval
    extracted_invoice_total = None
    
    if status == "Approved" and final_data and field_mapping:
        print(f"💰 Calculating extracted_invoice_total for manual approval...")
        
        # Find the invoice total field from field_mapping
        invoice_field_candidates = [
            'invoice total', 'invoice_total', 'total invoice', 'total_invoice',
            'premium amount', 'premium_amount', 'premium'
        ]
        
        # ✅ Exclude non-invoice fields
        excluded_invoice_fields = ['stoploss', 'commission', 'paid amount', 'rate']
        
        invoice_source_field = None
        for source_field, target_field in field_mapping.items():
            normalized_target = str(target_field).lower().strip()
            
            # Skip if this is an excluded field
            if any(excluded in normalized_target for excluded in excluded_invoice_fields):
                continue
            
            # Check exact match first for "Invoice Total"
            if normalized_target == 'invoice total':
                invoice_source_field = source_field
                print(f"💰 Found invoice field (exact match): {source_field} -> {target_field}")
                break
                
            # Then check other candidates
            if any(candidate in normalized_target or normalized_target in candidate 
                   for candidate in invoice_field_candidates):
                invoice_source_field = source_field
                print(f"💰 Found invoice field: {source_field} -> {target_field}")
                break
        
        if invoice_source_field:
            calculated_invoice = 0
            
            # Calculate total from final_data
            for table_idx, table in enumerate(final_data):
                if not isinstance(table, dict):
                    continue
                    
                headers = table.get('header') or table.get('headers', [])
                rows = table.get('rows', [])
                summary_rows_set = set(table.get('summaryRows', []))
                
                print(f"  📊 Table {table_idx}: {len(headers)} headers, {len(rows)} rows")
                print(f"  📋 Headers: {headers}")
                if rows:
                    print(f"  📋 First row sample: {rows[0]}")
                
                # Find invoice column index
                invoice_col_idx = -1
                if invoice_source_field in headers:
                    invoice_col_idx = headers.index(invoice_source_field)
                else:
                    # Try case-insensitive match
                    for idx, header in enumerate(headers):
                        if header and header.lower() == invoice_source_field.lower():
                            invoice_col_idx = idx
                            break
                
                if invoice_col_idx == -1:
                    print(f"  ⚠️ Table {table_idx}: Invoice column '{invoice_source_field}' not found in headers: {headers}")
                    continue
                
                print(f"  💰 Table {table_idx}: Invoice column '{invoice_source_field}' at index {invoice_col_idx}")
                
                # Sum non-summary rows
                table_total = 0
                for row_idx, row in enumerate(rows):
                    if row_idx in summary_rows_set:
                        continue
                    
                    # ✅ CRITICAL FIX: Support both DICT and LIST row formats
                    raw_value = None
                    if isinstance(row, dict):
                        # Row is a dictionary - access by key (field name)
                        raw_value = row.get(invoice_source_field)
                        print(f"    Row {row_idx}: [DICT] invoice_value = '{raw_value}'")
                    elif isinstance(row, list) and len(row) > invoice_col_idx:
                        # Row is a list - access by index
                        raw_value = row[invoice_col_idx]
                        print(f"    Row {row_idx}: [LIST] invoice_value = '{raw_value}'")
                    
                    if raw_value is None or raw_value == '':
                        continue
                    
                    # Parse numeric value
                    try:
                        if isinstance(raw_value, (int, float)):
                            numeric_value = float(raw_value)
                        elif isinstance(raw_value, str):
                            # ✅ Handle negative numbers in parentheses format: ($627.27) = -627.27
                            value_str = raw_value.strip()
                            is_negative = value_str.startswith('(') and value_str.endswith(')')
                            if is_negative:
                                value_str = value_str[1:-1]  # Remove parentheses
                            
                            cleaned = value_str.replace('$', '').replace(',', '').strip()
                            numeric_value = float(cleaned) if cleaned else 0
                            
                            # Apply negative sign if needed
                            if is_negative:
                                numeric_value = -numeric_value
                        else:
                            numeric_value = 0
                        
                        if numeric_value != 0:
                            table_total += numeric_value
                            calculated_invoice += numeric_value
                            print(f"    Row {row_idx}: Added ${numeric_value:.2f} to invoice (running total: ${calculated_invoice:.2f})")
                    except (ValueError, TypeError):
                        continue
                
                print(f"  ✅ Table {table_idx} invoice total: ${table_total:.2f}")
            
            extracted_invoice_total = round(calculated_invoice, 2)
            print(f"💰 Final extracted_invoice_total: ${extracted_invoice_total:.2f}")
        else:
            print(f"⚠️ No invoice field found in field_mapping")
    
    # Update the upload with final data
    db_upload.final_data = final_data
    db_upload.status = status
    db_upload.current_step = 'completed'
    db_upload.field_config = field_config
    db_upload.field_mapping = field_mapping if field_mapping else None  # Save field_mapping for review
    db_upload.rejection_reason = rejection_reason
    db_upload.plan_types = plan_types
    db_upload.selected_statement_date = selected_statement_date
    db_upload.completed_at = datetime.utcnow()
    db_upload.last_updated = datetime.utcnow()
    
    # Set extracted_total and total_amount_match if calculated
    if extracted_total is not None:
        db_upload.extracted_total = extracted_total
        db_upload.total_amount_match = total_amount_match
        print(f"✅ Set extracted_total={extracted_total}, total_amount_match={total_amount_match}")
    
    # Set extracted_invoice_total if calculated
    if extracted_invoice_total is not None:
        db_upload.extracted_invoice_total = extracted_invoice_total
        print(f"✅ Set extracted_invoice_total={extracted_invoice_total}")
    
    # If the statement is approved, process commission data BEFORE committing
    if status == "Approved":
        print(f"✅ Statement approved, processing commission data with BULK OPTIMIZATION...")
        from .earned_commission import bulk_process_commissions
        await bulk_process_commissions(db, db_upload)
    
    # Commit all changes together (statement + commission data)
    await db.commit()
    await db.refresh(db_upload)
    
    return db_upload

async def get_all_statement_reviews(db):
    """
    Get all statement reviews with pending files included.
    """
    result = await db.execute(
        select(StatementUploadModel).order_by(StatementUploadModel.last_updated.desc())
    )
    return result.scalars().all()

async def get_statements_for_company(db, company_id):
    """
    Get all statements for a company.
    
    CRITICAL: Only returns statements with valid persistent statuses (Approved, needs_review).
    Pending files should NOT be persisted to the database.
    """
    from sqlalchemy import and_
    
    logger.info(f"📋 Fetching statements for company {company_id} with status filter: {VALID_PERSISTENT_STATUSES}")
    
    # CRITICAL: Only return statements with valid persistent statuses
    result = await db.execute(
        select(StatementUploadModel).where(
            and_(
                StatementUploadModel.company_id == company_id,
                StatementUploadModel.status.in_(VALID_PERSISTENT_STATUSES)  # CRITICAL STATUS FILTER
            )
        )
        .order_by(StatementUploadModel.last_updated.desc())
    )
    statements = result.scalars().all()
    
    logger.info(f"✅ Found {len(statements)} statements with valid statuses for company {company_id}")
    
    return statements

async def get_statements_for_carrier(db, carrier_id):
    """
    Get all statements for a specific carrier.
    
    CRITICAL: Only returns statements with valid persistent statuses (Approved, needs_review).
    This prevents orphaned/ghost records from appearing in the UI.
    
    NOTE: Support both old (company_id) and new (carrier_id) format for backwards compatibility.
    Old format: carrier stored in company_id, carrier_id is NULL
    New format: carrier stored in carrier_id
    """
    from sqlalchemy import or_, and_
    
    logger.info(f"📋 Fetching statements for carrier {carrier_id} with status filter: {VALID_PERSISTENT_STATUSES}")
    
    # CRITICAL: Only return statements with valid persistent statuses
    result = await db.execute(
        select(StatementUploadModel).where(
            and_(
                or_(
                    StatementUploadModel.carrier_id == carrier_id,
                    and_(
                        StatementUploadModel.company_id == carrier_id,
                        StatementUploadModel.carrier_id.is_(None)
                    )
                ),
                StatementUploadModel.status.in_(VALID_PERSISTENT_STATUSES)  # CRITICAL STATUS FILTER
            )
        )
        .order_by(StatementUploadModel.last_updated.desc())
    )
    statements = result.scalars().all()
    
    logger.info(f"✅ Found {len(statements)} statements with valid statuses for carrier {carrier_id}")
    
    return statements

async def get_statement_by_id(db: AsyncSession, statement_id: str):
    try:
        # Convert string to UUID if needed
        if isinstance(statement_id, str):
            statement_id = UUID(statement_id)
        result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == statement_id))
        return result.scalar_one_or_none()
    except ValueError:
        # Invalid UUID format
        return None

async def delete_statement(db: AsyncSession, statement_id: str):
    statement = await get_statement_by_id(db, statement_id)
    if not statement:
        raise ValueError(f"Statement with ID {statement_id} not found")
    
    try:
        # Check if edited_tables table exists before trying to delete from it
        from sqlalchemy import text
        result = await db.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'edited_tables'
        """))
        edited_tables_exists = result.fetchone() is not None
        
        # Delete related edited tables first (only if table exists)
        if edited_tables_exists:
            await db.execute(
                text("DELETE FROM edited_tables WHERE upload_id = :upload_id"),
                {"upload_id": statement_id}
            )
        
        # Remove this upload from earned commission records
        from .earned_commission import remove_upload_from_earned_commissions
        await remove_upload_from_earned_commissions(db, statement_id)
        
         # Delete user data contributions that reference this upload
        await db.execute(
            text("DELETE FROM user_data_contributions WHERE upload_id = :upload_id"),
            {"upload_id": statement_id}
        )
        
        # Delete file duplicate records that reference this upload
        await db.execute(
            text("DELETE FROM file_duplicates WHERE original_upload_id = :upload_id OR duplicate_upload_id = :upload_id"),
            {"upload_id": statement_id}
        )
        
        # Delete the statement
        await db.delete(statement)
        await db.commit()
        return True
    except Exception as e:
        await db.rollback()
        raise ValueError(f"Failed to delete statement: {str(e)}")

async def save_edited_tables(db: AsyncSession, tables_data: list):
    """
    Save edited tables with progress tracking.
    """
    if not tables_data:
        return None
    
    # Get the upload_id from the first table
    upload_id = tables_data[0].get('upload_id')
    if not upload_id:
        return None
    
    # Update the upload with edited tables
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        return None
    
    db_upload.edited_tables = tables_data
    db_upload.current_step = 'table_editor'
    db_upload.last_updated = datetime.utcnow()
    
    # Save in progress_data
    if not db_upload.progress_data:
        db_upload.progress_data = {}
    
    db_upload.progress_data['table_editor'] = {
        'tables': tables_data,
        'table_count': len(tables_data)
    }
    
    await db.commit()
    await db.refresh(db_upload)
    return db_upload

async def get_edited_tables(db: AsyncSession, upload_id: str):
    """
    Get edited tables for an upload.
    """
    # Convert string to UUID if needed
    try:
        if isinstance(upload_id, str):
            upload_id_uuid = UUID(upload_id)
        else:
            upload_id_uuid = upload_id
    except (ValueError, AttributeError):
        return None
    
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id_uuid))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        return None
    
    return db_upload.edited_tables

async def update_upload_tables(db: AsyncSession, upload_id: str, tables_data: list, selected_statement_date: Optional[Dict[str, Any]] = None, carrier_id: Optional[str] = None):
    """
    Update upload tables with progress tracking, selected statement date, and carrier information.
    """
    print(f"🎯 CRUD: update_upload_tables called for upload_id: {upload_id}")
    print(f"🎯 CRUD: Tables data length: {len(tables_data) if tables_data else 0}")
    print(f"🎯 CRUD: Selected statement date: {selected_statement_date}")
    print(f"🎯 CRUD: Carrier ID: {carrier_id}")
    
    # Convert string to UUID if needed
    try:
        if isinstance(upload_id, str):
            upload_id_uuid = UUID(upload_id)
        else:
            upload_id_uuid = upload_id
    except (ValueError, AttributeError) as e:
        print(f"🎯 CRUD: Invalid upload_id format: {upload_id}, error: {e}")
        return None
    
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id_uuid))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        print(f"🎯 CRUD: Upload not found for ID: {upload_id_uuid}")
        return None
    
    print(f"🎯 CRUD: Found upload, updating with tables, statement date, and carrier")
    
    # Save edited tables to edited_tables field, not raw_data
    db_upload.edited_tables = tables_data
    db_upload.current_step = 'table_editor'
    db_upload.last_updated = datetime.utcnow()
    
    # Save selected statement date if provided
    if selected_statement_date:
        db_upload.selected_statement_date = selected_statement_date
        print(f"🎯 CRUD: Saved selected statement date to database: {selected_statement_date}")
        print(f"🎯 CRUD: Statement date type: {type(selected_statement_date)}")
        print(f"🎯 CRUD: Statement date keys: {list(selected_statement_date.keys()) if isinstance(selected_statement_date, dict) else 'Not a dict'}")
    else:
        print(f"🎯 CRUD: No selected statement date provided")
    
    # Update carrier_id if provided (this links the statement to the carrier)
    # CRITICAL: carrier_id = insurance carrier, company_id = user's company (DO NOT OVERWRITE!)
    if carrier_id:
        db_upload.carrier_id = carrier_id
        print(f"🎯 CRUD: Linking statement to carrier: carrier_id={carrier_id}, company_id stays as user's company={db_upload.company_id}")
    
    # Save in progress_data
    if not db_upload.progress_data:
        db_upload.progress_data = {}
    
    db_upload.progress_data['extraction'] = {
        'tables': tables_data,
        'table_count': len(tables_data)
    }
    
    # Also save selected statement date and carrier info in progress data
    if selected_statement_date or carrier_id:
        db_upload.progress_data['table_editor'] = {
            'selected_statement_date': selected_statement_date,
            'carrier_id': carrier_id
        }
        print(f"🎯 CRUD: Also saved statement date and carrier to progress_data")
    
    await db.commit()
    await db.refresh(db_upload)
    
    print(f"🎯 CRUD: Successfully updated upload {upload_id_uuid} with tables, statement date, and carrier")
    print(f"🎯 CRUD: Final selected_statement_date in database: {db_upload.selected_statement_date}")
    
    return db_upload

async def delete_edited_tables(db: AsyncSession, upload_id: str):
    """
    Delete edited tables for an upload.
    """
    # Convert string to UUID if needed
    try:
        if isinstance(upload_id, str):
            upload_id_uuid = UUID(upload_id)
        else:
            upload_id_uuid = upload_id
    except (ValueError, AttributeError):
        return False
    
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id_uuid))
    db_upload = result.scalar_one_or_none()
    
    if not db_upload:
        return False
    
    db_upload.edited_tables = None
    
    # Remove from progress_data
    if db_upload.progress_data and 'table_editor' in db_upload.progress_data:
        del db_upload.progress_data['table_editor']
    
    await db.commit()
    return True

async def get_upload_by_id(db: AsyncSession, upload_id: str):
    """
    Get upload by ID with all progress data.
    """
    # Convert string to UUID if needed
    try:
        if isinstance(upload_id, str):
            upload_id_uuid = UUID(upload_id)
        else:
            upload_id_uuid = upload_id
    except (ValueError, AttributeError):
        return None
    
    result = await db.execute(select(StatementUploadModel).where(StatementUploadModel.id == upload_id_uuid))
    return result.scalar_one_or_none()

async def get_statement_by_file_hash_and_status(
    db: AsyncSession, 
    file_hash: str,
    valid_statuses: List[str]
) -> Optional[StatementUploadModel]:
    """
    Get statement by file hash, filtering by valid statuses.
    Only checks against successfully extracted files to prevent
    409 conflicts for failed/cancelled extractions.
    
    Args:
        db: Database session
        file_hash: SHA256 hash of the file
        valid_statuses: List of statuses to check (e.g., ['pending', 'approved', 'needsreview', 'rejected'])
    
    Returns:
        StatementUploadModel if found, None otherwise
    """
    from sqlalchemy import and_
    
    result = await db.execute(
        select(StatementUploadModel).where(
            and_(
                StatementUploadModel.file_hash == file_hash,
                StatementUploadModel.status.in_(valid_statuses)
            )
        )
    )
    return result.scalar_one_or_none()

def get_progress_summary(current_step: str, progress_data: Optional[dict]) -> str:
    """
    Generate a human-readable summary of the current progress.
    """
    step_descriptions = {
        'upload': 'File uploaded, ready for processing',
        'table_editor': 'Tables extracted, ready for editing',
        'field_mapper': 'Tables edited, ready for field mapping',
        'dashboard': 'Field mapping completed, ready for review',
        'completed': 'Processing completed'
    }
    
    base_description = step_descriptions.get(current_step, f'At step: {current_step}')
    
    if progress_data:
        if current_step == 'table_editor' and 'tables' in progress_data:
            table_count = len(progress_data['tables'])
            return f'{base_description} ({table_count} tables)'
        elif current_step == 'field_mapper' and 'mapping' in progress_data:
            mapped_fields = len(progress_data['mapping'])
            return f'{base_description} ({mapped_fields} fields mapped)'
    
    return base_description
