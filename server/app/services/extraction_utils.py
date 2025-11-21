from typing import Dict, List, Any, Optional, Tuple, Set
from datetime import datetime
import pandas as pd
import numpy as np
import logging
import re
from dateutil import parser as date_parser

logger = logging.getLogger(__name__)

# Configuration constants for table stitching
HEADER_SIMILARITY_THRESHOLD = 0.8
PATTERN_MATCH_THRESHOLD = 0.6
SUMMARY_KEYWORDS = {"total", "subtotal", "grand total", "net total", "overall total", "sum"}
DEFAULT_EXPECTED_ROLLUPS = [
    "total",
    "grand total",
    "invoice total",
    "commission total",
    "net total",
    "overall total"
]
DEFAULT_SUMMARY_TOLERANCE_BPS = 75  # 0.75% difference allowed

SUMMARY_PHRASE_HINTS = [
    {
        "pattern": r"\btotal\s+for\s+vendor\b",
        "weight": 0.45,
        "reason": "Matches 'Total for Vendor' pattern"
    },
    {
        "pattern": r"\btotal\s+for\s+group\b",
        "weight": 0.4,
        "reason": "Matches 'Total for Group' pattern"
    },
    {
        "pattern": r"\btotal\s+for\s+(carrier|company|broker)\b",
        "weight": 0.4,
        "reason": "Matches carrier/company total pattern"
    },
    {
        "pattern": r"\btotal\s+for\b",
        "weight": 0.35,
        "reason": "Contains 'Total for ...' phrase"
    },
    {
        "pattern": r"\bcommission\s+total\b",
        "weight": 0.35,
        "reason": "Contains 'Commission Total'"
    },
    {
        "pattern": r"\bnet\s+(payment|commission)\b",
        "weight": 0.32,
        "reason": "Contains 'Net Payment/Commission'"
    },
    {
        "pattern": r"\bgrand\s+total\b",
        "weight": 0.35,
        "reason": "Contains 'Grand Total'"
    },
    {
        "pattern": r"\bstatement\s+total\b",
        "weight": 0.35,
        "reason": "Contains 'Statement Total'"
    },
    {
        "pattern": r"\btotal\s+commission\s+payment\b",
        "weight": 0.35,
        "reason": "Contains 'Total Commission Payment'"
    }
]


def normalize_table_headers(headers: List[str]) -> List[str]:
    """
    Normalize table headers by replacing newlines with spaces and cleaning whitespace.
    
    CRITICAL: Headers from PDF extraction often contain newline characters (\\n) 
    instead of spaces, which breaks field mapping matching. This function ensures
    consistent header format across the application.
    
    Args:
        headers: List of header strings that may contain newlines
        
    Returns:
        List of normalized headers with newlines replaced by spaces
        
    Example:
        >>> normalize_table_headers(['Commission\\nAmount', 'Invoice\\nTotal'])
        ['Commission Amount', 'Invoice Total']
    """
    if not headers:
        return headers
    
    normalized = []
    for header in headers:
        if header:
            # Replace newlines with spaces and clean up whitespace
            normalized_header = str(header).replace('\\n', ' ').replace('\\r', ' ').strip()
            # Collapse multiple spaces into one
            normalized_header = ' '.join(normalized_header.split())
            normalized.append(normalized_header)
        else:
            normalized.append(header)
    
    return normalized


def sanitize_table_data_for_pydantic(table_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sanitize table data to ensure all cell values are strings for Pydantic validation.
    
    Converts None values to empty strings and ensures all cells are string type.
    This is a defensive function to prevent Pydantic validation errors when table
    extraction returns None values (e.g., in summary rows or optional columns).
    
    Args:
        table_data: Dictionary containing 'headers' and 'rows' keys
        
    Returns:
        Sanitized table data with all cells as strings
        
    Example:
        >>> table = {'headers': ['A', 'B', None], 'rows': [['1', None, '3']]}
        >>> sanitize_table_data_for_pydantic(table)
        {'headers': ['A', 'B', ''], 'rows': [['1', '', '3']]}
    """
    sanitized = table_data.copy()
    
    # Sanitize rows: convert None to empty string and ensure all values are strings
    if 'rows' in sanitized and isinstance(sanitized['rows'], list):
        sanitized_rows = []
        for row in sanitized['rows']:
            if isinstance(row, list):
                sanitized_row = [
                    str(cell) if cell is not None else "" 
                    for cell in row
                ]
                sanitized_rows.append(sanitized_row)
            else:
                # If row is not a list (shouldn't happen), keep as is
                sanitized_rows.append(row)
        sanitized['rows'] = sanitized_rows
    
    # Sanitize headers: ensure all are strings
    if 'headers' in sanitized and isinstance(sanitized['headers'], list):
        sanitized['headers'] = [
            str(header) if header is not None else "" 
            for header in sanitized['headers']
        ]
    
    # Also handle 'header' (singular) as some parts of the codebase use this key
    if 'header' in sanitized and isinstance(sanitized['header'], list):
        sanitized['header'] = [
            str(header) if header is not None else "" 
            for header in sanitized['header']
        ]
    
    return sanitized


def normalize_statement_date(date_string: str) -> str:
    """
    Extract and normalize the primary date from various date formats.
    Handles date ranges by extracting only the start date.
    
    Examples:
        - "2025-03-15 thr 2025-04-14" -> "2025-03-15"
        - "March 15, 2025 through April 14, 2025" -> "2025-03-15"
        - "2025-03-15 to 2025-04-14" -> "2025-03-15"
        - "2025-03-15" -> "2025-03-15"
        - "03/15/2025 - 04/14/2025" -> "2025-03-15"
    
    Args:
        date_string: Date string that may be a single date or date range
        
    Returns:
        Normalized date in ISO format (YYYY-MM-DD), or original string if parsing fails
    """
    if not date_string or not isinstance(date_string, str):
        return date_string
    
    try:
        # Clean up the input string
        date_string = date_string.strip()
        
        # Common date range separators
        range_separators = [
            r'\s+through\s+',
            r'\s+thru\s+',
            r'\s+thr\s+',
            r'\s+to\s+',
            r'\s+-\s+',
            r'\s+–\s+',  # en dash
            r'\s+—\s+',  # em dash
            r'\s+until\s+',
            r'\s+till\s+',
        ]
        
        # Try to split on date range separators
        start_date_str = date_string
        for separator in range_separators:
            parts = re.split(separator, date_string, maxsplit=1, flags=re.IGNORECASE)
            if len(parts) == 2:
                # Found a range, use the first part (start date)
                start_date_str = parts[0].strip()
                logger.debug(f"Detected date range, extracting start date: '{start_date_str}' from '{date_string}'")
                break
        
        # Parse the date using dateutil parser (handles many formats automatically)
        try:
            parsed_date = date_parser.parse(start_date_str, fuzzy=True)
            # Return in ISO format (YYYY-MM-DD)
            normalized = parsed_date.strftime('%Y-%m-%d')
            
            if normalized != date_string:
                logger.info(f"Date normalized: '{date_string}' -> '{normalized}'")
            
            return normalized
            
        except (ValueError, TypeError, date_parser.ParserError) as parse_error:
            # If dateutil fails, try manual parsing for specific formats
            logger.warning(f"dateutil parser failed for '{start_date_str}', trying manual parsing: {parse_error}")
            
            # Try MM/DD/YYYY format
            mm_dd_yyyy_match = re.match(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', start_date_str)
            if mm_dd_yyyy_match:
                month, day, year = mm_dd_yyyy_match.groups()
                parsed_date = datetime(int(year), int(month), int(day))
                return parsed_date.strftime('%Y-%m-%d')
            
            # Try YYYY-MM-DD format (already normalized)
            yyyy_mm_dd_match = re.match(r'(\d{4})-(\d{1,2})-(\d{1,2})', start_date_str)
            if yyyy_mm_dd_match:
                return start_date_str  # Already in correct format
            
            # If all parsing fails, return original string
            logger.error(f"Could not parse date: '{date_string}'")
            return date_string
            
    except Exception as e:
        logger.error(f"Error normalizing date '{date_string}': {e}")
        return date_string


def normalize_multi_line_headers(headers: List[str], rows: List[List[str]] = None) -> List[str]:
    """
    Normalize multi-line column headers where parent columns span multiple sub-columns.
    
    Example transformation:
        Input: ["Clients", "", "Ind. Insurance", "Active HRA Employees", "", "", "Commissions", "", ""]
        Output: ["Clients", "Broker", "Ind. Insurance", "Active HRA Employees Lives", 
                 "Active HRA Employees PEPM", "Active HRA Employees Subtotal", 
                 "Commissions IND", "Commissions HRA", "Commissions Total"]
    
    Args:
        headers: List of header strings (may contain empty strings for sub-columns)
        rows: Optional sample rows to help infer sub-column names
        
    Returns:
        List of normalized header strings with hierarchical names
    """
    if not headers:
        return headers
    
    try:
        normalized = []
        last_parent = None
        parent_column_index = -1
        sub_column_count = 0
        
        # Common sub-column names for inference
        common_sub_columns = [
            ['Lives', 'PEPM', 'Subtotal'],
            ['Count', 'Amount', 'Total'],
            ['IND', 'HRA', 'Total'],
            ['Quantity', 'Rate', 'Amount'],
            ['Name', 'Value', 'Total'],
            ['Start', 'End', 'Duration'],
            ['Min', 'Max', 'Average'],
        ]
        
        for i, header in enumerate(headers):
            header_stripped = header.strip() if header else ""
            
            if header_stripped:
                # This is a parent column or standalone column
                # Check if next columns are empty (indicating this is a parent)
                empty_count = 0
                for j in range(i + 1, len(headers)):
                    if not headers[j].strip():
                        empty_count += 1
                    else:
                        break
                
                if empty_count > 0:
                    # This is a parent column with sub-columns
                    last_parent = header_stripped
                    parent_column_index = i
                    sub_column_count = 0
                    normalized.append(header_stripped)  # Keep parent name for first column
                else:
                    # Standalone column
                    last_parent = None
                    normalized.append(header_stripped)
            else:
                # Empty header - this is a sub-column
                if last_parent:
                    sub_column_count += 1
                    
                    # Try to infer sub-column name from data if rows provided
                    inferred_name = None
                    if rows and len(rows) > 0:
                        # Look at the first few rows to infer the sub-column name
                        inferred_name = _infer_sub_column_name(rows, i, sub_column_count)
                    
                    # Use inferred name or generate a generic one
                    if inferred_name:
                        sub_column_name = f"{last_parent} {inferred_name}"
                    else:
                        # Try to match common sub-column patterns
                        matched_pattern = _match_sub_column_pattern(sub_column_count, empty_count + 1)
                        if matched_pattern:
                            sub_column_name = f"{last_parent} {matched_pattern}"
                        else:
                            # Fallback to generic naming
                            sub_column_name = f"{last_parent} {sub_column_count}"
                    
                    normalized.append(sub_column_name)
                else:
                    # Empty header without a parent - generate a generic name
                    normalized.append(f"Column {i + 1}")
        
        logger.info(f"Header normalization: {len(headers)} headers normalized")
        logger.debug(f"Original headers: {headers}")
        logger.debug(f"Normalized headers: {normalized}")
        
        return normalized
        
    except Exception as e:
        logger.error(f"Error normalizing multi-line headers: {e}")
        # Return original headers if normalization fails
        return headers


def _infer_sub_column_name(rows: List[List[str]], column_index: int, sub_column_number: int) -> Optional[str]:
    """Infer sub-column name from data patterns."""
    try:
        # Look at first 5 rows for patterns
        sample_size = min(5, len(rows))
        column_values = []
        
        for i in range(sample_size):
            if column_index < len(rows[i]):
                value = str(rows[i][column_index]).strip()
                if value:
                    column_values.append(value.lower())
        
        if not column_values:
            return None
        
        # Check for common patterns
        if any('live' in v or 'count' in v or 'member' in v for v in column_values):
            return "Lives"
        elif any('pepm' in v or 'per member' in v for v in column_values):
            return "PEPM"
        elif any('subtotal' in v or 'sub total' in v for v in column_values):
            return "Subtotal"
        elif any('ind' in v or 'individual' in v for v in column_values):
            return "IND"
        elif any('hra' in v for v in column_values):
            return "HRA"
        elif any('total' in v for v in column_values):
            return "Total"
        elif any('amount' in v for v in column_values):
            return "Amount"
        elif any('rate' in v for v in column_values):
            return "Rate"
        
        return None
        
    except Exception as e:
        logger.warning(f"Error inferring sub-column name: {e}")
        return None


def _match_sub_column_pattern(position: int, total_sub_columns: int) -> Optional[str]:
    """Match common sub-column naming patterns based on position."""
    # Common 3-column patterns
    if total_sub_columns == 3:
        patterns_3col = [
            ['Lives', 'PEPM', 'Subtotal'],
            ['Count', 'Amount', 'Total'],
            ['IND', 'HRA', 'Total'],
            ['Quantity', 'Rate', 'Amount'],
        ]
        for pattern in patterns_3col:
            if position <= len(pattern):
                return pattern[position - 1]
    
    # Common 2-column patterns
    elif total_sub_columns == 2:
        patterns_2col = [
            ['Count', 'Amount'],
            ['Quantity', 'Total'],
            ['Value', 'Total'],
        ]
        for pattern in patterns_2col:
            if position <= len(pattern):
                return pattern[position - 1]
    
    return None


def infer_column_types(df: pd.DataFrame) -> Dict[str, str]:
    """
    Infer column types (number, text, date, currency) from DataFrame.
    """
    column_types = {}
    
    for col in df.columns:
        try:
            if hasattr(df[col], 'dtype') and df[col].dtype in ['int64', 'float64']:
                column_types[col] = 'number'
            elif hasattr(df[col], 'dtype') and df[col].dtype == 'object':
                # Check for date patterns
                sample_values = df[col].dropna().head(10)
                date_patterns = [
                    r'\d{1,2}/\d{1,2}/\d{2,4}',
                    r'\d{4}-\d{2}-\d{2}',
                    r'\d{1,2}-\d{1,2}-\d{2,4}'
                ]
                
                is_date = any(
                    sample_values.astype(str).str.match(pattern).any()
                    for pattern in date_patterns
                )
                
                if is_date:
                    column_types[col] = 'date'
                elif sample_values.astype(str).str.contains(r'[\$€£¥]').any():
                    column_types[col] = 'currency'
                else:
                    column_types[col] = 'text'
            else:
                column_types[col] = 'text'
        except Exception as e:
            # If there's any error, default to text
            column_types[col] = 'text'
    
    return column_types


def normalize_table_data(table_data: List[List[str]], headers: List[str]) -> Dict[str, Any]:
    """
    Normalize table data and convert to structured format.
    """
    if not table_data or not headers:
        return {"headers": [], "rows": [], "metadata": {}}
    
    # Create DataFrame for easier manipulation
    df = pd.DataFrame(table_data, columns=headers)
    
    # Clean up data
    df = df.replace('', np.nan)
    df = df.dropna(how='all')  # Remove completely empty rows
    
    # Infer column types
    column_types = infer_column_types(df)
    
    # Convert back to list format
    normalized_data = {
        "headers": headers,
        "rows": df.values.tolist(),
        "metadata": {
            "column_types": column_types,
            "row_count": len(df),
            "column_count": len(headers),
            "extraction_timestamp": datetime.now().isoformat()
        }
    }
    
    return normalized_data
def enrich_tables_with_summary_intelligence(
    tables: List[Dict[str, Any]],
    prompt_options: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Post-process tables to add profile metadata and smarter summary-row detection.
    """
    if not tables:
        return tables
    
    summary_config = _build_summary_config(prompt_options)
    enriched_tables: List[Dict[str, Any]] = []
    
    for table in tables:
        profile = _build_table_profile(table)
        detection = _detect_summary_rows_with_context(table, profile, summary_config)
        final_rows = detection.get("final_summary_rows") or detection.get("model_summary_rows") or []
        
        table["summary_detection"] = detection
        table["summary_rows"] = final_rows
        table["summaryRows"] = final_rows
        
        metadata = table.get("metadata") or {}
        metadata["table_profile"] = profile
        table["metadata"] = metadata
        
        enriched_tables.append(table)
    
    return enriched_tables


def _build_summary_config(prompt_options: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    prompt_options = prompt_options or {}
    
    keywords = {kw.lower() for kw in SUMMARY_KEYWORDS}
    for kw in prompt_options.get("summary_keywords", []):
        if isinstance(kw, str):
            keywords.add(kw.lower())
    
    expected_rollups = list(dict.fromkeys(
        DEFAULT_EXPECTED_ROLLUPS + [
            label for label in prompt_options.get("expected_rollups", []) if isinstance(label, str)
        ]
    ))
    
    tolerance_bps = prompt_options.get("numeric_tolerance_bps", DEFAULT_SUMMARY_TOLERANCE_BPS)
    try:
        tolerance_bps = float(tolerance_bps)
    except (TypeError, ValueError):
        tolerance_bps = DEFAULT_SUMMARY_TOLERANCE_BPS
    
    phrase_patterns = [
        {
            "regex": re.compile(hint["pattern"], re.IGNORECASE),
            "weight": hint["weight"],
            "reason": hint["reason"]
        }
        for hint in SUMMARY_PHRASE_HINTS
    ]
    
    return {
        "keywords": keywords,
        "expected_rollups": [label.lower() for label in expected_rollups],
        "numeric_tolerance_bps": tolerance_bps,
        "tolerance_ratio": tolerance_bps / 10000.0,
        "row_role_examples": prompt_options.get("row_role_examples", []),
        "phrase_patterns": phrase_patterns
    }


def _build_table_profile(table: Dict[str, Any]) -> Dict[str, Any]:
    headers = table.get("headers") or table.get("header") or []
    headers = normalize_table_headers(headers)
    rows = table.get("rows", []) or []
    total_rows = max(len(rows), 1)
    
    column_stats = []
    numeric_columns: List[int] = []
    text_columns: List[int] = []
    
    for col_idx, header in enumerate(headers):
        numeric_count = 0
        non_empty_cells = 0
        
        for row in rows:
            if col_idx >= len(row):
                continue
            value = row[col_idx]
            normalized = _normalize_cell_text(value)
            if normalized:
                non_empty_cells += 1
            if _coerce_numeric(value) is not None:
                numeric_count += 1
        
        numeric_ratio = numeric_count / total_rows
        if numeric_ratio >= 0.45:
            numeric_columns.append(col_idx)
        else:
            text_columns.append(col_idx)
        
        column_stats.append({
            "index": col_idx,
            "header": header,
            "numeric_ratio": numeric_ratio,
            "non_empty_cells": non_empty_cells
        })
    
    row_profiles: List[Dict[str, Any]] = []
    row_numeric_values: List[Dict[int, float]] = []
    
    for idx, row in enumerate(rows):
        tokens = _tokenize_row(row)
        numeric_map: Dict[int, float] = {}
        numeric_cells = 0
        non_empty = 0
        
        for col_idx, value in enumerate(row):
            normalized = _normalize_cell_text(value)
            if normalized:
                non_empty += 1
            if col_idx in numeric_columns:
                numeric_value = _coerce_numeric(value)
                if numeric_value is not None:
                    numeric_map[col_idx] = numeric_value
                    numeric_cells += 1
        
        row_numeric_values.append(numeric_map)
        
        text_token_count = len(tokens) - numeric_cells
        row_profiles.append({
            "index": idx,
            "tokens": tokens,
            "text_blob": " ".join(tokens),
            "text_token_count": max(text_token_count, 0),
            "numeric_ratio": numeric_cells / max(len(row), 1),
            "non_empty_cells": non_empty,
            "blank_identifier_columns": _identifier_columns_blank(row),
            "numeric_columns_present": list(numeric_map.keys())
        })
    
    return {
        "headers": headers,
        "row_count": len(rows),
        "numeric_columns": numeric_columns,
        "text_columns": text_columns,
        "column_stats": column_stats,
        "row_profiles": row_profiles,
        "row_numeric_values": row_numeric_values
    }


def _tokenize_row(row: List[Any]) -> List[str]:
    tokens: List[str] = []
    for cell in row:
        normalized = _normalize_cell_text(cell)
        if not normalized:
            continue
        parts = re.split(r"[\\s/,:;-]+", normalized)
        tokens.extend([part for part in parts if part])
    return tokens


def _normalize_cell_text(value: Any) -> str:
    if value is None:
        return ""
    try:
        text = str(value)
    except Exception:
        return ""
    text = text.replace("\n", " ").replace("\r", " ").strip().lower()
    return " ".join(text.split())


def _coerce_numeric(value: Any) -> Optional[float]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = text.replace(",", "").replace("$", "").replace("usd", "").strip()
    if text.endswith("%"):
        return None
    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1]
    text = text.replace("+", "")
    if text in {"-", "--", "—", "n/a", "na"}:
        return None
    try:
        value = float(text)
        return -value if negative else value
    except ValueError:
        return None


def _identifier_columns_blank(row: List[Any]) -> bool:
    if not row:
        return True
    max_cols = min(2, len(row))
    blank_count = 0
    for idx in range(max_cols):
        value = _normalize_cell_text(row[idx])
        if not value or value in {"-", "--", "—"}:
            blank_count += 1
    return blank_count == max_cols


def _detect_summary_rows_with_context(
    table: Dict[str, Any],
    profile: Dict[str, Any],
    summary_config: Dict[str, Any]
) -> Dict[str, Any]:
    rows = table.get("rows", []) or []
    if not rows:
        return {
            "model_summary_rows": [],
            "heuristic_summary_rows": [],
            "final_summary_rows": []
        }
    
    blueprint = table.get("table_blueprint") or {}
    expected_rollups = list(dict.fromkeys(
        summary_config["expected_rollups"] + [
            label.lower()
            for label in blueprint.get("summary_expectations", [])
            if isinstance(label, str)
        ]
    ))
    
    keywords = summary_config["keywords"]
    tolerance_ratio = summary_config["tolerance_ratio"]
    numeric_columns = profile.get("numeric_columns", [])
    phrase_patterns = summary_config.get("phrase_patterns", [])
    
    row_annotations = table.get("row_annotations") or []
    annotation_lookup = {
        ann.get("row_index"): ann
        for ann in row_annotations
        if isinstance(ann, dict) and isinstance(ann.get("row_index"), int)
    }
    summary_annotation_count = sum(
        1 for ann in annotation_lookup.values()
        if isinstance(ann.get("role"), str) and "summary" in ann.get("role", "").lower()
    )
    
    window_sums = {col_idx: 0.0 for col_idx in numeric_columns}
    detail_window_rows: List[int] = []
    
    existing_summaries = set(table.get("summary_rows") or table.get("summaryRows") or [])
    heuristic_summaries: Set[int] = set()
    final_summaries = set(existing_summaries)
    analysis_entries: List[Dict[str, Any]] = []
    
    for row_profile, numeric_map in zip(profile["row_profiles"], profile["row_numeric_values"]):
        idx = row_profile["index"]
        tokens = row_profile.get("tokens", [])
        text_blob = row_profile.get("text_blob", "")
        annotation = annotation_lookup.get(idx, {})
        annotation_role = str(annotation.get("role", "")).lower()
        
        keyword_match = any(kw in text_blob for kw in keywords)
        expected_rollup_match = any(label in text_blob for label in expected_rollups)
        annotation_summary_hint = "summary" in annotation_role if annotation_role else False
        phrase_bonus = 0.0
        phrase_reasons: List[str] = []
        for phrase in phrase_patterns:
            regex = phrase.get("regex")
            if not regex:
                continue
            if regex.search(text_blob):
                phrase_bonus = max(phrase_bonus, phrase.get("weight", 0.0))
                reason = phrase.get("reason")
                if reason:
                    phrase_reasons.append(reason)
        
        candidate = (
            annotation_summary_hint
            or keyword_match
            or expected_rollup_match
            or phrase_bonus > 0
        )
        if not candidate:
            candidate = (
                row_profile.get("numeric_ratio", 0) >= 0.7
                and row_profile.get("text_token_count", 0) <= 2
                and row_profile.get("blank_identifier_columns", False)
            )
        
        score = 0.0
        reasons: List[str] = []
        
        if annotation_summary_hint:
            score += 0.45
            reasons.append(f"Row annotated as {annotation.get('role')}")
        if keyword_match:
            score += 0.2
            reasons.append("Contains summary keyword")
        if expected_rollup_match:
            score += 0.15
            reasons.append("Matches expected rollup label")
        if phrase_bonus > 0:
            score += phrase_bonus
            reasons.extend(phrase_reasons)
        if row_profile.get("blank_identifier_columns"):
            score += 0.1
            reasons.append("Identifier columns blank")
        if row_profile.get("numeric_ratio", 0) >= 0.8:
            score += 0.1
            reasons.append("Row is mostly numeric")
        
        matches = []
        if numeric_map:
            for col_idx, candidate_value in numeric_map.items():
                if col_idx not in window_sums:
                    continue
                window_total = window_sums[col_idx]
                if window_total == 0:
                    continue
                if _values_within_tolerance(candidate_value, window_total, tolerance_ratio):
                    matches.append({
                        "column": profile["headers"][col_idx] if col_idx < len(profile["headers"]) else f"Column {col_idx + 1}",
                        "detail_total": window_total,
                        "row_value": candidate_value
                    })
        if matches:
            # Promote numeric matches even when textual cues are absent
            if not candidate:
                candidate = True
                reasons.append("Promoted due to numeric match with running totals")
            match_confidence = 0.45 + 0.05 * min(len(matches) - 1, 2)
            score += match_confidence
            reasons.append("Matches running total of previous detail rows")
        
        should_mark_summary = candidate and score >= 0.55
        if should_mark_summary:
            heuristic_summaries.add(idx)
            final_summaries.add(idx)
            analysis_entries.append({
                "row_index": idx,
                "score": round(score, 2),
                "reasons": reasons,
                "matched_columns": matches,
                "annotation_role": annotation.get("role"),
                "detail_rows_covered": detail_window_rows.copy()
            })
            # Reset window after confirming summary
            window_sums = {col_idx: 0.0 for col_idx in numeric_columns}
            detail_window_rows = []
            continue
        
        # Not a summary - treat as detail row and continue accumulating
        if numeric_map:
            for col_idx, value in numeric_map.items():
                if col_idx in window_sums and value is not None:
                    window_sums[col_idx] += value
        detail_window_rows.append(idx)
    
    final_sorted = sorted(final_summaries)
    
    return {
        "model_summary_rows": sorted(existing_summaries),
        "heuristic_summary_rows": sorted(heuristic_summaries),
        "final_summary_rows": final_sorted,
        "analysis": analysis_entries,
        "tolerance_bps": summary_config["numeric_tolerance_bps"],
        "keywords_used": sorted(keywords),
        "expected_rollups": expected_rollups,
        "row_annotations_used": {
            "total_annotations": len(annotation_lookup),
            "summary_annotations": summary_annotation_count
        },
        "table_blueprint": blueprint
    }


def _values_within_tolerance(candidate_value: float, target_value: float, tolerance_ratio: float) -> bool:
    if candidate_value is None or target_value is None:
        return False
    if target_value == 0:
        return False
    difference = abs(candidate_value - target_value)
    allowed_delta = max(abs(target_value) * tolerance_ratio, 0.01)
    return difference <= allowed_delta



def stitch_multipage_tables(
    tables: List[Dict[str, Any]],
    allow_fuzzy_merge: bool = False,
    fuzzy_similarity_threshold: float = 0.8
) -> List[Dict[str, Any]]:
    """
    Enhanced multi-strategy table stitching for tables spanning multiple pages.
    
    Strategies:
    1. Canonical header identification and unification
    2. Comprehensive similarity analysis (header, structure, data patterns)
    3. Exact header matching (case-insensitive)
    4. Partial header matching (80% similarity threshold)
    5. Structure-based matching (column count and data patterns)
    6. Continuation detection (headers only on first page)
    7. Column count alignment for missing headers
    """
    if not tables:
        return tables
    
    print(f"📎 Enhanced multi-strategy stitching: Processing {len(tables)} tables")
    
    # Step 1: Find canonical header (most complete header)
    headers_list = [table.get("headers", []) for table in tables if table.get("headers") and len(table.get("headers", [])) > 0]
    canonical_header = max(headers_list, key=len) if headers_list else []
    print(f"📎 Canonical header identified: {canonical_header} ({len(canonical_header)} columns)")
    
    # **DEBUG: Log header information for each table**
    for i, table in enumerate(tables):
        headers = table.get("headers", [])
        print(f"📎 Table {i+1} headers: {headers} ({len(headers)} columns)")
    
    # Step 2: Group tables by comprehensive similarity
    table_groups = _group_tables_by_similarity(tables, canonical_header)
    if allow_fuzzy_merge and len(table_groups) > 1:
        print(f"📎 Fuzzy merge enabled. Attempting to combine similar header groups (threshold={fuzzy_similarity_threshold}).")
        table_groups = _merge_groups_by_similarity(
            table_groups,
            canonical_header,
            fuzzy_similarity_threshold
        )
    
    print(f"📎 Grouped {len(tables)} tables into {len(table_groups)} groups")
    
    # Step 3: Merge each group
    merged_tables = []
    for i, group in enumerate(table_groups):
        print(f"📎 Merging group {i+1} with {len(group)} tables")
        merged_table = _merge_table_group(group, canonical_header)
        merged_table = _ensure_summary_metadata(merged_table)
        
        # **DEBUG: Log merged table structure**
        merged_headers = merged_table.get("headers", [])
        merged_rows = merged_table.get("rows", [])
        print(f"📎 Merged table {i+1}: {len(merged_headers)} headers, {len(merged_rows)} rows")
        print(f"📎 Merged headers: {merged_headers}")
        
        merged_tables.append(merged_table)
    
    print(f"📎 Enhanced stitching completed: {len(merged_tables)} final tables")
    return merged_tables

def _group_tables_by_similarity(tables: List[Dict[str, Any]], canonical_header: List[str]) -> List[List[Dict[str, Any]]]:
    """Group tables by comprehensive similarity analysis with improved identical header handling."""
    if not tables:
        return []
    
    groups = []
    processed = set()
    
    # **IMPROVED: First pass - group all tables with identical headers**
    header_groups = {}
    for i, table in enumerate(tables):
        headers = table.get("headers", [])
        header_key = tuple(h.lower().strip() for h in headers)
        
        if header_key not in header_groups:
            header_groups[header_key] = []
        header_groups[header_key].append((i, table))
    
    print(f"📎 Found {len(header_groups)} unique header patterns")
    for header_key, table_list in header_groups.items():
        if len(table_list) > 1:
            print(f"📎 Header pattern '{header_key[0] if header_key else 'empty'}' appears in {len(table_list)} tables")
    
    # Process each header group
    for header_key, table_list in header_groups.items():
        if not table_list:
            continue
            
        # If multiple tables have the same headers, group them together
        if len(table_list) > 1:
            group_indices = [i for i, _ in table_list]
            group_tables = [table for _, table in table_list]
            
            print(f"📎 Creating group with {len(group_tables)} tables (identical headers)")
            groups.append(group_tables)
            
            # Mark all tables in this group as processed
            for i in group_indices:
                processed.add(i)
        else:
            # Single table with unique headers - process individually
            i, table = table_list[0]
            if i not in processed:
                groups.append([table])
                processed.add(i)
    
    # **SECOND PASS: For remaining unprocessed tables, use similarity-based grouping**
    remaining_tables = [(i, table) for i, table in enumerate(tables) if i not in processed]
    
    for i, table in remaining_tables:
        if i in processed:
            continue
        
        # Start new group
        current_group = [table]
        processed.add(i)
        
        # Find similar tables among remaining tables
        for j, other_table in remaining_tables:
            if j in processed or j == i:
                continue
            
            # Calculate comprehensive similarity for non-exact matches
            similarity = _calculate_comprehensive_similarity(table, other_table, canonical_header)
            
            print(f"📎 Similarity between table {i} and {j}: {similarity:.3f}")
            
            # More flexible threshold for grouping
            if similarity >= 0.6:
                print(f"📎 Adding table {j} to group (similarity: {similarity:.3f})")
                current_group.append(other_table)
                processed.add(j)
        
        groups.append(current_group)
    
    return groups

def _calculate_comprehensive_similarity(table1: Dict[str, Any], table2: Dict[str, Any], canonical_header: List[str]) -> float:
    """Calculate comprehensive similarity score considering multiple factors."""
    scores = []
    weights = []
    
    # 1. Header similarity (weight: 0.3)
    headers1 = table1.get("headers", [])
    headers2 = table2.get("headers", [])
    header_similarity = _calculate_header_similarity_comprehensive(headers1, headers2)
    scores.append(header_similarity)
    weights.append(0.3)
    
    # 2. Column count similarity (weight: 0.2)
    col_count_similarity = _calculate_column_count_similarity(headers1, headers2)
    scores.append(col_count_similarity)
    weights.append(0.2)
    
    # 3. Row format similarity (weight: 0.25)
    row_format_similarity = _calculate_row_format_similarity(table1, table2, canonical_header)
    scores.append(row_format_similarity)
    weights.append(0.25)
    
    # 4. Data pattern similarity (weight: 0.15)
    data_pattern_similarity = _calculate_data_pattern_similarity(table1, table2)
    scores.append(data_pattern_similarity)
    weights.append(0.15)
    
    # 5. Structure similarity (weight: 0.1)
    structure_similarity = _calculate_structure_similarity(table1, table2)
    scores.append(structure_similarity)
    weights.append(0.1)
    
    # Calculate weighted average
    weighted_sum = sum(score * weight for score, weight in zip(scores, weights))
    total_weight = sum(weights)
    
    final_score = weighted_sum / total_weight if total_weight > 0 else 0.0
    
    print(f"📎 Similarity breakdown for tables:")
    print(f"   Header: {header_similarity:.3f}")
    print(f"   Column count: {col_count_similarity:.3f}")
    print(f"   Row format: {row_format_similarity:.3f}")
    print(f"   Data pattern: {data_pattern_similarity:.3f}")
    print(f"   Structure: {structure_similarity:.3f}")
    print(f"   Final score: {final_score:.3f}")
    
    return final_score

def _calculate_header_similarity_comprehensive(headers1: List[str], headers2: List[str]) -> float:
    """Calculate comprehensive header similarity with smart column splitting detection."""
    if not headers1 or not headers2:
        return 0.0
    
    # Normalize headers
    h1_norm = [h.lower().strip() for h in headers1]
    h2_norm = [h.lower().strip() for h in headers2]
    
    # Check for smart column splitting detection
    if _detect_smart_column_splitting(h1_norm, h2_norm):
        print(f"   🔍 Smart column splitting detected - using enhanced similarity")
        return _calculate_similarity_with_smart_splitting(h1_norm, h2_norm)
    
    # Calculate similarity for each header pair
    similarities = []
    max_len = max(len(h1_norm), len(h2_norm))
    
    for i in range(max_len):
        h1 = h1_norm[i] if i < len(h1_norm) else ""
        h2 = h2_norm[i] if i < len(h2_norm) else ""
        
        if h1 == h2:
            similarities.append(1.0)
        else:
            # Calculate partial similarity
            similarity = _calculate_string_similarity(h1, h2)
            similarities.append(similarity)
    
    return sum(similarities) / len(similarities) if similarities else 0.0

def _detect_smart_column_splitting(headers1: List[str], headers2: List[str]) -> bool:
    """Detect column splitting using smart, non-hardcoded techniques."""
    
    if not headers1 or not headers2:
        return False
    
    # Technique 1: Word-level analysis
    if _detect_word_level_splitting(headers1, headers2):
        return True
    
    # Technique 2: Phrase similarity analysis
    if _detect_phrase_similarity_splitting(headers1, headers2):
        return True
    
    # Technique 3: Column count analysis with content similarity
    if _detect_column_count_splitting(headers1, headers2):
        return True
    
    return False

def _detect_word_level_splitting(headers1: List[str], headers2: List[str]) -> bool:
    """Detect splitting by analyzing word-level patterns."""
    
    # Get all words from both header sets
    words1 = set()
    words2 = set()
    
    for header in headers1:
        words1.update(header.split())
    
    for header in headers2:
        words2.update(header.split())
    
    # Check for common words that might indicate splitting
    common_words = words1.intersection(words2)
    
    # If there are many common words but different column counts, likely splitting
    if len(common_words) >= 3 and abs(len(headers1) - len(headers2)) >= 1:
        # Check if the common words form meaningful phrases when combined
        common_words_list = list(common_words)
        for i, word1 in enumerate(common_words_list):
            for word2 in common_words_list[i+1:]:
                combined_phrase = f"{word1} {word2}"
                # Check if this combined phrase exists in either header set
                headers1_joined = " ".join(headers1)
                headers2_joined = " ".join(headers2)
                if combined_phrase in headers1_joined or combined_phrase in headers2_joined:
                    return True
    
    return False

def _detect_phrase_similarity_splitting(headers1: List[str], headers2: List[str]) -> bool:
    """Detect splitting by analyzing phrase similarity patterns."""
    
    # Join headers into phrases
    phrase1 = " ".join(headers1)
    phrase2 = " ".join(headers2)
    
    # Calculate phrase similarity
    phrase_similarity = _calculate_phrase_similarity(phrase1, phrase2)
    
    # If phrases are very similar but have different word counts, likely splitting
    if phrase_similarity >= 0.7:
        words1 = phrase1.split()
        words2 = phrase2.split()
        
        # Check if one has significantly more words than the other
        if abs(len(words1) - len(words2)) >= 2:
            return True
    
    return False

def _detect_column_count_splitting(headers1: List[str], headers2: List[str]) -> bool:
    """Detect splitting by analyzing column count differences with content similarity."""
    
    # If column counts are very different, check for content similarity
    if abs(len(headers1) - len(headers2)) >= 1:
        # Calculate content similarity
        content_similarity = _calculate_content_similarity(headers1, headers2)
        
        # If content is very similar but column counts differ, likely splitting
        if content_similarity >= 0.6:
            return True
    
    return False

def _calculate_content_similarity(headers1: List[str], headers2: List[str]) -> float:
    """Calculate similarity based on content analysis."""
    
    if not headers1 or not headers2:
        return 0.0
    
    # Get all words from both sets
    all_words1 = set()
    all_words2 = set()
    
    for header in headers1:
        all_words1.update(header.split())
    
    for header in headers2:
        all_words2.update(header.split())
    
    # Calculate Jaccard similarity for words
    intersection = len(all_words1.intersection(all_words2))
    union = len(all_words1.union(all_words2))
    
    word_similarity = intersection / union if union > 0 else 0.0
    
    # Also check character-level similarity
    char_similarity = _calculate_character_similarity(headers1, headers2)
    
    # Combine word and character similarity
    return (word_similarity * 0.7) + (char_similarity * 0.3)

def _calculate_character_similarity(headers1: List[str], headers2: List[str]) -> float:
    """Calculate character-level similarity between header sets."""
    
    # Join all headers into single strings
    text1 = " ".join(headers1)
    text2 = " ".join(headers2)
    
    # Calculate character-based similarity
    chars1 = set(text1)
    chars2 = set(text2)
    
    intersection = len(chars1.intersection(chars2))
    union = len(chars1.union(chars2))
    
    return intersection / union if union > 0 else 0.0

def _calculate_phrase_similarity(phrase1: str, phrase2: str) -> float:
    """Calculate similarity between phrases."""
    if not phrase1 or not phrase2:
        return 0.0
    
    if phrase1 == phrase2:
        return 1.0
    
    # Simple character-based similarity for phrases
    common_chars = sum(1 for c in phrase1 if c in phrase2)
    total_chars = max(len(phrase1), len(phrase2))
    
    return common_chars / total_chars if total_chars > 0 else 0.0

def _calculate_similarity_with_smart_splitting(headers1: List[str], headers2: List[str]) -> float:
    """Calculate similarity when smart column splitting is detected."""
    
    # Join headers to compare as phrases
    h1_joined = " ".join(headers1)
    h2_joined = " ".join(headers2)
    
    # Calculate phrase similarity
    phrase_similarity = _calculate_phrase_similarity(h1_joined, h2_joined)
    
    # Also consider individual word matches
    words1 = set(h1_joined.split())
    words2 = set(h2_joined.split())
    
    word_intersection = len(words1.intersection(words2))
    word_union = len(words1.union(words2))
    word_similarity = word_intersection / word_union if word_union > 0 else 0.0
    
    # Combine phrase and word similarity
    combined_similarity = (phrase_similarity * 0.7) + (word_similarity * 0.3)
    
    print(f"   Smart splitting similarity: phrase={phrase_similarity:.3f}, word={word_similarity:.3f}, combined={combined_similarity:.3f}")
    
    return combined_similarity

def _calculate_column_count_similarity(headers1: List[str], headers2: List[str]) -> float:
    """Calculate similarity based on column count."""
    count1 = len(headers1)
    count2 = len(headers2)
    
    if count1 == count2:
        return 1.0
    elif count1 == 0 or count2 == 0:
        return 0.0
    else:
        # Calculate similarity based on difference ratio
        max_count = max(count1, count2)
        min_count = min(count1, count2)
        difference_ratio = (max_count - min_count) / max_count
        return 1.0 - difference_ratio

def _calculate_row_format_similarity(table1: Dict[str, Any], table2: Dict[str, Any], canonical_header: List[str]) -> float:
    """Calculate similarity based on row format patterns."""
    rows1 = table1.get("rows", [])
    rows2 = table2.get("rows", [])
    
    if not rows1 or not rows2:
        return 0.0
    
    # Check row length consistency with canonical header
    expected_length = len(canonical_header)
    
    length_matches1 = sum(1 for row in rows1 if abs(len(row) - expected_length) <= 1)
    length_matches2 = sum(1 for row in rows2 if abs(len(row) - expected_length) <= 1)
    
    format_similarity1 = length_matches1 / len(rows1) if rows1 else 0.0
    format_similarity2 = length_matches2 / len(rows2) if rows2 else 0.0
    
    return (format_similarity1 + format_similarity2) / 2

def _calculate_data_pattern_similarity(table1: Dict[str, Any], table2: Dict[str, Any]) -> float:
    """Calculate similarity based on data value patterns."""
    rows1 = table1.get("rows", [])[:3]  # Sample first 3 rows
    rows2 = table2.get("rows", [])[:3]
    
    if not rows1 or not rows2:
        return 0.0
    
    # Analyze column patterns
    patterns1 = _analyze_column_patterns(rows1)
    patterns2 = _analyze_column_patterns(rows2)
    
    # Compare patterns
    pattern_matches = 0
    total_columns = min(len(patterns1), len(patterns2))
    
    for i in range(total_columns):
        if _patterns_are_similar(patterns1[i], patterns2[i]):
            pattern_matches += 1
    
    return pattern_matches / total_columns if total_columns > 0 else 0.0

def _analyze_column_patterns(rows: List[List[str]]) -> List[Dict[str, Any]]:
    """Analyze data patterns for each column."""
    if not rows:
        return []
    
    max_cols = max(len(row) for row in rows) if rows else 0
    patterns = []
    
    for col_idx in range(max_cols):
        column_data = []
        for row in rows:
            if col_idx < len(row):
                column_data.append(str(row[col_idx]).strip())
        
        pattern = {
            'has_numbers': any(_is_numeric(val) for val in column_data),
            'has_currency': any('$' in val for val in column_data),
            'has_dates': any(_is_date(val) for val in column_data),
            'avg_length': sum(len(val) for val in column_data) / len(column_data) if column_data else 0,
            'has_alpha': any(any(c.isalpha() for c in val) for val in column_data)
        }
        patterns.append(pattern)
    
    return patterns

def _patterns_are_similar(pattern1: Dict[str, Any], pattern2: Dict[str, Any]) -> bool:
    """Check if two column patterns are similar."""
    if not pattern1 or not pattern2:
        return False
    
    matches = 0
    total_checks = 0
    
    for key in ['has_numbers', 'has_currency', 'has_dates', 'has_alpha']:
        if pattern1.get(key) == pattern2.get(key):
            matches += 1
        total_checks += 1
    
    # Check length similarity
    length_diff = abs(pattern1.get('avg_length', 0) - pattern2.get('avg_length', 0))
    if length_diff <= 5:  # Allow 5 character difference
        matches += 1
    total_checks += 1
    
    return matches / total_checks >= 0.7 if total_checks > 0 else False

def _calculate_structure_similarity(table1: Dict[str, Any], table2: Dict[str, Any]) -> float:
    """Calculate similarity based on table structure."""
    has_headers1 = bool(table1.get("headers"))
    has_headers2 = bool(table2.get("headers"))
    has_rows1 = bool(table1.get("rows"))
    has_rows2 = bool(table2.get("rows"))
    
    matches = 0
    total_checks = 0
    
    if has_headers1 == has_headers2:
        matches += 1
    total_checks += 1
    
    if has_rows1 == has_rows2:
        matches += 1
    total_checks += 1
    
    # Check row count similarity
    if has_rows1 and has_rows2:
        rows1 = table1.get("rows", [])
        rows2 = table2.get("rows", [])
        row_count_diff = abs(len(rows1) - len(rows2))
        max_rows = max(len(rows1), len(rows2))
        if max_rows > 0 and row_count_diff / max_rows <= 0.5:
            matches += 1
        total_checks += 1
    
    return matches / total_checks if total_checks > 0 else 0.0

def _merge_groups_by_similarity(
    table_groups: List[List[Dict[str, Any]]],
    canonical_header: List[str],
    threshold: float
) -> List[List[Dict[str, Any]]]:
    """Merge table groups whose headers are highly similar (carrier-specific consolidation)."""
    if not table_groups:
        return table_groups
    
    merged_groups: List[List[Dict[str, Any]]] = []
    used = set()
    
    for i, base_group in enumerate(table_groups):
        if i in used:
            continue
        
        combined_group = list(base_group)
        base_table = base_group[0]
        
        for j in range(i + 1, len(table_groups)):
            if j in used:
                continue
            
            candidate_group = table_groups[j]
            candidate_table = candidate_group[0]
            similarity = _calculate_comprehensive_similarity(base_table, candidate_table, canonical_header)
            
            if similarity >= threshold:
                print(
                    f"📎 Fuzzy merge: combining group {i+1} with {j+1} (similarity={similarity:.3f})"
                )
                combined_group.extend(candidate_group)
                used.add(j)
        
        merged_groups.append(combined_group)
    
    return merged_groups


def _merge_table_group(group: List[Dict[str, Any]], canonical_header: List[str]) -> Dict[str, Any]:
    """Merge a group of similar tables into a single table."""
    if not group:
        return {}
    
    # **IMPROVED: Find the best header from the group**
    best_headers = None
    for table in group:
        headers = table.get("headers", [])
        if headers and len(headers) > 0:
            # Use the first non-empty header we find
            if not best_headers or len(headers) > len(best_headers):
                best_headers = headers
    
    # Fallback to canonical header if no good headers found
    if not best_headers:
        best_headers = canonical_header
    
    # Use the first table as base
    base_table = group[0].copy()
    all_rows = base_table.get("rows", [])
    
    # Add rows from other tables
    for table in group[1:]:
        rows = table.get("rows", [])
        all_rows.extend(rows)
    
    # **IMPROVED: Preserve original table metadata**
    merged_metadata = {
        "total_tables_merged": len(group),
        "total_rows": len(all_rows),
        "canonical_header": best_headers,
        "merged_from_tables": [table.get("metadata", {}).get("table_id", i) for i, table in enumerate(group)]
    }
    
    # Create merged table - preserve ALL fields from base table
    merged_table = base_table.copy()  # Start with all fields from base table
    merged_table.update({
        "headers": best_headers,
        "rows": all_rows,
        "metadata": merged_metadata
    })
    
    # **OPTIMIZATION: Skip re-applying enhancements after merge to avoid loading Mistral**
    # Enhancement was already applied to individual tables before merging
    # Preserve the enhancement metadata from the base table
    if "summary_detection" in base_table:
        merged_table["summary_detection"] = base_table["summary_detection"]
        merged_table["summary_detection"]["original_row_count"] = len(all_rows)
        merged_table["summary_detection"]["cleaned_row_count"] = len(all_rows)
    
    if "bracket_processing" in base_table:
        merged_table["bracket_processing"] = base_table["bracket_processing"]
        # Update cell counts for merged table
        total_cells = len(all_rows) * len(canonical_header)
        merged_table["bracket_processing"]["total_cells_processed"] = total_cells
        merged_table["bracket_processing"]["validation"]["total_cells_checked"] = total_cells
    
    logger.info(f"✅ Merged table created: {len(all_rows)} rows (enhancements preserved from individual tables)")
    return merged_table


def _ensure_summary_metadata(table: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure summary_rows metadata is populated using heuristic detection."""
    enriched = enrich_tables_with_summary_intelligence([table])
    return enriched[0] if enriched else table

def _headers_exact_match(headers1: List[str], headers2: List[str]) -> bool:
    """Check if headers match exactly (case-insensitive)."""
    if len(headers1) != len(headers2):
        return False
    
    headers1_lower = [h.lower().strip() for h in headers1]
    headers2_lower = [h.lower().strip() for h in headers2]
    
    return headers1_lower == headers2_lower

def _headers_partial_match(headers1: List[str], headers2: List[str]) -> bool:
    """Check if headers match partially with similarity threshold."""
    if len(headers1) != len(headers2):
        return False
    
    # Calculate similarity for each header pair
    similarities = []
    for h1, h2 in zip(headers1, headers2):
        similarity = _calculate_string_similarity(h1, h2)
        similarities.append(similarity)
    
    # Check if average similarity meets threshold
    avg_similarity = sum(similarities) / len(similarities) if similarities else 0
    
    # Enhanced logging for debugging
    print(f"   Header similarity check: {avg_similarity:.3f} (threshold: {HEADER_SIMILARITY_THRESHOLD})")
    print(f"   Headers 1: {headers1}")
    print(f"   Headers 2: {headers2}")
    print(f"   Individual similarities: {similarities}")
    
    return avg_similarity >= HEADER_SIMILARITY_THRESHOLD

def _calculate_string_similarity(str1: str, str2: str) -> float:
    """Calculate similarity between two strings."""
    if not str1 or not str2:
        return 0.0
    
    str1_lower = str1.lower().strip()
    str2_lower = str2.lower().strip()
    
    if str1_lower == str2_lower:
        return 1.0
    
    # Simple character-based similarity
    common_chars = sum(1 for c in str1_lower if c in str2_lower)
    total_chars = max(len(str1_lower), len(str2_lower))
    
    return common_chars / total_chars if total_chars > 0 else 0.0

def _structure_based_match(table1: Dict[str, Any], table2: Dict[str, Any]) -> bool:
    """Check if tables have similar structure based on column count and data patterns."""
    rows1 = table1.get("rows", [])
    rows2 = table2.get("rows", [])
    
    if not rows1 or not rows2:
        return False
    
    # Check column count similarity
    col_count1 = len(rows1[0]) if rows1 else 0
    col_count2 = len(rows2[0]) if rows2 else 0
    
    if col_count1 != col_count2:
        return False
    
    # Check data pattern similarity (first few rows)
    pattern_similarity = _analyze_data_patterns(rows1[:3], rows2[:3])
    return pattern_similarity >= PATTERN_MATCH_THRESHOLD

def _analyze_data_patterns(rows1: List[List[str]], rows2: List[List[str]]) -> float:
    """Analyze data patterns between two sets of rows."""
    if not rows1 or not rows2:
        return 0.0
    
    # Simple pattern analysis: check if columns contain similar data types
    similarities = []
    
    for col_idx in range(min(len(rows1[0]), len(rows2[0]))):
        col1_values = [row[col_idx] for row in rows1 if col_idx < len(row)]
        col2_values = [row[col_idx] for row in rows2 if col_idx < len(row)]
        
        # Check if columns have similar characteristics
        similarity = _compare_column_characteristics(col1_values, col2_values)
        similarities.append(similarity)
    
    return sum(similarities) / len(similarities) if similarities else 0.0

def _compare_column_characteristics(values1: List[str], values2: List[str]) -> float:
    """Compare characteristics of two columns."""
    if not values1 or not values2:
        return 0.0
    
    # Check if both columns contain similar data types
    has_numbers1 = any(_is_numeric(v) for v in values1)
    has_numbers2 = any(_is_numeric(v) for v in values2)
    
    has_dates1 = any(_is_date(v) for v in values1)
    has_dates2 = any(_is_date(v) for v in values2)
    
    # Calculate similarity based on data type consistency
    type_similarity = 0.0
    if has_numbers1 == has_numbers2:
        type_similarity += 0.5
    if has_dates1 == has_dates2:
        type_similarity += 0.5
    
    return type_similarity

def _is_numeric(value: str) -> bool:
    """Check if a value is numeric."""
    if not value:
        return False
    
    # Remove common non-numeric characters
    clean_value = value.replace(',', '').replace('$', '').replace('%', '').strip()
    
    # Check if it's a number
    try:
        float(clean_value)
        return True
    except ValueError:
        return False

def _is_date(value: str) -> bool:
    """Check if a value looks like a date."""
    if not value:
        return False
    
    # Simple date pattern detection
    import re
    date_patterns = [
        r'\d{1,2}/\d{1,2}/\d{2,4}',  # MM/DD/YYYY
        r'\d{1,2}-\d{1,2}-\d{2,4}',  # MM-DD-YYYY
        r'\d{4}-\d{1,2}-\d{1,2}',    # YYYY-MM-DD
    ]
    
    for pattern in date_patterns:
        if re.search(pattern, value):
            return True
    
    return False

def _continuation_detection(headers1: List[str], headers2: List[str], rows2: List[List[str]]) -> bool:
    """Detect if table2 is a continuation of table1 (headers only on first page)."""
    # Case 1: Next table has no headers
    if not headers2:
        return True
    
    # Case 2: Next table has very few headers (likely not real headers)
    if len(headers2) <= 2:
        return True
    
    # Case 3: Next table has data rows but headers look like data
    if rows2 and len(headers2) == len(rows2[0]):
        # Check if headers look like data (contain numbers, etc.)
        header_looks_like_data = any(_is_numeric(h) or _is_date(h) for h in headers2)
        return header_looks_like_data
    
    return False


def validate_table_structure(table: Dict[str, Any]) -> Dict[str, Any]:
    """
    Data-preserving table structure validation with enhanced logic.
    
    Args:
        table: Table dictionary to validate
        
    Returns:
        Validated table with metadata
    """
    validation_result = {
        "is_valid": True,
        "warnings": [],
        "errors": [],
        "preservation_metrics": {
            "original_rows": 0,
            "preserved_rows": 0,
            "original_columns": 0,
            "preserved_columns": 0
        }
    }
    
    headers = table.get("headers", [])
    rows = table.get("rows", [])
    footers = table.get("footers", [])
    
    # Track original dimensions
    original_row_count = len(rows)
    original_col_count = len(headers) if headers else 0
    
    print(f"📊 Data preservation: Validating table with {original_row_count} rows and {original_col_count} columns")
    
    # Generate default headers if none exist
    if not headers and rows:
        print("📋 Data preservation: No headers found, generating default headers")
        max_cols = max(len(row) for row in rows) if rows else 0
        headers = [f"Column_{i+1}" for i in range(max_cols)]
        table["headers"] = headers
        validation_result["warnings"].append("Generated default headers")
    
    # Ensure headers are strings and not empty
    if headers:
        normalized_headers = []
        for i, header in enumerate(headers):
            if header and str(header).strip():
                cleaned_header = _clean_text(str(header).strip())
                normalized_headers.append(cleaned_header)
            else:
                # Generate meaningful header based on data
                meaningful_header = _generate_header_from_data(rows, i) if rows else f"Column_{i+1}"
                normalized_headers.append(meaningful_header)
                print(f"📋 Data preservation: Generated header '{meaningful_header}' for empty column {i}")
        
        table["headers"] = normalized_headers
        headers = normalized_headers
    
    # Preserve all rows and normalize cell content
    if rows:
        normalized_rows = []
        for i, row in enumerate(rows):
            if isinstance(row, (list, tuple)):
                # Preserve all cells, normalize to strings and clean them
                normalized_row = [_clean_text(str(cell).strip()) if cell else "" for cell in row]
                normalized_rows.append(normalized_row)
            else:
                # Single value row - preserve as single column
                normalized_rows.append([_clean_text(str(row).strip()) if row else ""])
                validation_result["warnings"].append(f"Row {i} converted to single column")
        
        table["rows"] = normalized_rows
        rows = normalized_rows
    
    # Normalize row lengths by padding (don't truncate)
    if rows and headers:
        max_cols = len(headers)
        for i, row in enumerate(rows):
            if len(row) < max_cols:
                # Pad with empty strings
                rows[i] = row + [""] * (max_cols - len(row))
            elif len(row) > max_cols:
                # Extend headers to match longest row
                while len(headers) < len(row):
                    headers.append(f"Column_{len(headers)+1}")
                table["headers"] = headers
                validation_result["warnings"].append(f"Extended headers to match row {i} length")
    
    # Ensure footers are strings
    if footers:
        footers = [str(f).strip() if f else "" for f in footers]
        table["footers"] = footers
    
    # Check for duplicate headers and make them unique
    if headers:
        unique_headers = []
        header_counts = {}
        
        for header in headers:
            if header in header_counts:
                header_counts[header] += 1
                unique_header = f"{header}_{header_counts[header]}"
                unique_headers.append(unique_header)
                validation_result["warnings"].append(f"Made duplicate header '{header}' unique: '{unique_header}'")
            else:
                header_counts[header] = 1
                unique_headers.append(header)
        
        table["headers"] = unique_headers
    
    # Calculate preservation metrics
    final_row_count = len(rows)
    final_col_count = len(headers)
    
    validation_result["preservation_metrics"] = {
        "original_rows": original_row_count,
        "preserved_rows": final_row_count,
        "original_columns": original_col_count,
        "preserved_columns": final_col_count,
        "row_preservation_rate": final_row_count / original_row_count if original_row_count > 0 else 1.0,
        "column_preservation_rate": final_col_count / original_col_count if original_col_count > 0 else 1.0
    }
    
    print(f"📊 Data preservation: Final result - {final_row_count} rows and {final_col_count} columns")
    print(f"📊 Data preservation: Row preservation rate: {validation_result['preservation_metrics']['row_preservation_rate']:.1%}")
    print(f"📊 Data preservation: Column preservation rate: {validation_result['preservation_metrics']['column_preservation_rate']:.1%}")
    
    # Ensure required fields exist
    if "row_count" not in table:
        table["row_count"] = len(rows)
    if "column_count" not in table:
        table["column_count"] = len(headers)
    if "extractor" not in table:
        table["extractor"] = "unknown"
    
    # Update validation result
    table["validation"] = validation_result
    return table

def _clean_text(text: str) -> str:
    """
    Clean and normalize text by removing excessive formatting and artifacts.
    
    Args:
        text: Raw text to clean
        
    Returns:
        Cleaned text
    """
    if not text:
        return ""
    
    # Remove excessive underscores (common in form fields and OCR artifacts)
    import re
    cleaned = re.sub(r'_+', ' ', text)
    
    # Remove excessive dashes (common in form fields)
    cleaned = re.sub(r'-+', ' ', cleaned)
    
    # Remove excessive dots/periods
    cleaned = re.sub(r'\.+', '.', cleaned)
    
    # Remove excessive spaces
    cleaned = re.sub(r'\s+', ' ', cleaned)
    
    # Remove leading/trailing whitespace
    cleaned = cleaned.strip()
    
    # If the result is just whitespace or empty, return empty string
    if not cleaned or cleaned.isspace():
        return ""
    
    return cleaned

def _generate_header_from_data(rows: List[List[str]], column_index: int) -> str:
    """
    Generate a meaningful header based on the data in a specific column.
    
    Args:
        rows: Table data rows
        column_index: Index of the column to analyze
        
    Returns:
        Generated header string
    """
    try:
        if not rows or column_index >= len(rows[0]):
            return f"Column_{column_index+1}"
        
        # Get all values in this column
        column_values = []
        for row in rows:
            if column_index < len(row):
                value = row[column_index].strip()
                if value:
                    column_values.append(value)
        
        if not column_values:
            return f"Column_{column_index+1}"
        
        # Analyze the data to generate a meaningful header
        sample_values = column_values[:5]  # Look at first 5 values
        
        # Check if it looks like dates
        date_pattern = any(_is_date(val) for val in sample_values)
        if date_pattern:
            return "Date"
        
        # Check if it looks like numbers
        number_pattern = any(_is_numeric(val) for val in sample_values)
        if number_pattern:
            return "Amount"
        
        # Check if it looks like names
        name_pattern = any(_looks_like_name(val) for val in sample_values)
        if name_pattern:
            return "Name"
        
        # Default to a generic header
        return f"Column_{column_index+1}"
        
    except Exception as e:
        print(f"Error generating header from data: {e}")
        return f"Column_{column_index+1}"

def _looks_like_name(value: str) -> bool:
    """Check if a value looks like a name."""
    import re
    # Simple heuristic: contains letters and spaces, no numbers
    return bool(re.match(r'^[A-Za-z\s]+$', value))

