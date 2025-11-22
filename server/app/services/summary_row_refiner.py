import math
import re
from typing import Any, Dict, List, Set

SUMMARY_KEYWORDS = [
    "total",
    "subtotal",
    "summary",
    "grand",
    "vendor",
    "overall",
    "net",
    "balance",
    "group",
]

SUMMARY_ROW_REGEXES = [
    re.compile(r"\btotal\s+for\b", re.IGNORECASE),
    re.compile(r"\bgrand\s+total\b", re.IGNORECASE),
    re.compile(r"\bnet\s+(?:payment|commission)\b", re.IGNORECASE),
    re.compile(r"\bsummary\b", re.IGNORECASE),
    re.compile(r"\bcommission\s+total\b", re.IGNORECASE),
    re.compile(r"\bwriting\s+agent\b", re.IGNORECASE),
    re.compile(r"\bplan\s+summary\b", re.IGNORECASE),
]


def _count_non_empty_cells(row: List[Any]) -> int:
    return sum(1 for cell in row if str(cell).strip())


def _count_numeric_cells(row: List[Any]) -> int:
    count = 0
    for cell in row:
        text = str(cell).strip()
        if not text:
            continue
        # Remove commas, $, parentheses for negative numbers
        normalized = text.replace(",", "").replace("$", "")
        if normalized.startswith("(") and normalized.endswith(")"):
            normalized = normalized[1:-1]
        try:
            float(normalized)
            count += 1
        except ValueError:
            continue
    return count


def _row_has_keyword(row: List[Any]) -> bool:
    lowered = " ".join(str(cell).lower() for cell in row if cell)
    return any(keyword in lowered for keyword in SUMMARY_KEYWORDS)


def _is_numeric_value(cell: Any) -> bool:
    """Check if a cell contains only a numeric/currency value (not a text identifier)"""
    if not cell:
        return False
    text = str(cell).strip()
    if not text:
        return False
    # Remove currency symbols, commas, parentheses
    normalized = text.replace(",", "").replace("$", "").replace("(", "").replace(")", "").strip()
    if not normalized:
        return False
    # Check if what remains is a number (including decimals and negatives)
    try:
        float(normalized)
        return True
    except ValueError:
        return False


def row_looks_like_summary(row: List[Any]) -> bool:
    """
    Detect summary-like rows even when AI didn't mark them.
    Looks for explicit phrases plus sparse rows with few populated cells.
    """
    if not row:
        return False

    joined_lower = " ".join(str(cell).strip().lower() for cell in row if str(cell).strip())
    if joined_lower:
        for regex in SUMMARY_ROW_REGEXES:
            if regex.search(joined_lower):
                return True
        if "total" in joined_lower and joined_lower.count("total") > 1:
            return True

    non_empty = _count_non_empty_cells(row)
    numeric_cells = _count_numeric_cells(row)

    if non_empty == 0:
        return False

    # Rows that only have 3 or fewer populated cells and mention "total" anywhere are summaries
    if non_empty <= 3 and joined_lower and "total" in joined_lower:
        return True

    # Sparse rows with few numeric cells are usually rollups (e.g., Total for Vendor)
    if non_empty <= 4 and numeric_cells <= 2 and joined_lower:
        if any(keyword in joined_lower for keyword in ["total", "vendor", "summary", "plan"]):
            return True

    # Rows with zero identifiers (first two columns empty) but multiple numeric cells are usually subtotals
    identifier_cells = [str(cell).strip() for cell in row[:2]]
    if non_empty <= 5 and not any(identifier_cells) and numeric_cells >= 1:
        return True

    return False


def refine_summary_rows(table: Dict[str, Any]) -> Dict[str, Any]:
    """
    Post-process summary rows to reduce false positives and add obvious omissions.
    Looks at row density (number of populated cells) and keyword presence.
    
    ✅ CRITICAL: Preserves AI-marked summary rows and handles grand total tables specially.
    """
    rows: List[List[Any]] = table.get("rows", []) or []
    if not rows:
        table["summaryRows"] = []
        return table

    headers = table.get("header") or table.get("headers") or []
    column_count = len(headers) if headers else max(len(row) for row in rows)

    existing = set(table.get("summaryRows") or table.get("summary_rows") or [])
    
    # ✅ CRITICAL: Check if this is a grand total table
    # If yes, ALL rows are summary rows - don't refine
    from app.services.extraction_utils import is_grand_total_table
    if is_grand_total_table(table):
        # Mark all rows as summary rows for grand total tables
        all_rows_as_summary = list(range(len(rows)))
        table["summaryRows"] = all_rows_as_summary
        if "summary_rows" in table:
            table.pop("summary_rows", None)
        return table

    non_empty_counts = [_count_non_empty_cells(row) for row in rows]
    avg_non_empty = sum(non_empty_counts) / max(len(non_empty_counts), 1)
    median_non_empty = sorted(non_empty_counts)[len(non_empty_counts) // 2]
    # Threshold: rows with <= 40% of typical density (but at least 2 cells) are candidates
    density_threshold = max(2, math.ceil(min(avg_non_empty, median_non_empty) * 0.4))

    refined: Set[int] = set()

    for idx, row in enumerate(rows):
        non_empty = non_empty_counts[idx]
        numeric_cells = _count_numeric_cells(row)
        has_keyword = _row_has_keyword(row)
        
        # ✅ IMPROVED: Check if identifier columns contain actual text identifiers (not just numbers)
        # Summary rows often have ONLY numeric values, even in identifier columns
        identifier_cells = row[:2] if len(row) >= 2 else row
        has_text_identifier = any(
            str(cell).strip() and not _is_numeric_value(cell) 
            for cell in identifier_cells
        )
        
        # ✅ NEW: Detect sparse rows with only numeric values (common summary pattern)
        # Example: ["$142,491.00", "$137,371.00", null, null, null, "$6,783.30"]
        non_empty_cells = [
            cell for cell in row 
            if cell is not None and str(cell).strip() and str(cell).lower() not in ('null', 'none', '')
        ]
        all_non_empty_are_numeric = (
            len(non_empty_cells) > 0 and 
            all(_is_numeric_value(cell) for cell in non_empty_cells)
        )
        is_numeric_summary_pattern = (
            non_empty <= max(3, column_count * 0.5) and  # Sparse row
            numeric_cells >= 1 and  # At least one numeric value
            not has_text_identifier and  # No text identifiers
            all_non_empty_are_numeric  # Only numbers in populated cells
        )

        looks_sparse = non_empty <= density_threshold
        numeric_heavy = numeric_cells >= max(1, math.ceil(column_count * 0.3))

        heuristic_summary = (
            has_keyword or 
            (looks_sparse and not has_text_identifier and numeric_heavy) or
            is_numeric_summary_pattern  # ✅ NEW: Catch numeric-only summary rows
        )
        detected_summary = row_looks_like_summary(row)
        should_be_summary = heuristic_summary or detected_summary

        if should_be_summary:
            refined.add(idx)
        elif idx in existing:
            # ✅ CRITICAL: Trust GPT's row annotations - if GPT marked it as summary, keep it
            # Only remove if it's definitely NOT a summary (has REAL text identifier and dense)
            is_definitely_not_summary = has_text_identifier and non_empty > density_threshold * 1.5
            if not is_definitely_not_summary:
                refined.add(idx)
        # else leave out

    # Always return sorted list for stability
    table["summaryRows"] = sorted(refined)
    if "summary_rows" in table:
        table.pop("summary_rows", None)
    return table


