from ..models import EarnedCommission, Company, StatementUpload as StatementUploadModel
from ..schemas import EarnedCommissionCreate, EarnedCommissionUpdate
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from uuid import UUID
from typing import Optional

async def create_earned_commission(db: AsyncSession, commission: EarnedCommissionCreate):
    """Create a new earned commission record."""
    db_commission = EarnedCommission(
        carrier_id=commission.carrier_id,
        client_name=commission.client_name,
        invoice_total=commission.invoice_total,
        commission_earned=commission.commission_earned,
        statement_count=commission.statement_count,
        upload_ids=commission.upload_ids,
        statement_date=commission.statement_date,
        statement_month=commission.statement_month,
        statement_year=commission.statement_year,
        jan_commission=commission.jan_commission,
        feb_commission=commission.feb_commission,
        mar_commission=commission.mar_commission,
        apr_commission=commission.apr_commission,
        may_commission=commission.may_commission,
        jun_commission=commission.jun_commission,
        jul_commission=commission.jul_commission,
        aug_commission=commission.aug_commission,
        sep_commission=commission.sep_commission,
        oct_commission=commission.oct_commission,
        nov_commission=commission.nov_commission,
        dec_commission=commission.dec_commission
    )
    db.add(db_commission)
    await db.commit()
    await db.refresh(db_commission)
    return db_commission

async def get_earned_commission_by_carrier_and_client(db: AsyncSession, carrier_id: UUID, client_name: str, statement_year: int = None):
    """Get earned commission record by carrier, client name, and year."""
    query = select(EarnedCommission).where(
        EarnedCommission.carrier_id == carrier_id,
        EarnedCommission.client_name == client_name
    )
    
    if statement_year is not None:
        query = query.where(EarnedCommission.statement_year == statement_year)
    
    result = await db.execute(query)
    return result.scalar_one_or_none()

async def update_earned_commission(db: AsyncSession, commission_id: UUID, update_data: EarnedCommissionUpdate):
    """Update an earned commission record."""
    result = await db.execute(select(EarnedCommission).where(EarnedCommission.id == commission_id))
    db_commission = result.scalar_one_or_none()
    
    if not db_commission:
        return None
    
    update_dict = update_data.dict(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(db_commission, field, value)
    
    db_commission.last_updated = datetime.utcnow()
    await db.commit()
    await db.refresh(db_commission)
    return db_commission

async def upsert_earned_commission(db: AsyncSession, carrier_id: UUID, client_name: str, invoice_total: float, commission_earned: float, statement_date: datetime = None, statement_month: int = None, statement_year: int = None, upload_id: str = None):
    """Upsert earned commission data - create if not exists, update if exists."""
    existing = await get_earned_commission_by_carrier_and_client(db, carrier_id, client_name, statement_year)
    
    if existing:
        # Update existing record - convert to Decimal for proper arithmetic
        existing_invoice = float(existing.invoice_total) if existing.invoice_total else 0
        existing_commission = float(existing.commission_earned) if existing.commission_earned else 0
        
        # Handle missing values: if existing has invoice but new doesn't, keep existing
        # If new has invoice but existing doesn't, use new
        # If both have invoice, add them
        final_invoice_total = existing_invoice
        if invoice_total != 0:
            if existing_invoice == 0:
                final_invoice_total = invoice_total
            else:
                final_invoice_total = existing_invoice + invoice_total
        
        # Prepare update data
        update_data = EarnedCommissionUpdate(
            invoice_total=final_invoice_total,
            commission_earned=existing_commission + commission_earned,
            statement_count=existing.statement_count + 1
        )
        
        # Update upload_ids if provided
        if upload_id:
            existing_upload_ids = existing.upload_ids or []
            if upload_id not in existing_upload_ids:
                existing_upload_ids.append(upload_id)
                update_data.upload_ids = existing_upload_ids
                print(f"🎯 Upsert: Added upload_id {upload_id} to {client_name}, total uploads: {existing_upload_ids}")
            else:
                print(f"🎯 Upsert: Upload_id {upload_id} already exists for {client_name}")
        
        # Update monthly breakdown if statement date is provided
        if statement_month and statement_year:
            month_columns = {
                1: 'jan_commission', 2: 'feb_commission', 3: 'mar_commission',
                4: 'apr_commission', 5: 'may_commission', 6: 'jun_commission',
                7: 'jul_commission', 8: 'aug_commission', 9: 'sep_commission',
                10: 'oct_commission', 11: 'nov_commission', 12: 'dec_commission'
            }
            
            if statement_month in month_columns:
                current_month_value = getattr(existing, month_columns[statement_month], 0) or 0
                new_month_value = float(current_month_value) + commission_earned
                setattr(update_data, month_columns[statement_month], new_month_value)
                print(f"🎯 Upsert: Updated {month_columns[statement_month]} for {client_name}: {current_month_value} + {commission_earned} = {new_month_value}")
        
        result = await update_earned_commission(db, existing.id, update_data)
        return result
    else:
        # Create new record
        commission_data = EarnedCommissionCreate(
            carrier_id=carrier_id,
            client_name=client_name,
            invoice_total=invoice_total,
            commission_earned=commission_earned,
            statement_count=1,
            statement_date=statement_date,
            statement_month=statement_month,
            statement_year=statement_year,
            upload_ids=[upload_id] if upload_id else []
        )
        
        # Set monthly breakdown if statement date is provided
        if statement_month and statement_year:
            month_columns = {
                1: 'jan_commission', 2: 'feb_commission', 3: 'mar_commission',
                4: 'apr_commission', 5: 'may_commission', 6: 'jun_commission',
                7: 'jul_commission', 8: 'aug_commission', 9: 'sep_commission',
                10: 'oct_commission', 11: 'nov_commission', 12: 'dec_commission'
            }
            
            if statement_month in month_columns:
                setattr(commission_data, month_columns[statement_month], commission_earned)
        
        return await create_earned_commission(db, commission_data)

async def get_earned_commissions_by_carrier(db: AsyncSession, carrier_id: UUID):
    """Get all earned commission records for a specific carrier."""
    result = await db.execute(
        select(EarnedCommission)
        .where(EarnedCommission.carrier_id == carrier_id)
        .order_by(EarnedCommission.client_name.asc())
    )
    return result.scalars().all()

async def get_all_earned_commissions(db: AsyncSession, year: Optional[int] = None):
    """Get all earned commission records with carrier names, optionally filtered by year."""
    query = select(EarnedCommission, Company.name.label('carrier_name'))\
        .join(Company, EarnedCommission.carrier_id == Company.id)
    
    if year is not None:
        query = query.where(EarnedCommission.statement_year == year)
    
    query = query.order_by(Company.name.asc(), EarnedCommission.client_name.asc())
    result = await db.execute(query)
    return result.all()

async def get_commission_record(db: AsyncSession, carrier_id: str, client_name: str, statement_date: datetime):
    """Get commission record by carrier, client, and statement date."""
    result = await db.execute(
        select(EarnedCommission).where(
            EarnedCommission.carrier_id == carrier_id,
            EarnedCommission.client_name == client_name,
            EarnedCommission.statement_date == statement_date
        )
    )
    return result.scalar_one_or_none()

async def recalculate_commission_totals(db: AsyncSession, commission: EarnedCommission):
    """Recalculate commission totals based on remaining uploads."""
    try:
        # Reset all totals to zero
        total_invoice = 0.0
        total_commission = 0.0
        statement_count = 0
        
        # Reset monthly breakdown
        month_columns = {
            1: 'jan_commission', 2: 'feb_commission', 3: 'mar_commission',
            4: 'apr_commission', 5: 'may_commission', 6: 'jun_commission',
            7: 'jul_commission', 8: 'aug_commission', 9: 'sep_commission',
            10: 'oct_commission', 11: 'nov_commission', 12: 'dec_commission'
        }
        
        monthly_totals = {month: 0.0 for month in range(1, 13)}
        
        # Process each remaining upload to recalculate totals
        for upload_id in commission.upload_ids:
            print(f"🎯 Recalculate: Processing upload {upload_id} for {commission.client_name}")
            # Get the statement upload
            from .statement_upload import get_statement_by_id
            statement = await get_statement_by_id(db, upload_id)
            if not statement or not statement.final_data:
                print(f"🎯 Recalculate: No statement or final_data for upload {upload_id}")
                continue
                
            # Process the statement data to extract commission information
            commission_data = await extract_commission_data_from_statement(statement, commission.client_name)
            if commission_data:
                total_invoice += commission_data['invoice_total']
                total_commission += commission_data['commission_earned']
                statement_count += 1
                print(f"🎯 Recalculate: Added commission data for {commission.client_name}: invoice=${commission_data['invoice_total']}, commission=${commission_data['commission_earned']}")
            else:
                print(f"🎯 Recalculate: No commission data extracted for {commission.client_name} from upload {upload_id}")
                
                # Add to monthly breakdown if statement date is available
                if statement.selected_statement_date:
                    try:
                        # Handle selected_statement_date as JSON object
                        if isinstance(statement.selected_statement_date, dict):
                            date_str = statement.selected_statement_date.get('date') or statement.selected_statement_date.get('date_value')
                            if date_str:
                                # Parse the date string (could be ISO format or other format)
                                if 'T' in date_str or 'Z' in date_str:
                                    # ISO format
                                    statement_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                                else:
                                    # Try other common formats
                                    for fmt in ['%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y']:
                                        try:
                                            statement_date = datetime.strptime(date_str, fmt)
                                            break
                                        except ValueError:
                                            continue
                                    else:
                                        # If no format works, skip this statement
                                        print(f"Could not parse date: {date_str}")
                                        continue
                                
                                month = statement_date.month
                                if month in monthly_totals:
                                    monthly_totals[month] += commission_data['commission_earned']
                                    print(f"Added ${commission_data['commission_earned']} to month {month} for {commission.client_name}")
                        else:
                            # Handle as string (legacy format)
                            statement_date = datetime.fromisoformat(statement.selected_statement_date.replace('Z', '+00:00'))
                            month = statement_date.month
                            if month in monthly_totals:
                                monthly_totals[month] += commission_data['commission_earned']
                                print(f"Added ${commission_data['commission_earned']} to month {month} for {commission.client_name}")
                    except (ValueError, TypeError) as e:
                        print(f"Error parsing statement date for upload {upload_id}: {e}")
                        pass  # Skip if date parsing fails
        
        # Update the commission record with recalculated totals
        commission.invoice_total = total_invoice
        commission.commission_earned = total_commission
        commission.statement_count = statement_count
        commission.last_updated = datetime.utcnow()
        
        # Update monthly breakdown
        for month, total in monthly_totals.items():
            if month in month_columns:
                setattr(commission, month_columns[month], total)
                print(f"🎯 Recalculate: Set {month_columns[month]} = ${total} for {commission.client_name}")
        
        print(f"Recalculated commission totals for {commission.client_name}: invoice=${total_invoice}, commission=${total_commission}, statements={statement_count}")
        print(f"Monthly breakdown: {monthly_totals}")
        
        # Commit the changes to the database
        await db.commit()
        await db.refresh(commission)
        
    except Exception as e:
        print(f"Error recalculating commission totals: {e}")
        raise

async def extract_commission_data_from_statement(statement: StatementUploadModel, client_name: str):
    """Extract commission data for a specific client from a statement."""
    try:
        if not statement.final_data or not statement.field_config:
            return None
            
        # Find the client name, commission, and invoice fields using the same logic as process_commission_data_from_statement
        client_name_field = None
        commission_earned_field = None
        invoice_total_field = None
        
        print(f"🎯 Extract Commission: Processing field_config: {statement.field_config}")
        
        # Look for these specific database fields in the field_config (same logic as process_commission_data_from_statement)
        for field in statement.field_config:
            if isinstance(field, dict):
                field_name = field.get('field', '')
                field_label = field.get('label', '')
                
                print(f"🎯 Extract Commission: Checking field: {field_name} -> {field_label}")
                
                # Check for company/client name fields
                if (field_name.lower() in ['company name', 'client name', 'companyname', 'clientname'] or 
                    field_label.lower() in ['company name', 'client name', 'companyname', 'clientname'] or
                    'company' in field_name.lower() or 'company' in field_label.lower() or
                    'client' in field_name.lower() or 'client' in field_label.lower()):
                    client_name_field = field_label
                    print(f"🎯 Extract Commission: Found client name field: {client_name_field}")
                
                # Check for commission earned fields
                elif (field_name.lower() in ['commission earned', 'commissionearned', 'commission_earned'] or 
                      field_label.lower() in ['commission earned', 'commissionearned', 'commission_earned'] or
                      'commission' in field_name.lower() and 'earned' in field_name.lower() or
                      'commission' in field_label.lower() and 'earned' in field_label.lower()):
                    commission_earned_field = field_label
                    print(f"🎯 Extract Commission: Found commission earned field: {commission_earned_field}")
                
                # Check for invoice total fields
                elif (field_name.lower() in ['invoice total', 'invoicetotal', 'invoice_total', 'premium amount', 'premiumamount'] or 
                      field_label.lower() in ['invoice total', 'invoicetotal', 'invoice_total', 'premium amount', 'premiumamount'] or
                      'invoice' in field_name.lower() and 'total' in field_name.lower() or
                      'invoice' in field_label.lower() and 'total' in field_label.lower() or
                      'premium' in field_name.lower() and 'amount' in field_name.lower() or
                      'premium' in field_label.lower() and 'amount' in field_label.lower()):
                    invoice_total_field = field_label
                    print(f"🎯 Extract Commission: Found invoice total field: {invoice_total_field}")
        
        # If we didn't find the fields, try alternative field names (same logic as process_commission_data_from_statement)
        if not client_name_field:
            for field in statement.field_config:
                if isinstance(field, dict):
                    field_name = field.get('field', '').lower()
                    field_label = field.get('label', '').lower()
                    
                    # Try alternative client name patterns
                    if any(keyword in field_name or keyword in field_label for keyword in ['group', 'employer', 'organization']):
                        client_name_field = field.get('label', '')
                        print(f"🎯 Extract Commission: Found alternative client name field: {client_name_field}")
                        break
        
        if not commission_earned_field:
            for field in statement.field_config:
                if isinstance(field, dict):
                    field_name = field.get('field', '').lower()
                    field_label = field.get('label', '').lower()
                    
                    # Try alternative commission patterns
                    if any(keyword in field_name or keyword in field_label for keyword in ['commission', 'earned', 'paid', 'amount']):
                        commission_earned_field = field.get('label', '')
                        print(f"🎯 Extract Commission: Found alternative commission field: {commission_earned_field}")
                        break
        
        if not client_name_field:
            print(f"🎯 Extract Commission: Missing required field: client_name_field={client_name_field}")
            return None
        
        if not commission_earned_field:
            print(f"🎯 Extract Commission: Missing required field: commission_earned_field={commission_earned_field}")
            return None
            
        # Process each row to find matching client
        total_invoice = 0.0
        total_commission = 0.0
        
        print(f"🎯 Extract Commission: Looking for client '{client_name}' in statement data")
        
        for table in statement.final_data:
            if not isinstance(table, dict) or 'rows' not in table:
                continue
                
            for row in table['rows']:
                if isinstance(row, dict):
                    row_client_name = row.get(client_name_field, '').strip()
                    print(f"🎯 Extract Commission: Checking row client '{row_client_name}' against '{client_name}'")
                    if row_client_name.lower() == client_name.lower():
                        # Extract commission amount
                        commission_str = str(row.get(commission_earned_field, '0')).strip()
                        commission_amount = parse_currency_amount(commission_str)
                        total_commission += commission_amount
                        print(f"🎯 Extract Commission: Found commission ${commission_amount} for {client_name}")
                        
                        # Extract invoice amount if field exists
                        if invoice_total_field:
                            invoice_str = str(row.get(invoice_total_field, '0')).strip()
                            invoice_amount = parse_currency_amount(invoice_str)
                            total_invoice += invoice_amount
                            print(f"🎯 Extract Commission: Found invoice ${invoice_amount} for {client_name}")
                        else:
                            # No invoice field found, use 0
                            print(f"🎯 Extract Commission: No invoice field found, using 0 for {client_name}")
        
        print(f"🎯 Extract Commission: Total for {client_name}: commission=${total_commission}, invoice=${total_invoice}")
        
        return {
            'invoice_total': total_invoice,
            'commission_earned': total_commission
        }
        
    except Exception as e:
        print(f"Error extracting commission data from statement: {e}")
        return None

def parse_currency_amount(amount_str: str) -> float:
    """Parse currency amount string to float, handling various formats."""
    try:
        # Remove currency symbols and commas
        clean_str = amount_str.replace('$', '').replace(',', '')
        
        # Handle negative values in parentheses
        is_negative = clean_str.startswith('(') and clean_str.endswith(')')
        if is_negative:
            clean_str = clean_str.replace('(', '').replace(')', '')
        
        amount = float(clean_str)
        return -amount if is_negative else amount
        
    except (ValueError, TypeError):
        return 0.0

async def remove_upload_from_earned_commissions(db: AsyncSession, upload_id: str):
    """Remove an upload from earned commission records and recalculate totals."""
    try:
        # First, get the statement being deleted to extract its contribution
        from .statement_upload import get_statement_by_id
        deleted_statement = await get_statement_by_id(db, upload_id)
        if not deleted_statement:
            print(f"Warning: Could not find statement {upload_id} for deletion")
            return
        
        # Find all earned commission records that contain this upload_id
        result = await db.execute(
            select(EarnedCommission).where(
                EarnedCommission.upload_ids.isnot(None)
            )
        )
        commission_records = result.scalars().all()
        
        # Filter records that contain the upload_id
        records_to_update = []
        for commission in commission_records:
            if commission.upload_ids and upload_id in commission.upload_ids:
                records_to_update.append(commission)
                print(f"🎯 Remove Upload: Found commission record for {commission.client_name} that contains upload {upload_id}")
        
        print(f"🎯 Remove Upload: Found {len(records_to_update)} commission records to update")
        
        for commission in records_to_update:
            print(f"🎯 Remove Upload: Processing commission record for {commission.client_name}")
            
            # Extract the contribution of the deleted upload before removing it
            deleted_contribution = await extract_commission_data_from_statement(deleted_statement, commission.client_name)
            deleted_month = None
            
            # Get the month from the deleted statement
            if deleted_statement.selected_statement_date:
                try:
                    if isinstance(deleted_statement.selected_statement_date, dict):
                        date_str = deleted_statement.selected_statement_date.get('date') or deleted_statement.selected_statement_date.get('date_value')
                        if date_str:
                            if 'T' in date_str or 'Z' in date_str:
                                statement_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                            else:
                                for fmt in ['%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y']:
                                    try:
                                        statement_date = datetime.strptime(date_str, fmt)
                                        break
                                    except ValueError:
                                        continue
                                else:
                                    statement_date = None
                            
                            if statement_date:
                                deleted_month = statement_date.month
                                print(f"🎯 Remove Upload: Deleted upload is from month {deleted_month}")
                except (ValueError, TypeError) as e:
                    print(f"Error parsing deleted statement date: {e}")
            
            # Remove this upload_id from the upload_ids list
            if commission.upload_ids and upload_id in commission.upload_ids:
                commission.upload_ids.remove(upload_id)
                print(f"🎯 Remove Upload: Removed upload {upload_id} from {commission.client_name}, remaining uploads: {commission.upload_ids}")
                
                # If no more uploads contribute to this record, delete it
                if not commission.upload_ids:
                    await db.delete(commission)
                    print(f"🎯 Remove Upload: Deleted commission record {commission.id} as no uploads remain")
                else:
                    # Subtract the deleted upload's contribution from totals and monthly breakdown
                    if deleted_contribution:
                        print(f"🎯 Remove Upload: Subtracting deleted contribution for {commission.client_name}: invoice=${deleted_contribution['invoice_total']}, commission=${deleted_contribution['commission_earned']}")
                        
                        # Subtract from totals
                        commission.invoice_total = max(0, (commission.invoice_total or 0) - deleted_contribution['invoice_total'])
                        commission.commission_earned = max(0, (commission.commission_earned or 0) - deleted_contribution['commission_earned'])
                        commission.statement_count = max(0, (commission.statement_count or 0) - 1)
                        
                        # Subtract from monthly breakdown if we know the month
                        if deleted_month:
                            month_columns = {
                                1: 'jan_commission', 2: 'feb_commission', 3: 'mar_commission',
                                4: 'apr_commission', 5: 'may_commission', 6: 'jun_commission',
                                7: 'jul_commission', 8: 'aug_commission', 9: 'sep_commission',
                                10: 'oct_commission', 11: 'nov_commission', 12: 'dec_commission'
                            }
                            
                            if deleted_month in month_columns:
                                current_month_value = getattr(commission, month_columns[deleted_month]) or 0
                                new_month_value = max(0, current_month_value - deleted_contribution['commission_earned'])
                                setattr(commission, month_columns[deleted_month], new_month_value)
                                print(f"🎯 Remove Upload: Subtracted ${deleted_contribution['commission_earned']} from {month_columns[deleted_month]} for {commission.client_name}")
                        
                        commission.last_updated = datetime.utcnow()
                        print(f"🎯 Remove Upload: Updated commission record {commission.id}, removed upload {upload_id}")
                    else:
                        # Fallback to full recalculation if we can't extract the deleted contribution
                        print(f"🎯 Remove Upload: Could not extract deleted contribution, falling back to full recalculation for {commission.client_name}")
                        await recalculate_commission_totals(db, commission)
        
        await db.commit()
        print(f"Successfully removed upload {upload_id} from {len(records_to_update)} commission records")
        
    except Exception as e:
        await db.rollback()
        print(f"Error removing upload from earned commissions: {e}")
        raise

async def create_commission_record(db: AsyncSession, commission: EarnedCommissionCreate):
    """Create a new commission record with monthly breakdown."""
    return await create_earned_commission(db, commission)

async def update_commission_record(db: AsyncSession, record_id: UUID, invoice_total: float, commission_earned: float, statement_month: int, statement_year: int):
    """Update commission record with new data."""
    result = await db.execute(select(EarnedCommission).where(EarnedCommission.id == record_id))
    db_commission = result.scalar_one_or_none()
    
    if not db_commission:
        return None
    
    # Update basic fields
    db_commission.invoice_total = invoice_total
    db_commission.commission_earned = commission_earned
    db_commission.statement_month = statement_month
    db_commission.statement_year = statement_year
    db_commission.last_updated = datetime.utcnow()
    
    # Update the appropriate month column
    month_columns = {
        1: 'jan_commission', 2: 'feb_commission', 3: 'mar_commission',
        4: 'apr_commission', 5: 'may_commission', 6: 'jun_commission',
        7: 'jul_commission', 8: 'aug_commission', 9: 'sep_commission',
        10: 'oct_commission', 11: 'nov_commission', 12: 'dec_commission'
    }
    
    if statement_month in month_columns:
        setattr(db_commission, month_columns[statement_month], commission_earned)
    
    await db.commit()
    await db.refresh(db_commission)
    return db_commission

async def process_commission_data_from_statement(db: AsyncSession, statement_upload: StatementUploadModel):
    """Process commission data from an approved statement and update earned commission records."""
    if not statement_upload.final_data:
        print(f"Missing final_data: final_data={bool(statement_upload.final_data)}")
        return None
    
    # Check if field_config is missing or empty
    if not statement_upload.field_config:
        print(f"Missing field_config: field_config={bool(statement_upload.field_config)}")
        print("Attempting to process commission data without field_config by inferring fields from data...")
        
        # Try to infer fields from the data structure
        if statement_upload.final_data and len(statement_upload.final_data) > 0:
            first_table = statement_upload.final_data[0]
            if isinstance(first_table, dict) and 'rows' in first_table and len(first_table['rows']) > 0:
                first_row = first_table['rows'][0]
                if isinstance(first_row, dict):
                    # Try to infer field mapping from the data
                    inferred_field_config = []
                    for key, value in first_row.items():
                        if key and value:
                            # Try to determine field type based on key name and value
                            field_type = 'unknown'
                            if any(keyword in key.lower() for keyword in ['company', 'client', 'group', 'name']):
                                field_type = 'client_name'
                            elif any(keyword in key.lower() for keyword in ['commission', 'earned', 'paid']):
                                field_type = 'commission_earned'
                            elif any(keyword in key.lower() for keyword in ['invoice', 'premium', 'total', 'amount']):
                                field_type = 'invoice_total'
                            
                            inferred_field_config.append({
                                'field': key,
                                'label': key,
                                'type': field_type
                            })
                    
                    if inferred_field_config:
                        print(f"Inferred field_config: {inferred_field_config}")
                        # Create a temporary field_config for processing
                        statement_upload.field_config = inferred_field_config
                    else:
                        print("Could not infer field_config from data")
                        return None
                else:
                    print("First row is not a dictionary")
                    return None
            else:
                print("No valid table structure found")
                return None
        else:
            print("No final_data available")
            return None
    
    # Validate data structure
    if not isinstance(statement_upload.final_data, list):
        print(f"Invalid final_data structure: expected list, got {type(statement_upload.final_data)}")
        return None
    
    if len(statement_upload.final_data) == 0:
        print("Empty final_data list")
        return None
    
    # Check if data structure is correct (should be array of objects, not arrays)
    first_table = statement_upload.final_data[0]
    if not isinstance(first_table, dict) or 'rows' not in first_table:
        print(f"Invalid table structure in final_data: {type(first_table)}")
        return None
    
    if not first_table['rows'] or len(first_table['rows']) == 0:
        print("No rows in first table")
        return None
    
    first_row = first_table['rows'][0]
    if not isinstance(first_row, dict):
        print(f"Invalid row structure: expected dict, got {type(first_row)}")
        print("This indicates the data was not properly mapped. Please re-upload the statement.")
        return None
    
    # Get statement date from the upload
    statement_date = None
    statement_month = None
    statement_year = None
    
    print(f"🎯 Commission Processing: Checking for selected statement date")
    print(f"🎯 Commission Processing: selected_statement_date from upload: {statement_upload.selected_statement_date}")
    print(f"🎯 Commission Processing: Upload ID: {statement_upload.id}")
    print(f"🎯 Commission Processing: Upload status: {statement_upload.status}")
    
    # Check if status is approved (case insensitive)
    if statement_upload.status.lower() != 'approved':
        print(f"🎯 Commission Processing: Statement status is not approved: {statement_upload.status}")
        return None
    
    if statement_upload.selected_statement_date:
        print(f"🎯 Commission Processing: Found selected statement date in upload")
        try:
            # Parse the selected statement date - check both 'date' and 'date_value' keys
            date_str = statement_upload.selected_statement_date.get('date') or statement_upload.selected_statement_date.get('date_value')
            print(f"🎯 Commission Processing: Extracted date string: {date_str}")
            
            if date_str:
                print(f"🎯 Commission Processing: Attempting to parse date: {date_str}")
                # Try to parse as ISO format first
                try:
                    statement_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    print(f"🎯 Commission Processing: Successfully parsed as ISO format: {statement_date}")
                except ValueError:
                    print(f"🎯 Commission Processing: ISO format failed, trying parse_statement_date")
                    # If ISO format fails, try to parse using the parse_statement_date function
                    from app.api.mapping import parse_statement_date
                    statement_date = parse_statement_date(date_str)
                    if not statement_date:
                        raise ValueError(f"Could not parse date: {date_str}")
                    print(f"🎯 Commission Processing: Successfully parsed with parse_statement_date: {statement_date}")
                
                statement_month = statement_date.month
                statement_year = statement_date.year
                print(f"🎯 Commission Processing: Using statement date: {statement_date} (month: {statement_month}, year: {statement_year})")
            else:
                print(f"🎯 Commission Processing: No date string found in selected_statement_date")
        except Exception as e:
            print(f"🎯 Commission Processing: Error parsing statement date: {e}")
            # Fall back to current date if parsing fails
            statement_date = datetime.utcnow()
            statement_month = statement_date.month
            statement_year = statement_date.year
            print(f"🎯 Commission Processing: Falling back to current date: {statement_date}")
    else:
        print(f"🎯 Commission Processing: No statement date selected, using current date")
        statement_date = datetime.utcnow()
        statement_month = statement_date.month
        statement_year = statement_date.year
        print(f"🎯 Commission Processing: Using current date: {statement_date}")
    
    # Find the field mappings for Client Name and Commission Earned
    client_name_field = None
    commission_earned_field = None
    invoice_total_field = None
    
    print(f"Processing field_config: {statement_upload.field_config}")
    
    # Look for these specific database fields in the field_config
    for field in statement_upload.field_config:
        if isinstance(field, dict):
            field_name = field.get('field', '')
            field_label = field.get('label', '')
            
            print(f"Checking field: {field_name} -> {field_label}")
            
            # Check for company/client name fields
            if (field_name.lower() in ['company name', 'client name', 'companyname', 'clientname'] or 
                field_label.lower() in ['company name', 'client name', 'companyname', 'clientname'] or
                'company' in field_name.lower() or 'company' in field_label.lower() or
                'client' in field_name.lower() or 'client' in field_label.lower()):
                client_name_field = field_label
                print(f"Found client name field: {client_name_field}")
            
            # Check for commission earned fields
            elif (field_name.lower() in ['commission earned', 'commissionearned', 'commission_earned'] or 
                  field_label.lower() in ['commission earned', 'commissionearned', 'commission_earned'] or
                  'commission' in field_name.lower() and 'earned' in field_name.lower() or
                  'commission' in field_label.lower() and 'earned' in field_label.lower()):
                commission_earned_field = field_label
                print(f"Found commission earned field: {commission_earned_field}")
            
            # Check for invoice total fields
            elif (field_name.lower() in ['invoice total', 'invoicetotal', 'invoice_total', 'premium amount', 'premiumamount'] or 
                  field_label.lower() in ['invoice total', 'invoicetotal', 'invoice_total', 'premium amount', 'premiumamount'] or
                  'invoice' in field_name.lower() and 'total' in field_name.lower() or
                  'invoice' in field_label.lower() and 'total' in field_label.lower() or
                  'premium' in field_name.lower() and 'amount' in field_name.lower() or
                  'premium' in field_label.lower() and 'amount' in field_label.lower()):
                invoice_total_field = field_label
                print(f"Found invoice total field: {invoice_total_field}")
    
    # If we didn't find the fields, try alternative field names
    if not client_name_field:
        for field in statement_upload.field_config:
            if isinstance(field, dict):
                field_name = field.get('field', '').lower()
                field_label = field.get('label', '').lower()
                
                # Try alternative client name patterns
                if any(keyword in field_name or keyword in field_label for keyword in ['group', 'employer', 'organization']):
                    client_name_field = field.get('label', '')
                    print(f"Found alternative client name field: {client_name_field}")
                    break
    
    if not commission_earned_field:
        for field in statement_upload.field_config:
            if isinstance(field, dict):
                field_name = field.get('field', '').lower()
                field_label = field.get('label', '').lower()
                
                # Try alternative commission patterns
                if any(keyword in field_name or keyword in field_label for keyword in ['commission', 'earned', 'paid', 'amount']):
                    commission_earned_field = field.get('label', '')
                    print(f"Found alternative commission field: {commission_earned_field}")
                    break
    
    if not client_name_field:
        print(f"Missing required field: client_name_field={client_name_field}")
        print(f"Available fields in field_config: {[f.get('label', '') for f in statement_upload.field_config if isinstance(f, dict)]}")
        # If we don't have the client name field, skip processing
        return None
    
    if not commission_earned_field:
        print(f"Missing required field: commission_earned_field={commission_earned_field}")
        print(f"Available fields in field_config: {[f.get('label', '') for f in statement_upload.field_config if isinstance(f, dict)]}")
        # If we don't have the commission field, skip processing
        return None
    
    # Invoice total field is optional - if not found, we'll use 0
    if not invoice_total_field:
        print(f"No invoice total field found - will use 0 for invoice totals")
    
    print(f"Processing {len(statement_upload.final_data)} rows with fields: client={client_name_field}, commission={commission_earned_field}, invoice={invoice_total_field}")
    print(f"Final data sample: {statement_upload.final_data[:2] if statement_upload.final_data else 'No data'}")
    
    # Process each row in the final_data
    for table in statement_upload.final_data:
        if not isinstance(table, dict) or 'rows' not in table:
            continue
            
        for row in table['rows']:
            if isinstance(row, dict):
                client_name = row.get(client_name_field, '').strip()
                commission_earned_str = str(row.get(commission_earned_field, '0')).strip()
                # Handle case where invoice_total_field is None (no invoice total field in statement)
                if invoice_total_field:
                    invoice_total_str = str(row.get(invoice_total_field, '0')).strip()
                else:
                    invoice_total_str = '0'  # Default to 0 when no invoice total field exists
                
                if not client_name:
                    continue
                
                print(f"Processing row: client={client_name}, commission={commission_earned_str}, invoice={invoice_total_str}")
                
                # Convert string values to float, handling various formats including negative values in parentheses
                try:
                    # Handle negative values in parentheses
                    commission_earned_str_clean = commission_earned_str.replace('$', '').replace(',', '')
                    invoice_total_str_clean = invoice_total_str.replace('$', '').replace(',', '')
                    
                    # Check if values are negative (in parentheses)
                    commission_is_negative = commission_earned_str_clean.startswith('(') and commission_earned_str_clean.endswith(')')
                    invoice_is_negative = invoice_total_str_clean.startswith('(') and invoice_total_str_clean.endswith(')')
                    
                    # Remove parentheses and convert to float
                    commission_earned = float(commission_earned_str_clean.replace('(', '').replace(')', ''))
                    invoice_total = float(invoice_total_str_clean.replace('(', '').replace(')', ''))
                    
                    # Apply negative sign if values were in parentheses
                    if commission_is_negative:
                        commission_earned = -commission_earned
                    if invoice_is_negative:
                        invoice_total = -invoice_total
                except (ValueError, TypeError):
                    commission_earned = 0
                    invoice_total = 0
                
                # Process commission data if it has a value (including negative adjustments)
                if commission_earned != 0:
                    print(f"Upserting commission data: client={client_name}, commission={commission_earned}, invoice={invoice_total}")
                    # Upsert the commission data
                    await upsert_earned_commission(
                        db, 
                        statement_upload.company_id, 
                        client_name, 
                        invoice_total, 
                        commission_earned,
                        statement_date,
                        statement_month,
                        statement_year,
                        str(statement_upload.id)
                    )
                elif commission_earned == 0 and invoice_total != 0:
                    # If commission is 0 but invoice has a value, still process it
                    print(f"Upserting invoice-only data: client={client_name}, commission={commission_earned}, invoice={invoice_total}")
                    await upsert_earned_commission(
                        db, 
                        statement_upload.company_id, 
                        client_name, 
                        invoice_total, 
                        commission_earned,
                        statement_date,
                        statement_month,
                        statement_year,
                        str(statement_upload.id)
                    )
    
    print("Commission data processing completed successfully")
    return True
