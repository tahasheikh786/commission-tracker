"""
Summary Row Pre-Filtering and Post-Validation Utilities

This module implements the hybrid approach for summary row detection:
1. Pre-filtering: Remove obvious summary rows before LLM processing
2. Post-validation: Catch any escaped summary rows after LLM extraction

Based on the comprehensive analysis document for table extraction.
"""

import re
import logging
from typing import List, Dict, Any, Tuple

logger = logging.getLogger(__name__)


class SummaryRowPreFilter:
    """
    Pre-filter summary rows before sending to LLM.
    This reduces token usage and improves accuracy.
    """
    
    # Summary keywords from extraction rules
    SUMMARY_KEYWORDS = [
        'total for group:',
        'total for vendor:',
        'sub-total',
        'subtotal:',
        'grand total',
        'writing agent number:',
        'writing agent 2 no:',
        'writing agent name:',
        'writing agent 1 name:',
        'writing agent 2 name:',
        'agent 2 name:',
        'agent 2 number:',
        'producer name:',
        'producer number:',
    ]
    
    # Explicit regex patterns for exact phrase matching
    EXCLUSION_PATTERNS = [
        re.compile(r'^Total for Group:\s*', re.IGNORECASE),
        re.compile(r'^Total for Vendor:\s*', re.IGNORECASE),
        re.compile(r'^Sub-?total:?\s*', re.IGNORECASE),
        re.compile(r'^Grand Total:?\s*', re.IGNORECASE),
        re.compile(r'^Writing Agent Number:\s*', re.IGNORECASE),
        re.compile(r'^Writing Agent 2 No:\s*', re.IGNORECASE),
        re.compile(r'^Writing Agent Name:\s*', re.IGNORECASE),
        re.compile(r'^Agent 2 Name:\s*', re.IGNORECASE),
        re.compile(r'^Producer Name:\s*', re.IGNORECASE),
        # Pattern for group numbers with valid format (Letter + 6 digits)
        re.compile(r'^[A-Z]\d{6}$'),  # Valid pattern - use for validation
    ]
    
    @staticmethod
    def filter_summary_rows(raw_table_data: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """
        Pre-filter summary rows from raw table data before LLM processing.
        
        Args:
            raw_table_data: Dictionary with 'headers' and 'rows' keys
            
        Returns:
            Tuple of (filtered_table_data, excluded_rows)
            - filtered_table_data: Table data with summary rows removed
            - excluded_rows: List of excluded rows with reasons
        """
        if not raw_table_data or 'rows' not in raw_table_data:
            return raw_table_data, []
        
        headers = raw_table_data.get('headers', [])
        rows = raw_table_data.get('rows', [])
        
        if not rows:
            return raw_table_data, []
        
        detail_rows = []
        excluded_rows = []
        
        logger.info(f"Pre-filtering {len(rows)} rows for summary detection")
        
        for row_idx, row in enumerate(rows):
            if not row:
                continue
            
            # Convert row to string for checking
            row_text = ' '.join(str(cell).lower() for cell in row if cell)
            
            # Check 1: Keyword-based detection
            is_summary, reason = SummaryRowPreFilter._check_keywords(row, row_text)
            if is_summary:
                excluded_rows.append({
                    'row_index': row_idx,
                    'row_data': row,
                    'reason': reason,
                    'filter_stage': 'pre_filter_keyword'
                })
                continue
            
            # Check 2: Pattern-based detection
            is_summary, reason = SummaryRowPreFilter._check_patterns(row)
            if is_summary:
                excluded_rows.append({
                    'row_index': row_idx,
                    'row_data': row,
                    'reason': reason,
                    'filter_stage': 'pre_filter_pattern'
                })
                continue
            
            # Check 3: Structural detection (empty key fields)
            is_summary, reason = SummaryRowPreFilter._check_structure(row, headers)
            if is_summary:
                excluded_rows.append({
                    'row_index': row_idx,
                    'row_data': row,
                    'reason': reason,
                    'filter_stage': 'pre_filter_structure'
                })
                continue
            
            # Check 4: Group number format validation
            has_valid_group_no, reason = SummaryRowPreFilter._validate_group_number(row, headers)
            if not has_valid_group_no:
                excluded_rows.append({
                    'row_index': row_idx,
                    'row_data': row,
                    'reason': reason,
                    'filter_stage': 'pre_filter_validation'
                })
                continue
            
            # Row passed all checks - include it
            detail_rows.append(row)
        
        filtered_data = {
            'headers': headers,
            'rows': detail_rows
        }
        
        logger.info(f"Pre-filtering complete: {len(detail_rows)} detail rows, {len(excluded_rows)} excluded")
        
        return filtered_data, excluded_rows
    
    @staticmethod
    def _check_keywords(row: List[Any], row_text: str) -> Tuple[bool, str]:
        """
        Check if row contains summary keywords.
        
        Returns:
            Tuple of (is_summary: bool, reason: str)
        """
        for keyword in SummaryRowPreFilter.SUMMARY_KEYWORDS:
            if keyword in row_text:
                return True, f"Contains summary keyword: '{keyword}'"
        return False, ""
    
    @staticmethod
    def _check_patterns(row: List[Any]) -> Tuple[bool, str]:
        """
        Check if row matches exclusion patterns.
        
        Returns:
            Tuple of (is_summary: bool, reason: str)
        """
        if not row or len(row) == 0:
            return False, ""
        
        first_cell = str(row[0]).strip()
        
        for pattern in SummaryRowPreFilter.EXCLUSION_PATTERNS:
            # Skip the validation pattern (used later)
            if pattern.pattern == r'^[A-Z]\d{6}$':
                continue
            
            if pattern.match(first_cell):
                return True, f"Matches exclusion pattern: {pattern.pattern}"
        
        return False, ""
    
    @staticmethod
    def _check_structure(row: List[Any], headers: List[str]) -> Tuple[bool, str]:
        """
        Check structural indicators of summary rows.
        
        Returns:
            Tuple of (is_summary: bool, reason: str)
        """
        if not row or len(row) < 2:
            return False, ""
        
        # Find Group No. and Group Name column indices
        group_no_idx = None
        group_name_idx = None
        
        for idx, header in enumerate(headers):
            header_lower = str(header).lower()
            if 'group no' in header_lower or 'group number' in header_lower:
                group_no_idx = idx
            if 'group name' in header_lower or 'company' in header_lower or 'customer name' in header_lower:
                group_name_idx = idx
        
        # Check if Group No. is empty
        if group_no_idx is not None and group_no_idx < len(row):
            group_no = str(row[group_no_idx]).strip()
            if not group_no or group_no in ['—', '-', 'n/a', 'na', 'none', '']:
                return True, "Group No. is empty - likely aggregate row"
        
        # Check if both key columns are empty
        if group_no_idx is not None and group_name_idx is not None:
            if group_no_idx < len(row) and group_name_idx < len(row):
                group_no = str(row[group_no_idx]).strip()
                group_name = str(row[group_name_idx]).strip()
                
                if not group_no and not group_name:
                    return True, "Both Group No. and Group Name are empty - likely total row"
        
        return False, ""
    
    @staticmethod
    def _validate_group_number(row: List[Any], headers: List[str]) -> Tuple[bool, str]:
        """
        Validate that row has a proper group number format.
        
        Returns:
            Tuple of (is_valid: bool, reason: str)
        """
        if not row:
            return False, "Empty row"
        
        # Find Group No. column
        group_no_idx = None
        for idx, header in enumerate(headers):
            header_lower = str(header).lower()
            if 'group no' in header_lower or 'group number' in header_lower:
                group_no_idx = idx
                break
        
        if group_no_idx is None or group_no_idx >= len(row):
            # No Group No. column found or index out of bounds
            # Try using first column as group number
            group_no_idx = 0
        
        group_no = str(row[group_no_idx]).strip()
        
        if not group_no:
            return False, "Group number is empty"
        
        # Valid formats:
        # - Letter followed by 6 digits (e.g., L242820)
        # - 6-7 digits (e.g., 1653402)
        # - Alphanumeric with reasonable length
        
        # Check for valid formats
        if re.match(r'^[A-Z]\d{6}$', group_no):
            return True, "Valid alphanumeric group number"
        
        if re.match(r'^\d{6,7}$', group_no):
            return True, "Valid numeric group number"
        
        # Check if it's a reasonable alphanumeric ID (not a summary keyword)
        if re.match(r'^[A-Z0-9]{4,10}$', group_no):
            # Additional check: make sure it's not a summary keyword
            if 'total' not in group_no.lower() and 'summary' not in group_no.lower():
                return True, "Valid alphanumeric identifier"
        
        return False, f"Group number format invalid: '{group_no}'"


class SummaryRowPostValidator:
    """
    Post-validation to catch escaped summary rows after LLM extraction.
    This is a safety net to ensure summary rows don't slip through.
    """
    
    @staticmethod
    def validate_extracted_rows(extracted_data: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """
        Validate that extracted data contains no summary rows.
        
        🔴 CRITICAL LOGIC:
        - We DON'T remove rows from the array (downstream code expects row indices to match)
        - Instead, we mark which rows are summaries in summary_rows/summaryRows metadata
        - Downstream code (semantic_extractor, earned_commission) will skip those indices
        
        Args:
            extracted_data: Extracted data from LLM (tables with rows)
            
        Returns:
            Tuple of (validated_data, detected_summary_rows)
            - validated_data: Data with summary_rows metadata updated
            - detected_summary_rows: List of detected summary rows with reasons
        """
        if not extracted_data:
            return extracted_data, []
        
        # Handle both single table and multiple tables
        tables = extracted_data.get('tables', [])
        if not tables:
            return extracted_data, []
        
        detected_summary_rows = []
        validated_tables = []
        
        for table_idx, table in enumerate(tables):
            headers = table.get('headers', []) or table.get('header', [])
            rows = table.get('rows', [])
            
            if not rows:
                validated_tables.append(table)
                continue
            
            # Get existing summary row indices
            existing_summary_rows = table.get('summary_rows', []) or table.get('summaryRows', [])
            if isinstance(existing_summary_rows, set):
                existing_summary_rows = list(existing_summary_rows)
            
            summary_row_indices = set(existing_summary_rows)  # Start with existing
            
            for row_idx, row in enumerate(rows):
                # Skip if already marked as summary
                if row_idx in summary_row_indices:
                    continue
                
                # Check if row is marked as summary by LLM
                row_data = row
                if isinstance(row, dict):
                    row_data = row.get('data', row)
                    is_summary = row.get('is_summary', False)
                    summary_confidence = row.get('summary_confidence', 0.0)
                    
                    if is_summary and summary_confidence >= 0.75:
                        summary_row_indices.add(row_idx)
                        detected_summary_rows.append({
                            'table_index': table_idx,
                            'row_index': row_idx,
                            'row_data': row_data,
                            'reason': f"Marked as summary by LLM (confidence: {summary_confidence})",
                            'filter_stage': 'post_validate_llm_marked'
                        })
                        continue
                
                # Apply validation to detect unmarked summary rows
                is_valid, reason = SummaryRowPostValidator._validate_row(row_data, headers)
                
                if not is_valid:
                    summary_row_indices.add(row_idx)
                    detected_summary_rows.append({
                        'table_index': table_idx,
                        'row_index': row_idx,
                        'row_data': row_data,
                        'reason': reason,
                        'filter_stage': 'post_validate_pattern'
                    })
            
            # ✅ NEW: Check if last row is grand total
            if len(rows) > 0:
                last_row_idx = len(rows) - 1
                
                # Skip if already marked as summary
                if last_row_idx not in summary_row_indices:
                    last_row = rows[last_row_idx]
                    last_row_data = last_row.get('data', last_row) if isinstance(last_row, dict) else last_row
                    
                    # Check if this row looks like a grand total:
                    # 1. Has an amount (check last few columns for dollar values)
                    # 2. Has mostly empty cells (especially Group No.)
                    # 3. Is the last row
                    
                    # Find Group No., Group Name, and amount columns
                    group_no_idx = None
                    group_name_idx = None
                    amount_idx = None
                    
                    for idx, header in enumerate(headers):
                        header_lower = str(header).lower()
                        if 'group no' in header_lower or 'group number' in header_lower or 'group id' in header_lower:
                            group_no_idx = idx
                        if 'group name' in header_lower or 'company' in header_lower:
                            group_name_idx = idx
                        if 'paid amount' in header_lower or 'commission' in header_lower or 'amount' in header_lower:
                            amount_idx = idx
                    
                    # Check if key identifier columns are empty and amount is populated
                    identifiers_empty = False
                    has_amount = False
                    
                    # Check Group No. (if exists)
                    if group_no_idx is not None and group_no_idx < len(last_row_data):
                        group_no = str(last_row_data[group_no_idx]).strip()
                        if not group_no or group_no in ['—', '-', 'n/a', 'na', 'none', '', 'null', 'Total']:
                            identifiers_empty = True
                    
                    # If no Group No. column or Group No. is empty, also check Group Name
                    if (group_no_idx is None or identifiers_empty) and group_name_idx is not None and group_name_idx < len(last_row_data):
                        group_name = str(last_row_data[group_name_idx]).strip()
                        # Group Name should also be empty or be a total keyword
                        if not group_name or group_name in ['—', '-', 'n/a', 'na', 'none', '', 'null', 'Total', 'Grand Total']:
                            identifiers_empty = True
                        elif group_name.lower() in ['total', 'grand total', 'subtotal']:
                            identifiers_empty = True
                    elif group_no_idx is None and group_name_idx is None:
                        # No identifier columns found, can't validate
                        identifiers_empty = False
                    
                    # Check if amount is populated and looks like money
                    if amount_idx is not None and amount_idx < len(last_row_data):
                        amount = str(last_row_data[amount_idx]).strip()
                        has_amount = (amount and 
                                     (amount.startswith('$') or amount.startswith('(') or 
                                      re.match(r'^[\d,]+\.\d{2}$', amount) or
                                      re.match(r'^\(\$?[\d,]+\.\d{2}\)$', amount)))
                    
                    # If last row has empty identifiers and populated amount → Grand Total
                    if identifiers_empty and has_amount:
                        summary_row_indices.add(last_row_idx)
                        detected_summary_rows.append({
                            'table_index': table_idx,
                            'row_index': last_row_idx,
                            'row_data': last_row_data,
                            'reason': "Last row with empty Group No. and amount - grand total",
                            'filter_stage': 'post_validate_grand_total'
                        })
                        logger.info(f"   🎯 Detected grand total at last row (index {last_row_idx})")
            
            # Convert back to sorted list
            all_summary_rows = sorted(list(summary_row_indices))
            
            # Update table with summary row metadata (keep all rows, just mark summaries)
            validated_table = {
                **table,
                'summary_rows': all_summary_rows,  # Use standard field name
                'summaryRows': all_summary_rows   # Also set alternate field name for compatibility
            }
            validated_tables.append(validated_table)
        
        validated_data = {
            **extracted_data,
            'tables': validated_tables
        }
        
        logger.info(f"Post-validation complete: marked {len(detected_summary_rows)} rows as summaries")
        
        return validated_data, detected_summary_rows
    
    @staticmethod
    def _validate_row(row: List[Any], headers: List[str]) -> Tuple[bool, str]:
        """
        Validate a single row against summary patterns.
        
        ✅ ENHANCED: Added specific patterns from Allied Benefit statements.
        
        Returns:
            Tuple of (is_valid: bool, reason: str)
        """
        if not row:
            return False, "Empty row"
        
        # ✅ NEW: Check for all-empty rows (separators/headers/placeholders)
        non_empty_cells = [cell for cell in row if cell and str(cell).strip() and str(cell).strip() not in ['—', '-', '']]
        
        if len(non_empty_cells) == 0:
            return False, "All cells empty - separator or header row"
        
        # ✅ NEW: Check for mostly-empty rows with only 1-2 values
        if len(non_empty_cells) <= 2:
            return False, f"Only {len(non_empty_cells)} non-empty cells - likely summary row"
        
        # Convert row to string for checking
        row_text = ' '.join(str(cell) for cell in row if cell).lower()
        
        # Invalid patterns (from user's document)
        INVALID_PATTERNS = [
            r'total\s+for\s+(group|vendor)',
            r'sub-?total',
            r'grand\s+total',
            r'writing\s+agent\s+(number|2\s+no|name)',
            r'agent\s+2\s+(name|number)',
            r'producer\s+(name|number)',
        ]
        
        for pattern in INVALID_PATTERNS:
            if re.search(pattern, row_text, re.IGNORECASE):
                return False, f"Contains invalid pattern: {pattern}"
        
        # Check Group No. format (if we can identify the column)
        group_no_idx = None
        for idx, header in enumerate(headers):
            header_lower = str(header).lower()
            if 'group no' in header_lower or 'group number' in header_lower:
                group_no_idx = idx
                break
        
        if group_no_idx is not None and group_no_idx < len(row):
            group_no = str(row[group_no_idx]).strip()
            
            # ✅ NEW: Explicit empty check with more variations
            if not group_no or group_no in ['—', '-', 'n/a', 'na', 'none', '', 'null', 'N/A', 'NA']:
                return False, "Group No. is empty - likely summary or total row"
            
            # Validate group number format
            if not (re.match(r'^[A-Z]\d{6}$', group_no) or 
                    re.match(r'^\d{6,7}$', group_no) or 
                    re.match(r'^[A-Z0-9]{4,10}$', group_no)):
                return False, f"Invalid group number format: '{group_no}'"
        
        return True, "Valid detail row"


# Utility function for the hybrid approach
def apply_hybrid_filtering(
    raw_table_data: Dict[str, Any]
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Apply hybrid filtering approach:
    1. Pre-filter obvious summary rows
    2. Ready for LLM processing (caller sends filtered data to LLM)
    3. Post-validate LLM results (caller applies after LLM extraction)
    
    Args:
        raw_table_data: Raw table data before processing
        
    Returns:
        Tuple of (pre_filtered_data, filtering_metadata)
        - pre_filtered_data: Data ready for LLM processing
        - filtering_metadata: Information about filtered rows
    """
    # Stage 1: Pre-filtering
    filtered_data, pre_excluded = SummaryRowPreFilter.filter_summary_rows(raw_table_data)
    
    logger.info(f"Hybrid filtering - Pre-filter: excluded {len(pre_excluded)} rows")
    
    metadata = {
        'pre_filter_excluded_count': len(pre_excluded),
        'pre_filter_excluded_rows': pre_excluded,
        'pre_filter_remaining_count': len(filtered_data.get('rows', [])),
    }
    
    return filtered_data, metadata


def post_validate_extraction(
    extracted_data: Dict[str, Any]
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Apply post-validation after LLM extraction.
    
    Args:
        extracted_data: Data extracted by LLM
        
    Returns:
        Tuple of (validated_data, validation_metadata)
        - validated_data: Final validated data
        - validation_metadata: Information about removed rows
    """
    # Stage 2: Post-validation
    validated_data, post_detected = SummaryRowPostValidator.validate_extracted_rows(extracted_data)
    
    logger.info(f"Hybrid filtering - Post-validate: detected {len(post_detected)} summary rows")
    
    metadata = {
        'post_validate_detected_count': len(post_detected),
        'post_validate_detected_rows': post_detected,
        'final_row_count': sum(len(t.get('rows', [])) for t in validated_data.get('tables', [])),
        'summary_row_count': sum(len(t.get('summary_rows', [])) for t in validated_data.get('tables', [])),
    }
    
    return validated_data, metadata

