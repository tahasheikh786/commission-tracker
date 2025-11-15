"""
UNIFIED EXTRACTION RULES - SINGLE SOURCE OF TRUTH

This module consolidates ALL extraction rules into a single, organized hierarchy.
Previously split across 3 separate files:
- carrier_extraction_rules.py (17.4K chars)
- total_amount_extraction_rules.py (12K chars)  
- summary_row_filtering_rules.py (10.2K chars)

Now unified here for easier maintenance, consistent versioning, and cleaner imports.

Usage:
    from .extraction_rules import ExtractionRules
    
    # Access carrier rules
    carrier_xml = ExtractionRules.Carrier.get_xml_format()
    
    # Access amount rules
    amount_strategy = ExtractionRules.Amount.get_extraction_strategy()
    
    # Access filtering rules
    keywords = ExtractionRules.Filtering.get_skip_keywords()
"""


class ExtractionRules:
    """
    Unified extraction rules - single source of truth for all extraction requirements.
    
    Organized as nested classes for clarity:
    - Carrier: Insurance carrier extraction rules
    - Amount: Total amount extraction rules
    - Filtering: Summary row filtering rules
    """
    
    class Carrier:
        """
        Carrier extraction rules - determines which insurance company issued the statement.
        
        Critical for preventing duplicate carrier entries in the database.
        """
        
        @staticmethod
        def get_critical_requirements() -> str:
            """
            CRITICAL carrier extraction requirements.
            Applied to ALL extraction pipelines to ensure consistent carrier names.
            
            Returns:
                Comprehensive extraction instructions for Claude
            """
            return """
## CARRIER EXTRACTION - CRITICAL REQUIREMENTS ⚠️

### Definition
Extract the insurance company (carrier) that ISSUED this commission statement.
This is the company PROVIDING the insurance coverage (NOT the broker/agent receiving payment).

### NEW PRIORITY: Full Name First, Logo Second

**CRITICAL CHANGE - READ CAREFULLY:**

1. **FIRST: Search for FULL company name in document text**
   - Look in headers, footers, copyright text, "Prepared by:", document titles
   - Full names are often in text even if logo shows abbreviation
   - Example: Logo might show "Allied" but footer shows "Allied Benefit Systems"
   
2. **SECOND: If full name not found, check logo**
   - Use logo as backup only
   - If logo shows abbreviated name (e.g., "Allied"), search ENTIRE document for full name
   
3. **VALIDATION: Check against known carriers**
   - If extracted name is unusually short (1-2 words), scan document for longer version
   - Known carriers: UnitedHealthcare, Blue Cross Blue Shield, Allied Benefit Systems, Aetna, Cigna, Humana

**Example Decision Process:**
```
Document Analysis:
- Logo (top): "Allied" (abbreviated)
- Footer text: "Allied Benefit Systems" (full name)
- Copyright: "© 2024 Allied Benefit Systems, LLC"

Decision: Extract "Allied Benefit Systems" (from footer/copyright)
✅ Reason: Full name takes priority over logo abbreviation
```

**NEW RULE: If Logo Shows Abbreviation**

If the logo/header shows what appears to be an abbreviated name:
1. Scan the entire first page for a longer version of the name
2. Check footers on all pages
3. Look for copyright statements
4. If found, use the FULL name, not the abbreviation

Example:
- Logo: "Allied" → Search document → Find "Allied Benefit Systems" → Extract "Allied Benefit Systems"

### Where to Look (Priority Order) 🎯

**1. DOCUMENT HEADER/FOOTER TEXT (Top priority)**
- Look for FULL company name in text (not just logos)
- Common locations: "Prepared by:", "This statement from:", copyright text
- **WEIGHT: 0.95-0.98 confidence if full name found in text**

**2. HEADER LOGO AREA (Secondary priority)**
- Company logos and branding (top 20% of first page)
- **WARNING:** Logos often show abbreviated names
- **ACTION:** If logo appears abbreviated, search document for full name
- **WEIGHT: 0.90-0.95 confidence if logo only**

**3. FOOTER BRANDING (Tertiary priority)**
- Company logo/name in footer (bottom 15% of pages)
- Copyright statements often contain full legal name
- **WEIGHT: 0.90-0.95 confidence**

**4. BODY TEXT (Fallback)**
- Carrier mentioned in document body
- **WEIGHT: 0.70-0.85 confidence**

### Extraction Rules - CHARACTER-LEVEL PRECISION ✅

**✅ DO THIS:**
1. Extract EXACTLY as written, character-for-character
2. Preserve spacing, capitalization, punctuation PRECISELY
3. Stop at natural text boundaries (whitespace, punctuation, visual separation)
4. Verify EACH character against source image
5. Use the MOST PROMINENT occurrence (header/logo trumps body text)

**❌ NEVER DO THIS (CRITICAL - THESE CAUSE DUPLICATE CARRIERS):**
1. ❌ Add abbreviations (e.g., don't add "(ABSF)" unless visible in source)
2. ❌ Remove text or condense spacing
3. ❌ Add legal entity designations (e.g., don't add "LLC" unless shown)
4. ❌ Standardize or normalize names (keep "UnitedHealthcare" not "United Healthcare")
5. ❌ Add clarifying notes or context
6. ❌ Infer full name from abbreviations
7. ❌ Extract from table data columns (columns show CLIENT names, not carrier)
8. ❌ Use current date or default carrier name
9. ❌ Modify capitalization or spacing for consistency
10. ❌ Add punctuation that isn't visible

### Verification Checklist (MANDATORY BEFORE RETURNING) ✓

Before returning carrier name, answer these questions:

**Q1: Is every character I extracted present in the source image?**
   - Answer: YES/NO
   - If NO → RE-EXTRACT from source

**Q2: Did I add ANY characters not visible?**
   - Answer: YES/NO  
   - If YES → REMOVE added characters, RE-EXTRACT

**Q3: Does spacing/capitalization match exactly?**
   - Answer: YES/NO
   - If NO → RE-EXTRACT with exact spacing/caps

**Q4: Did I extract from header/logo area (not table data)?**
   - Answer: YES/NO
   - If NO → Search header/logo area first

**If ANY answer is wrong → RE-EXTRACT from source following rules above**

### Confidence Scoring Methodology 📊

Calculate confidence based on:

**Location Weight (Primary Factor):**
- Header logo (top 20%): +0.15 points (most reliable)
- Footer logo (bottom 15%): +0.10 points
- Document title: +0.10 points
- Body text: +0.05 points

**Clarity Weight:**
- Crystal clear text, no OCR artifacts: +0.10 points
- Slightly unclear (minor OCR artifacts): +0.05 points
- Ambiguous or degraded text: +0.00 points

**Uniqueness Weight:**
- Only one carrier mentioned: +0.05 points
- Multiple carriers mentioned: +0.00 points

**Prominence Weight:**
- Large, prominent branding: +0.05 points
- Small or secondary mention: +0.00 points

**Formula:**
```
Base: 0.80
+ Location Weight (0.00-0.15)
+ Clarity Weight (0.00-0.10)
+ Uniqueness Weight (0.00-0.05)
+ Prominence Weight (0.00-0.05)
= Raw Score

Final Score = min(Raw Score, 0.98)  # Cap at 0.98, never claim 100% certainty
```

**Examples:**
- Logo in header, crystal clear, only carrier: 0.80 + 0.15 + 0.10 + 0.05 + 0.05 = 1.15 → **Capped at 0.98**
- Logo in header, slightly unclear: 0.80 + 0.15 + 0.05 = 1.00 → **Capped at 0.95**
- In document title, multiple carriers: 0.80 + 0.10 + 0.00 = 0.90 → **0.90**
- Body text only, clear: 0.80 + 0.05 + 0.10 = 0.95 → **0.85** (reduce for non-prominent location)

### Output Format 📤

Return in this exact format:

```json
{
  "carrier_name": "Exact text as shown in source",
  "carrier_confidence": 0.95,
  "evidence": "Header logo area, page 1, top 20%, prominent branding",
  "location": "header_logo",
  "confidence_calculation": "base_0.80 + location_0.15 + clarity_0.10 = 0.98 (capped)"
}
```

### Critical Reminder 🔴

**WHY THIS MATTERS:**
- Inconsistent carrier names create DUPLICATE database entries
- "Allied Benefit Systems" ≠ "Allied Benefit Systems (ABSF)"
- Database treats these as TWO different carriers
- Breaks reporting, analytics, and automated approval systems
- Character-level precision is MANDATORY, not optional

**THIS IS THE #1 CAUSE OF DATA QUALITY ISSUES IN PRODUCTION**
"""
        
        @staticmethod
        def get_xml_format() -> str:
            """
            Get the carrier extraction rules in XML format (for Claude-specific prompts).
            
            Some prompts use XML structure per Anthropic best practices.
            This provides the same rules in XML format for those prompts.
            
            Returns:
                XML-formatted carrier extraction rules
            """
            return """
<carrier_name_extraction>
  <objective>
    Identify the insurance carrier (company) that issued this commission statement
  </objective>
  
  <search_locations priority="sequential">
    <location priority="1">
      <name>Header Logo Area</name>
      <description>Top 20% of first page - look for company logos and branding</description>
      <visual_cues>Large text, distinctive branding, company letterhead</visual_cues>
      <confidence_weight>0.95-0.98</confidence_weight>
    </location>
    
    <location priority="2">
      <name>Footer Branding</name>
      <description>Bottom 15% of any page - footer logos and company names</description>
      <confidence_weight>0.90-0.95</confidence_weight>
    </location>
    
    <location priority="3">
      <name>Document Title/Header</name>
      <description>Main heading or title of document</description>
      <confidence_weight>0.85-0.90</confidence_weight>
    </location>
  </search_locations>
  
  <extraction_protocol>
    <critical_rule id="exact_text">
      Extract the carrier name EXACTLY as it appears character-for-character.
      This is CRITICAL for preventing duplicate carrier entries.
    </critical_rule>
    
    <step number="1">
      <action>Visually locate the carrier name in priority order above</action>
    </step>
    
    <step number="2">
      <action>Read the text character-by-character as displayed</action>
      <examples>
        <correct>
          Document shows: "Allied Benefit Systems"
          Extract: "Allied Benefit Systems"
        </correct>
        <incorrect>
          Document shows: "Allied Benefit Systems"  
          Extract: "Allied Benefit Systems (ABSF)" ❌ WRONG - abbreviation added
        </incorrect>
        <incorrect>
          Document shows: "UnitedHealthcare"
          Extract: "United Healthcare" ❌ WRONG - spacing modified
        </incorrect>
      </examples>
    </step>
    
    <step number="3">
      <action>Stop extraction at natural text boundary</action>
      <boundaries>
        - End of line
        - Whitespace/line break
        - Period or other sentence-ending punctuation
        - Visual separation from other text
      </boundaries>
    </step>
    
    <step number="4">
      <action>Verify extraction against source</action>
      <verification_questions>
        Q1: Is every character I extracted present in the source image? (Yes/No)
        Q2: Did I add ANY characters not visible in the source? (Yes/No)  
        Q3: Does the spacing and capitalization match exactly? (Yes/No)
        
        If ANY answer is wrong → Re-extract from source
      </verification_questions>
    </step>
  </extraction_protocol>
  
  <forbidden_actions>
    <do_not>Add abbreviations in parentheses (e.g., "(ABSF)", "(UHC)")</do_not>
    <do_not>Add legal entity designations unless visible (e.g., "LLC", "Inc.")</do_not>
    <do_not>Standardize or normalize carrier names</do_not>
    <do_not>Add clarifying text or context</do_not>
    <do_not>Infer full name from abbreviation</do_not>
    <do_not>Extract carrier name from table data columns</do_not>
    <do_not>Modify spacing or capitalization</do_not>
    <do_not>Use current date or default carrier</do_not>
  </forbidden_actions>
  
  <confidence_scoring>
    <formula>
      Base: 0.80
      + Location Weight (0.00-0.15)
      + Clarity Weight (0.00-0.10)
      + Uniqueness Weight (0.00-0.05)
      = Final Score (capped at 0.98)
    </formula>
    
    <location_weights>
      <header_logo>0.15</header_logo>
      <footer_logo>0.10</footer_logo>
      <document_title>0.10</document_title>
      <body_text>0.05</body_text>
    </location_weights>
    
    <clarity_weights>
      <crystal_clear>0.10</crystal_clear>
      <slightly_unclear>0.05</slightly_unclear>
      <ambiguous>0.00</ambiguous>
    </clarity_weights>
  </confidence_scoring>
  
  <output_format>
    {
      "carrier_name": "Exact text as shown",
      "carrier_confidence": 0.95,
      "evidence": "Found in header logo area, page 1, top-left",
      "confidence_calculation": "base_0.80 + header_0.15 = 0.95"
    }
  </output_format>
</carrier_name_extraction>
"""
    
    class Amount:
        """
        Total amount extraction rules - finds the total commission amount on the statement.
        
        Critical for payment reconciliation.
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
    
    class Filtering:
        """
        Summary row filtering rules - identifies and excludes summary/total/metadata rows.
        
        Applied to groups_and_companies extraction to ensure only actual groups are included.
        """
        
        @staticmethod
        def get_skip_keywords() -> list:
            """
            Keywords that indicate a summary/total/metadata row.
            
            These rows should be EXCLUDED from groups_and_companies extraction.
            
            Returns:
                List of lowercase keywords to check against group names/numbers
            """
            return [
                # Total/Summary rows
                'total for group',
                'total for vendor',
                'total compensation',
                'grand total',
                'subtotal',
                'total',  # General catch-all
                'summary',
                
                # Agent metadata rows
                'writing agent name',
                'writing agent number',
                'writing agent 1 name',
                'writing agent 1 number',
                'writing agent 2 name',
                'writing agent 2 number',
                'agent 2 name',
                'agent 2 number',
                'agent name:',
                'agent number:',
                'producer name:',
                'producer number:',
                
                # Empty/placeholder indicators
                '—',  # Em dash used as placeholder
                '-',  # Hyphen used as placeholder
                'n/a',
                'na',
                'none',
                'blank',
            ]
        
        @staticmethod
        def get_prompt_instructions() -> str:
            """
            Instructions for Claude to mark summary rows during extraction.
            
            NEW APPROACH: Extract all rows, mark summaries for later filtering.
            This is safer than having Claude skip rows during extraction.
            
            Returns:
                Detailed marking instructions for Claude
            """
            return """
**📋 SUMMARY ROW IDENTIFICATION (Not Filtering)**

**NEW APPROACH: Extract All, Mark Summaries**

Do NOT skip summary rows during extraction. Instead:

1. **Extract ALL rows** (including summaries)
2. **Mark summary rows** with `"is_summary": true` in the row object
3. **Let Python code filter** them later in post-processing

**How to Identify Summary Rows:**

A row is a summary if ANY of these conditions are true:

1. **Text-based indicators:**
   - Group Number contains: "Total", "Subtotal", "Grand Total", "Total for Group"
   - Group Name contains: "Total", "Summary", "Grand Total", "Combined"
   - Row represents aggregate of multiple groups (not a single group)

2. **Visual indicators:**
   - Row is clearly a total/subtotal line (bold, different font, separator line above/below)
   - Row has different background color or styling than data rows
   - Row appears at the bottom of a table or section

3. **🔴 CRITICAL: Empty column indicators (Most commonly missed!):**
   - Group Number is **BLANK/EMPTY** but amount column has a large value
   - Group Name is **BLANK/EMPTY** but amount column has a large value
   - First 2-3 columns are blank, but the last column (amount) has a value
   - **This is the GRAND TOTAL row pattern - DO NOT MISS THIS!**

4. **Position-based indicators:**
   - Last row in the table with empty group columns but non-zero amount
   - Row immediately after a section of similar groups

**Output Format Examples:**

**Example 1: Text-based summary row**
```json
{
  "tables": [
    {
      "headers": ["Group No.", "Group Name", "Paid Amount"],
      "rows": [
        {
          "data": ["L001", "Company A", "$100.00"],
          "is_summary": false
        },
        {
          "data": ["L002", "Company B", "$200.00"],
          "is_summary": false
        },
        {
          "data": ["Total for Group:", "Company A + B", "$300.00"],
          "is_summary": true   ← Mark as summary (has "Total" text)
        }
      ]
    }
  ]
}
```

**Example 2: 🔴 GRAND TOTAL with empty columns (Most Common!)**
```json
{
  "tables": [
    {
      "headers": ["Group No.", "Group Name", "Billing Period", "Paid Amount"],
      "rows": [
        {
          "data": ["L001", "Company A", "1/1/2025", "$1,234.56"],
          "is_summary": false
        },
        {
          "data": ["L002", "Company B", "1/1/2025", "$2,345.67"],
          "is_summary": false
        },
        {
          "data": ["L003", "Company C", "1/1/2025", "$890.12"],
          "is_summary": false
        },
        {
          "data": ["", "", "", "$4,470.35"],
          "is_summary": true   ← Mark as summary (empty group columns, last row, matches sum)
        }
      ]
    }
  ]
}
```

**Key Point:** If the last row has blank Group No. and Group Name but has a value in the amount column, it's ALWAYS a grand total summary row!

**Why This Approach?**

- **Safer:** Ensures no data rows are accidentally skipped
- **Traceable:** We can see what was filtered and why
- **Reversible:** Can include summaries later if needed
- **Simpler:** Claude doesn't need to make filtering decisions

**Key Point:** Your job is to extract ALL rows accurately. Python code will handle filtering summaries based on the `is_summary` flag.
"""
        
        @staticmethod
        def should_filter_row(group_name: str, group_number: str) -> bool:
            """
            Determine if a row should be filtered (excluded).
            
            This implements the filtering logic for Python post-processing.
            
            Args:
                group_name: The group/company name
                group_number: The group identifier/number
                
            Returns:
                True if row should be EXCLUDED (is a summary/metadata row)
                False if row should be INCLUDED (is an actual group)
            """
            # Convert to lowercase for case-insensitive matching
            name_lower = str(group_name).strip().lower()
            number_lower = str(group_number).strip().lower()
            
            # Skip if group name is empty
            if not name_lower:
                return True  # EXCLUDE
            
            # Get skip keywords
            skip_keywords = ExtractionRules.Filtering.get_skip_keywords()
            
            # Check if group name contains any skip keyword
            if any(keyword in name_lower for keyword in skip_keywords):
                return True  # EXCLUDE
            
            # Check if group name STARTS with "total" or "summary"
            if name_lower.startswith('total') or name_lower.startswith('summary'):
                return True  # EXCLUDE
            
            # CRITICAL: Also check group number for skip keywords
            # Summary rows often have "Total for Group:" in the group_number field
            if number_lower:
                if any(keyword in number_lower for keyword in skip_keywords):
                    return True  # EXCLUDE
                
                if number_lower.startswith('total') or number_lower.startswith('summary'):
                    return True  # EXCLUDE
            
            # Check if group number is missing or invalid
            if not number_lower or number_lower in ['—', '-', 'n/a', 'na', 'none', '']:
                return True  # EXCLUDE
            
            # If all checks passed, this is a legitimate group
            return False  # INCLUDE
        
        @staticmethod
        def filter_groups(groups: list) -> tuple:
            """
            Filter a list of groups to remove summary/metadata rows.
            
            Args:
                groups: List of group dictionaries with 'group_name' and 'group_number' keys
                
            Returns:
                Tuple of (filtered_groups, excluded_groups)
                - filtered_groups: List of valid groups
                - excluded_groups: List of excluded groups (for debugging)
            """
            if not groups:
                return [], []
            
            filtered_groups = []
            excluded_groups = []
            
            for group in groups:
                group_name = group.get('group_name', '')
                group_number = group.get('group_number', '')
                
                if ExtractionRules.Filtering.should_filter_row(group_name, group_number):
                    excluded_groups.append({
                        'group_number': group_number,
                        'group_name': group_name,
                        'reason': 'Summary/metadata row detected'
                    })
                else:
                    filtered_groups.append(group)
            
            return filtered_groups, excluded_groups
        
        @staticmethod
        def get_xml_format() -> str:
            """
            Get summary row filtering rules in XML format.
            
            For prompts using XML structure per Anthropic best practices.
            
            Returns:
                XML-formatted filtering instructions
            """
            return """
<summary_row_filtering>
  <objective>
    Exclude summary, total, and metadata rows from groups_and_companies extraction
  </objective>
  
  <rows_to_exclude>
    <category name="summary_totals">
      <description>Rows that aggregate multiple groups</description>
      <keywords>
        - "Total for Group"
        - "Total for Vendor"
        - "Total Compensation"
        - "Grand Total"
        - "Subtotal"
        - Rows starting with "Total" or "Summary"
      </keywords>
      <check_fields>
        Check BOTH group_name AND group_number fields
      </check_fields>
    </category>
    
    <category name="agent_metadata">
      <description>Rows containing agent information labels</description>
      <keywords>
        - "Writing Agent Name:"
        - "Writing Agent Number:"
        - "Agent 2 Name:"
        - "Agent 2 Number:"
        - "Producer Name:"
        - "Producer Number:"
      </keywords>
    </category>
    
    <category name="invalid_identifiers">
      <description>Rows without valid group numbers</description>
      <invalid_values>
        - Empty/blank
        - "—" (em dash)
        - "-" (hyphen)
        - "n/a" or "N/A"
        - "None"
      </invalid_values>
    </category>
  </rows_to_exclude>
  
  <rows_to_include>
    <criteria>
      <requirement>Valid, unique Group Number (e.g., "L242393", "1653402")</requirement>
      <requirement>Actual business/client name (not summary marker)</requirement>
      <requirement>Individual commission data for specific group</requirement>
      <requirement>Represents SINGLE client (not sum of multiple)</requirement>
    </criteria>
  </rows_to_include>
  
  <validation_checklist>
    Before including a row, verify:
    1. Has valid, unique Group Number? (not blank, not "—")
    2. Has actual company/client name? (not "Total", not "Summary")
    3. Group Number does NOT contain summary keywords?
    4. Group Name does NOT contain summary keywords?
    5. Shows individual commission data? (not aggregated)
    6. NOT an agent metadata row?
    
    If ALL YES → INCLUDE
    If ANY NO → EXCLUDE
  </validation_checklist>
  
  <examples>
    <exclude>
      <case>Group Number: "Total for Group:", Group Name: "SOAR LOGISTICS" → Summary row</case>
      <case>Group Number: "Writing Agent Name:", Group Name: "JOHN DOE" → Metadata row</case>
      <case>Group Number: "—", Group Name: "Some Company" → Invalid identifier</case>
    </exclude>
    
    <include>
      <case>Group Number: "L242393", Group Name: "PATEL LOGISTICS IN" → Valid group</case>
      <case>Group Number: "1653402", Group Name: "B & B Lightning" → Valid group</case>
    </include>
  </examples>
</summary_row_filtering>
"""

