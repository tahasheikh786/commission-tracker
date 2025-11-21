import math
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


def refine_summary_rows(table: Dict[str, Any]) -> Dict[str, Any]:
    """
    Post-process summary rows to reduce false positives and add obvious omissions.
    Looks at row density (number of populated cells) and keyword presence.
    """
    rows: List[List[Any]] = table.get("rows", []) or []
    if not rows:
        table["summaryRows"] = []
        return table

    headers = table.get("header") or table.get("headers") or []
    column_count = len(headers) if headers else max(len(row) for row in rows)

    existing = set(table.get("summaryRows") or table.get("summary_rows") or [])

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
        has_identifier = any(str(cell).strip() for cell in row[:2])

        looks_sparse = non_empty <= density_threshold
        numeric_heavy = numeric_cells >= max(1, math.ceil(column_count * 0.3))

        should_be_summary = has_keyword or (looks_sparse and not has_identifier and numeric_heavy)

        if should_be_summary:
            refined.add(idx)
        elif idx in existing:
            # AI marked it, but heuristics disagree – keep only if it's extremely sparse
            if looks_sparse or has_keyword:
                refined.add(idx)
        # else leave out

    # Always return sorted list for stability
    table["summaryRows"] = sorted(refined)
    if "summary_rows" in table:
        table.pop("summary_rows", None)
    return table


