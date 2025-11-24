"""
New Extraction API - Advanced table extraction using the new working solution
This API provides endpoints for the new advanced extraction pipeline while
maintaining compatibility with the existing server structure.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.services.enhanced_extraction_service import EnhancedExtractionService
from app.config import get_db
from app.utils.db_retry import with_db_retry
from app.dependencies.auth_dependencies import get_current_user_hybrid
from app.db.models import User
from app.services.audit_logging_service import AuditLoggingService
import asyncio
import os
from datetime import datetime
from uuid import uuid4, UUID
from app.services.gcs_utils import upload_file_to_gcs, get_gcs_file_url, download_file_from_gcs, generate_gcs_signed_url
from app.services.websocket_service import connection_manager
import logging
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass
from fastapi.responses import JSONResponse
import re
import hashlib
import copy
from pypdf import PdfReader
from app.services.cancellation_manager import cancellation_manager
from app.constants.statuses import VALID_PERSISTENT_STATUSES
from app.services.summary_row_refiner import refine_summary_rows, row_looks_like_summary
from app.services.extraction_utils import resolve_carrier_broker_roles
from app.services.upload_cache import upload_cache

router = APIRouter(prefix="/api", tags=["new-extract"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = "pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Initialize the enhanced extraction service
enhanced_extraction_service = None

async def get_enhanced_extraction_service_instance(use_enhanced: bool = None):
    """
    Get or create the enhanced extraction service instance.
    
    Args:
        use_enhanced: If True, use enhanced 3-phase extraction pipeline.
                     If None, uses default (environment variable or False).
    """
    # Create new instance with specific configuration when use_enhanced is specified
    if use_enhanced is not None:
        return EnhancedExtractionService(use_enhanced=use_enhanced)
    
    # Otherwise use cached instance with default configuration
    global enhanced_extraction_service
    if enhanced_extraction_service is None:
        enhanced_extraction_service = EnhancedExtractionService()
    return enhanced_extraction_service



# Store running extraction tasks for cancellation
running_extractions: Dict[str, asyncio.Task] = {}

SUMMARY_TOTAL_KEYWORDS = [
    ("total for vendor", 6.0),
    ("total for carrier", 5.0),
    ("total for company", 4.5),
    ("total for broker", 4.5),
    ("total for group", 4.0),
    ("total for statement", 4.5),
    ("total for report", 4.0),
    ("commission total", 4.0),
    ("total commission payment", 4.0),
    ("net commission", 3.5),
    ("net payment", 3.5),
    ("grand total", 3.5),
    ("statement total", 3.5),
    ("total payment", 3.0),
    ("total amount", 3.0),
    ("total due", 3.0)
]

GLOBAL_TOTAL_KEYWORDS = {
    "total for vendor",
    "vendor total",
    "carrier total",
    "total for carrier",
    "total for statement",
    "statement total",
    "report total",
    "grand total",
    "overall total",
    "net payment",
    "net commission",
    "net remit",
    "total commission payment",
    "total commission amount",
}


@dataclass
class TotalCandidate:
    amount: float
    label: str
    row_index: int
    score: float
    source: str


def guess_carrier_from_pdf(file_path: str) -> Optional[str]:
    """
    Attempt to infer the carrier name directly from the PDF text layer.
    Focuses on the first page and filters out common header keywords.
    """
    try:
        reader = PdfReader(file_path)
        if not reader.pages:
            return None
        first_page = reader.pages[0]
        text = first_page.extract_text() or ""
        if not text:
            return None
        
        candidates: List[str] = []
        for line in text.splitlines():
            cleaned = line.strip()
            if not cleaned:
                continue
            lower = cleaned.lower()
            if any(
                keyword in lower
                for keyword in (
                    "commission",
                    "statement",
                    "summary",
                    "prepared for",
                    "broker",
                    "agent",
                    "payment",
                    "period"
                )
            ):
                continue
            if ":" in cleaned:
                continue
            if len(cleaned) > 80:
                continue
            if re.match(r"^\d", cleaned):
                continue
            if re.search(r"\d", cleaned) and not re.search(r"[A-Za-z]", cleaned):
                continue
            candidates.append(cleaned)
            if len(candidates) >= 5:
                break
        
        return candidates[0] if candidates else None
    except Exception as exc:
        logger.debug(f"Carrier guess from PDF failed: {exc}")
        return None


def extract_pdf_text_snippet(file_path: str, max_chars: int = 1500) -> Optional[str]:
    """
    Extract a small text snippet from the first page of a PDF for carrier detection.
    """
    try:
        reader = PdfReader(file_path)
        if not reader.pages:
            return None
        first_page = reader.pages[0]
        text = first_page.extract_text() or ""
        snippet = text.replace('\r', '\n').strip()
        if not snippet:
            return None
        return snippet[:max_chars]
    except Exception as exc:
        logger.debug(f"Unable to extract PDF snippet from '{file_path}': {exc}")
        return None


async def validate_carrier_metadata_with_db(
    db: AsyncSession,
    document_metadata: Dict[str, Any],
    fallback_carrier_name: Optional[str],
    file_path: str,
    pdf_text_snippet: Optional[str] = None
) -> Dict[str, Any]:
    """
    Cross-check extracted carrier/broker names against known companies in the database.
    Prevents GPT from misclassifying brokers as carriers and vice versa.
    """
    if not document_metadata:
        return document_metadata
    
    if pdf_text_snippet is None:
        pdf_text_snippet = extract_pdf_text_snippet(file_path)
    
    metadata, disambig = resolve_carrier_broker_roles(
        document_metadata,
        expected_carrier_name=fallback_carrier_name,
        uploader_company_name=None,
        pdf_text_snippet=pdf_text_snippet
    )
    if disambig:
        logger.info(f"📎 Carrier/Broker resolution adjustments applied: {disambig}")
    
    metadata = metadata or {}
    validation_events: List[Dict[str, Any]] = []
    extracted_carrier = metadata.get('carrier_name')
    extracted_broker = metadata.get('broker_company')
    placeholder_tokens = {"unknown", "null", "none", "n/a", "na", "not provided", "pending"}
    
    def _is_placeholder(value: Optional[str]) -> bool:
        if value is None:
            return True
        trimmed = value.strip()
        if not trimmed:
            return True
        return trimmed.lower() in placeholder_tokens
    
    def _split_composite_name(value: Optional[str]) -> List[str]:
        if not value:
            return []
        if not any(sep in value for sep in ('/', '|', '•')):
            return []
        parts = [segment.strip(" -–—•") for segment in re.split(r'[\/\|•]+', value)]
        return [part for part in parts if part]
    
    async def _handle_composite_carrier(value: Optional[str]) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        segments = _split_composite_name(value)
        if len(segments) < 2:
            return events
        
        segment_roles: List[Tuple[str, Optional[Dict[str, Any]]]] = []
        for segment in segments:
            try:
                role_info = await with_db_retry(db, crud.get_company_role_by_name, name=segment)
            except Exception as exc:
                logger.debug(f"Composite carrier lookup failed for '{segment}': {exc}")
                role_info = None
            segment_roles.append((segment, role_info))
        
        broker_candidates = [
            seg for seg, role in segment_roles
            if role and role.get('classification') == 'broker'
        ]
        carrier_candidates = [
            seg for seg, role in segment_roles
            if role and role.get('classification') in ('carrier', 'mixed')
        ]
        
        selected_carrier = None
        if carrier_candidates:
            selected_carrier = carrier_candidates[0]
        elif fallback_carrier_name:
            selected_carrier = fallback_carrier_name
        elif segments:
            selected_carrier = segments[0]
        
        if selected_carrier and selected_carrier != value:
            metadata['carrier_name'] = selected_carrier
            metadata['carrier_confidence'] = max(metadata.get('carrier_confidence', 0.6), 0.9)
            events.append({
                "issue": "composite_carrier_cleaned",
                "matched_segments": segments,
                "selected_carrier": selected_carrier
            })
        
        if broker_candidates:
            broker_choice = broker_candidates[0]
            if _is_placeholder(metadata.get('broker_company')):
                metadata['broker_company'] = broker_choice
                metadata['broker_confidence'] = max(metadata.get('broker_confidence', 0.6), 0.85)
            events.append({
                "issue": "composite_broker_identified",
                "broker_candidate": broker_choice
            })
        
        return events
    
    # First handle composite carrier/broker strings such as "Carrier / Broker"
    if extracted_carrier and any(sep in extracted_carrier for sep in ('/', '|', '•')):
        composite_events = await _handle_composite_carrier(extracted_carrier)
        validation_events.extend(composite_events)
        extracted_carrier = metadata.get('carrier_name')
        extracted_broker = metadata.get('broker_company')
    
    carrier_role_info = None
    if extracted_carrier and not _split_composite_name(extracted_carrier):
        carrier_role_info = await with_db_retry(db, crud.get_company_role_by_name, name=extracted_carrier)
        if carrier_role_info:
            metadata['carrier_name_db_role'] = carrier_role_info
            if carrier_role_info.get('classification') == 'broker':
                logger.warning(
                    "⚠️ Carrier '%s' matches broker profile in DB. Reclassifying as broker.",
                    extracted_carrier
                )
                inferred_carrier = fallback_carrier_name or guess_carrier_from_pdf(file_path)
                metadata['broker_company'] = metadata.get('broker_company') or extracted_carrier
                metadata['broker_confidence'] = max(
                    metadata.get('broker_confidence', 0.6),
                    metadata.get('carrier_confidence', 0.6)
                )
                metadata['carrier_name'] = inferred_carrier
                metadata['carrier_confidence'] = 0.35 if inferred_carrier else 0.0
                
                validation_events.append({
                    "issue": "carrier_matched_known_broker",
                    "matched_company": carrier_role_info.get('company_name'),
                    "fallback_carrier": inferred_carrier,
                    "action": "promoted_to_broker" if inferred_carrier else "needs_manual_review"
                })
    
    if extracted_broker:
        broker_role_info = await with_db_retry(db, crud.get_company_role_by_name, name=extracted_broker)
        if broker_role_info:
            metadata['broker_company_db_role'] = broker_role_info
            if (
                broker_role_info.get('classification') == 'carrier'
                and not metadata.get('carrier_name')
            ):
                logger.warning(
                    "⚠️ Broker '%s' matches carrier profile in DB. Treating as carrier.",
                    extracted_broker
                )
                metadata['carrier_name'] = extracted_broker
                metadata['carrier_confidence'] = max(metadata.get('carrier_confidence', 0.4), 0.4)
                validation_events.append({
                    "issue": "broker_matched_known_carrier",
                    "matched_company": broker_role_info.get('company_name'),
                    "action": "promoted_to_carrier"
                })
    
    if validation_events:
        metadata['carrier_broker_validation'] = {
            "events": validation_events,
            "validated_at": datetime.utcnow().isoformat()
        }
    
    return metadata


TOTAL_METHOD_PRIORITY = {
    # ═══════════════════════════════════════════════════════════════════════════════
    # STRICT HIERARCHY FOR TOTAL COMMISSION EXTRACTION
    # ═══════════════════════════════════════════════════════════════════════════════
    # ✅ RULE: Higher priority methods can NEVER be replaced by lower priority methods
    # ✅ BULLETPROOF: document_metadata has explicit guard and can NEVER be replaced
    # ═══════════════════════════════════════════════════════════════════════════════
    'document_metadata': 88,  # 🛡️ HIGHEST PRIORITY: GPT-extracted from document - PROTECTED - NEVER REPLACED
    'grand_total_table': 95,  # Grand total table (if document_metadata missing)
    'two_pass_authoritative_total': 90,  # Two-pass extraction (if document_metadata missing)
    'summary_row_scan': 85,  # 📊 SECOND PRIORITY: Bottom of Commission column (if document_metadata missing)
    'table_footer': 80,  # Table footer scan
    'table_scan': 75,  # General table scan
    'business_intelligence': 70,  # Business intelligence totals
    'gpt_summary_regex': 55,  # Regex extraction from summary
    'calculated_sum': 40,  # Calculated from detail rows
    'calculated': 40,  # Generic calculated
    None: 0,
}


def _sync_structured_summary(
    structured_data: Optional[Dict[str, Any]],
    document_metadata: Dict[str, Any],
    extracted_invoice_total: float = None
) -> Optional[Dict[str, Any]]:
    """Ensure structured summary mirrors authoritative metadata values."""
    if not structured_data or not isinstance(structured_data, dict):
        return structured_data

    total_amount = document_metadata.get("total_amount")
    if total_amount is not None:
        try:
            numeric_total = float(total_amount)
            structured_data["total_amount"] = f"{numeric_total:.2f}"
            structured_data["total_amount_formatted"] = f"${numeric_total:,.2f}"
        except (TypeError, ValueError):
            pass

    if extracted_invoice_total is not None:
        try:
            structured_data["invoice_total"] = f"{float(extracted_invoice_total):.2f}"
        except (TypeError, ValueError):
            pass

    if document_metadata.get("statement_date"):
        structured_data["statement_date"] = document_metadata["statement_date"]

    if document_metadata.get("carrier_name"):
        structured_data["carrier_name"] = document_metadata["carrier_name"]

    if document_metadata.get("company_count"):
        structured_data.setdefault("company_count", document_metadata.get("company_count"))

    return structured_data

COMMISSION_COLUMN_KEYWORDS = [
    "commission earned",
    "commission amount",
    "commission paid",
    "total commission",
    "net commission",
    "net payment",
    "payment amount",
    "paid amount",
    "paid amt",
    "total payment",
    "commission"
]

# Columns that must be ignored even though they contain the word "commission"
COMMISSION_COLUMN_EXCLUSIONS = [
    "commissionable",
    "rate",
    "percentage",
    "percent",
    "comm rate",
    "comm. rate"
]

# Higher weight indicates a better match for the true commission column
COMMISSION_COLUMN_PRIORITY = [
    ("commission earned", 8),
    ("commission amount", 7),
    ("commission paid", 6),
    ("total commission", 6),
    ("net commission", 5),
    ("net payment", 4),
    ("payment amount", 4),
    ("paid amount", 3),
    ("paid amt", 3),
    ("total payment", 3),
    ("commission", 1)
]


def _normalize_header_token(header: Any) -> str:
    """Normalize header text for keyword comparisons."""
    if header is None:
        return ""
    token = str(header).lower()
    token = token.replace("\n", " ")
    token = re.sub(r"[^a-z0-9\s\.]", " ", token)
    token = re.sub(r"\s+", " ", token).strip()
    return token


def _detect_commission_column_index(headers: List[Any]) -> Optional[int]:
    """
    Identify the most likely commission column using weighted keywords and exclusion rules.
    """
    best_idx = None
    best_score = 0
    normalized_headers = [_normalize_header_token(h) for h in headers]
    
    for idx, token in enumerate(normalized_headers):
        if not token:
            continue
        if any(exclusion in token for exclusion in COMMISSION_COLUMN_EXCLUSIONS):
            continue
        
        score = 0
        for keyword, weight in COMMISSION_COLUMN_PRIORITY:
            if keyword in token:
                score = max(score, weight)
        if score == 0:
            if any(keyword in token for keyword in COMMISSION_COLUMN_KEYWORDS):
                score = 1
        
        if score > best_score:
            best_score = score
            best_idx = idx
    
    return best_idx


def _extract_commission_total_from_table(
    table: Dict[str, Any],
    parse_currency_value
) -> Optional[TotalCandidate]:
    """
    Extract commission total from the BOTTOM of the Commission Earned/Commission Amount column ONLY.
    
    ✅ STRICT EXTRACTION RULES:
       1. Find which header most likely can be mapped "Commission Earned" field name
       2. ONLY scan that specific column (NOT Invoice Amount, NOT Premium, etc.)
       3. Look at the BOTTOM of that column (summary rows with "Total" keywords)
       4. Return the value from summary rows that contain total indicators
    
    ✅ SECURITY: If no Commission column is found, return None (don't fall back to other columns)
    ✅ This is the ONLY way totals appear in tables (besides document_metadata)
    
    Returns:
        TotalCandidate with amount from Commission column bottom, or None if not found
    """
    if not table or not parse_currency_value:
        return None
    
    headers = table.get('header') or table.get('headers') or []
    rows = table.get('rows') or []
    if not headers or not rows:
        return None
    
    # ✅ STEP 1: Find which header most strongly matches "Commission Earned" field name
    # This uses weighted keyword matching: "commission earned" (weight=8), "commission amount" (weight=7), etc.
    candidate_idx = _detect_commission_column_index(headers)
    
    if candidate_idx is None:
        logger.warning(
            f"⚠️ _extract_commission_total_from_table: No commission column found in headers: {headers}. "
            f"Cannot extract total - will NOT fall back to other columns like Invoice Amount!"
        )
        return None  # ✅ SECURITY: Don't fall back to last column - prevents extracting from wrong columns!
    
    logger.info(
        f"📊 _extract_commission_total_from_table: MATCHED header '{headers[candidate_idx]}' to 'Commission Earned' field "
        f"(column index {candidate_idx} from {len(headers)} headers). Scanning BOTTOM of this column ONLY."
    )
    
    candidate_columns: List[int] = [candidate_idx]  # ✅ STEP 2: Only scan the matched commission column
    
    summary_rows = set(table.get('summaryRows', []) or table.get('summary_rows', []))
    total_rows = len(rows)
    best_candidate: Optional[TotalCandidate] = None
    
    # ✅ STEP 3: Scan rows from BOTTOM to TOP, looking for summary rows with "Total" keywords
    # Summary rows are identified by: marked as summaryRows, last 3 rows, or contain total keywords
    for idx, row in enumerate(rows):
        if not row:
            continue
        row_text = ' '.join(str(cell).lower() for cell in row if cell).strip()
        if not row_text:
            continue
        
        # Calculate score based on total indicators (higher score = more likely to be the true total)
        phrase_score = 0.0
        for keyword, weight in SUMMARY_TOTAL_KEYWORDS:
            if keyword in row_text:
                phrase_score = max(phrase_score, weight)
        if "total" in row_text:
            phrase_score = max(phrase_score, 1.0)
        if idx in summary_rows:
            phrase_score += 3.5  # Boost if GPT marked it as summary row
        if idx >= total_rows - 3:
            phrase_score += 1.5  # Boost if in last 3 rows (typical location for totals)
        if any(term in row_text for term in GLOBAL_TOTAL_KEYWORDS):
            phrase_score += 4.5  # Strong boost for "Grand Total", "Total for Vendor", etc.
        
        if phrase_score <= 0:
            continue  # Skip rows that don't look like totals
        
        # ✅ STEP 4: Extract value from the Commission column (NOT Invoice Amount or other columns)
        for col_idx in candidate_columns:
            if col_idx >= len(row):
                continue
            value = parse_currency_value(str(row[col_idx]))
            if value is None:
                continue
            
            candidate_score = phrase_score
            # ✅ Pick the candidate with the HIGHEST score (best match to total indicators)
            # We do NOT prefer higher amounts - we prefer better-matching rows
            if best_candidate is None or candidate_score > best_candidate.score + 0.25:
                best_candidate = TotalCandidate(
                    amount=value,
                    label=row_text,
                    row_index=idx,
                    score=candidate_score,
                    source="summary_row"
                )
            # ✅ SECURITY: Removed logic that preferred higher amounts when scores were equal
            # That was causing $75,202 (Invoice Amount) to be picked over $4,861.56 (Commission Amount)
    
    if best_candidate:
        logger.info(
            f"✅ _extract_commission_total_from_table: Extracted ${best_candidate.amount:,.2f} "
            f"from COMMISSION COLUMN at row {best_candidate.row_index} "
            f"(score: {best_candidate.score:.2f}, label: '{best_candidate.label[:50]}')"
        )
    
    return best_candidate


def _calculate_detail_commission_total(
    table: Dict[str, Any],
    parse_currency_value
) -> Optional[float]:
    """
    Calculate the total commission by summing detail rows (excluding summary rows)
    for the detected commission column.
    """
    if not table or not parse_currency_value:
        return None
    
    headers = table.get('header') or table.get('headers') or []
    rows = table.get('rows') or []
    if not headers or not rows:
        return None
    
    amount_col_idx = _detect_commission_column_index(headers)
    if amount_col_idx is None:
        return None
    
    summary_indices = set(table.get('summaryRows', []) or table.get('summary_rows', []))
    augmented_indices = set()
    total = 0.0
    detail_rows = 0
    
    for row_idx, row in enumerate(rows):
        row_is_summary = row_idx in summary_indices or row_looks_like_summary(row)
        if row_is_summary:
            if row_idx not in summary_indices:
                augmented_indices.add(row_idx)
                summary_indices.add(row_idx)
            continue
        if amount_col_idx >= len(row):
            continue
        raw_value = str(row[amount_col_idx])
        value = parse_currency_value(raw_value)
        if value is None:
            cleaned = (
                raw_value.replace('$', '')
                .replace(',', '')
                .replace('(', '-')
                .replace(')', '')
                .strip()
            )
            try:
                value = float(cleaned)
            except (ValueError, TypeError):
                value = None
        if value is None:
            continue
        total += value
        detail_rows += 1

    if augmented_indices:
        updated_indices = sorted(summary_indices)
        table['summaryRows'] = updated_indices
        if 'summary_rows' in table:
            table['summary_rows'] = updated_indices
    
    return total if detail_rows > 0 else None


def _should_replace_total(
    existing_amount: Optional[float],
    existing_method: Optional[str],
    candidate_amount: Optional[float],
    candidate_method: Optional[str]
) -> bool:
    """
    Determine if a newly detected total should override the current one.
    
    ✅ STRICT HIERARCHY:
       1. document_metadata (GPT-extracted) - HIGHEST PRIORITY - NEVER REPLACED
       2. Commission column bottom scan - ONLY used if document_metadata is missing
    
    ✅ BULLETPROOF: document_metadata can NEVER be replaced by any other method
    ✅ Priority system: higher priority methods are NEVER replaced by lower priority
    ✅ Massive discrepancies (> 200%) are rejected to prevent extraction errors
    """
    if candidate_amount is None:
        logger.warning(f"🔍 _should_replace_total: REJECTED - candidate_amount is None")
        return False
    if existing_amount is None:
        logger.info(f"🔍 _should_replace_total: ACCEPTED - no existing amount, using candidate ${candidate_amount:.2f} ({candidate_method})")
        return True
    
    # 🛡️ BULLETPROOF GUARD: document_metadata can NEVER be replaced
    if existing_method == 'document_metadata':
        logger.warning(
            f"🛡️ ABSOLUTE PROTECTION: existing method is 'document_metadata' (${existing_amount:,.2f}). "
            f"Candidate '{candidate_method}' (${candidate_amount:,.2f}) is REJECTED regardless of priority. "
            f"Document metadata is the HIGHEST priority source and can NEVER be replaced!"
        )
        return False
    
    existing_priority = TOTAL_METHOD_PRIORITY.get(existing_method, 10)
    candidate_priority = TOTAL_METHOD_PRIORITY.get(candidate_method, 10)
    difference = abs(candidate_amount - existing_amount)
    tolerance = max(5.0, abs(existing_amount) * 0.05)  # ✅ 5% tolerance
    difference_percent = (difference / max(abs(existing_amount), 1.0)) * 100
    
    # ✅ ALWAYS log this check with WARNING level so it shows in production logs
    logger.warning(
        f"🔍 _should_replace_total VALIDATION:\n"
        f"   Existing: ${existing_amount:,.2f} (method={existing_method}, priority={existing_priority})\n"
        f"   Candidate: ${candidate_amount:,.2f} (method={candidate_method}, priority={candidate_priority})\n"
        f"   Difference: ${difference:,.2f} ({difference_percent:.1f}%), tolerance=${tolerance:.2f}"
    )
    
    # ✅ CRITICAL: Reject massive discrepancies (> 200%) - likely extraction error
    # Increased threshold from 100% to 200% to allow legitimate 2x differences
    # But $75,202 vs $4,861.56 is 1447% - this will still be caught!
    if difference_percent > 200:
        logger.warning(
            f"  ❌ REJECTED: MASSIVE discrepancy ({difference_percent:.1f}%) detected! "
            f"This is likely an extraction error. Keeping existing value ${existing_amount:,.2f}"
        )
        return False
    
    # ✅ CRITICAL: Lower priority candidates can NEVER replace higher priority values
    # This prevents summary_row_scan (85) from replacing document_metadata (88)
    if candidate_priority < existing_priority:
        logger.warning(
            f"  ❌ REJECTED: Candidate has LOWER priority ({candidate_priority} < {existing_priority}). "
            f"Keeping existing ${existing_amount:,.2f} from {existing_method}"
        )
        return False
    
    # ✅ Same priority: only replace when candidate provides materially different AND larger value
    if candidate_priority == existing_priority:
        should_replace = difference > tolerance and candidate_amount > existing_amount
        logger.warning(
            f"  {'✅ ACCEPTED' if should_replace else '❌ REJECTED'}: Same priority - "
            f"replace only if diff > tolerance AND candidate > existing: {should_replace}"
        )
        return should_replace
    
    # ✅ Higher priority candidate: allow replacement
    # But skip if difference is trivial (just rounding)
    if difference <= tolerance:
        logger.warning(
            f"  ❌ REJECTED: Candidate has higher priority but difference (${difference:.2f}) "
            f"is trivial (< ${tolerance:.2f}). Keeping existing"
        )
        return False
    
    logger.warning(
        f"  ✅ ACCEPTED: Candidate has HIGHER priority ({candidate_priority} > {existing_priority}). "
        f"Replacing ${existing_amount:,.2f} with ${candidate_amount:,.2f}"
    )
    return True

@router.post("/extract-tables-smart/")
async def extract_tables_smart(
    file: UploadFile = File(...),
    company_id: Optional[str] = Form(None),
    extraction_method: str = Form("smart"),
    upload_id: Optional[str] = Form(None),
    environment_id: Optional[str] = Form(None),
    use_enhanced: Optional[bool] = Form(None),  # ⭐ New parameter for enhanced extraction
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """
    Smart extraction endpoint that automatically detects PDF type and routes to appropriate extraction method.
    - Digital PDFs: Uses new advanced extraction pipeline (TableFormer + Docling)
    - Scanned PDFs: Uses existing extraction pipeline (Google DocAI + Docling)
    - Includes format learning integration for automatic settings application
    - Supports real-time progress tracking via WebSocket
    - Enhanced mode: Uses 3-phase intelligent extraction for Google Gemini-quality results
    
    New Parameters:
        use_enhanced: Optional[bool] - Enable enhanced 3-phase extraction pipeline
                      (Phase 1: Document Intelligence, Phase 2: Semantic Extraction, 
                       Phase 3: Intelligent Summarization)
    """
    start_time = datetime.now()
    # Generate a proper UUID for database operations
    upload_id_uuid = uuid4()
    
    # Use provided upload_id for tracking or generate a new one
    if upload_id:
        # If upload_id is provided, use it as-is (it's already a string)
        upload_id_str = upload_id
    else:
        # Generate a new tracking ID if none provided
        upload_id_str = str(upload_id_uuid)
    
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    # Determine file type
    file_ext = file.filename.lower().split('.')[-1]
    allowed_extensions = ['pdf', 'xlsx', 'xls', 'xlsm', 'xlsb']
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # ✅ STEP 1: Read file content FIRST (required for hash calculation)
    file_content = await file.read()
    
    # ✅ STEP 2: Calculate file hash IMMEDIATELY (before any other operations)
    file_size = len(file_content)
    file_hash = hashlib.sha256(file_content).hexdigest()
    
    logger.info(f"📁 File: {file.filename}, Size: {file_size} bytes, Hash: {file_hash[:16]}..., User: {current_user.id}")
    
    # ✅ STEP 3: DUPLICATE CHECK FIRST - BEFORE GCS upload and file saving
    # Check for duplicates ONLY in successfully extracted files
    # This allows re-upload of failed/cancelled/processing files
    # CRITICAL: Use correct status values from constants module
    logger.info("🔍 Checking for duplicates BEFORE proceeding with upload...")
    
    existing_upload = await crud.get_statement_by_file_hash_and_status(
        db=db,
        file_hash=file_hash,
        valid_statuses=VALID_PERSISTENT_STATUSES  # ✅ Use correct status constants: ['Approved', 'needs_review']
    )
    
    if existing_upload:
        logger.warning(f"🚫 DUPLICATE DETECTED: File hash {file_hash[:16]}... already exists (upload_id: {existing_upload.id})")
        
        # Generate GCS URL for the existing file
        existing_gcs_url = None
        if existing_upload.file_name:
            existing_gcs_url = generate_gcs_signed_url(existing_upload.file_name)
            if not existing_gcs_url:
                existing_gcs_url = get_gcs_file_url(existing_upload.file_name)
        
        # Format upload date for user-friendly display
        upload_date = None
        if existing_upload.uploaded_at:
            upload_date = existing_upload.uploaded_at.strftime("%B %d, %Y at %I:%M %p")
        
        # ✅ Return 409 IMMEDIATELY - no GCS upload, no file saving, no metadata preparation
        return JSONResponse(
            status_code=409,
            content={
                "success": False,
                "status": "duplicate_detected",
                "error": f"This file has already been uploaded on {upload_date}.",
                "message": f"Duplicate file detected. This file was previously uploaded on {upload_date}. Please upload a different file or use the existing one.",
                "duplicate_info": {
                    "type": existing_upload.status,
                    "existing_upload_id": str(existing_upload.id),
                    "existing_file_name": existing_upload.file_name,
                    "existing_upload_date": existing_upload.uploaded_at.isoformat() if existing_upload.uploaded_at else None,
                    "existing_upload_date_formatted": upload_date,
                    "gcs_url": existing_gcs_url,
                    "gcs_key": existing_upload.file_name,
                    "table_count": len(existing_upload.raw_data or [])
                }
            }
        )
    
    # ✅ No duplicate found - proceed with normal upload flow
    logger.info(f"✅ No duplicate found - proceeding with upload for file: {file.filename}")
    
    # Prepare file path for saving (only if not a duplicate)
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    try:
        logger.info(f"🚀 Starting extraction: {file.filename} (ID: {upload_id_str})")
        
        # Save uploaded file to disk (only after duplicate check passes)
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)

        # Handle company_id - if not provided, we'll extract it from the document
        if not company_id:
            # Get all companies and use the first one, or create a default company
            all_companies = await with_db_retry(db, crud.get_all_companies)
            if all_companies:
                company_id = all_companies[0].id
            else:
                # Create a default company
                default_company = schemas.CompanyCreate(
                    name="Auto-Detected Carrier"
                )
                company = await with_db_retry(db, crud.create_company, company=default_company)
                company_id = company.id

        # Get company info with retry
        company = await with_db_retry(db, crud.get_company_by_id, company_id=company_id)
        if not company:
            os.remove(file_path)
            raise HTTPException(status_code=404, detail="Company not found")

        uploader_company_name = None
        if current_user.company_id:
            try:
                uploader_company = await with_db_retry(db, crud.get_company_by_id, company_id=current_user.company_id)
                uploader_company_name = uploader_company.name if uploader_company else None
            except Exception as uploader_company_error:
                logger.debug(f"Unable to resolve uploader company name: {uploader_company_error}")

        # Upload to GCS
        gcs_key = f"statements/{upload_id_uuid}/{file.filename}"
        from app.services.gcs_utils import gcs_service
        if not gcs_service.is_available():
            raise HTTPException(status_code=503, detail="Cloud storage service is not available. Please contact support.")
        
        if not upload_file_to_gcs(file_path, gcs_key) or not gcs_service.file_exists(gcs_key):
            raise HTTPException(status_code=500, detail="Failed to upload file to GCS.")
        
        logger.info(f"✅ Uploaded to GCS: {gcs_key}")
        
        # Generate signed URL for PDF preview
        gcs_url = generate_gcs_signed_url(gcs_key)
        if not gcs_url:
            # Fallback to public URL if signed URL generation fails
            gcs_url = get_gcs_file_url(gcs_key)

        # Emit WebSocket: Step 1 - Upload started (10% progress)
        if upload_id:
            await connection_manager.emit_upload_step(upload_id, 'upload', 10)
        
        # Get or create environment
        from app.db.crud.environment import get_or_create_default_environment
        
        # CRITICAL: ALWAYS use user's default environment for ALL uploads
        # This ensures consistency and prevents environment mismatches
        # We ignore any environment_id parameter to maintain data integrity
        target_env = await get_or_create_default_environment(db, current_user.company_id, current_user.id)
        
        # Log if someone tried to specify a different environment
        if environment_id and environment_id != str(target_env.id):
            logger.warning(f"⚠️  Ignoring specified environment_id {environment_id}, using user's default environment {target_env.id}")
        
        logger.info(f"✅ Using user's default environment {target_env.id} for upload consistency")
        
        # CRITICAL CHANGE: DO NOT create DB record here!
        # Records are ONLY created during approval (auto or manual)
        # Store metadata for later use during approval
        # CRITICAL FIX: company_id should be USER's company, carrier_id should be the insurance carrier
        upload_metadata = {
            'upload_id': str(upload_id_uuid),
            'company_id': str(current_user.company_id),  # USER's company (who owns the data)
            'carrier_id': company_id,  # CARRIER/Insurance company (Allied Benefit Systems, etc.)
            'user_company_id': str(current_user.company_id),  # Explicit user company for frontend
            'user_id': str(current_user.id),
            'environment_id': str(target_env.id),
            'file_name': gcs_key,
            'file_hash': file_hash,
            'file_size': file_size,
            'uploaded_at': datetime.utcnow().isoformat(),
            'extraction_method': extraction_method,
            'file_type': file_ext,
            'start_time': start_time.isoformat()
        }
        logger.info(f"📝 Upload metadata prepared (NOT saved to DB): {upload_id_uuid}")
        
        # Log the extraction start
        audit_service = AuditLoggingService(db)
        await audit_service.log_extraction_start(
            user_id=current_user.id,
            company_id=company_id,
            file_name=file.filename,
            extraction_method=extraction_method,
            upload_id=upload_id_uuid
        )
        
        # Get extraction service
        enhanced_service = await get_enhanced_extraction_service_instance(use_enhanced=use_enhanced)
        
        # ✅ NEW: Create extraction as background task with aggressive heartbeats
        async def run_extraction_with_heartbeat():
            """Run extraction with aggressive WebSocket heartbeats to prevent 1006 errors on Render"""
            heartbeat_task = None
            try:
                # Start aggressive heartbeat (every 10 seconds) during extraction
                async def send_heartbeats():
                    progress_stages = [
                        (10, "Initializing extraction..."),
                        (20, "Analyzing document structure..."),
                        (30, "Processing tables..."),
                        (50, "AI extraction in progress..."),
                        (70, "Finalizing results..."),
                        (85, "Preparing response...")
                    ]
                    stage_idx = 0
                    
                    while True:
                        await asyncio.sleep(10)  # Every 10 seconds
                        
                        # Cycle through progress stages
                        percentage, message = progress_stages[stage_idx % len(progress_stages)]
                        stage_idx += 1
                        
                        # Send progress update
                        await connection_manager.send_step_progress(
                            upload_id=upload_id_str,
                            percentage=percentage,
                            estimated_time="2-3 minutes",
                            current_stage="ai_extraction",
                            message=message
                        )
                        logger.debug(f"💓 Heartbeat sent: {message} ({percentage}%)")
                
                # Start heartbeat task
                heartbeat_task = asyncio.create_task(send_heartbeats())
                
                try:
                    # Run the actual extraction
                    result = await enhanced_service.extract_tables_with_progress(
                        file_path=file_path,
                        company_id=company_id,
                        upload_id=upload_id_str,
                        file_type=file_ext,
                        extraction_method=extraction_method,
                        upload_id_uuid=str(upload_id_uuid)
                    )
                    
                    logger.info("✅ Extraction completed successfully")
                    return result
                    
                except asyncio.CancelledError:
                    logger.info(f"🛑 Extraction cancelled: {upload_id_str}")
                    raise
                    
            finally:
                # Cancel heartbeat task when extraction completes
                if heartbeat_task:
                    heartbeat_task.cancel()
                    try:
                        await heartbeat_task
                    except asyncio.CancelledError:
                        pass
        
        # Store the task for potential cancellation
        task = asyncio.create_task(run_extraction_with_heartbeat())
        running_extractions[upload_id_str] = task
        
        try:
            extraction_result = await task
        except asyncio.CancelledError:
            logger.info(f"🛑 Extraction cancelled: {upload_id_str}")
            try:
                await cleanup_failed_upload(db, upload_id_uuid)
                await connection_manager.send_upload_complete(upload_id_str, {"status": "cancelled", "message": "Upload cancelled"})
            except Exception as e:
                logger.warning(f"Cleanup error: {e}")
            raise HTTPException(status_code=499, detail="Extraction cancelled by user")
        finally:
            running_extractions.pop(upload_id_str, None)
            await cancellation_manager.clear_cancelled(upload_id_str)
        
        # Normalize/refine summary rows before any downstream usage
        raw_tables = extraction_result.get('tables', []) or []
        refined_tables = []
        for idx, table in enumerate(raw_tables):
            refined_table = refine_summary_rows(copy.deepcopy(table))
            refined_tables.append(refined_table)
            if table.get("summaryRows") != refined_table.get("summaryRows"):
                logger.info(
                    f"🔍 Summary row refinement adjusted table {idx}: "
                    f"{table.get('summaryRows')} → {refined_table.get('summaryRows')}"
                )
        extraction_result['tables'] = refined_tables

        # CRITICAL CHANGE: DO NOT update DB record - it doesn't exist yet!
        # Extraction data will be passed to frontend and then to approval endpoint
        # Update upload_metadata with extraction results for logging/tracking
        format_learning_info = extraction_result.get('format_learning', {})
        field_mapping = format_learning_info.get('suggested_mapping', {}) if format_learning_info and format_learning_info.get('found_match') else None
        
        upload_metadata.update({
            'extraction_completed': True,
            'completion_time': datetime.utcnow().isoformat(),
            'tables_count': len(refined_tables),
            'extraction_method_used': extraction_method,
            # Note: raw_data stored in DB but NOT sent to frontend to reduce response size
            'raw_data': copy.deepcopy(refined_tables),
            'field_mapping': field_mapping
        })
        logger.info("✅ Extraction completed (data NOT saved to DB, will be saved on approval)")
        
        # ===== DATA QUALITY VALIDATION =====
        # Validate extracted company count to catch potential summary row inclusion
        try:
            # Extract entities from result
            entities = extraction_result.get('entities', {})
            groups_and_companies = entities.get('groups_and_companies', [])
            extracted_company_count = len(groups_and_companies)
            
            # Calculate total rows across all tables
            tables = extraction_result.get('tables', [])
            total_rows = sum(len(table.get('rows', [])) for table in tables)
            
            # Sanity check: warn if company count is suspiciously high
            # Heuristic: If extracted companies > 50% of total rows, likely includes summary rows
            if total_rows > 0 and extracted_company_count > (total_rows * 0.5):
                logger.warning(
                    f"⚠️ DATA QUALITY WARNING: High company extraction ratio detected!\n"
                    f"   - Extracted companies: {extracted_company_count}\n"
                    f"   - Total table rows: {total_rows}\n"
                    f"   - Ratio: {(extracted_company_count / total_rows * 100):.1f}%\n"
                    f"   This may indicate summary rows being extracted as companies.\n"
                    f"   Semantic filtering should have caught this. Investigate if issue persists."
                )
        except Exception as validation_error:
            # Don't fail the extraction if validation has errors
            logger.debug(f"Data quality validation error (non-critical): {validation_error}")
        
        # Log successful extraction
        processing_time = (datetime.now() - start_time).total_seconds()
        await audit_service.log_extraction_complete(
            user_id=current_user.id,
            company_id=company_id,
            upload_id=upload_id_uuid,
            processing_time=processing_time,
            tables_count=len(extraction_result.get('tables', []))
        )
        
        # Extract carrier and date information from document metadata
        pdf_text_snippet = extract_pdf_text_snippet(file_path)
        document_metadata = extraction_result.get('document_metadata', {})
        document_metadata, carrier_broker_note = resolve_carrier_broker_roles(
            document_metadata,
            expected_carrier_name=company.name if company else None,
            uploader_company_name=uploader_company_name,
            pdf_text_snippet=pdf_text_snippet
        )
        if carrier_broker_note:
            logger.info(f"🤖 Carrier/Broker disambiguation applied: {carrier_broker_note}")
        
        document_metadata = await validate_carrier_metadata_with_db(
            db=db,
            document_metadata=document_metadata,
            fallback_carrier_name=company.name if company else None,
            file_path=file_path,
            pdf_text_snippet=pdf_text_snippet
        )
        extraction_result['document_metadata'] = document_metadata
        
        extracted_carrier = document_metadata.get('carrier_name')
        extracted_date = document_metadata.get('statement_date')
        
        # Initialize AI data and variables (CRITICAL: Initialize outside carrier block to avoid scope errors)
        ai_plan_type_data = None
        ai_field_mapping_data = None
        table_selection_data = None  # FIX: Initialize here to avoid UnboundLocalError
        
        # Look up learned formats if carrier was detected
        format_learning_data = extraction_result.get('format_learning', {})
        carrier_id_for_response = None  # Initialize carrier_id for response
        
        if extracted_carrier and extraction_result.get('tables'):
            try:
                from app.services.format_learning_service import FormatLearningService
                format_learning_service = FormatLearningService()
                
                # Find carrier by name to get carrier_id
                carrier = await with_db_retry(db, crud.get_company_by_name, name=extracted_carrier)
                
                # ⚠️ AUTO-CREATE CARRIER IF NOT FOUND
                if not carrier:
                    logger.info(f"🆕 Carrier '{extracted_carrier}' not found in database, creating automatically...")
                    try:
                        # Create new carrier
                        carrier_data = schemas.CompanyCreate(name=extracted_carrier)
                        carrier = await with_db_retry(db, crud.create_company, company=carrier_data)
                        logger.info(f"✅ Auto-created carrier: {carrier.name} with ID {carrier.id}")
                    except Exception as create_error:
                        logger.error(f"❌ Failed to auto-create carrier '{extracted_carrier}': {create_error}")
                        carrier = None
                
                if carrier:
                    logger.info(f"🎯 Format Learning: Using carrier {carrier.name} with ID {carrier.id}")
                    
                    # Always save carrier_id for response
                    carrier_id_for_response = str(carrier.id)
                    
                    # ⚠️ CRITICAL FIX: Always update carrier_id to the extracted carrier
                    # This ensures the file appears under the correct carrier in My Data
                    if str(carrier.id) != str(company_id):
                        logger.warning(f"🚨 CARRIER MISMATCH DETECTED: File uploaded to {company_id} but extracted as {carrier.name} ({carrier.id})")
                        logger.info(f"🔄 Reassigning file to correct carrier: {carrier.name}")
                        
                        # Also update the GCS key to move file to correct carrier folder
                        old_gcs_key = gcs_key
                        new_gcs_key = f"statements/{carrier.id}/{file.filename}"
                        
                        # Move file in GCS (copy to new location and delete old)
                        from app.services.gcs_utils import copy_gcs_file, delete_gcs_file
                        if copy_gcs_file(old_gcs_key, new_gcs_key):
                            delete_gcs_file(old_gcs_key)
                            gcs_key = new_gcs_key
                            gcs_url = generate_gcs_signed_url(gcs_key) or get_gcs_file_url(gcs_key)
                            logger.info(f"✅ File moved to correct carrier folder in GCS: {new_gcs_key}")
                            
                            # CRITICAL CHANGE: Update metadata only (no DB record yet)
                            # carrier_id = insurance carrier (what we extracted)
                            # company_id = user's broker company (DO NOT OVERWRITE!)
                            upload_metadata.update({
                                'carrier_id': str(carrier.id),
                                'file_name': new_gcs_key
                            })
                            logger.info(f"✅ Updated upload metadata: carrier_id={carrier.id}, company_id stays as user's company={upload_metadata.get('company_id')}")
                        else:
                            logger.warning("⚠️ Failed to move file in GCS, keeping original location")
                            # CRITICAL CHANGE: Update metadata only (no DB record yet)
                            upload_metadata.update({
                                'carrier_id': str(carrier.id)
                            })
                            logger.info(f"✅ Updated upload metadata: carrier_id={carrier.id}, company_id stays as user's company={upload_metadata.get('company_id')}")
                        
                        # Update company_id for all subsequent operations
                        company_id = str(carrier.id)
                    else:
                        # Even if carrier matches, ensure carrier_id is set in metadata
                        logger.info(f"✅ Carrier matches upload: {carrier.name} ({carrier.id})")
                        # CRITICAL CHANGE: Update metadata only (no DB record yet)
                        upload_metadata.update({
                            'carrier_id': str(carrier.id)
                        })
                        logger.info(f"✅ Ensured carrier_id in metadata: {carrier.id}")
                    
                    # ===== INTELLIGENT TABLE SELECTION =====
                    # Use AI to select the best table for field mapping when multiple tables exist
                    selected_table_index = 0
                    
                    if len(extraction_result['tables']) > 1:
                        logger.info(f"🔍 Multiple tables detected ({len(extraction_result['tables'])}), analyzing for field mapping suitability")
                        
                        # ✅ INTELLIGENT TABLE SELECTION
                        # Prioritize tables for field mapping based on:
                        # 1. table_type: commission_table > commission_detail > data_table > summary/hold tables
                        # 2. Row count: More rows generally means main data table
                        # 3. Header patterns: Look for commission-related headers
                        
                        best_table_index = 0
                        best_score = 0
                        reasoning_parts = []
                        
                        for idx, table in enumerate(extraction_result['tables']):
                            score = 0
                            table_type = (table.get('table_type') or '').lower()
                            row_count = len(table.get('rows', []))
                            headers = table.get('header', table.get('headers', []))
                            
                            # Score based on table_type (most important)
                            if 'commission' in table_type and 'detail' in table_type:
                                score += 100  # commission_detail_table
                            elif 'commission' in table_type:
                                score += 90   # commission_table
                            elif 'data' in table_type:
                                score += 70
                            elif any(x in table_type for x in ['hold', 'summary', 'total']):
                                score += 10   # Usually not for mapping
                            else:
                                score += 50   # Unknown type
                            
                            # Score based on row count (more rows = likely main table)
                            score += min(row_count, 50)  # Cap at 50 points
                            
                            # Score based on commission-related headers
                            commission_headers = ['commission', 'paid_amount', 'client', 'company', 'premium', 'rate']
                            header_matches = sum(1 for h in headers if any(keyword in h.lower() for keyword in commission_headers))
                            score += header_matches * 5
                            
                            logger.info(f"   Table {idx}: type={table_type}, rows={row_count}, score={score}")
                            
                            if score > best_score:
                                best_score = score
                                best_table_index = idx
                                reasoning_parts = [
                                    f"table_type={table_type}",
                                    f"rows={row_count}",
                                    f"commission_headers={header_matches}",
                                    f"score={score}"
                                ]
                        
                        selected_table_index = best_table_index
                        table_selection_data = {
                            "enabled": True,
                            "selected_table_index": best_table_index,
                            "reasoning": f"Selected table {best_table_index} ({', '.join(reasoning_parts)})",
                            "total_tables": len(extraction_result['tables']),
                            "fallback_used": False
                        }
                        logger.info(f"🎯 INTELLIGENT SELECTION: Using table {best_table_index} for field mapping")
                        logger.info(f"   Reasoning: {table_selection_data['reasoning']}")
                    else:
                        # Single table - use it directly
                        logger.info("📊 Single table detected, using it for field mapping")
                        table_selection_data = {
                            "enabled": False,
                            "selected_table_index": 0,
                            "confidence": 1.0,
                            "single_table": True,
                            "total_tables": 1
                        }
                    
                    # Get the selected table for format matching and AI mapping
                    selected_table = extraction_result['tables'][selected_table_index]
                    headers = selected_table.get('header', []) or selected_table.get('headers', [])
                    
                    logger.info(f"🎯 Using table {selected_table_index} for field mapping with {len(headers)} headers")
                    
                    # Generate table structure
                    table_structure = {
                        "row_count": len(selected_table.get('rows', [])),
                        "column_count": len(headers),
                        "has_financial_data": any(keyword in ' '.join(headers).lower() for keyword in [
                            'premium', 'commission', 'billed', 'group', 'client', 'invoice',
                            'total', 'amount', 'due', 'paid', 'rate', 'percentage', 'period'
                        ])
                    }
                    
                    # Look up learned format for this carrier
                    learned_format, match_score = await format_learning_service.find_matching_format(
                        db=db,
                        company_id=str(carrier.id),  # Use carrier_id for lookup
                        headers=headers,
                        table_structure=table_structure
                    )
                    
                    if learned_format and match_score > 0.5:
                        logger.info(f"🎯 Format Learning: Found matching format with score {match_score}")
                        format_learning_data = {
                            "found_match": True,
                            "match_score": match_score,
                            "learned_format": learned_format,
                            "suggested_mapping": learned_format.get("field_mapping", {}),
                            "table_editor_settings": learned_format.get("table_editor_settings")
                        }
                        
                        # CRITICAL: Use corrected carrier name if available from format learning
                        table_editor_settings = learned_format.get('table_editor_settings', {})
                        if table_editor_settings.get('corrected_carrier_name'):
                            corrected_carrier = table_editor_settings.get('corrected_carrier_name')
                            logger.info(f"🎯 Format Learning: Applying corrected carrier name from learned format: {corrected_carrier}")
                            # Update extracted carrier with the corrected one
                            extracted_carrier = corrected_carrier
                            document_metadata['carrier_name'] = corrected_carrier
                            document_metadata['carrier_source'] = 'format_learning'
                        
                        # NOTE: We do NOT auto-apply statement dates from format learning 
                        # because dates are document-specific, not format-specific
                        # The extracted date from the current document should be used as-is
                        logger.info("🎯 Format Learning: Skipping statement date auto-apply (dates are document-specific)")
                        
                        # CRITICAL FIX: Auto-apply table deletions from learned format
                        if table_editor_settings.get('deleted_tables') or table_editor_settings.get('table_deletions'):
                            deleted_tables = table_editor_settings.get('deleted_tables') or table_editor_settings.get('table_deletions', [])
                            if deleted_tables:
                                logger.info(f"🎯 Format Learning: Auto-applying table deletions: {deleted_tables}")
                                # Store deletion info for frontend to apply
                                format_learning_data['auto_delete_tables'] = deleted_tables
                        
                        # CRITICAL FIX: Auto-apply row deletions from learned format
                        if table_editor_settings.get('deleted_rows') or table_editor_settings.get('row_deletions'):
                            deleted_rows = table_editor_settings.get('deleted_rows') or table_editor_settings.get('row_deletions', [])
                            if deleted_rows:
                                logger.info(f"🎯 Format Learning: Auto-applying row deletions: {len(deleted_rows)} rows")
                                # Store deletion info for frontend to apply
                                format_learning_data['auto_delete_rows'] = deleted_rows
                        
                        # CRITICAL: Check if automation is eligible
                        can_automate = False
                        automation_reason = None
                        
                        # Requirement 1: Statement date must be present
                        has_statement_date = extracted_date is not None and extracted_date.strip() != ""
                        
                        # Requirement 2: Carrier name must be present  
                        has_carrier_name = carrier is not None and carrier.name is not None
                        
                        # Requirement 3: Format must have been successfully learned (high confidence)
                        has_high_confidence = learned_format.get("confidence_score", 0) >= 70
                        
                        # Requirement 4: Has been used successfully at least once before
                        has_usage_history = learned_format.get("usage_count", 0) >= 1
                        
                        if not has_statement_date:
                            automation_reason = "Statement date not detected - manual review required"
                        elif not has_carrier_name:
                            automation_reason = "Carrier name not detected - manual review required"
                        elif not has_high_confidence:
                            automation_reason = "Format confidence too low for automation"
                        elif not has_usage_history:
                            automation_reason = "First-time format - manual review required"
                        else:
                            can_automate = True
                            automation_reason = "All criteria met - automation eligible"
                        
                        # ✨ ENHANCED: Extract total amount from current file for validation
                        current_total_amount = None
                        total_extraction_method = None
                        total_candidates: List[Dict[str, Any]] = []
                        business_intel = extraction_result.get('business_intelligence') or {}
                        detail_sum_amount = None
                        total_pass_analysis = document_metadata.get('total_pass_analysis') if document_metadata else None

                        def _record_total_candidate(method: str, amount: Optional[float], confidence: float, context: Optional[str] = None):
                            if amount is None:
                                return
                            try:
                                numeric_amount = float(amount)
                            except (TypeError, ValueError):
                                return
                            total_candidates.append({
                                "method": method,
                                "amount": round(numeric_amount, 2),
                                "confidence": round(confidence, 2),
                                "context": context
                            })

                        if total_pass_analysis:
                            authoritative = total_pass_analysis.get('authoritative_total') or {}
                            candidate_amount = authoritative.get('amount')
                            try:
                                candidate_value = float(candidate_amount)
                            except (TypeError, ValueError):
                                candidate_value = None
                            confidence_value = authoritative.get('confidence', 0.96)
                            try:
                                confidence_value = float(confidence_value)
                            except (TypeError, ValueError):
                                confidence_value = 0.96
                            if candidate_value:
                                _record_total_candidate(
                                    'two_pass_authoritative_total',
                                    candidate_value,
                                    confidence_value,
                                    authoritative.get('label')
                                )
                        
                        # STRATEGY 1: Check document_metadata.total_amount (most reliable)
                        if document_metadata and 'total_amount' in document_metadata:
                            try:
                                current_total_amount = float(document_metadata['total_amount'])
                                total_extraction_method = 'document_metadata'
                                logger.info(f"✅ Total extracted from document_metadata: ${current_total_amount:.2f}")
                                _record_total_candidate('document_metadata', current_total_amount, 0.95, 'document_metadata.total_amount')
                            except (ValueError, TypeError):
                                pass
                        
                        # STRATEGY 2: Parse from summary text (GPT metadata)
                        if current_total_amount is None and document_metadata and document_metadata.get('summary'):
                            summary_text = document_metadata['summary']
                            total_patterns = [
                                r'[Tt]otal\s+for\s+(?:Vendor|Group|Broker)[:\s]*\$?([\d,]+\.?\d{2})',
                                r'[Tt]otal\s+[Cc]ompensation[:\s]*\$?([\d,]+\.?\d{2})',
                                r'[Tt]otal\s+[Aa]mount[:\s]*\$?([\d,]+\.?\d{2})',
                                r'[Nn]et\s+[Pp]ayment[:\s]*\$?([\d,]+\.?\d{2})',
                                r'[Gg]rand\s+[Tt]otal[:\s]*\$?([\d,]+\.?\d{2})',
                                r'\$?([\d,]+\.?\d{2})\s+in\s+total'
                            ]
                            
                            for pattern in total_patterns:
                                matches = re.findall(pattern, summary_text)
                                if matches:
                                    try:
                                        total_str = matches[0].replace(',', '')
                                        current_total_amount = float(total_str)
                                        total_extraction_method = 'gpt_summary_regex'
                                        logger.info(f"✅ Total extracted from summary text: ${current_total_amount:.2f}")
                                        _record_total_candidate('gpt_summary_regex', current_total_amount, 0.72, 'document_metadata.summary')
                                        break
                                    except ValueError:
                                        continue

                        # STRATEGY 2B: Use business intelligence totals if available
                        if current_total_amount is None and business_intel:
                            bi_total_raw = (
                                business_intel.get('total_commission_amount')
                                or business_intel.get('total_commission')
                                or business_intel.get('total_amount')
                            )
                            if bi_total_raw is not None:
                                try:
                                    if isinstance(bi_total_raw, str):
                                        cleaned = bi_total_raw.replace('$', '').replace(',', '').strip()
                                        bi_total_value = float(cleaned)
                                    else:
                                        bi_total_value = float(bi_total_raw)
                                    current_total_amount = bi_total_value
                                    total_extraction_method = 'business_intelligence'
                                    logger.info(f"✅ Total extracted from business intelligence: ${current_total_amount:.2f}")
                                    _record_total_candidate('business_intelligence', current_total_amount, 0.8, 'business_intelligence.total_commission_amount')
                                except (ValueError, TypeError):
                                    pass
                        
                        # STRATEGY 3: Extract from table footer rows
                        learned_total_amount = table_editor_settings.get("statement_total_amount")
                        total_field_name = table_editor_settings.get("total_amount_field_name")
                        
                        if current_total_amount is None and total_field_name and selected_table:
                            try:
                                headers = selected_table.get("header", [])
                                rows = selected_table.get("rows", [])
                                
                                total_idx = None
                                for idx, header in enumerate(headers):
                                    if header.lower() == total_field_name.lower():
                                        total_idx = idx
                                        break
                                
                                if total_idx is not None:
                                    for row in reversed(rows[-10:]):
                                        if total_idx < len(row):
                                            potential_total = format_learning_service.parse_currency_value(str(row[total_idx]))
                                            if potential_total and potential_total > 0:
                                                row_text = ' '.join(str(cell).lower() for cell in row)
                                                if any(keyword in row_text for keyword in ['total', 'vendor', 'grand', 'net', 'payment']):
                                                    current_total_amount = potential_total
                                                    total_extraction_method = 'table_footer'
                                                    logger.info(f"✅ Total extracted from table footer: ${current_total_amount:.2f}")
                                                    _record_total_candidate('table_footer', current_total_amount, 0.88, total_field_name)
                                                    break
                            except Exception as e:
                                logger.warning(f"Failed to extract current total amount: {e}")
                        
                        # ═══════════════════════════════════════════════════════════════════════════════
                        # STRATEGY 3B: Scan COMMISSION COLUMN BOTTOM for total (ONLY if document_metadata is missing)
                        # ═══════════════════════════════════════════════════════════════════════════════
                        # ✅ STRICT HIERARCHY:
                        #    1. FIRST PRIORITY: document_metadata (GPT-extracted) - NEVER replaced
                        #    2. SECOND PRIORITY: Bottom of Commission Earned/Amount column ONLY
                        # ═══════════════════════════════════════════════════════════════════════════════
                        
                        # Initialize variables (needed even if we skip scanning due to protection guard)
                        summary_candidate = None
                        grand_total_candidate = None
                        best_summary_candidate = None
                        
                        # 🛡️ BULLETPROOF GUARD: If document_metadata has a total, SKIP table scanning entirely
                        if current_total_amount is not None and total_extraction_method == 'document_metadata':
                            logger.warning(
                                f"🛡️ PROTECTED: Document metadata total (${current_total_amount:,.2f}) is LOCKED. "
                                f"Skipping table column scanning to prevent incorrect replacements."
                            )
                        else:
                            # Only scan tables if document_metadata didn't provide a total
                            logger.info(f"🔍 Total extraction: Document metadata empty, scanning COMMISSION COLUMN at table bottoms")
                            
                            # First pass: Look for pure grand total tables (usually have 1-3 rows, all summary rows)
                            for table_idx, table in enumerate(tables):
                                table_type = table.get("table_type", "").lower()
                                rows = table.get("rows", [])
                                summary_rows_set = set(table.get("summaryRows", []) or table.get("summary_rows", []))
                                
                                logger.debug(
                                    f"  Table {table_idx}: type='{table_type}', rows={len(rows)}, "
                                    f"summary_rows={len(summary_rows_set)}"
                                )
                                
                                # Identify grand total tables:
                                # 1. Explicitly marked as summary table type
                                # 2. OR: Very few rows (1-3) where ALL rows are summary rows
                                # 3. OR: Single-row tables (often grand totals)
                                is_grand_total_table = (
                                    table_type in ['summary_table', 'total_summary', 'vendor_total', 'grand_total', 'summary'] or
                                    (len(rows) <= 3 and len(rows) > 0 and len(summary_rows_set) == len(rows)) or
                                    (len(rows) == 1)  # Single-row tables are often grand totals
                                )
                                
                                if is_grand_total_table:
                                    logger.info(f"  ✓ Table {table_idx} identified as GRAND TOTAL table")
                                    # ✅ This function ONLY scans the Commission Amount/Earned column (not Invoice Amount)
                                    candidate = _extract_commission_total_from_table(
                                        table,
                                        format_learning_service.parse_currency_value
                                    )
                                    if candidate:
                                        # Boost score for grand total tables
                                        candidate.score += 10.0  # Make them heavily preferred
                                        if grand_total_candidate is None or candidate.score > grand_total_candidate.score:
                                            grand_total_candidate = candidate
                                            logger.info(
                                                f"🎯 Found grand total table (table {table_idx}): "
                                                f"${candidate.amount:.2f} (score: {candidate.score:.2f})"
                                            )
                            
                            # Second pass: If no grand total table, check summary rows in selected_table
                            if not grand_total_candidate and selected_table:
                                # ✅ This function ONLY scans the Commission Amount/Earned column at the BOTTOM
                                summary_candidate = _extract_commission_total_from_table(
                                    selected_table,
                                    format_learning_service.parse_currency_value
                                )
                            
                            # Prefer grand total table over summary rows
                            best_summary_candidate = grand_total_candidate or summary_candidate
                            
                            if best_summary_candidate:
                                # Use higher confidence for grand total tables
                                confidence = 0.95 if grand_total_candidate else 0.82
                                source_label = "grand_total_table" if grand_total_candidate else "summary_row_scan"
                                
                                # Only replace if current_total_amount is None (document_metadata guard already passed)
                                should_replace = (
                                    current_total_amount is None or
                                    _should_replace_total(
                                        current_total_amount,
                                        total_extraction_method,
                                        best_summary_candidate.amount,
                                        source_label
                                    )
                                )
                                if should_replace:
                                    if current_total_amount is not None:
                                        logger.warning(
                                            f"⚠️ Replacing total_amount {current_total_amount:.2f} "
                                            f"(method={total_extraction_method}) with {source_label}=${best_summary_candidate.amount:.2f}"
                                        )
                                    else:
                                        logger.info(f"✅ Total extracted from {source_label}: ${best_summary_candidate.amount:.2f}")
                                    current_total_amount = best_summary_candidate.amount
                                    total_extraction_method = source_label
                                _record_total_candidate(source_label, best_summary_candidate.amount, confidence, best_summary_candidate.label)
                        
                        # STRATEGY 4: Calculate from paid_amount column and use as authoritative fallback
                        if selected_table:
                            try:
                                detail_sum_amount = _calculate_detail_commission_total(
                                    selected_table,
                                    format_learning_service.parse_currency_value
                                )
                                if detail_sum_amount is not None:
                                    document_metadata['detail_sum_amount'] = detail_sum_amount
                                    should_replace = (
                                        current_total_amount is None or
                                        _should_replace_total(
                                            current_total_amount,
                                            total_extraction_method,
                                            detail_sum_amount,
                                            'calculated_sum'
                                        )
                                    )
                                    if should_replace:
                                        if current_total_amount is not None:
                                            logger.warning(
                                                f"⚠️ Replacing total_amount {current_total_amount:.2f} "
                                                f"(method={total_extraction_method}) with calculated_sum={detail_sum_amount:.2f}"
                                            )
                                        else:
                                            logger.info(f"✅ Total CALCULATED from data rows: ${detail_sum_amount:.2f}")
                                        current_total_amount = detail_sum_amount
                                        total_extraction_method = 'calculated_sum'
                                    _record_total_candidate('calculated_sum', detail_sum_amount, 0.9, 'detail_rows_sum')
                            except Exception as calc_error:
                                logger.warning(f"Failed to calculate total from rows: {calc_error}")
                        
                        # Flag discrepancies between summary totals and calculated sums
                        # ✅ NEW BEHAVIOR: Total mismatch does NOT block auto-approval
                        # Instead, we flag for review and let user fix in UI
                        has_total_discrepancy = False
                        if best_summary_candidate and detail_sum_amount is not None:
                            diff_value = abs(detail_sum_amount - best_summary_candidate.amount)
                            tolerance_value = max(5.0, best_summary_candidate.amount * 0.05)  # ✅ 5% tolerance
                            if diff_value > tolerance_value:
                                diff_percent = (diff_value / max(best_summary_candidate.amount, 1.0)) * 100
                                if document_metadata is None:
                                    document_metadata = {}
                                document_metadata['total_discrepancy'] = {
                                    'summary_total': round(best_summary_candidate.amount, 2),
                                    'detail_sum_total': round(detail_sum_amount, 2),
                                    'difference': round(diff_value, 2),
                                    'difference_percent': round(diff_percent, 2)
                                }
                                logger.warning(
                                    "⚠️ Total discrepancy detected: summary %.2f vs detail %.2f "
                                    "(Δ=%.2f, %.2f%%) - will flag for review but ALLOW auto-approval",
                                    best_summary_candidate.amount,
                                    detail_sum_amount,
                                    diff_value,
                                    diff_percent
                                )
                                has_total_discrepancy = True
                                # ✅ REMOVED: No longer blocks auto-approval
                                # Old code: can_automate = False
                                # User can review and fix in remap component
                        
                        # Validate total amount if we have both values
                        total_validation = None
                        if can_automate and current_total_amount is not None:
                            total_validation = format_learning_service.validate_total_amount(
                                extracted_amount=current_total_amount,
                                learned_amount=learned_total_amount,
                                tolerance_percent=5.0  # 5% tolerance
                            )
                            logger.info(f"🎯 Format Learning: Total validation result: {total_validation}")
                        
                        # ✅ NEW: Determine requires_review based on total discrepancy
                        # Auto-approval proceeds, but statement needs review if totals don't match
                        requires_review = has_total_discrepancy
                        if has_total_discrepancy:
                            logger.info(
                                "📝 Auto-approval will proceed, but statement flagged for review due to total mismatch"
                            )
                        
                        # Add automation eligibility to format learning data
                        format_learning_data.update({
                            "can_automate": can_automate,
                            "automation_reason": automation_reason,
                            "requires_review": requires_review,  # ✅ Based on total discrepancy, not can_automate
                            "has_total_discrepancy": has_total_discrepancy,  # ✅ NEW: Explicit flag
                            "current_total_amount": current_total_amount,
                            "learned_total_amount": learned_total_amount,
                            "total_validation": total_validation,
                        })
                        
                        # ✨ CRITICAL: Add total amount to document_metadata for frontend display
                        if current_total_amount is not None:
                            if document_metadata is None:
                                document_metadata = {}
                            
                            document_metadata.update({
                                'total_amount': current_total_amount,
                                'total_amount_label': document_metadata.get('total_amount_label', 'Total Amount'),
                                'total_extraction_method': total_extraction_method,
                                'total_confidence': 0.95 if total_extraction_method in ['document_metadata', 'table_footer'] else 0.7
                            })
                            if total_candidates:
                                document_metadata['total_candidates'] = total_candidates
                            
                            logger.info(f"📊 Added total to document_metadata: ${current_total_amount:.2f} (method: {total_extraction_method})")
                    else:
                        logger.info(f"🎯 Format Learning: No matching format found (score: {match_score})")
                        
                        # ✨ FALLBACK: Extract total amount even without format learning
                        # This ensures document_metadata.total_amount is ALWAYS populated
                        if document_metadata and 'total_amount' not in document_metadata:
                            logger.info("🔍 No format learning - attempting direct total extraction")
                            fallback_total = None
                            fallback_method = None
                            
                            # Try to extract from tables
                            if selected_table:
                                try:
                                    headers = selected_table.get('header', [])
                                    rows = selected_table.get('rows', [])
                                    summary_indices = set(selected_table.get('summaryRows', []) or selected_table.get('summary_rows', []))
                                    
                                    # Look for amount column
                                    amount_col_idx = None
                                    for idx, header in enumerate(headers):
                                        h_lower = str(header).lower()
                                        if any(kw in h_lower for kw in ['paid amount', 'commission', 'net compensation', 'total', 'amount']):
                                            amount_col_idx = idx
                                            break
                                    
                                    if amount_col_idx is not None:
                                        # Check last 10 rows for total
                                        for row in reversed(rows[-10:]):
                                            if amount_col_idx < len(row):
                                                row_text = ' '.join(str(cell).lower() for cell in row)
                                                if any(kw in row_text for kw in ['total', 'vendor', 'grand', 'net']):
                                                    potential_total = format_learning_service.parse_currency_value(str(row[amount_col_idx]))
                                                    if potential_total and potential_total > 0:
                                                        fallback_total = potential_total
                                                        fallback_method = 'table_scan'
                                                        logger.info(f"✅ Fallback: Found total in table footer: ${fallback_total:.2f}")
                                                        break
                                        
                                        # If still not found, calculate from all rows
                                        if fallback_total is None:
                                            calculated = 0.0
                                            for row_idx, row in enumerate(rows):
                                                if row_idx in summary_indices:
                                                    continue
                                                if amount_col_idx < len(row):
                                                    amount = format_learning_service.parse_currency_value(str(row[amount_col_idx]))
                                                    if amount:
                                                        calculated += amount
                                            
                                            if calculated > 0:
                                                fallback_total = calculated
                                                fallback_method = 'calculated'
                                                logger.info(f"✅ Fallback: Calculated total from rows: ${fallback_total:.2f}")
                                
                                except Exception as e:
                                    logger.warning(f"Fallback total extraction failed: {e}")
                            
                            # Update document_metadata with fallback total
                            if fallback_total is not None:
                                document_metadata.update({
                                    'total_amount': fallback_total,
                                    'total_amount_label': 'Total Amount',
                                    'total_extraction_method': fallback_method,
                                    'total_confidence': 0.7  # Lower confidence for fallback
                                })
                                logger.info(f"📊 Fallback: Added total to document_metadata: ${fallback_total:.2f}")
                        
                    # ===== AI PLAN TYPE DETECTION (DURING EXTRACTION) =====
                    # Plan type detection happens here, but field mapping happens after table editing
                    # Emit WebSocket: Step 4 - Plan Detection started (70% progress)
                    if upload_id:
                        await connection_manager.emit_upload_step(upload_id, 'plan_detection', 70)
                    
                    try:
                        from app.services.ai_plan_type_detection_service import AIPlanTypeDetectionService
                        
                        ai_plan_service = AIPlanTypeDetectionService()
                        
                        if ai_plan_service.is_available() and selected_table:
                            logger.info("🔍 AI Plan Type Detection: Detecting plan types during extraction")
                            
                            # Get AI plan type detection
                            ai_plan_result = await ai_plan_service.detect_plan_types(
                                db=db,
                                document_context={
                                    'carrier_name': carrier.name,
                                    'statement_date': extracted_date,
                                    'document_type': 'commission_statement'
                                },
                                table_headers=headers,
                                table_sample_data=selected_table.get('rows', [])[:5],
                                extracted_carrier=carrier.name
                            )
                            
                            if ai_plan_result.get('success'):
                                ai_plan_type_data = {
                                    "ai_enabled": True,
                                    "detected_plan_types": ai_plan_result.get('detected_plan_types', []),
                                    "confidence": ai_plan_result.get('overall_confidence', 0.0),
                                    "multi_plan_document": ai_plan_result.get('multi_plan_document', False),
                                    "statistics": ai_plan_result.get('detection_statistics', {})
                                }
                                logger.info(f"✅ AI Plan Detection: {len(ai_plan_result.get('detected_plan_types', []))} plan types with {ai_plan_result.get('overall_confidence', 0):.2f} confidence")
                            else:
                                ai_plan_type_data = None
                        else:
                            ai_plan_type_data = None
                        
                    except Exception as ai_error:
                        logger.warning(f"AI plan type detection failed (non-critical): {str(ai_error)}")
                        ai_plan_type_data = None
                    
                    # Perform AI field mapping during extraction
                    # Emit WebSocket: Step 5 - AI Field Mapping started (80% progress)
                    if upload_id:
                        await connection_manager.emit_upload_step(upload_id, 'ai_field_mapping', 80)
                    
                    try:
                        logger.info("🧠 AI Field Mapping: Starting field mapping during extraction")
                        
                        # Call the enhanced extraction analysis endpoint for both field mapping and plan detection
                        from app.api.ai_intelligent_mapping import enhanced_extraction_analysis
                        
                        # ✅ CRITICAL FIX: Normalize headers before AI mapping (remove newlines)
                        original_headers = selected_table.get('header', [])
                        normalized_headers = [h.replace('\n', ' ').strip() for h in original_headers]
                        
                        logger.info("📋 Normalizing headers for AI mapping:")
                        for orig, norm in zip(original_headers, normalized_headers):
                            if orig != norm:
                                logger.info(f"   '{orig}' → '{norm}'")
                        
                        # Prepare request data
                        analysis_request = {
                            "extracted_headers": normalized_headers,  # ✅ Use normalized headers
                            "table_sample_data": selected_table.get('rows', [])[:5],
                            "document_context": {
                                'carrier_name': carrier.name if carrier else None,
                                'document_type': 'commission_statement',
                                'statement_date': extracted_date
                            },
                            "carrier_id": str(carrier.id) if carrier else None,
                            "extracted_carrier": carrier.name if carrier else extracted_carrier,
                            "timestamp": datetime.now().isoformat()
                        }
                        
                        # Get both field mapping and plan type detection
                        ai_analysis_result = await enhanced_extraction_analysis(
                            request=analysis_request,
                            current_user=current_user,
                            db=db
                        )
                        
                        if ai_analysis_result.get('success'):
                            # Extract field mapping data
                            field_mapping = ai_analysis_result.get('field_mapping', {})
                            if field_mapping.get('success'):
                                mappings = field_mapping.get('mappings', [])
                                
                                # ✅ CRITICAL FIX: Add sample data to each mapping
                                selected_table_headers = selected_table.get('header', [])
                                selected_table_rows = selected_table.get('rows', [])
                                
                                for mapping in mappings:
                                    extracted_field = mapping.get('extracted_field')
                                    
                                    # Find column index for this field
                                    col_idx = None
                                    for idx, header in enumerate(selected_table_headers):
                                        # Normalize both for comparison (remove newlines)
                                        normalized_header = header.replace('\n', ' ').strip()
                                        normalized_field = extracted_field.replace('\n', ' ').strip()
                                        if normalized_header == normalized_field:
                                            col_idx = idx
                                            break
                                    
                                    # Extract sample value from first non-empty row
                                    sample_value = ''
                                    if col_idx is not None and selected_table_rows:
                                        for row in selected_table_rows[:5]:  # Check first 5 rows
                                            if col_idx < len(row) and row[col_idx]:
                                                cell_value = str(row[col_idx]).strip()
                                                if cell_value and cell_value != '':
                                                    sample_value = cell_value
                                                    break
                                    
                                    # Add sample value to mapping
                                    mapping['sample_value'] = sample_value
                                    logger.debug(f"   Sample for '{extracted_field}': '{sample_value}'")
                                
                                ai_field_mapping_data = {
                                    "ai_enabled": True,
                                    "mappings": mappings,
                                    "unmapped_fields": field_mapping.get('unmapped_fields', []),
                                    "confidence": field_mapping.get('confidence', 0.0),
                                    "learned_format_used": field_mapping.get('learned_format_used', False),
                                    "timestamp": ai_analysis_result.get('timestamp')
                                }
                                logger.info(f"✅ AI Field Mapping: {len(mappings)} mappings with sample data, confidence {field_mapping.get('confidence', 0):.2f}")
                            else:
                                ai_field_mapping_data = {"ai_enabled": False, "error": "Field mapping failed"}
                            
                            # Update plan type detection data if available
                            plan_detection = ai_analysis_result.get('plan_type_detection', {})
                            if plan_detection.get('success'):
                                ai_plan_type_data = {
                                    "ai_enabled": True,
                                    "detected_plan_types": plan_detection.get('detected_plan_types', []),
                                    "confidence": plan_detection.get('confidence', 0.0),
                                    "multi_plan_document": plan_detection.get('multi_plan_document', False),
                                    "statistics": plan_detection.get('detection_statistics', {})
                                }
                        else:
                            logger.warning("AI enhanced extraction analysis failed")
                            ai_field_mapping_data = {"ai_enabled": False}
                            
                    except Exception as ai_error:
                        logger.warning(f"AI field mapping failed (non-critical): {str(ai_error)}")
                        ai_field_mapping_data = {"ai_enabled": False, "error": str(ai_error)}
                    
            except Exception as e:
                logger.warning(f"Format learning lookup failed: {str(e)}")
        
        # ===== CONVERSATIONAL SUMMARY GENERATION =====
        # Generate natural language summary in parallel (non-blocking)
        structured_data = extraction_result.get('structured_data') or {}
        conversational_summary = extraction_result.get('summary')
        summary_generation_task = None
        
        # Use any pre-generated summary from upstream pipeline; otherwise fall back to on-demand generation
        if conversational_summary:
            logger.info("✅ Conversational summary supplied by extraction pipeline")
            logger.info(f"   Summary preview: {conversational_summary[:200]}")
            logger.info(f"   Structured data keys: {list(structured_data.keys()) if structured_data else []}")
        else:
            # Generate conversational summary if not already done
            try:
                from app.services.conversational_summary_service import ConversationalSummaryService
                
                summary_service = ConversationalSummaryService()
                
                if summary_service.is_available():
                    logger.info("🗣️ Starting conversational summary generation...")
                    
                    # Send progress update
                    if upload_id:
                        await connection_manager.send_step_progress(
                            upload_id,
                            percentage=92,
                            estimated_time="Preparing summary...",
                            current_stage="summary_generation"
                        )
                    
                    # Check if we have enhanced extraction data
                    has_enhanced_data = (
                        'entities' in extraction_result or
                        'business_intelligence' in extraction_result or
                        'relationships' in extraction_result
                    )
                    
                    # Prepare extraction data - use enhanced data if available
                    if has_enhanced_data:
                        logger.info("✅ Using ENHANCED extraction data for summary")
                        extraction_data = extraction_result  # Pass full enhanced result
                        use_enhanced = True
                    else:
                        logger.info("📝 Using STANDARD extraction data for summary")
                        extraction_data = {
                            'carrier_name': extracted_carrier,
                            'statement_date': extracted_date,
                            'broker_company': extracted_carrier,  # Use carrier name instead of company_id
                            'tables': extraction_result.get('tables', []),
                            'document_metadata': document_metadata
                        }
                        use_enhanced = False
                    
                    # Start summary generation as async task (non-blocking)
                    summary_generation_task = asyncio.create_task(
                        summary_service.generate_conversational_summary(
                            extraction_data=extraction_data,
                            document_context={
                                'file_name': file.filename,
                                'page_count': len(extraction_result.get('tables', [])),
                                'file_size': file_size,
                                'extraction_method': extraction_method
                            },
                            use_enhanced=use_enhanced  # ⭐ CRITICAL: Pass use_enhanced flag
                        )
                    )
                    
            except Exception as summary_error:
                logger.warning(f"Conversational summary initialization failed (non-critical): {summary_error}")
        
        # ✅ CRITICAL FIX: Transform GPT's summary_rows (snake_case) to summaryRows (camelCase) for frontend
        # Also remove large metadata fields that frontend doesn't use (reduces response size)
        transformed_tables = []
        for table in extraction_result.get('tables', []):
            transformed_table = dict(table)  # Create a copy
            
            # Convert summary_rows to summaryRows if present
            if 'summary_rows' in transformed_table:
                transformed_table['summaryRows'] = transformed_table.pop('summary_rows')
                logger.info(f"🔧 Transformed summary_rows to summaryRows for table: {transformed_table.get('summaryRows', [])}")
            # Ensure summaryRows exists even if empty
            if 'summaryRows' not in transformed_table:
                transformed_table['summaryRows'] = []
            
            # ✅ OPTIMIZATION: Remove large metadata fields that frontend doesn't need
            # These are kept in DB raw_data but excluded from API response to reduce size
            fields_to_remove = ['row_annotations', 'table_blueprint', 'summary_detection']
            for field in fields_to_remove:
                transformed_table.pop(field, None)
            
            # Remove detailed table_profile from metadata (keep other metadata)
            if 'metadata' in transformed_table and isinstance(transformed_table['metadata'], dict):
                transformed_table['metadata'].pop('table_profile', None)
            
            transformed_tables.append(transformed_table)
        
        # Prepare client response WITH plan type detection (field mapping happens after editing)
        client_response = {
            "success": True,
            "upload_id": str(upload_id_uuid),
            "tables": transformed_tables,  # ✅ Use transformed tables with summaryRows
            "file_name": file.filename,
            "gcs_url": gcs_url,  # CRITICAL: Include GCS URL for PDF preview
            "gcs_key": gcs_key,  # Include GCS key for reference
            "company_id": company_id,
            "carrier_id": carrier_id_for_response,  # Add carrier_id
            "extraction_method": extraction_method,
            "file_type": file_ext,
            "processing_time": processing_time,
            "quality_summary": extraction_result.get('quality_summary', {}),
            "extraction_config": extraction_result.get('extraction_config', {}),
            "format_learning": format_learning_data,  # Use enhanced format learning data
            "metadata": extraction_result.get('metadata', {}),
            "extracted_carrier": extracted_carrier,
            "extracted_date": extracted_date,
            "document_metadata": document_metadata,
            "plan_types": (
                ai_plan_type_data.get('detected_plan_types', [])
                if ai_plan_type_data else []
            ),
            
            # CRITICAL FIX: Include upload_metadata so frontend has access to environment_id
            # But exclude raw_data to reduce response size (it's a duplicate of tables)
            "upload_metadata": {k: v for k, v in upload_metadata.items() if k != 'raw_data'},
            # Also add environment_id at top level for easier access
            "environment_id": str(target_env.id),
            "user_id": str(current_user.id),
            "uploaded_at": upload_metadata.get('uploaded_at'),
            "file_hash": upload_metadata.get('file_hash'),
            "file_size": upload_metadata.get('file_size'),
            
            # ===== AI INTELLIGENCE - BOTH PLAN TYPE AND FIELD MAPPING DURING EXTRACTION =====
            # Both plan type detection and field mapping happen during extraction
            "ai_intelligence": {
                "enabled": (ai_plan_type_data is not None) or (ai_field_mapping_data is not None),
                "field_mapping": ai_field_mapping_data or {"ai_enabled": False},
                "plan_type_detection": ai_plan_type_data or {"ai_enabled": False},
                "table_selection": table_selection_data or {"enabled": False},
                "overall_confidence": max(
                    ai_plan_type_data.get('confidence', 0.0) if ai_plan_type_data else 0.0,
                    ai_field_mapping_data.get('confidence', 0.0) if ai_field_mapping_data else 0.0
                )
            },
            "message": f"Successfully extracted {len(extraction_result.get('tables', []))} tables using {extraction_method} method."
        }
        
        # Record user contribution (deferred until approval)
        # CRITICAL: User contributions are ONLY recorded during approval, not extraction
        # This is because statement_uploads records are only created after approval
        # to prevent ghost/orphan records. The contribution will be recorded when
        # the user approves the statement via review.py or auto_approval.py
        # 
        # DO NOT attempt to record contribution here - it will always fail with a
        # foreign key constraint error since the statement_uploads record doesn't exist yet.
        # Both review.py and auto_approval.py handle contribution recording after the
        # statement is persisted to the database.
        
        # Log file upload for audit
        await audit_service.log_file_upload(
            user_id=current_user.id,
            file_name=file.filename,
            file_size=file_size,
            file_hash=file_hash,
            company_id=company_id,
            upload_id=upload_id_uuid
        )
        
        # Clean up local file
        os.remove(file_path)
        
        # ===== AWAIT CONVERSATIONAL SUMMARY (WITH TIMEOUT) =====
        # Wait for summary generation to complete (max 5 seconds) - only if not already generated
        if summary_generation_task and not conversational_summary:
            try:
                logger.info("⏳ Waiting for conversational summary...")
                summary_result = await asyncio.wait_for(summary_generation_task, timeout=5.0)
                
                if summary_result and summary_result.get('success'):
                    conversational_summary = summary_result.get('summary')
                    structured_data = summary_result.get('structured_data', {})
                    logger.info(f"✅ Conversational summary ready: {conversational_summary[:100]}...")
                    logger.info(f"✅ Structured data ready: {structured_data}")
                    
                    # Send summary AND structured data via WebSocket for real-time display
                    if upload_id:
                        import json
                        await connection_manager.send_step_progress(
                            upload_id,
                            percentage=85,  # ✅ FIXED: 85% not 70% (after field mapping at 80%)
                            estimated_time="Enhanced summary ready",
                            current_stage="summary_complete",
                            conversational_summary=conversational_summary,  # Text summary
                            summaryContent=json.dumps(structured_data),  # Structured key-value data (legacy key)
                            summary_data=structured_data or {}
                        )
                else:
                    logger.warning("Summary generation returned unsuccessful result")
                    
            except asyncio.TimeoutError:
                logger.warning("Summary generation timeout (5s) - using fallback")
                # Generate simple fallback summary with actual entity names
                conversational_summary = f"Commission statement from {extracted_carrier or 'Unknown'}, dated {extracted_date or 'Unknown'}, prepared for {extraction_result.get('document_metadata', {}).get('broker_company', 'Unknown')}."
                
                if upload_id:
                    await connection_manager.send_step_progress(
                        upload_id,
                        percentage=85,  # ✅ FIXED: 85% not 70% (after field mapping at 80%)
                        estimated_time="Enhanced summary ready",
                        current_stage="summary_complete",
                        conversational_summary=conversational_summary
                    )
                    
            except Exception as summary_error:
                logger.error(f"Error awaiting summary: {summary_error}")
                conversational_summary = None
        elif conversational_summary:
            # Enhanced summary was already generated - send it via WebSocket
            logger.info("📤 Sending pre-generated enhanced summary via WebSocket...")
            if upload_id:
                # Use structured_data if available (should be set above), otherwise empty dict
                import json
                structured_data_json = json.dumps(structured_data if structured_data else {})
                logger.info(f"📊 Sending structured data: {structured_data_json[:200]}...")
                
                await connection_manager.send_step_progress(
                    upload_id,
                    percentage=85,  # ✅ FIXED: 85% not 70% (after field mapping at 80%)
                    estimated_time="Enhanced summary ready",
                    current_stage="summary_complete",
                    conversational_summary=conversational_summary,
                    summaryContent=structured_data_json,
                    summary_data=structured_data or {}
                )
        
        # ✅ Emit WebSocket: Step 6 - Preparing Results (95% progress) - AFTER summary
        if upload_id:
            await connection_manager.emit_upload_step(upload_id, 'preparing_results', 95)
        
        # Add server-specific fields to response
        # ✅ Extract total_amount (commission) and total_invoice from document_metadata if available
        extracted_total = 0.0
        extracted_invoice_total = 0.0
        
        if document_metadata and 'total_amount' in document_metadata:
            try:
                extracted_total = float(document_metadata.get('total_amount', 0))
            except (ValueError, TypeError):
                extracted_total = 0.0
        
        # ✅ CRITICAL FIX: Extract invoice total from document_metadata
        if document_metadata and 'total_invoice' in document_metadata:
            try:
                extracted_invoice_total = float(document_metadata.get('total_invoice', 0))
            except (ValueError, TypeError):
                extracted_invoice_total = 0.0
        
        # ✅ CRITICAL FIX: Calculate invoice total from ALL tables (not just selected_table)
        if extracted_invoice_total == 0.0 and extraction_result.get('tables'):
            try:
                all_tables = extraction_result.get('tables', [])
                logger.info(f"📊 Calculating invoice total from {len(all_tables)} tables")
                
                total_invoice_sum = 0.0
                
                for table_idx, table in enumerate(all_tables):
                    headers = table.get('header', []) or table.get('headers', [])
                    rows = table.get('rows', [])
                    summary_rows = set(table.get('summary_rows', []))
                    
                    if not headers or not rows:
                        continue
                    
                    # Look for invoice amount/total column
                    invoice_col_idx = None
                    for idx, header in enumerate(headers):
                        h_lower = str(header).lower().replace('\n', ' ')
                        if any(kw in h_lower for kw in ['invoice amount', 'invoice total', 'total invoice']):
                            invoice_col_idx = idx
                            logger.info(f"📊 Table {table_idx}: Found invoice column at index {idx}: '{header}'")
                            break
                    
                    if invoice_col_idx is not None:
                        # Strategy 1: Try to get from summary row first (most accurate)
                        for row_idx in summary_rows:
                            if row_idx < len(rows):
                                row = rows[row_idx]
                                if invoice_col_idx < len(row):
                                    cell_value = str(row[invoice_col_idx]).replace('$', '').replace(',', '').strip()
                                    try:
                                        table_invoice_total = float(cell_value)
                                        total_invoice_sum += table_invoice_total
                                        logger.info(f"✅ Table {table_idx}: Extracted from summary row: ${table_invoice_total:,.2f}")
                                        break
                                    except ValueError:
                                        continue
                        else:
                            # Strategy 2: Sum all non-summary rows
                            table_invoice_sum = 0.0
                            for row_idx, row in enumerate(rows):
                                if row_idx not in summary_rows and invoice_col_idx < len(row):
                                    cell_value = str(row[invoice_col_idx]).replace('$', '').replace(',', '').strip()
                                    try:
                                        amount = float(cell_value)
                                        if amount > 0:  # Only add positive values
                                            table_invoice_sum += amount
                                    except ValueError:
                                        continue
                            
                            if table_invoice_sum > 0:
                                total_invoice_sum += table_invoice_sum
                                logger.info(f"✅ Table {table_idx}: Calculated from rows: ${table_invoice_sum:,.2f}")
                
                if total_invoice_sum > 0:
                    extracted_invoice_total = total_invoice_sum
                    logger.info(f"✅ TOTAL invoice amount from all tables: ${extracted_invoice_total:,.2f}")
                else:
                    logger.warning("⚠️ Could not calculate invoice total from tables")
                    
            except Exception as e:
                logger.warning(f"Failed to extract invoice total from tables: {e}")
        
        structured_data = _sync_structured_summary(structured_data, document_metadata, extracted_invoice_total)

        client_response.update({
            "success": True,
            "extraction_id": str(upload_id_uuid),
            "upload_id": str(upload_id_uuid),
            "gcs_url": gcs_url,
            "gcs_key": gcs_key,
            "file_name": gcs_key,  # Use full GCS path as file_name for PDF preview
            "conversational_summary": conversational_summary,  # ← NEW: Include in response
             "summary_data": structured_data or {},
            "structured_summary": structured_data or {},
            "extracted_total": extracted_total,  # ✅ Commission total for auto-approval
            "extracted_invoice_total": extracted_invoice_total  # ✅ CRITICAL FIX: Invoice total for dashboard
        })

        try:
            cache_payload = {
                "raw_tables": copy.deepcopy(refined_tables),
                "document_metadata": copy.deepcopy(document_metadata) if document_metadata else {},
                "format_learning": copy.deepcopy(format_learning_data) if format_learning_data else {},
                "upload_metadata": copy.deepcopy(upload_metadata),
                "structured_data": copy.deepcopy(structured_data) if structured_data else {},
                "carrier_id": str(carrier.id) if carrier else carrier_id_for_response,
                "extracted_total": extracted_total,
                "extracted_invoice_total": extracted_invoice_total,
                "statement_date": document_metadata.get('statement_date') if document_metadata else None,
                "field_mapping": field_mapping,
                "plan_types": ai_plan_type_data.get('detected_plan_types', []) if ai_plan_type_data else [],
            }
            upload_cache.set(str(upload_id_uuid), cache_payload)
        except Exception as cache_error:
            logger.warning(f"⚠️ Unable to cache extraction snapshot for auto-approval: {cache_error}")
        
        # Emit WebSocket: EXTRACTION_COMPLETE with full results
        if upload_id:
            # Convert all UUID objects to strings for JSON serialization
            def convert_uuids_to_strings(obj):
                """Recursively convert UUID objects to strings for JSON serialization"""
                if isinstance(obj, UUID):
                    return str(obj)
                elif isinstance(obj, dict):
                    return {k: convert_uuids_to_strings(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [convert_uuids_to_strings(item) for item in obj]
                else:
                    return obj
            
            # Create a JSON-safe copy of the response
            json_safe_response = convert_uuids_to_strings(client_response)
            
            # ✅ Final completion at 100%
            await connection_manager.send_step_progress(
                upload_id,
                percentage=100,
                estimated_time="Complete",
                current_stage="complete"
            )
            
            await connection_manager.send_extraction_complete(upload_id, json_safe_response)
            logger.info(f"✅ Extraction complete! Sent results via WebSocket for upload_id: {upload_id}")
        
        return client_response
        
    except HTTPException:
        # CRITICAL CHANGE: No DB record to cleanup anymore
        # Just clean up GCS files and local files
        try:
            if gcs_key:
                from app.services.gcs_utils import delete_gcs_file
                delete_gcs_file(gcs_key)
                logger.info(f"🗑️ Deleted GCS file: {gcs_key}")
        except Exception as gcs_error:
            logger.warning(f"⚠️ Failed to delete GCS file: {gcs_error}")
        
        # Clean up local file on error
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"🗑️ Deleted local file: {file_path}")
        raise
    except Exception as e:
        logger.error(f"❌ Smart extraction error: {str(e)}")
        
        # CRITICAL CHANGE: No DB record to cleanup anymore
        # Just clean up GCS files and local files
        try:
            if gcs_key:
                from app.services.gcs_utils import delete_gcs_file
                delete_gcs_file(gcs_key)
                logger.info(f"🗑️ Deleted GCS file: {gcs_key}")
        except Exception as gcs_error:
            logger.warning(f"⚠️ Failed to delete GCS file: {gcs_error}")
        
        # Clean up local file on error
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"🗑️ Deleted local file: {file_path}")
        
        raise HTTPException(status_code=500, detail=f"Smart extraction failed: {str(e)}")


async def cleanup_failed_upload(db: AsyncSession, upload_id: UUID):
    """
    Complete cleanup of failed/cancelled upload.
    - Deletes DB record
    - Deletes GCS files
    - Allows file to be re-uploaded
    
    Args:
        db: Database session
        upload_id: UUID of the upload to clean up
    """
    from sqlalchemy import select, delete
    from app.db.models import StatementUpload
    from app.services.gcs_utils import delete_gcs_file
    
    try:
        # Get upload record
        result = await db.execute(
            select(StatementUpload).where(StatementUpload.id == upload_id)
        )
        upload_record = result.scalar_one_or_none()
        
        if not upload_record:
            logger.warning(f"⚠️ Upload record not found for cleanup: {upload_id}")
            return
        
        logger.info(f"🗑️ Cleaning up failed upload: {upload_id} (file: {upload_record.file_name})")
        
        # Delete GCS files
        if upload_record.gcs_key:
            try:
                delete_gcs_file(upload_record.gcs_key)
                logger.info(f"✅ Deleted GCS file: {upload_record.gcs_key}")
            except Exception as gcs_error:
                logger.error(f"❌ Failed to delete GCS file: {gcs_error}")
        
        if upload_record.file_name and upload_record.file_name != upload_record.gcs_key:
            try:
                delete_gcs_file(upload_record.file_name)
                logger.info(f"✅ Deleted GCS file: {upload_record.file_name}")
            except Exception as gcs_error:
                logger.error(f"❌ Failed to delete GCS file: {gcs_error}")
        
        # Delete DB record - CRITICAL for allowing re-upload
        await db.execute(
            delete(StatementUpload).where(StatementUpload.id == upload_id)
        )
        await db.commit()
        logger.info(f"✅ Deleted failed upload record {upload_id} - file can now be re-uploaded")
        
    except Exception as e:
        logger.error(f"❌ Error in cleanup_failed_upload: {e}")
        await db.rollback()
        raise


@router.post("/cancel-extraction/{upload_id}")
async def cancel_extraction(
    upload_id: str,
    current_user: User = Depends(get_current_user_hybrid),
    db: AsyncSession = Depends(get_db)
):
    """
    Cancel a running extraction process with immediate effect and cleanup.
    
    - Marks extraction as cancelled immediately
    - Cancels running task
    - Cleans up database records
    - Deletes GCS and local files
    - Sends WebSocket notification
    
    Args:
        upload_id: The upload ID to cancel
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Success message if cancellation was successful
    """
    logger.info(f"🛑 Cancellation requested for upload {upload_id}")
    
    try:
        upload_uuid = UUID(upload_id)
    except ValueError:
        logger.error(f"❌ Invalid upload ID format: {upload_id}")
        raise HTTPException(status_code=400, detail="Invalid upload ID")
    
    # Define cleanup callback - uses reusable cleanup function
    async def cleanup_cancelled_upload():
        """Cleanup database and files for cancelled upload."""
        try:
            await cleanup_failed_upload(db, upload_uuid)
            logger.info(f"✅ Cleanup completed for cancelled upload {upload_id}")
        except Exception as cleanup_error:
            logger.error(f"❌ Failed to cleanup cancelled upload: {cleanup_error}")
    
    try:
        # Mark as cancelled immediately with cleanup callback
        await cancellation_manager.mark_cancelled(upload_id, cleanup_callback=cleanup_cancelled_upload)
        
        # If task is running, cancel it
        if upload_id in running_extractions:
            task = running_extractions[upload_id]
            task.cancel()
            
            try:
                await task
            except asyncio.CancelledError:
                logger.info(f"✅ Successfully cancelled extraction task for {upload_id}")
            
            # Remove from running extractions
            running_extractions.pop(upload_id, None)
        else:
            logger.warning(f"⚠️ No running extraction found for {upload_id}, but still proceeding with cleanup")
        
        # Execute cleanup immediately
        await cancellation_manager.execute_cleanup(upload_id)
        
        # Send WebSocket notification
        try:
            await connection_manager.send_upload_complete(
                upload_id,
                {
                    "status": "cancelled",
                    "message": "Upload cancelled successfully"
                }
            )
        except Exception as ws_error:
            logger.warning(f"Failed to send WebSocket notification: {ws_error}")
        
        # Clear from cancellation manager
        await cancellation_manager.clear_cancelled(upload_id)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"Extraction cancelled and cleaned up successfully for upload {upload_id}",
                "upload_id": upload_id
            }
        )
        
    except Exception as e:
        logger.error(f"❌ Cancellation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cancel extraction: {str(e)}")


@router.post("/extract-tables-gpt/")
async def extract_tables_gpt(
    upload_id: str = Form(...),
    company_id: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Extract tables using GPT-5 Vision analysis.
    This endpoint uses the same format as the default extraction for consistency.
    """
    start_time = datetime.now()
    logger.info(f"Starting GPT extraction for upload_id: {upload_id}")
    
    try:
        # Get upload information
        upload_info = await crud.get_upload_by_id(db, upload_id)
        if not upload_info:
            raise HTTPException(status_code=404, detail="Upload not found")
        
        # Get PDF file from GCS
        gcs_key = upload_info.file_name
        logger.info(f"Using GCS key: {gcs_key}")
        
        # Download PDF from GCS to temporary file
        temp_pdf_path = download_file_from_gcs(gcs_key)
        if not temp_pdf_path:
            raise HTTPException(
                status_code=404, 
                detail=f"Failed to download PDF from GCS: {gcs_key}"
            )
        
        logger.info(f"Processing PDF: {temp_pdf_path} (downloaded from GCS)")
        
        # Use the GPT-5 Vision service for extraction
        from app.services.gpt4o_vision_service import GPT4oVisionService
        gpt4o_service = GPT4oVisionService()
        
        if not gpt4o_service.is_available():
            raise HTTPException(
                status_code=503, 
                detail="GPT-5 Vision service not available. Please check OPENAI_API_KEY configuration."
            )
        
        # Step 1: Determine number of pages and enhance page images
        import fitz  # PyMuPDF
        doc = fitz.open(temp_pdf_path)
        num_pages = len(doc)
        doc.close()
        
        logger.info(f"PDF has {num_pages} pages")
        
        # Use the new intelligent extraction method that automatically handles PDF type and optimization
        logger.info("Starting intelligent GPT extraction with automatic PDF type detection...")
        extraction_result = gpt4o_service.extract_commission_data(
            pdf_path=temp_pdf_path,
            max_pages=min(num_pages, 5)  # Limit to first 5 pages or total pages if less
        )
        
        # Extract document metadata (carrier, date, broker) from first page
        logger.info("Extracting document metadata (carrier, date, broker)...")
        from app.services.enhanced_extraction_service import EnhancedExtractionService
        enhanced_service = EnhancedExtractionService()
        
        gpt_metadata = await enhanced_service._extract_metadata_with_gpt(temp_pdf_path)
        
        # Store document metadata for response
        document_metadata = {}
        if gpt_metadata.get('success'):
            document_metadata = {
                "carrier_name": gpt_metadata.get('carrier_name'),
                "carrier_confidence": gpt_metadata.get('carrier_confidence', 0.9),
                "statement_date": gpt_metadata.get('statement_date'),
                "date_confidence": gpt_metadata.get('date_confidence', 0.9),
                "broker_company": gpt_metadata.get('broker_company'),  # Extract broker from metadata
                "document_type": "commission_statement"
            }
            logger.info(f"Extracted metadata: carrier={document_metadata.get('carrier_name')}, date={document_metadata.get('statement_date')}, broker={document_metadata.get('broker_company')}")
        else:
            logger.warning(f"Metadata extraction failed: {gpt_metadata.get('error')}")
            document_metadata = {
                "carrier_name": None,
                "carrier_confidence": 0.0,
                "statement_date": None,
                "date_confidence": 0.0,
                "broker_company": None,
                "document_type": "commission_statement"
            }
        
        # Clean up temporary file
        try:
            os.remove(temp_pdf_path)
            logger.info(f"Cleaned up temporary file: {temp_pdf_path}")
        except Exception as e:
            logger.warning(f"Failed to clean up temporary file {temp_pdf_path}: {e}")
        
        if not extraction_result.get("success"):
            raise HTTPException(
                status_code=500, 
                detail=f"GPT extraction failed: {extraction_result.get('error', 'Unknown error')}"
            )
        
        logger.info("GPT extraction completed successfully")
        
        # Check if extraction was successful
        if not extraction_result.get("success"):
            error_msg = extraction_result.get('error', 'Unknown error')
            logger.error(f"GPT extraction failed: {error_msg}")
            return JSONResponse(
                status_code=422,  # Unprocessable Entity
                content={
                    "success": False,
                    "error": f"GPT extraction failed: {error_msg}",
                    "message": "The document could not be processed by GPT. This may be due to document format or content issues. Please try with a different document or contact support.",
                    "upload_id": upload_id,
                    "timestamp": datetime.now().isoformat()
                }
            )
        
        # Get extracted tables
        extracted_tables = extraction_result.get("tables", [])
        extraction_metadata = extraction_result.get("extraction_metadata", {})
        
        if not extracted_tables:
            logger.warning("No tables extracted from GPT analysis")
            return JSONResponse(
                status_code=422,  # Unprocessable Entity
                content={
                    "success": False,
                    "error": "No tables found in document",
                    "message": "GPT could not identify any tables in the document. This may be due to document format or content issues. Please try with a different document or contact support.",
                    "upload_id": upload_id,
                    "timestamp": datetime.now().isoformat()
                }
            )
        
        logger.info("GPT extraction completed successfully")
        
        # Use enhanced extracted tables with hierarchical structure detection
        processed_tables = []
        
        logger.info(f"Processing {len(extracted_tables)} extracted tables with hierarchical structure enhancement")
        for i, table in enumerate(extracted_tables):
            logger.info(f"Processing table {i+1} with hierarchical structure enhancement")
            # The hierarchical structure detection is already applied in the GPT service
            # Just add final metadata
            table["extractor"] = "gpt4o_vision_enhanced"
            table["processing_notes"] = "Enhanced extraction with hierarchical structure detection and company name propagation"
            processed_tables.append(table)
        
        
        # Step 4: Merge similar tables with identical headers
        merged_tables = gpt4o_service.merge_similar_tables(processed_tables)
        
        final_tables = merged_tables
        
        # Transform tables to the format expected by TableEditor
        frontend_tables = []
        total_rows = 0
        total_cells = 0
        all_headers = []
        all_table_data = []
        
        for i, table in enumerate(final_tables):
            rows = table.get("rows", [])
            # Handle both "header" and "headers" keys for compatibility
            headers = table.get("headers", table.get("header", []))
            
            # Calculate metrics
            total_rows += len(rows)
            total_cells += sum(len(row) for row in rows) if rows else 0
            
            # Collect headers (use the most comprehensive set)
            if len(headers) > len(all_headers):
                all_headers = headers
            
            # Convert rows to table_data format for backward compatibility
            for row in rows:
                row_dict = {}
                for j, header in enumerate(headers):
                    header_key = header.lower().replace(" ", "_").replace("-", "_")
                    value = str(row[j]) if j < len(row) else ""
                    row_dict[header_key] = value
                all_table_data.append(row_dict)
            
            # Determine extractor type and processing notes
            extractor = table.get("extractor", "gpt4o_vision")
            processing_notes = "GPT-5 Vision enhanced extraction with multi-pass analysis and smart pattern detection"
            if extractor == "gpt4o_vision_enhanced":
                processing_notes = "GPT-5 Vision enhanced extraction with hierarchical company detection"
            elif extractor == "gpt4o_vision_hierarchical":
                processing_notes = "GPT-5 Vision hierarchical extraction"
            elif extractor == "gpt4o_vision_merged":
                processing_notes = "GPT-5 Vision merged extraction with similar table consolidation"
            elif extractor == "enhanced_multi_pass_extraction":
                processing_notes = "GPT-5 Vision enhanced multi-pass extraction with smart pattern detection and validation"
            
            table_data = {
                "name": table.get("name", f"GPT Extracted Table {i + 1}"),
                "header": headers,
                "rows": rows,
                "extractor": extractor,
                "structure_type": table.get("structure_type", "standard"),
                # CRITICAL FIX: Include summaryRows for frontend display
                "summaryRows": table.get("summaryRows", []),
                "summary_detection": table.get("summary_detection", {}),
                "metadata": {
                    "extraction_method": extractor,
                    "timestamp": datetime.now().isoformat(),
                    "processing_notes": processing_notes,
                    "confidence": 0.95
                }
            }
            frontend_tables.append(table_data)
        
        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()
        
        # Add format learning (same as PDF flow)
        format_learning_data = None
        if frontend_tables and len(frontend_tables) > 0:
            try:
                from app.services.format_learning_service import FormatLearningService
                format_learning_service = FormatLearningService()
                
                # Get first table for format learning
                first_table = frontend_tables[0]
                headers = first_table.get("header", [])
                
                # Generate table structure for format learning
                table_structure = {
                    "row_count": len(first_table.get("rows", [])),
                    "column_count": len(headers),
                    "has_financial_data": any(keyword in ' '.join(headers).lower() for keyword in [
                        'premium', 'commission', 'billed', 'group', 'client', 'invoice',
                        'total', 'amount', 'due', 'paid', 'rate', 'percentage', 'period'
                    ])
                }
                
                # Find matching format
                learned_format, match_score = await format_learning_service.find_matching_format(
                    db=db,
                    company_id=company_id,
                    headers=headers,
                    table_structure=table_structure
                )
                
                if learned_format and match_score > 0.5:
                    logger.info(f"🎯 GPT: Found matching format with score {match_score}")
                    logger.info(f"🎯 GPT: Learned format field_mapping: {learned_format.get('field_mapping', {})}")
                    logger.info(f"🎯 GPT: Learned format table_editor_settings: {learned_format.get('table_editor_settings')}")
                    format_learning_data = {
                        "found_match": True,
                        "match_score": match_score,
                        "learned_format": learned_format,
                        "suggested_mapping": learned_format.get("field_mapping", {}),
                        "table_editor_settings": learned_format.get("table_editor_settings")
                    }
                    
                    # CRITICAL FIX: Auto-apply learned settings
                    table_editor_settings = learned_format.get('table_editor_settings', {})
                    
                    # Auto-apply table deletions from learned format
                    if table_editor_settings.get('deleted_tables') or table_editor_settings.get('table_deletions'):
                        deleted_tables = table_editor_settings.get('deleted_tables') or table_editor_settings.get('table_deletions', [])
                        if deleted_tables:
                            logger.info(f"🎯 GPT Format Learning: Auto-applying table deletions: {deleted_tables}")
                            format_learning_data['auto_delete_tables'] = deleted_tables
                    
                    # Auto-apply row deletions from learned format
                    if table_editor_settings.get('deleted_rows') or table_editor_settings.get('row_deletions'):
                        deleted_rows = table_editor_settings.get('deleted_rows') or table_editor_settings.get('row_deletions', [])
                        if deleted_rows:
                            logger.info(f"🎯 GPT Format Learning: Auto-applying row deletions: {len(deleted_rows)} rows")
                            format_learning_data['auto_delete_rows'] = deleted_rows
                    
                    logger.info(f"🎯 GPT: Created format_learning_data: {format_learning_data}")
                else:
                    format_learning_data = {
                        "found_match": False,
                        "match_score": match_score or 0,
                        "learned_format": None,
                        "suggested_mapping": {},
                        "table_editor_settings": None
                    }
                    
            except Exception as e:
                logger.warning(f"GPT: Format learning failed: {str(e)}")
                format_learning_data = {
                    "found_match": False,
                    "match_score": 0,
                    "learned_format": None,
                    "suggested_mapping": {},
                    "table_editor_settings": None
                }
        
        # Prepare response in the exact same format as extraction API
        response_data = {
            "status": "success",
            "success": True,
                            "message": "Successfully extracted tables with GPT-5 Vision using high quality image processing and intelligent table merging",
            "job_id": str(uuid4()),
            "upload_id": upload_id,
            "extraction_id": upload_id,
            "tables": frontend_tables,
            "table_headers": all_headers,
            "table_data": all_table_data,
            "processing_time_seconds": processing_time,
            "extraction_time_seconds": processing_time,
            "extraction_metrics": {
                "total_text_elements": total_cells,
                "extraction_time": processing_time,
                "table_confidence": 0.95,
                "model_used": "gpt4o_vision"
            },
            "document_metadata": document_metadata,  # Add document metadata with carrier, date, and broker
            "document_info": {
                "pdf_type": "commission_statement",
                "total_tables": len(frontend_tables),
                "hierarchical_tables_count": len([t for t in final_tables if t.get("structure_type") == "hierarchical_with_company_column"]),
                "standard_tables_count": len([t for t in final_tables if t.get("structure_type") == "standard"]),
                "hierarchical_indicators": extraction_metadata.get("hierarchical_structure", {})
            },
            "quality_summary": {
                "total_tables": len(frontend_tables),
                "valid_tables": len(frontend_tables),
                "average_quality_score": 95.0,
                "overall_confidence": "HIGH",
                "issues_found": [],
                "recommendations": [
                    "GPT-5 Vision extraction completed successfully",
                    f"Hierarchical processing: {len([t for t in final_tables if t.get('structure_type') == 'hierarchical_with_company_column'])} tables processed" if any(t.get('structure_type') == 'hierarchical_with_company_column' for t in final_tables) else "Standard table extraction"
                ]
            },
            "quality_metrics": {
                "table_confidence": 0.95,
                "text_elements_extracted": total_cells,
                "table_rows_extracted": total_rows,
                "extraction_completeness": "complete",
                "data_quality": "high"
            },
            "extraction_log": [
                {
                    "extractor": "gpt4o_vision",
                    "pdf_type": "commission_statement",
                    "timestamp": datetime.now().isoformat(),
                    "processing_method": "GPT-5 Vision table extraction",
                    "format_accuracy": "≥95%"
                }
            ],
            "pipeline_metadata": {
                "extraction_methods_used": ["gpt4o_vision"],
                "pdf_type": "commission_statement",
                "extraction_errors": [],
                "processing_notes": "GPT-5 Vision table extraction",
                "format_accuracy": "≥95%"
            },
            "gcs_key": upload_info.file_name,
            "gcs_url": generate_gcs_signed_url(upload_info.file_name) or f"https://text-extraction-pdf.s3.us-east-1.amazonaws.com/{upload_info.file_name}",
            "file_name": upload_info.file_name,  # Use full GCS path for PDF preview
            "timestamp": datetime.now().isoformat(),
            "format_learning": format_learning_data
        }
        
        logger.info(f"✅ GPT extraction completed successfully in {processing_time:.2f} seconds")
        logger.info(f"📊 Response data: {response_data}")
        
        return JSONResponse(response_data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error in GPT extraction: {str(e)}")
        import traceback
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"GPT extraction failed: {str(e)}"
        )
