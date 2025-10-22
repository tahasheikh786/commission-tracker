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
  - Cov Type (Med, Den, Vis) → also include coverage_type_text
  - Bill Eff Date (MM/DD/YYYY format) → convert to YYYY-MM-DD
  - Billed Premium & Paid Premium (currency); normalize parentheses to negatives
  - Sub count (≥0 integer)
  - Adj Typ (A–X) → include mapped adjustment_meaning
  - Iss St (two-letter US code)
  - Method (PEPM or POP; other carrier methods allowed)
  - Rate (currency or percent, indicate rate_unit)
  - Split % (0-100)
  - Comp Type (Fee, Comm)
  - Bus Type (Comm, Leve)
  - Billed Fee Amount, Customer Paid Fee, Paid Amount (currency; normalize negatives)

  -So the Final table headers list is:
  - Cov Type
  - Bill Eff Date
  - Billed Premium (currency)
  - Paid Premium (currency)
  - Sub Count (≥0 integer)
  - Adj Typ (A–X)
  - Iss St (two-letter US code)
  - Method (PEPM or POP; other carrier methods allowed)
  - Rate (currency or percent, indicate rate_unit)
  - Split % (0-100)
  - Comp Type (Fee, Comm)
  - Bus Type (Comm, Leve)
  - Billed Fee Amount (currency)
  - Customer Paid Fee (currency)
  - Paid Amount (currency)

Make sure all these header have a seperate column and each column has its own value and no value merged into each other.

**Controlled Vocabulary:**
- Use exact values for controlled fields as described above. Return extra mapped fields for types and adjustment codes.

**Validation Rules:**
- Cov Type must be one of {Med, Den, Vis}; mark error if missing or ambiguous.
- Method = PEPM ⇒ rate must be >0 and ≤200.
- Adj Typ = V ⇒ Paid Amount ≥0; X ⇒ Paid Amount ≤0.
- Iss St must be a valid two-letter US code.
- Sub Count ≥0.
- “100% Fee” implies Split % = 100, Comp Type = Fee.
- For each row, return {valid: true/false, errors: [...]} in your output object.

**Currency & Percentage Normalization:**
- Strip $ and commas from currency fields, convert (xxx.xx) → -xxx.xx
- Remove % and store numeric value; add Rate Unit: percent or currency

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