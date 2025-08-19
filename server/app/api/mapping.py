from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.config import get_db
from app.utils.db_retry import with_db_retry
from app.services.format_learning_service import FormatLearningService
from typing import List, Dict, Any
from datetime import datetime
import re
import logging

router = APIRouter()
format_learning_service = FormatLearningService()
logger = logging.getLogger(__name__)

# --- New Pydantic schema for mapping config ---
from pydantic import BaseModel

class MappingConfig(BaseModel):
    mapping: Dict[str, str]
    plan_types: List[str] = []
    table_names: List[str] = []
    field_config: List[Dict[str, str]] = []
    table_data: List[List[str]] = []  # Add table data for learning
    headers: List[str] = []  # Add headers for learning
    selected_statement_date: Dict[str, Any] = None  # Add selected statement date

@router.get("/companies/{company_id}/mapping/", response_model=MappingConfig)
async def get_company_mapping(company_id: str, db: AsyncSession = Depends(get_db)):
    # Fetch mapping from company_field_mappings table with retry
    mapping_rows = await with_db_retry(db, crud.get_company_mappings, company_id=company_id)
    mapping = {row.display_name: row.column_name for row in mapping_rows}
    
    # Fetch company configuration (field_config, plan_types, table_names) with retry
    company_config = await with_db_retry(db, crud.get_company_configuration, company_id=company_id)
    
    # Use company configuration if available, otherwise fall back to defaults
    plan_types = company_config.plan_types if company_config and company_config.plan_types else []
    table_names = company_config.table_names if company_config and company_config.table_names else []
    
    # Get field_config from company configuration if available, otherwise return empty list for new carriers
    if company_config and company_config.field_config:
        field_config = company_config.field_config
    else:
        # For new carriers with no existing configuration, return empty field_config
        # This allows the frontend to start with empty fields and let users add them manually
        field_config = []
    
    return MappingConfig(
        mapping=mapping,
        plan_types=plan_types,
        table_names=table_names,
        field_config=field_config
    )

@router.post("/companies/{company_id}/mapping/")
async def update_company_mapping(company_id: str, config: MappingConfig, db: AsyncSession = Depends(get_db)):
    logger.info(f"🎯 Mapping API: Received mapping request for company {company_id}")
    logger.info(f"🎯 Mapping API: Config received - mapping keys: {list(config.mapping.keys()) if config.mapping else 'None'}")
    logger.info(f"🎯 Mapping API: Selected statement date: {config.selected_statement_date}")
    logger.info(f"🎯 Mapping API: Table data rows: {len(config.table_data) if config.table_data else 0}")
    logger.info(f"🎯 Mapping API: Headers: {config.headers}")
    
    # Save field mapping to company_field_mappings table with retry
    for display_name, column_name in config.mapping.items():
        mapping_obj = schemas.CompanyFieldMappingCreate(
            company_id=company_id,
            display_name=display_name,
            column_name=column_name,
        )
        await with_db_retry(db, crud.save_company_mapping, mapping=mapping_obj)
    
    # Save field_config, plan_types, and table_names to company_configurations table with retry
    await with_db_retry(
        db, 
        crud.save_company_configuration,
        company_id=company_id, 
        field_config=config.field_config,
        plan_types=config.plan_types,
        table_names=config.table_names
    )
    
    # Learn from the processed file if table data is provided
    if config.table_data and config.headers and config.mapping:
        try:
            logger.info(f"🎯 Mapping API: Learning from processed file")
            logger.info(f"🎯 Mapping API: Table data length: {len(config.table_data)}")
            logger.info(f"🎯 Mapping API: Headers: {config.headers}")
            logger.info(f"🎯 Mapping API: Mapping: {config.mapping}")
            
            await format_learning_service.learn_from_processed_file(
                db=db,
                company_id=company_id,
                table_data=config.table_data,
                headers=config.headers,
                field_mapping=config.mapping,
                confidence_score=85,  # Higher confidence for manually mapped data
                table_editor_settings=None  # Will be learned from table editor save
            )
            logger.info(f"🎯 Mapping API: Format learning completed successfully")
        except Exception as e:
            # Log error but don't fail the mapping save
            logger.error(f"🎯 Mapping API: Error learning from processed file: {e}")
            print(f"Error learning from processed file: {e}")
    
    # Process commission data with statement date if provided
    if config.selected_statement_date and config.table_data:
        try:
            logger.info(f"🎯 Mapping API: Processing commission data with statement date")
            logger.info(f"🎯 Mapping API: Statement date object: {config.selected_statement_date}")
            await process_commission_data_with_date(
                db=db,
                company_id=company_id,
                table_data=config.table_data,
                headers=config.headers,
                mapping=config.mapping,
                statement_date=config.selected_statement_date
            )
            logger.info(f"🎯 Mapping API: Commission data processing completed successfully")
        except Exception as e:
            # Log error but don't fail the mapping save
            logger.error(f"🎯 Mapping API: Error processing commission data: {e}")
            print(f"Error processing commission data: {e}")
    else:
        logger.warning(f"🎯 Mapping API: No statement date or table data provided for commission processing")
        if not config.selected_statement_date:
            logger.warning(f"🎯 Mapping API: selected_statement_date is None or empty")
        if not config.table_data:
            logger.warning(f"🎯 Mapping API: table_data is None or empty")
    
    logger.info(f"🎯 Mapping API: Mapping update completed successfully for company {company_id}")
    return {"ok": True}


async def process_commission_data_with_date(
    db: AsyncSession,
    company_id: str,
    table_data: List[List[str]],
    headers: List[str],
    mapping: Dict[str, str],
    statement_date: Dict[str, Any]
):
    """
    Process commission data and create/update earned commission records with statement date.
    """
    try:
        logger.info(f"🎯 Commission Processing: Starting commission data processing")
        logger.info(f"🎯 Commission Processing: Company ID: {company_id}")
        logger.info(f"🎯 Commission Processing: Table data rows: {len(table_data)}")
        logger.info(f"🎯 Commission Processing: Headers: {headers}")
        logger.info(f"🎯 Commission Processing: Mapping: {mapping}")
        logger.info(f"🎯 Commission Processing: Statement date: {statement_date}")
        
        # Parse the statement date
        date_value = statement_date.get('date_value', '')
        if not date_value:
            logger.warning(f"🎯 Commission Processing: No statement date provided")
            print("No statement date provided")
            return
        
        logger.info(f"🎯 Commission Processing: Date value extracted: {date_value}")
        
        # Parse the date string to get month and year
        parsed_date = parse_statement_date(date_value)
        if not parsed_date:
            logger.error(f"🎯 Commission Processing: Could not parse statement date: {date_value}")
            print(f"Could not parse statement date: {date_value}")
            return
        
        logger.info(f"🎯 Commission Processing: Parsed date: {parsed_date}")
        statement_month = parsed_date.month
        statement_year = parsed_date.year
        logger.info(f"🎯 Commission Processing: Month: {statement_month}, Year: {statement_year}")
        
        # Find the relevant columns from the mapping
        client_name_col = None
        invoice_total_col = None
        commission_col = None
        auto_fill_invoice = False
        
        # Look for common field names in the mapping
        for display_name, column_name in mapping.items():
            display_lower = display_name.lower()
            if any(keyword in display_lower for keyword in ['company', 'client', 'group', 'name']):
                client_name_col = column_name
                logger.info(f"🎯 Commission Processing: Found client name column: {column_name}")
            elif any(keyword in display_lower for keyword in ['invoice', 'premium', 'total', 'amount']):
                invoice_total_col = column_name
                logger.info(f"🎯 Commission Processing: Found invoice total column: {column_name}")
                
                # Check if this is auto-filled with zero
                if column_name == '__AUTO_FILL_ZERO__':
                    auto_fill_invoice = True
                    invoice_total_col = None  # We'll handle this specially
                    logger.info(f"🎯 Commission Processing: Invoice total will be auto-filled with $0.00")
            elif any(keyword in display_lower for keyword in ['commission', 'earned', 'paid']):
                commission_col = column_name
                logger.info(f"🎯 Commission Processing: Found commission column: {column_name}")
        
        # If we can't find the columns, try to infer from headers
        if not client_name_col:
            for i, header in enumerate(headers):
                header_lower = header.lower()
                if any(keyword in header_lower for keyword in ['company', 'client', 'group', 'name']):
                    client_name_col = headers[i]
                    logger.info(f"🎯 Commission Processing: Inferred client name column from headers: {headers[i]}")
                    break
        
        if not invoice_total_col:
            for i, header in enumerate(headers):
                header_lower = header.lower()
                if any(keyword in header_lower for keyword in ['invoice', 'premium', 'total', 'amount']):
                    invoice_total_col = headers[i]
                    logger.info(f"🎯 Commission Processing: Inferred invoice total column from headers: {headers[i]}")
                    break
        
        if not commission_col:
            for i, header in enumerate(headers):
                header_lower = header.lower()
                if any(keyword in header_lower for keyword in ['commission', 'earned', 'paid']):
                    commission_col = headers[i]
                    logger.info(f"🎯 Commission Processing: Inferred commission column from headers: {headers[i]}")
                    break
        
        logger.info(f"🎯 Commission Processing: Final column mapping - Client: {client_name_col}, Invoice: {invoice_total_col}, Commission: {commission_col}")
        
        # Process each row in the table data
        processed_rows = 0
        for row_idx, row in enumerate(table_data):
            if len(row) != len(headers):
                logger.warning(f"🎯 Commission Processing: Row {row_idx} length mismatch - expected {len(headers)}, got {len(row)}")
                continue
            
            # Extract values
            client_name = row[headers.index(client_name_col)] if client_name_col else "Unknown"
            
            # Handle invoice total - either from column or auto-filled with zero
            if auto_fill_invoice:
                invoice_total_str = "0"  # Auto-fill with zero
                logger.info(f"🎯 Commission Processing: Auto-filling invoice total with $0.00 for {client_name}")
            else:
                invoice_total_str = row[headers.index(invoice_total_col)] if invoice_total_col else "0"
            
            commission_str = row[headers.index(commission_col)] if commission_col else "0"
            
            logger.info(f"🎯 Commission Processing: Row {row_idx} - Client: {client_name}, Invoice: {invoice_total_str}, Commission: {commission_str}")
            
            # Skip if no client name or if it's a summary row
            if not client_name or client_name.lower() in ['total', 'summary', 'subtotal', '']:
                logger.info(f"🎯 Commission Processing: Skipping row {row_idx} - summary row or no client name")
                continue
            
            # Parse numeric values
            invoice_total = parse_currency(invoice_total_str)
            commission_earned = parse_currency(commission_str)
            
            logger.info(f"🎯 Commission Processing: Row {row_idx} - Parsed values - Invoice: {invoice_total}, Commission: {commission_earned}")
            
            if commission_earned <= 0:
                logger.info(f"🎯 Commission Processing: Skipping row {row_idx} - commission <= 0")
                continue
            
            # Create or update commission record
            await create_or_update_commission_record(
                db=db,
                carrier_id=company_id,
                client_name=client_name,
                invoice_total=invoice_total,
                commission_earned=commission_earned,
                statement_date=parsed_date,
                statement_month=statement_month,
                statement_year=statement_year
            )
            processed_rows += 1
            logger.info(f"🎯 Commission Processing: Successfully processed row {row_idx}")
        
        logger.info(f"🎯 Commission Processing: Completed processing {processed_rows} rows with statement date {date_value}")
        print(f"Processed commission data for {len(table_data)} rows with statement date {date_value}")
        
    except Exception as e:
        logger.error(f"🎯 Commission Processing: Error processing commission data: {e}")
        print(f"Error processing commission data: {e}")
        raise


def parse_statement_date(date_str: str) -> datetime:
    """
    Parse various date formats from statement date string.
    """
    try:
        logger.info(f"🎯 Date Parsing: Attempting to parse date: {date_str}")
        
        # Remove any extra whitespace
        date_str = date_str.strip()
        
        # Try different date formats
        formats = [
            '%m/%d/%Y',  # 01/15/2025
            '%m-%d-%Y',  # 01-15-2025
            '%Y-%m-%d',  # 2025-01-15
            '%m/%d/%y',  # 01/15/25
            '%m-%d-%y',  # 01-15-25
            '%B %d, %Y',  # January 15, 2025
            '%b %d, %Y',  # Jan 15, 2025
        ]
        
        for fmt in formats:
            try:
                parsed_date = datetime.strptime(date_str, fmt)
                logger.info(f"🎯 Date Parsing: Successfully parsed date '{date_str}' with format '{fmt}' -> {parsed_date}")
                return parsed_date
            except ValueError:
                continue
        
        # If none of the formats work, try to extract date using regex
        import re
        
        # Match MM/DD/YYYY or MM-DD-YYYY
        match = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', date_str)
        if match:
            month, day, year = match.groups()
            parsed_date = datetime(int(year), int(month), int(day))
            logger.info(f"🎯 Date Parsing: Successfully parsed date '{date_str}' with regex MM/DD/YYYY -> {parsed_date}")
            return parsed_date
        
        # Match YYYY-MM-DD
        match = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', date_str)
        if match:
            year, month, day = match.groups()
            parsed_date = datetime(int(year), int(month), int(day))
            logger.info(f"🎯 Date Parsing: Successfully parsed date '{date_str}' with regex YYYY-MM-DD -> {parsed_date}")
            return parsed_date
        
        logger.error(f"🎯 Date Parsing: Could not parse date '{date_str}' with any format")
        return None
        
    except Exception as e:
        logger.error(f"🎯 Date Parsing: Error parsing date {date_str}: {e}")
        print(f"Error parsing date {date_str}: {e}")
        return None


def parse_currency(currency_str: str) -> float:
    """
    Parse currency string to float value.
    """
    try:
        if not currency_str:
            return 0.0
        
        # Remove currency symbols, commas, and extra whitespace
        cleaned = re.sub(r'[^\d.-]', '', currency_str.strip())
        
        if not cleaned:
            return 0.0
        
        return float(cleaned)
        
    except Exception as e:
        logger.error(f"🎯 Currency Parsing: Error parsing currency {currency_str}: {e}")
        print(f"Error parsing currency {currency_str}: {e}")
        return 0.0


async def create_or_update_commission_record(
    db: AsyncSession,
    carrier_id: str,
    client_name: str,
    invoice_total: float,
    commission_earned: float,
    statement_date: datetime,
    statement_month: int,
    statement_year: int
):
    """
    Create or update commission record with monthly breakdown.
    """
    try:
        logger.info(f"🎯 Commission Record: Creating/updating record for {carrier_id} - {client_name} - {statement_date}")
        
        # Check if record exists for this carrier, client, and statement date
        existing_record = await crud.get_commission_record(
            db, 
            carrier_id=carrier_id,
            client_name=client_name,
            statement_date=statement_date
        )
        
        if existing_record:
            logger.info(f"🎯 Commission Record: Updating existing record ID {existing_record.id}")
            # Update existing record
            await crud.update_commission_record(
                db,
                record_id=existing_record.id,
                invoice_total=invoice_total,
                commission_earned=commission_earned,
                statement_month=statement_month,
                statement_year=statement_year
            )
            logger.info(f"🎯 Commission Record: Successfully updated existing record")
        else:
            logger.info(f"🎯 Commission Record: Creating new record")
            # Create new record
            commission_record = schemas.EarnedCommissionCreate(
                carrier_id=carrier_id,
                client_name=client_name,
                invoice_total=invoice_total,
                commission_earned=commission_earned,
                statement_date=statement_date,
                statement_month=statement_month,
                statement_year=statement_year,
                statement_count=1
            )
            
            # Set the appropriate month column
            month_columns = {
                1: 'jan_commission', 2: 'feb_commission', 3: 'mar_commission',
                4: 'apr_commission', 5: 'may_commission', 6: 'jun_commission',
                7: 'jul_commission', 8: 'aug_commission', 9: 'sep_commission',
                10: 'oct_commission', 11: 'nov_commission', 12: 'dec_commission'
            }
            
            if statement_month in month_columns:
                setattr(commission_record, month_columns[statement_month], commission_earned)
                logger.info(f"🎯 Commission Record: Set {month_columns[statement_month]} = {commission_earned}")
            
            await crud.create_commission_record(db, commission_record)
            logger.info(f"🎯 Commission Record: Successfully created new record")
        
    except Exception as e:
        logger.error(f"🎯 Commission Record: Error creating/updating commission record: {e}")
        print(f"Error creating/updating commission record: {e}")
        raise
