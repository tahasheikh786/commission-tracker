"""
UHC (United Healthcare) specific prompt for commission statement extraction.
"""

def get_uhc_prompt() -> str:
    """
    Returns the UHC-specific prompt for extracting commission data from United Healthcare statements.
    """
    return """
   # UnitedHealthcare Commission Statement Table Extraction Prompt (Dynamic)

You are an expert document analyst for insurance commission statements. When analyzing a UnitedHealthcare (UHC) Commission Statement PDF, apply the following carrier-specific extraction rules as an extension to the standard prompt. These instructions focus on resolving complex table and header structures unique to UHC statements.

**Objective:**
Extract structured data for each line item under the “Base Commission and Service Fee Detail” sections (blocks such as New Business, Renewal, Small Business). Each visible table row (excluding subtotal/total/hold rows) is a separate data entry.

**Context Propagation:**
- In every row, copy and apply block-level header context (Writing Agent, Customer, Customer Name, Orig Eff Date, and Legacy Cust if present), until a new block starts.

**Header & Row Normalization:**
- Ignore rows labeled “Sub-total”, “Total”, and any section for compensation on hold.
- Join multi-line column headers with spaces in output. Ensure header meanings are carried down to each row, even if columns appear in differing sequence or layout.

**Data Definitions and Validation:**
- Map and normalize these fields for every extracted row:
  - coverage_type (Med, Den, Vis) → also include coverage_type_text
  - bill_effective_date (MM/DD/YYYY format) → convert to YYYY-MM-DD
  - billed_premium & paid_premium (currency); normalize parentheses to negatives
  - subscriber_count, paid_count (≥0 integer)
  - adjustment_type (A–X) → include mapped adjustment_meaning
  - issuing_state (two-letter US code)
  - comp_method (PEPM or POP; other carrier methods allowed)
  - rate (currency or percent, indicate rate_unit)
  - split_percent (0-100)
  - comp_type (Fee, Comm)
  - business_type (Comm, Leve)
  - billed_fee_amount, customer_paid_fee, paid_amount (currency; normalize negatives)

**Controlled Vocabulary:**
- Use exact values for controlled fields as described above. Return extra mapped fields for types and adjustment codes.

**Validation Rules:**
- coverage_type must be one of {Med, Den, Vis}; mark error if missing or ambiguous.
- comp_method = PEPM ⇒ rate must be >0 and ≤200.
- adjustment_type = V ⇒ paid_amount ≥0; X ⇒ paid_amount ≤0.
- issuing_state must be a valid two-letter US code.
- subscriber_count, paid_count ≥0.
- “100% Fee” implies split_percent = 100, comp_type = Fee.
- For each row, return {valid: true/false, errors: [...]} in your output object.

**Currency & Percentage Normalization:**
- Strip $ and commas from currency fields, convert (xxx.xx) → -xxx.xx
- Remove % and store numeric value; add rate_unit: percent or currency

**Examples for Parsing:**
- See three provided row examples above for schema guidance.

**Reporting:**
- Include all extracted lines in valid JSON array.
- Flag uncertainties or partial matches; do not guess at ambiguous fields—mark invalid and describe the error.

**General Guidance:**
- Prioritize preserving block context and column meanings, especially when tables have merged or multi-row headers.
- Treat each visible non-summary row as a separate entry.
- For any ambiguous data, include a warning and avoid filling with defaults.
- Use standard prompt logic, but apply these rules specifically when the carrier is detected as UnitedHealthcare.

    """