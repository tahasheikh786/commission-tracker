"""
Utility functions for generating and managing normalized filenames for statement uploads.
"""
import re
from datetime import datetime
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from uuid import UUID


def sanitize_carrier_name(carrier_name: str) -> str:
    """
    Sanitize carrier name for use in filename.
    Removes special characters and replaces spaces with underscores.
    
    Args:
        carrier_name: Original carrier name
        
    Returns:
        Sanitized carrier name safe for filenames
    """
    # Remove special characters and replace spaces with underscores
    sanitized = re.sub(r'[^\w\s-]', '', carrier_name)
    sanitized = re.sub(r'[\s]+', '_', sanitized)
    # Remove multiple consecutive underscores
    sanitized = re.sub(r'_+', '_', sanitized)
    # Remove leading/trailing underscores
    sanitized = sanitized.strip('_')
    return sanitized


def format_statement_date(statement_date: dict) -> Tuple[str, int, int]:
    """
    Format statement date from various input formats to YYYY-MM string.
    
    Args:
        statement_date: Dictionary containing date information with keys like:
                       - 'year' and 'month'
                       - 'date' (ISO string)
                       - 'value' (ISO string)
    
    Returns:
        Tuple of (formatted_date_string, year, month)
    """
    year = None
    month = None
    
    # Try to extract year and month from various dict formats
    if isinstance(statement_date, dict):
        # Format 1: Direct year and month fields
        if 'year' in statement_date and 'month' in statement_date:
            year = int(statement_date['year'])
            month = int(statement_date['month'])
        # Format 2: ISO date string in 'date' field
        elif 'date' in statement_date:
            date_str = statement_date['date']
            if isinstance(date_str, str):
                dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                year = dt.year
                month = dt.month
        # Format 3: ISO date string in 'value' field
        elif 'value' in statement_date:
            date_str = statement_date['value']
            if isinstance(date_str, str):
                dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                year = dt.year
                month = dt.month
    
    if year and month:
        formatted_date = f"{year}-{month:02d}"
        return formatted_date, year, month
    
    # Fallback to current date if parsing fails
    now = datetime.now()
    formatted_date = f"{now.year}-{now.month:02d}"
    return formatted_date, now.year, now.month


async def check_existing_filenames(
    db: AsyncSession,
    carrier_id: UUID,
    year: int,
    month: int,
    file_extension: str,
    carrier_name: str,
    exclude_upload_id: Optional[UUID] = None
) -> int:
    """
    Check for existing files with the same carrier and month,
    and return the next available number suffix.
    
    Args:
        db: Database session
        carrier_id: Carrier UUID
        year: Statement year
        month: Statement month
        file_extension: File extension (e.g., 'pdf', 'xlsx')
        carrier_name: Sanitized carrier name
        exclude_upload_id: Upload ID to exclude from search (for renames)
    
    Returns:
        Next available number (0 if no duplicates, 1+ for duplicates)
    """
    from app.db.models import StatementUpload
    
    # Sanitize carrier name for pattern matching
    sanitized_carrier = sanitize_carrier_name(carrier_name)
    date_str = f"{year}-{month:02d}"
    
    # Build base pattern for matching files
    # Matches: carriername_YYYY-MM.ext or carriername_YYYY-MM(N).ext
    base_pattern = f"{sanitized_carrier}_{date_str}"
    pattern = f"%{base_pattern}%"
    
    # Query for existing statements with similar filenames
    query = select(StatementUpload).where(
        or_(
            StatementUpload.carrier_id == carrier_id,
            and_(
                StatementUpload.company_id == carrier_id,
                StatementUpload.carrier_id.is_(None)
            )
        ),
        StatementUpload.file_name.like(pattern)
    )
    
    # Exclude the current upload if renaming
    if exclude_upload_id:
        query = query.where(StatementUpload.id != exclude_upload_id)
    
    result = await db.execute(query)
    existing_uploads = result.scalars().all()
    
    if not existing_uploads:
        return 0
    
    # Extract numbers from existing filenames
    # Pattern: carriername_YYYY-MM(N).ext where N is optional
    number_pattern = re.compile(
        rf"{re.escape(base_pattern)}(?:\((\d+)\))?\.{re.escape(file_extension)}$"
    )
    
    existing_numbers = []
    for upload in existing_uploads:
        # Extract filename from full GCS path
        filename = upload.file_name.split('/')[-1] if upload.file_name else ""
        match = number_pattern.search(filename)
        if match:
            # If no number in parentheses, it's the base version (0)
            num = int(match.group(1)) if match.group(1) else 0
            existing_numbers.append(num)
    
    if not existing_numbers:
        return 0
    
    # Return next available number
    max_num = max(existing_numbers)
    return max_num + 1


def generate_normalized_filename(
    carrier_name: str,
    statement_date_str: str,
    file_extension: str,
    duplicate_number: int = 0
) -> str:
    """
    Generate normalized filename following the pattern: carrier_YYYY-MM.ext
    or carrier_YYYY-MM(N).ext for duplicates.
    
    Args:
        carrier_name: Sanitized carrier name
        statement_date_str: Date string in YYYY-MM format
        file_extension: File extension without dot (e.g., 'pdf', 'xlsx')
        duplicate_number: Number for duplicates (0 for first file, 1+ for duplicates)
    
    Returns:
        Normalized filename
    """
    sanitized_carrier = sanitize_carrier_name(carrier_name)
    
    if duplicate_number == 0:
        return f"{sanitized_carrier}_{statement_date_str}.{file_extension}"
    else:
        return f"{sanitized_carrier}_{statement_date_str}({duplicate_number}).{file_extension}"


async def get_normalized_filename_for_upload(
    db: AsyncSession,
    carrier_id: UUID,
    carrier_name: str,
    statement_date: dict,
    original_filename: str,
    upload_id: UUID,
    current_file_path: Optional[str] = None
) -> str:
    """
    Get the normalized filename for an upload, handling duplicates.
    
    Args:
        db: Database session
        carrier_id: Carrier UUID
        carrier_name: Carrier name
        statement_date: Statement date dictionary
        original_filename: Original uploaded filename
        upload_id: Current upload ID (to exclude from duplicate check)
        current_file_path: Current full GCS path (optional, used to determine correct folder)
    
    Returns:
        Normalized filename with path (statements/folder_id/normalized_name.ext)
    """
    # Extract file extension
    file_ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else 'pdf'
    
    # Format statement date
    date_str, year, month = format_statement_date(statement_date)
    
    # Check for existing files and get next available number
    duplicate_number = await check_existing_filenames(
        db=db,
        carrier_id=carrier_id,
        year=year,
        month=month,
        file_extension=file_ext,
        carrier_name=carrier_name,
        exclude_upload_id=upload_id
    )
    
    # Generate normalized filename
    normalized_filename = generate_normalized_filename(
        carrier_name=carrier_name,
        statement_date_str=date_str,
        file_extension=file_ext,
        duplicate_number=duplicate_number
    )
    
    # Determine the correct folder ID from current file path
    # Files can be in either statements/upload_id/ or statements/carrier_id/
    folder_id = str(carrier_id)
    
    if current_file_path:
        # Extract folder from current path: statements/{folder_id}/filename
        path_parts = current_file_path.split('/')
        if len(path_parts) >= 2 and path_parts[0] == 'statements':
            folder_id = path_parts[1]
    
    # Return full GCS path using the determined folder
    return f"statements/{folder_id}/{normalized_filename}"

