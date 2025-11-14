"""
UNIFIED TOTAL AMOUNT EXTRACTION RULES - SINGLE SOURCE OF TRUTH

This is the SINGLE SOURCE OF TRUTH for total amount extraction requirements.
Previously this logic was duplicated in:
- prompts.py::get_table_extraction_prompt() (150+ lines)
- enhanced_prompts.py::get_document_intelligence_extraction_prompt() (100+ lines)

Now centralized here to prevent inconsistencies and reduce maintenance burden.
"""


class TotalAmountExtractionRules:
    """
    Definitive total amount extraction rules used by all prompts.
    
    Centralizes:
    - Multi-level search strategy (summary → table footer → calculation)
    - Common label patterns
    - Extraction format rules
    - Validation requirements
    """
    
    @staticmethod
    def get_extraction_strategy() -> str:
        """
        Comprehensive total amount extraction strategy.
        
        This is the critical field for payment reconciliation - must be highly accurate.
        
        Returns:
            Complete extraction instructions for Claude
        """
        return """
## TOTAL AMOUNT EXTRACTION - UNIFIED STRATEGY 💰

### Priority Level: 🔴 HIGHEST
This field is CRITICAL for payment reconciliation. Accuracy is mandatory.

### Multi-Level Search Strategy (Execute in Order)

**LEVEL 1: Document Summary Section (CHECK FIRST) - PRIMARY**

📍 **Location:** Bottom 20% of last page, OR dedicated summary page

📋 **Common Labels to Search For:**
- "Total for Vendor" ← **HIGHEST PRIORITY** (common in Allied Benefit)
- "Total for Group"
- "Total Compensation"
- "Total Amount"
- "Total Commission"
- "Grand Total"
- "Net Payment"
- "EFT Amount"
- "Statement Total"
- "Amount Due"
- "Total Paid Amount"
- "Net Compensation"
- "Payment Amount"

🎯 **Visual Indicators:**
- Usually in BOLD or highlighted text
- Often in a separate summary box
- May be last row of main table
- Typically larger font or different styling
- Often has divider line above it

✅ **If found here:**
- Confidence: 0.95-0.98 (explicit vendor/broker total)
- This is the definitive amount
- Proceed to extraction format below


**LEVEL 2: Table Footer Rows (IF NO SUMMARY FOUND) - SECONDARY**

📍 **Location:** Last 3-5 rows of main commission table

🔍 **How to Identify:**
- Look for rows with "Total" or "Subtotal" keywords
- Usually has different formatting (bold, colored, bordered)
- Spans multiple columns or has merged cells
- Contains sum of column values

⚠️ **Validation Required:**
- Ensure it's a SUM row, not a data row
- Check that keyword is "Total" not a company name containing "total"
- Verify it's at the END of the table, not middle

✅ **If found here:**
- Confidence: 0.90-0.95 (table footer total)
- Use this as total amount
- Proceed to extraction format below


**LEVEL 3: Header Summary Box (TERTIARY FALLBACK)**

📍 **Location:** Top 30% of first page

📋 **Common Labels:**
- "Payment Amount"
- "Check Amount"
- "EFT Amount"
- "Total Commission"

✅ **If found here:**
- Confidence: 0.85-0.90 (header summary)
- Less preferred than footer total
- But still explicit and reliable


**LEVEL 4: Calculate from Data (LAST RESORT)**

📍 **Action:** If NO explicit total found anywhere, calculate manually

🧮 **Calculation Method:**
1. Locate the "Paid Amount" or "Commission" column in main table
2. SUM all data row values in that column
3. EXCLUDE summary/total rows (avoid double-counting)
4. EXCLUDE header rows
5. Return calculated sum

⚠️ **Return with:**
- Confidence: 0.70-0.75 (calculated, not explicit)
- Note: "Calculated from line items, no explicit total found"


### Extraction Format Rules 📐

**Rule 1: Numeric Value Only**
- Extract as: `1027.20` (numeric, decimal format)
- Remove: `$` symbol
- Remove: `,` commas
- Keep: `.` decimal point
- Keep: `-` for negative numbers (adjustments)

**Examples:**
```
Document shows: "$1,027.20"
Extract: 1027.20 ✅

Document shows: "Total: $3,604.95"
Extract: 3604.95 ✅

Document shows: "($168.00)" (negative/adjustment)
Extract: -168.00 ✅

Document shows: "$1,027"
Extract: 1027.00 ✅ (add .00 for consistency)
```

**Rule 2: Store Label Separately**
- Extract the exact label text used: "Total for Vendor"
- This helps with validation and debugging
- Store in: `total_amount_label` field

**Rule 3: Confidence Scoring**
```
If explicit total found in summary: 0.95-0.98
If explicit total in table footer: 0.90-0.95
If explicit total in header: 0.85-0.90
If calculated from line items: 0.70-0.75
If uncertain or ambiguous: 0.50-0.70
```

**Rule 4: Calculation Method**
- Document HOW you found the total
- Options:
  - "extracted_summary" - Found in document summary section
  - "extracted_footer" - Found in table footer row
  - "extracted_header" - Found in header summary box
  - "calculated_sum" - Manually calculated from line items
  - "inferred" - Best guess from available data


### Validation & Cross-Checking ✓

**Validation Rule 1: Reasonableness Check**
- Total should be > $0 if document has commission data
- If document shows activity but total is $0.00, flag for review
- If total is negative, check for adjustment/correction statement

**Validation Rule 2: Sum Verification (If possible)**
- If you can see line items, verify total matches their sum
- If mismatch > 1% of total, flag discrepancy
- Example: Line items sum to $3,600 but total says $3,605 → investigate

**Validation Rule 3: Multiple Totals**
- If document has MULTIPLE "total" rows:
  - Use the HIGHEST level total (vendor/broker level)
  - NOT group-level subtotals
  - NOT sub-agent totals
- Example hierarchy:
  ```
  Total for Group A: $1,000 (subtotal - don't use)
  Total for Group B: $2,000 (subtotal - don't use)
  Total for Vendor: $3,000 (USE THIS - top level)
  ```

**Validation Rule 4: Label Context**
- "Total for Vendor" > "Total for Group" (use vendor)
- "Grand Total" > "Subtotal" (use grand total)
- "Net Payment" often = "Total Commission" (verify context)


### Output Format 📤

Return in this exact structure:

```json
{
  "total_amount": 3604.95,
  "total_amount_label": "Total for Vendor",
  "total_amount_confidence": 0.95,
  "total_calculation_method": "extracted_summary",
  "evidence": "Found in summary section at bottom of page 7, labeled 'Total for Vendor: $3,604.95'",
  "validation_notes": "Sum of line items ($3,604.95) matches total ✓"
}
```

### Common Patterns by Carrier 📋

**Allied Benefit Systems:**
- Always uses "Total for Vendor" label
- Located at bottom of last page
- Usually after "Total for Group" subtotals
- Format: "Total for Vendor $X,XXX.XX" or "Total for Vendor: → $X,XXX.XX"

**UnitedHealthcare:**
- Uses "Net Payment" or "Total Compensation"
- May be in header summary box
- Format: "Net Payment: $X,XXX.XX"

**Aetna:**
- Uses "Total Commission" or "Statement Total"
- Located in table footer
- Format: "Total Commission $X,XXX.XX"

**Generic/Unknown Carriers:**
- Search all levels in priority order
- Don't assume label format
- Use visual cues (bold, borders) to find totals


### Error Prevention 🚫

**Common Mistakes to AVOID:**

❌ **Mistake 1: Extracting Group Subtotal Instead of Vendor Total**
```
Document shows:
  Total for Group A: $1,027.20
  Total for Group B: $2,577.75
  Total for Vendor: $3,604.95  ← USE THIS

Wrong: Extracting $1,027.20
Right: Extracting $3,604.95 ✅
```

❌ **Mistake 2: Including $ and Commas**
```
Wrong: "$3,604.95"
Right: 3604.95 ✅
```

❌ **Mistake 3: Extracting from Table Data**
```
Table has "Paid Amount" column with values: $100, $200, $300
Wrong: Extracting $100 (first row)
Right: Calculate sum ($600) OR find explicit "Total" row ✅
```

❌ **Mistake 4: Using Current Date Total**
```
Document is multi-period with breakdown by date
Wrong: Using just one period's subtotal
Right: Find overall "Grand Total" or "Total for Vendor" ✅
```

### Special Cases 🔄

**Case 1: Zero Commission Statements**
- Some statements show $0.00 due to adjustments
- This is VALID, not an error
- Extract: 0.00
- Confidence: 0.95 (if explicit)
- Note: "Zero commission statement - likely adjustment period"

**Case 2: Negative Totals**
- Adjustment/correction statements may have negative totals
- Extract with minus sign: -168.00
- Confidence: 0.95 (if explicit)
- Note: "Negative total - adjustment statement"

**Case 3: Pending/Estimated Totals**
- Some statements show "Estimated" or "Pending" totals
- Extract the amount shown
- Confidence: 0.70-0.80 (pending)
- Note: "Total marked as estimated/pending"

**Case 4: Multi-Currency Statements**
- If statement shows multiple currencies, use the PRIMARY currency
- Usually indicated by "USD", "CAD", etc.
- Note the currency in evidence field
- Example: "Total: $3,604.95 USD"


### Critical Reminder 🔴

**WHY THIS MATTERS:**
- Total amount drives payment reconciliation
- Mismatches cause failed payment matching
- Discrepancies trigger manual review and delays
- Accuracy directly impacts broker payment timing
- This is the MOST IMPORTANT financial field to extract correctly

**If uncertain about which total to use:**
- Err on the side of HIGHEST-LEVEL total (vendor/broker level)
- Include evidence of what you found
- Note any discrepancies or ambiguities
- Better to flag for review than to extract wrong amount
"""

    @staticmethod
    def get_xml_format() -> str:
        """
        Get total amount extraction rules in XML format.
        
        For prompts using XML structure per Anthropic best practices.
        
        Returns:
            XML-formatted total amount extraction rules
        """
        return """
<total_amount_extraction>
  <priority>HIGHEST - This is critical for payment reconciliation</priority>
  
  <search_strategy priority="sequential">
    <search_area priority="1">
      <name>Document Summary Section</name>
      <location>Bottom 20% of last page, or dedicated summary page</location>
      <common_labels>
        - "Total for Vendor" (PRIORITY - common in Allied Benefit)
        - "Total for Group"  
        - "Total Compensation"
        - "Total Amount"
        - "Total Commission"
        - "Grand Total"
        - "Net Payment"
        - "EFT Amount"
        - "Statement Total"
      </common_labels>
      <confidence_if_found>0.95-0.98</confidence_if_found>
    </search_area>
    
    <search_area priority="2">
      <name>Table Footer Rows</name>
      <location>Last 3-5 rows of main commission table</location>
      <indicators>Row with "Total" keyword + dollar amount</indicators>
      <confidence_if_found>0.90-0.95</confidence_if_found>
    </search_area>
    
    <search_area priority="3">
      <name>Header Summary Box</name>
      <location>Top of document in summary box</location>
      <indicators>"Payment Amount", "Check Amount", "EFT Amount"</indicators>
      <confidence_if_found>0.85-0.90</confidence_if_found>
    </search_area>
    
    <search_area priority="4">
      <name>Calculate from Data</name>
      <method>Sum all "Paid Amount" column values, exclude summary rows</method>
      <confidence_if_calculated>0.70-0.75</confidence_if_calculated>
    </search_area>
  </search_strategy>
  
  <extraction_rules>
    <rule>Extract as numeric value only: 1027.20 (no $, no commas)</rule>
    <rule>Store the exact label found: "Total for Vendor"</rule>
    <rule>If multiple totals exist, use highest-level vendor/broker total</rule>
    <rule>If NO explicit total found, calculate by summing "Paid Amount" column</rule>
    <rule>For negative amounts (adjustments), include minus sign: -168.00</rule>
  </extraction_rules>
  
  <validation>
    <check>Total should be > $0 if document has commission data</check>
    <check>If possible, verify total matches sum of line items</check>
    <check>Use vendor-level total, not group-level subtotals</check>
  </validation>
  
  <output_format>
    {
      "total_amount": 1027.20,
      "total_amount_label": "Total for Vendor",
      "total_amount_confidence": 0.95,
      "total_calculation_method": "extracted_summary",
      "evidence": "Found in summary section, bottom of page 7"
    }
  </output_format>
</total_amount_extraction>
"""

