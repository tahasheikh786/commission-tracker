"""
Utility functions for GPT-based extraction pipeline.

This module provides helper functions for data validation, transformation,
and common operations used throughout the pipeline.
"""

import re
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


def clean_json_response(content: str) -> str:
    """
    Clean JSON response by removing markdown code blocks and extra whitespace.
    
    Args:
        content: Raw response content from GPT
        
    Returns:
        Cleaned JSON string
    """
    if not content:
        return ""
    
    cleaned = content.strip()
    
    # Remove markdown code blocks
    if cleaned.startswith('```json'):
        cleaned = cleaned[7:]
    if cleaned.startswith('```'):
        cleaned = cleaned[3:]
    if cleaned.endswith('```'):
        cleaned = cleaned[:-3]
    
    return cleaned.strip()


def validate_carrier_name(carrier_name: str) -> bool:
    """
    Validate that carrier name is reasonable and not empty.
    
    Args:
        carrier_name: Carrier name to validate
        
    Returns:
        True if valid, False otherwise
    """
    if not carrier_name or not carrier_name.strip():
        return False
    
    # Check minimum length
    if len(carrier_name.strip()) < 2:
        return False
    
    # Check for placeholder text
    placeholder_patterns = [
        'unknown', 'n/a', 'none', 'carrier', 'insurance company',
        'not found', 'not specified'
    ]
    
    name_lower = carrier_name.lower().strip()
    if name_lower in placeholder_patterns:
        return False
    
    return True


def validate_statement_date(date_str: str) -> bool:
    """
    Validate that statement date is in correct format and reasonable.
    
    Args:
        date_str: Date string to validate (expected format: YYYY-MM-DD)
        
    Returns:
        True if valid, False otherwise
    """
    if not date_str or not date_str.strip():
        return False
    
    # Check format
    date_pattern = r'^\d{4}-\d{2}-\d{2}$'
    if not re.match(date_pattern, date_str):
        return False
    
    try:
        # Parse date
        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
        
        # Check if date is reasonable (not too far in past or future)
        current_year = datetime.now().year
        if date_obj.year < 2000 or date_obj.year > current_year + 1:
            return False
        
        return True
    except ValueError:
        return False


def extract_dollar_amount(amount_str: str) -> Optional[float]:
    """
    Extract numeric dollar amount from string.
    
    Args:
        amount_str: String containing dollar amount (e.g., "$1,234.56")
        
    Returns:
        Float amount or None if parsing fails
    """
    if not amount_str:
        return None
    
    try:
        # Remove currency symbols and commas
        cleaned = str(amount_str).replace('$', '').replace(',', '').strip()
        
        # Handle parentheses for negative amounts
        is_negative = False
        if cleaned.startswith('(') and cleaned.endswith(')'):
            cleaned = cleaned[1:-1]
            is_negative = True
        
        # Convert to float
        amount = float(cleaned)
        
        if is_negative:
            amount = -amount
        
        return amount
    except (ValueError, AttributeError):
        return None


def format_dollar_amount(amount: float) -> str:
    """
    Format float amount as dollar string.
    
    Args:
        amount: Numeric amount
        
    Returns:
        Formatted string (e.g., "$1,234.56")
    """
    if amount < 0:
        return f"(${ abs(amount):,.2f})"
    return f"${amount:,.2f}"


def calculate_confidence_score(
    extraction_results: Dict[str, Any],
    required_fields: List[str]
) -> float:
    """
    Calculate overall confidence score based on field extraction success.
    
    Args:
        extraction_results: Dictionary of extraction results
        required_fields: List of required field names
        
    Returns:
        Confidence score between 0.0 and 1.0
    """
    if not required_fields:
        return 0.0
    
    # Count successfully extracted fields
    extracted_count = 0
    total_confidence = 0.0
    
    for field in required_fields:
        if field in extraction_results:
            value = extraction_results[field]
            
            # Check if field has actual value
            if value and str(value).strip():
                extracted_count += 1
                
                # Check for confidence field
                confidence_field = f"{field}_confidence"
                if confidence_field in extraction_results:
                    total_confidence += extraction_results[confidence_field]
                else:
                    total_confidence += 0.8  # Default confidence
    
    if extracted_count == 0:
        return 0.0
    
    # Calculate average
    avg_confidence = total_confidence / len(required_fields)
    
    # Penalize for missing fields
    completeness_ratio = extracted_count / len(required_fields)
    
    return avg_confidence * completeness_ratio


def merge_table_rows(rows: List[List[str]]) -> List[List[str]]:
    """
    Merge split rows that belong together (e.g., wrapped text).
    
    Args:
        rows: List of table rows
        
    Returns:
        Merged rows
    """
    if not rows or len(rows) < 2:
        return rows
    
    merged = []
    i = 0
    
    while i < len(rows):
        current_row = rows[i]
        
        # Check if next row should be merged
        if i + 1 < len(rows):
            next_row = rows[i + 1]
            
            # Heuristic: If next row has fewer non-empty cells, it might be a continuation
            current_non_empty = sum(1 for cell in current_row if cell and str(cell).strip())
            next_non_empty = sum(1 for cell in next_row if cell and str(cell).strip())
            
            if next_non_empty < current_non_empty * 0.5:
                # Merge rows
                merged_row = []
                for j in range(max(len(current_row), len(next_row))):
                    cell1 = current_row[j] if j < len(current_row) else ""
                    cell2 = next_row[j] if j < len(next_row) else ""
                    
                    if cell1 and cell2:
                        merged_row.append(f"{cell1} {cell2}")
                    else:
                        merged_row.append(cell1 or cell2)
                
                merged.append(merged_row)
                i += 2  # Skip next row
                continue
        
        merged.append(current_row)
        i += 1
    
    return merged


def deduplicate_tables(tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Remove duplicate tables based on content similarity.
    
    Args:
        tables: List of extracted tables
        
    Returns:
        Deduplicated list of tables
    """
    if not tables or len(tables) <= 1:
        return tables
    
    unique_tables = []
    seen_signatures = set()
    
    for table in tables:
        # Create signature from headers and first few rows
        headers = table.get("headers", [])
        rows = table.get("rows", [])[:5]  # First 5 rows
        
        signature = tuple(headers) + tuple(tuple(row) for row in rows)
        
        if signature not in seen_signatures:
            seen_signatures.add(signature)
            unique_tables.append(table)
        else:
            logger.debug(f"Skipping duplicate table with {len(headers)} headers")
    
    return unique_tables


def log_extraction_stats(extraction_result: Dict[str, Any]) -> None:
    """
    Log statistics about the extraction for monitoring and debugging.
    
    Args:
        extraction_result: Complete extraction result dictionary
    """
    try:
        stats = {
            "success": extraction_result.get("success", False),
            "method": extraction_result.get("extraction_method", "unknown"),
            "pdf_type": extraction_result.get("pdf_type", "unknown"),
            "table_count": len(extraction_result.get("tables", [])),
            "groups_count": len(extraction_result.get("entities", {}).get("groups_and_companies", [])),
            "has_summary": bool(extraction_result.get("intelligent_summary", "")),
            "timestamp": extraction_result.get("extraction_timestamp", "")
        }
        
        logger.info(f"📊 Extraction Stats: {stats}")
        
        # Log metadata
        metadata = extraction_result.get("document_metadata", {})
        if metadata:
            logger.info(f"📄 Document: carrier={metadata.get('carrier_name', 'N/A')}, "
                       f"date={metadata.get('statement_date', 'N/A')}, "
                       f"broker={metadata.get('broker_company', 'N/A')}")
        
        # Log business intelligence
        bi = extraction_result.get("business_intelligence", {})
        if bi:
            logger.info(f"💰 Business Intelligence: total={bi.get('total_commission_amount', 'N/A')}, "
                       f"groups={bi.get('number_of_groups', 0)}")
    
    except Exception as e:
        logger.warning(f"Failed to log extraction stats: {e}")

