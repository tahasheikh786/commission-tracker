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

### CRITICAL: CARRIER vs BROKER DISTINCTION

**UNDERSTAND THE DIFFERENCE (THIS IS ESSENTIAL):**

**CARRIER** = Insurance company that ISSUED the statement
- Shown in LOGO/company branding
- Example: Allied Benefit Systems, Aetna, Blue Cross Blue Shield, UnitedHealthcare, Cigna, Humana, breckpoint
- This is the insurance company providing coverage

**BROKER** = Agency/company RECEIVING the commissions  
- Shown near "Agent:", "Broker:", "Prepared For:", "Producer Name:" labels
- Example: Innovative BPS, ABC Insurance Agency
- This is the recipient of the statement

**🔴 NEVER CONFUSE THESE TWO ENTITIES 🔴**

### NEW PRIORITY: Logo First, Full Name Search Second

**CRITICAL CHANGE - READ CAREFULLY:**

1. **FIRST: Check LOGO AREA (Top 20% of first page) - HIGHEST PRIORITY**
   - Look for company logo with distinctive branding
   - Visual cues: Colorful graphics, wordmarks, distinctive design
   - Extract the exact text visible IN or ADJACENT to the logo
   - Example: If you see "breckpoint" logo with colorful branding → Extract "breckpoint"
   - **WEIGHT: 0.95-0.98 confidence**
   
2. **SECOND: If logo text appears abbreviated, search for full name**
   - Check footers (bottom 15% of all pages)
   - Check copyright statements
   - Look for full company name in footer branding
   - Example: Logo shows "Allied" → Search footers → Find "Allied Benefit Systems" → Extract "Allied Benefit Systems"
   
3. **THIRD: If no logo visible, check FOOTER BRANDING**
   - Bottom 15% of any page
   - Footer logos and full company names
   - Copyright statements often contain full legal name
   - **WEIGHT: 0.90-0.95 confidence**

4. **LAST RESORT: Document header TEXT (USE WITH EXTREME CAUTION)**
   - Only if NO logo found anywhere
   - **WARNING:** Headers often show BROKER name, not CARRIER name
   - Verify this is the insurance company, not the recipient agency
   - **WEIGHT: 0.70-0.85 confidence**

### Where to Look (Priority Order) 🎯

**1. LOGO AREA (HIGHEST PRIORITY for carrier identification)**
- Top 20% of first page - look for LOGO with company branding
- Logo shows the CARRIER (insurance company that issued the statement)
- Extract the exact text visible in/near the logo
- Visual indicators: Colorful branding, distinctive wordmark, company logo graphics
- If logo text appears abbreviated, search footers/copyright for full name
- **WEIGHT: 0.95-0.98 confidence**

**2. FOOTER/COPYRIGHT TEXT (Secondary priority)**
- Bottom 15% of any page - footer logos and company names
- Copyright statements often contain full legal name of carrier
- Example: "© 2024 Allied Benefit Systems, LLC"
- **WEIGHT: 0.90-0.95 confidence**

**3. DOCUMENT TITLE/HEADER TEXT (Tertiary - USE WITH EXTREME CAUTION)**
- Only if NO logo found anywhere
- **CRITICAL WARNING:** Headers often show BROKER name, not CARRIER name
- Verify this is the insurance company, not the recipient agency
- Labels like "Agent:", "Broker:", "Prepared For:", "Producer Name:" indicate the BROKER (recipient), NOT the carrier
- **WEIGHT: 0.70-0.85 confidence**

**4. BODY TEXT (Last resort fallback)**
- Carrier mentioned in document body
- **WEIGHT: 0.70-0.85 confidence**

### CRITICAL DISTINCTION RULES ⚠️

**Labels that indicate BROKER (not carrier):**
- "Agent:" → The company listed is the BROKER, not the carrier
- "Broker:" → The company listed is the BROKER, not the carrier
- "Prepared For:" → The company listed is the BROKER, not the carrier
- "Producer Name:" → The company listed is the BROKER, not the carrier
- "Agency:" → The company listed is the BROKER, not the carrier

**Where to find CARRIER:**
- Logo branding area (top 20% of first page) ← PRIMARY SOURCE
- Footer logos and company names ← SECONDARY SOURCE
- Copyright statements ← TERTIARY SOURCE

**Example Confusion to AVOID:**
```
Document has:
- Logo (top): "breckpoint" (with colorful logo) ← THIS IS THE CARRIER
- Header text: "Innovative BPS" near "Prepared For:" label ← THIS IS THE BROKER

CORRECT: Extract "breckpoint" (the carrier from logo)
WRONG: Extract "Innovative BPS" (this is the broker/recipient)
```

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
  
  <critical_distinction>
    <carrier>Insurance company that ISSUED the statement - shown in LOGO and company branding</carrier>
    <broker>Agency/company RECEIVING commissions - shown near "Agent", "Broker", "Prepared For" labels</broker>
    <warning>NEVER confuse carrier (issuer) with broker (recipient)</warning>
  </critical_distinction>
  
  <search_locations priority="sequential">
    <location priority="1">
      <name>Logo Area (HIGHEST PRIORITY)</name>
      <description>Top 20% of first page - look for company LOGO with distinctive branding</description>
      <visual_cues>
        - Colorful logo graphics
        - Company branding/wordmark
        - Distinctive visual identity
        - Usually largest branding element on page
      </visual_cues>
      <extraction_rule>Extract the exact text visible in or immediately adjacent to the logo</extraction_rule>
      <example>
        If you see "breckpoint" logo with colorful branding → Extract "breckpoint"
        If you see logo shows "Allied" → Search footers → Find "Allied Benefit Systems" → Extract "Allied Benefit Systems"
      </example>
      <confidence_weight>0.95-0.98</confidence_weight>
    </location>
    
    <location priority="2">
      <name>Footer Branding</name>
      <description>Bottom 15% of any page - footer logos and full company names</description>
      <extraction_rule>Look for full legal company name in copyright statements</extraction_rule>
      <example>© 2024 Allied Benefit Systems, LLC → Extract "Allied Benefit Systems"</example>
      <confidence_weight>0.90-0.95</confidence_weight>
    </location>
    
    <location priority="3">
      <name>Document Title/Header Text (USE WITH CAUTION)</name>
      <description>Main heading or title of document - ONLY if no logo found</description>
      <critical_warning>
        Headers often show BROKER name (recipient), not CARRIER name (issuer).
        Verify this is the insurance company, not the agency receiving commissions.
      </critical_warning>
      <broker_indicators>
        Labels that indicate BROKER (not carrier):
        - "Agent:" - company listed is the BROKER
        - "Broker:" - company listed is the BROKER
        - "Prepared For:" - company listed is the BROKER
        - "Producer Name:" - company listed is the BROKER
      </broker_indicators>
      <validation>
        If extracted name appears near "Agent:", "Broker:", "Prepared For:" labels,
        re-scan for the actual insurance carrier logo/branding
      </validation>
      <confidence_weight>0.70-0.85</confidence_weight>
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
        Enhanced with multi-stage intelligent detection based on textual, structural, 
        positional, and content pattern indicators.
        """
        
        @staticmethod
        def get_skip_keywords() -> list:
            """
            Keywords that indicate a summary/total/metadata row.
            
            These rows should be EXCLUDED from groups_and_companies extraction.
            
            🔴 CRITICAL: These are EXACT PHRASES that must match for exclusion.
            
            Returns:
                List of lowercase keywords to check against group names/numbers
            """
            return [
                # 🔴 HIGHEST PRIORITY - Exact phrase matches (from user's document)
                'total for group:',  # Most common summary pattern
                'total for vendor:',  # Grand total pattern
                'sub-total',
                'subtotal:',
                'grand total',
                'writing agent number:',
                'writing agent 2 no:',
                'writing agent name:',
                'writing agent 1 name:',
                'writing agent 1 number:',
                'writing agent 2 name:',
                'agent 2 name:',
                'agent 2 number:',
                'producer name:',
                'producer number:',
                
                # Total/Summary rows (secondary)
                'total for group',  # Without colon
                'total for vendor',  # Without colon
                'total compensation',
                'total',  # General catch-all (use carefully)
                'summary',
                'sum',
                'overall',
                'aggregate',
                'combined',
                'consolidated',
                'net total',
                'final',
                
                # Page/Section totals
                'page total',
                'section total',
                'department total',
                'agent total',
                'writing agent total',
                'group total',
                'vendor total',
                
                # Agent metadata rows (alternative formats)
                'agent name:',
                'agent number:',
                'agent:',
                'writing agent:',
                
                # Empty/placeholder indicators
                '—',  # Em dash used as placeholder
                '-',  # Hyphen used as placeholder (only if standalone)
                'n/a',
                'na',
                'none',
                'blank',
            ]
        
        @staticmethod
        def get_explicit_exclusion_patterns() -> list:
            """
            Get explicit regex patterns for EXACT phrase matching.
            
            These patterns match the EXACT phrases from the user's analysis document.
            They are more precise than keyword matching.
            
            Returns:
                List of compiled regex patterns for exclusion
            """
            import re
            return [
                re.compile(r'^Total for Group:\s*', re.IGNORECASE),
                re.compile(r'^Total for Vendor:\s*', re.IGNORECASE),
                re.compile(r'^Sub-?total:?\s*', re.IGNORECASE),
                re.compile(r'^Grand Total:?\s*', re.IGNORECASE),
                re.compile(r'^Writing Agent Number:\s*', re.IGNORECASE),
                re.compile(r'^Writing Agent 2 No:\s*', re.IGNORECASE),
                re.compile(r'^Writing Agent Name:\s*', re.IGNORECASE),
                re.compile(r'^Writing Agent 1 Name:\s*', re.IGNORECASE),
                re.compile(r'^Writing Agent 1 Number:\s*', re.IGNORECASE),
                re.compile(r'^Agent 2 Name:\s*', re.IGNORECASE),
                re.compile(r'^Agent 2 Number:\s*', re.IGNORECASE),
                re.compile(r'^Producer Name:\s*', re.IGNORECASE),
                re.compile(r'^Producer Number:\s*', re.IGNORECASE),
                # Pattern for detecting totals in company name field
                re.compile(r'^.*\s+Total$', re.IGNORECASE),
                re.compile(r'^Total\s+.*$', re.IGNORECASE),
            ]
        
        @staticmethod
        def get_context_aware_prompt_instructions() -> str:
            """
            Optimized 2025 prompt engineering instructions for summary detection.
            Uses hierarchical STOP logic with clear priorities.
            
            This returns the optimized hierarchical prompt structure with STOP at first match.
            """
            return """
<summary_detection>
  <approach>
  Use semantic understanding to classify rows as DATA or SUMMARY.
  Apply hierarchical priority rules (PRIORITY 1 → 2 → 3 → 4).
  STOP at first match. Do NOT continue to next rule if one matches.
  </approach>
  
  <priority_hierarchy>
    <priority_1 confidence="0.99">
      <name>Explicit Keywords with Colons</name>
      <rule>Check if FIRST COLUMN contains exact phrases WITH colons</rule>
      <keywords>
        - "Total for Group:"
        - "Total for Vendor:"
        - "Grand Total:"
        - "Subtotal:"
        - "Writing Agent Number:"
        - "Writing Agent Name:"
        - "Agent 2 Name:"
        - "Producer Name:"
      </keywords>
      <decision>If found → is_summary: true, confidence: 0.99 → STOP</decision>
    </priority_1>
    
    <priority_2 confidence="0.95">
      <name>Valid Group No + Company Name</name>
      <rule>Check if row has valid business identifiers (ALL THREE must be true)</rule>
      <conditions>
        1. Group No matches pattern: L##### or ##### (5-7 digits)
        2. Company Name populated (length > 2, actual text)
        3. Company Name does NOT contain summary keywords (unless LLC/INC/CORP)
      </conditions>
      <decision>If ALL THREE true → is_summary: false, confidence: 0.95 → STOP</decision>
      <special_cases>
        - Negative amounts WITH valid IDs = DATA ROW (adjustments)
        - Low census (1,2,3) WITH valid IDs = DATA ROW (small groups)
        - "Total" in business name WITH LLC/INC/CORP = DATA ROW
      </special_cases>
    </priority_2>
    
    <priority_3 confidence="0.90">
      <name>Empty Identifiers with Amount</name>
      <rule>Check if both key identifier columns are empty but amount present</rule>
      <conditions>
        1. Group No is empty OR only symbols (—, -, n/a)
        2. Company Name is empty OR only "Total"/"Summary"
        3. Amount column is populated with currency value
      </conditions>
      <decision>If ALL THREE true → is_summary: true, confidence: 0.90 → STOP</decision>
    </priority_3>
    
    <priority_4 confidence="0.40">
      <name>Default Fallback</name>
      <rule>If NO rules 1-3 matched</rule>
      <decision>is_summary: false (default to DATA ROW), confidence: 0.40</decision>
      <note>Should rarely happen. Flag for manual review.</note>
    </priority_4>
  </priority_hierarchy>
  
  <critical_reminders>
    ✅ Negative amounts = DATA (adjustments, not summaries)
    ✅ Low census (1,2,3) = DATA (small groups are real)
    ✅ Company name contains "Total" = DATA if has LLC/INC/CORP
    ❌ Do NOT use position (last row, first rows) as indicator
    ❌ Do NOT use amount size as indicator
    ❌ MUST STOP at first matching rule (don't continue evaluation)
  </critical_reminders>
  
  <validation_checklist>
    Before returning, verify for EVERY row:
    □ "data" field with array values?
    □ "is_summary" boolean?
    □ "summary_confidence" 0.0-1.0?
    □ "summary_reason" text?
    □ Rules applied in order 1→2→3→4?
    □ STOPPED at first match?
  </validation_checklist>
  
  <expected_results>
    Typical commission statement:
    - Data rows: ~85% (most rows)
    - Summary rows: ~15% (totals + metadata)
    
    ⚠️ WARNING: If > 20% marked as summaries, re-check rule application
  </expected_results>
</summary_detection>
"""
        
        @staticmethod
        def get_prompt_instructions() -> str:
            """
            Instructions for Claude to intelligently identify summary rows during extraction.
            
            COMPREHENSIVE MULTI-STAGE APPROACH: Extract all rows, mark summaries with confidence scores.
            Uses textual, structural, positional, and content pattern indicators.
            
            Returns:
                Comprehensive intelligent filtering instructions for Claude
            """
            return """
## 🎯 COMMISSION STATEMENT SUMMARY ROW REMOVAL SYSTEM

**CRITICAL: Extract ALL detail rows, but EXCLUDE all summary rows.**

Summary rows are aggregations, subtotals, totals, group rollups, or any row that represents a calculation rather than an actual transaction or commission record.

---

### Part 1: Identify Summary Row Indicators

A summary row typically exhibits ONE OR MORE of these characteristics:

#### 1. Textual Indicators (Check First Column/Name Column)

- Starts with keywords: "Total", "Subtotal", "Grand Total", "Summary", "Sum", "Overall", "Aggregate", "Combined", "Consolidated", "Net", "Final"
- Contains patterns like "Total for Group:", "Total for [NAME]:", "[NAME] Total"
- Contains "Page Total", "Section Total", "Department Total", "Agent Total", "Writing Agent Total", "Group Total", "Vendor Total"
- Reads as a label rather than a name (e.g., "TOTAL COMMISSIONS" vs "ABC COMPANY LLC")

#### 2. Structural Position Indicators

- Appears AFTER a continuous block of data rows from the same entity/group
- Positioned just before the next group begins
- Located near page boundaries (bottom of page, between page breaks)
- Appears at the end of a table section
- Has unusual indentation or spacing compared to detail rows
- Bordered/highlighted differently than detail rows

#### 3. Data Pattern Indicators

- First column contains numeric aggregate (not a company name)
- Row contains mostly EMPTY CELLS compared to detail rows
- Row has sparse data - only amounts/totals populated, company name missing
- Contains only 2-3 populated cells while detail rows have 8-12
- All numeric columns in this row are much LARGER than typical detail rows (likely sums)
- Contains BOLD or ITALICIZED text (visual formatting for emphasis)

#### 4. Content Pattern Indicators

- Row has repeated/duplicate values across columns
- Contains percentages that look like rollup calculations
- Shows running totals or cumulative amounts
- Census count is ZERO or very high compared to detail rows
- Invoice total equals sum of several rows above it
- Shows "0" or "-0" in certain columns (aggregate placeholders)

#### 5. Hierarchical Relationship Indicators

- Preceded by rows with the SAME company name (this row is their total)
- Preceded by rows with DIFFERENT company names under same agent/section (section total)
- Followed by a new company/agent (marks end of section)
- Indented further than detail rows (hierarchy marker)

#### 6. Format-Specific Indicators

- Lacks detailed employee/policy information
- Missing dates that are present in all detail rows
- Calculation-like values: "(1,234.56)" format indicating negative/adjustments
- Shows rates/percentages instead of actual commission amounts

---

### Part 2: Context Analysis Strategy

Before making decisions, understand the FULL CONTEXT:

#### Step 1: Analyze Document Structure
1. Count total rows in the table
2. Identify the "writing agent" or primary grouping level (if present)
3. Find logical sections (blocks of rows for same company, same agent, etc.)
4. Look for patterns in row counts (e.g., every 5-10 rows has a total row)
5. Identify visual/structural breaks that mark section boundaries

#### Step 2: Establish What's "Normal" for Detail Rows
1. Count populated columns in typical detail rows (benchmark)
2. Note typical row structure/format
3. Identify standard value ranges for amounts, census counts, rates
4. Document which columns are ALWAYS populated in detail rows

#### Step 3: Compare Suspect Rows to Normal Pattern
1. If row has significantly fewer populated cells → likely summary
2. If row values are much larger than the group above it → likely sum
3. If row structure doesn't match the detail row pattern → likely summary
4. If position suggests it's marking section end → likely summary

---

### Part 3: Carrier-Specific Patterns

Some carriers have unique summary row formats:

**Allied Benefit Systems (ABSF)**
- Summary rows often say "Total for Group: [GROUP NAME]"
- May show in separate row with same company name but marked "TOTAL"
- Look for "Total for Vendor" patterns
- Often has negative numbers in parentheses for adjustments

**UnitedHealthcare (UHC)**
- Summary rows marked with "Subtotal:" in first column
- May have writing agent summaries
- Page totals often present at bottom
- Look for "Summary" keyword in first column

**Cigna**
- Summary rows may use "NET" keyword
- Look for "Total Commission" patterns
- Often indented for hierarchy

**Generic/Unknown Carriers**
- "Total" is most common keyword
- Look for position-based indicators (end of group)
- Analyze numeric pattern - sums are always larger than individuals

---

### Part 4: The Intelligent Filtering Algorithm

For each row, ask these questions IN THIS ORDER:

**Question 1: Is this a text summary label?**
- IF first_column contains ["total", "subtotal", "summary", "grand", "net", "final", "overall"]
- AND NOT contains company-like names (all caps company suffixes: LLC, INC, LP, CORP)
- THEN → REMOVE (it's a summary)

**Question 2: Is this a structural summary marker?**
- IF (position_in_section == "last" AND previous_rows_same_company > 0)
- OR (structure matches "Total for Group: [name]" pattern)
- OR (preceded by 5+ rows of same company AND this row has different structure)
- THEN → REMOVE (it's a section total)

**Question 3: Is this an aggregate by size?**
- IF (total_populated_cells < 4 AND (numeric_columns < detail_row_avg OR numeric_values >> detail_row_avg_values))
- THEN → REMOVE (it's an aggregate)

**Question 4: Is this a position-based aggregate?**
- IF (row appears at page boundary OR section boundary)
- AND (has summary keywords OR structural anomalies)
- THEN → REMOVE (it's a section boundary aggregate)

**Question 5: Everything else?**
- IF not matched by Q1-Q4 above
- THEN → KEEP (it's a detail row)

---

### Part 5: Confidence Scoring

For each row you identify as a summary, assign a confidence score:

- **95-100%**: Text contains explicit "Total", "Subtotal", "Summary" + numeric aggregate patterns
- **85-94%**: Position + keywords match AND structure differs from detail rows
- **75-84%**: Strong structural indicators but ambiguous text
- **60-74%**: Weak indicators; might be edge case
- **Below 60%**: Likely detail row; flag for manual review

Only remove rows with 75%+ confidence. Flag lower scores for user review.

---

### Part 6: Critical Edge Cases to Handle

**Duplicate Company Names**: Some companies appear multiple times
- Summary row: "ACME CORP Total" or indented summary
- Detail rows: Regular "ACME CORP" entries
- Decision: Check context and structure, not just name

**Empty/Placeholder Rows**: Rows with dashes, zeros, or blanks
- Often appear between sections
- Remove only if clearly part of formatting, not data

**Negative Amounts**: Usually in parentheses like "(100.00)"
- Could be corrections/adjustments (KEEP) or aggregate negatives (REMOVE)
- Context: Is this one entry or sum of entries?

**High-Value Rows**: One row with amount much larger than others
- Could be large deal (KEEP) or aggregate (REMOVE)
- Check: Does it have company/policy details?

**Single-Row Sections**: Sometimes a carrier/group has only one transaction
- KEEP it - it's the detail row, not a summary
- Only remove if structure/keywords explicitly mark it as "Total"

---

### Part 7: Output Format

**NEW APPROACH: Extract All, Mark Summaries**

Do NOT skip summary rows during extraction. Instead:

1. **Extract ALL rows** (including summaries)
2. **Mark summary rows** with `"is_summary": true` and `"summary_confidence": 0.95` in the row object
3. **Let Python code filter** them later in post-processing

**Output Format Example:**

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
          "data": ["Total for Group:", "Companies A-B", "$300.00"],
          "is_summary": true,
          "summary_confidence": 0.98,
          "summary_reason": "Text pattern 'Total for Group:' + position match"
        },
        {
          "data": ["", "", "$300.00"],
          "is_summary": true,
          "summary_confidence": 0.95,
          "summary_reason": "Empty group columns + last row + matches sum"
        }
      ]
    }
  ]
}
```

---

### Part 8: Validation Checklist

Before returning final result, verify:

☑ No "Total" or "Summary" keyword rows remain (unless company name like "Total Logistics LLC")
☑ Row counts make sense (detail rows > summary rows)
☑ Flagged rows are legitimately ambiguous
☑ Key numeric columns align (sections sum to totals correctly)
☑ Removed rows match summary patterns from Part 1
☑ Carrier-specific patterns were applied
☑ Confidence scores are realistic (not all 100% or all 50%)
☑ Edge cases documented in extraction_notes

---

**Why This Works Better:**
- Multi-layered Analysis: Doesn't rely on single regex pattern
- Contextual Understanding: Claude analyzes structure, not just keywords
- Carrier Flexibility: Works with ANY carrier structure
- Confidence Scoring: User can review uncertain cases
- Semantic Awareness: Claude understands business logic, not just text patterns
- Edge Case Handling: Documents special cases instead of failing

**Key Point:** Your job is to extract ALL rows accurately and mark summaries with confidence. Python code will handle final filtering based on the `is_summary` flag and confidence scores.
"""
        
        @staticmethod
        def should_filter_row(group_name: str, group_number: str, paid_amount: str = None, row_data: dict = None) -> bool:
            """
            Determine if a row should be filtered (excluded) using intelligent multi-stage detection.
            
            This implements the comprehensive filtering logic for Python post-processing.
            Uses textual, structural, and content pattern indicators.
            
            Args:
                group_name: The group/company name
                group_number: The group identifier/number
                paid_amount: Optional paid amount (to detect aggregates)
                row_data: Optional full row data dict (to check is_summary flag and confidence)
                
            Returns:
                True if row should be EXCLUDED (is a summary/metadata row)
                False if row should be INCLUDED (is an actual group)
            """
            # PRIORITY CHECK: If Claude marked this as summary with high confidence, trust it
            if row_data:
                is_summary = row_data.get('is_summary', False)
                summary_confidence = row_data.get('summary_confidence', 0.0)
                if is_summary and summary_confidence >= 0.75:
                    return True  # EXCLUDE - Claude marked as summary with high confidence
            
            # Convert to lowercase for case-insensitive matching
            name_lower = str(group_name).strip().lower()
            number_lower = str(group_number).strip().lower()
            
            # CRITICAL CHECK: Empty group name AND empty group number = aggregate/total row
            if not name_lower and not number_lower:
                return True  # EXCLUDE - likely grand total with empty identifiers
            
            # Skip if group name is empty
            if not name_lower:
                return True  # EXCLUDE
            
            # Get skip keywords
            skip_keywords = ExtractionRules.Filtering.get_skip_keywords()
            
            # Question 1: Text-based summary label detection
            # Check if group name contains any skip keyword
            if any(keyword in name_lower for keyword in skip_keywords):
                # BUT: Exclude if it's a company name like "Total Logistics LLC"
                # Company names typically have entity designations
                if not any(entity in name_lower for entity in ['llc', 'inc', 'corp', 'ltd', 'lp']):
                    return True  # EXCLUDE
            
            # Check if group name STARTS with "total" or "summary"
            if name_lower.startswith('total') or name_lower.startswith('summary'):
                # BUT: Exclude if it's a company name
                if not any(entity in name_lower for entity in ['llc', 'inc', 'corp', 'ltd', 'lp']):
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
            
            # Question 2: Structural pattern detection
            # Check for "Total for [NAME]:" pattern
            if 'total for' in name_lower or 'total for' in number_lower:
                return True  # EXCLUDE
            
            # Question 3: Content pattern detection
            # Check for aggregate indicators in the paid amount
            if paid_amount:
                amount_str = str(paid_amount).strip().lower()
                # If paid amount is suspiciously large or formatted as subtotal
                if 'subtotal' in amount_str or 'total:' in amount_str:
                    return True  # EXCLUDE
            
            # If all checks passed, this is a legitimate group
            return False  # INCLUDE
        
        @staticmethod
        def filter_groups(groups: list) -> tuple:
            """
            Filter a list of groups to remove summary/metadata rows using intelligent detection.
            
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
                paid_amount = group.get('paid_amount', '')
                
                # Pass full group dict as row_data to check is_summary flag
                if ExtractionRules.Filtering.should_filter_row(
                    group_name, 
                    group_number, 
                    paid_amount,
                    row_data=group
                ):
                    excluded_groups.append({
                        'group_number': group_number,
                        'group_name': group_name,
                        'paid_amount': paid_amount,
                        'is_summary': group.get('is_summary', False),
                        'summary_confidence': group.get('summary_confidence', 0.0),
                        'summary_reason': group.get('summary_reason', 'Multi-stage detection'),
                        'reason': 'Summary/metadata row detected via intelligent filtering'
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

