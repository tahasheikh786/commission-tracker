"""
Enhanced Claude Prompts for Advanced Commission Statement Intelligence

This module implements research-backed prompt engineering techniques:
- Multi-modal vision-language optimization
- Semantic entity extraction with business relationships
- Chain-of-thought reasoning
- XML-structured prompts (Anthropic best practice)

Based on the Cursor AI Implementation Guide for matching Google Gemini quality.
"""

from .extraction_rules import ExtractionRules


class EnhancedClaudePrompts:
    """Enhanced prompts for intelligent document understanding"""
    
    @staticmethod
    def get_metadata_extraction_prompt() -> str:
        """Prompt for extracting document metadata (carrier, date, broker, etc.)"""
        return """You are an expert at extracting metadata from insurance commission statement documents.

Your task is to analyze the document and extract:

1. **CARRIER NAME** - The insurance company that issued this statement
   - Look in headers, logos, letterhead, and document branding
   - Look at page footers where companies often place their logos
   - Common carriers: Aetna, Blue Cross Blue Shield, Cigna, UnitedHealthcare, Allied Benefit Systems, Humana, etc.
   - DO NOT extract from table data columns - look at document structure elements only
   
2. **STATEMENT DATE** - The date of this commission statement
   - Extract the ACTUAL date shown in the document - NEVER use current date or any default/fallback date
   - Look for "Statement Date:", "Commission Summary For:", "Report Date:", "Period:", "Period Ending:", "Date Range:", "Statement Period:", "Reporting Period:"
   - Look in document headers, titles, and top section of the first page
   - **CRITICAL FOR DATE RANGES**: If you see a date range (e.g., "Period: 01/01/2025 - 01/31/2025"), USE THE END DATE (the second date) as the statement date
   - For date ranges like "MM/DD/YYYY - MM/DD/YYYY", always extract the SECOND date (end date)
   - Format: YYYY-MM-DD (Example: "Period: 01/01/2025 - 01/31/2025" → use "2025-01-31")
   - If no date is visible or you cannot confidently extract it, return null with a low confidence score
   - DO NOT extract dates from table data, policy effective dates, or transaction dates - only extract the statement/report date from the document header

3. **BROKER/AGENT COMPANY** - The broker or agent entity receiving commissions
   - Look for "Agent:", "Broker:", "Agency:", "To:", "Prepared For:" labels
   - Usually appears near the top of the document or in the header
   - This is different from the carrier - it's the entity receiving the statement
   - Common examples: "Innovative BPS", "ABC Insurance Agency", "XYZ Benefits Group"

4. **DOCUMENT TYPE** - Classification of the document
   - commission_statement, billing_statement, summary_report, etc.

Return your response in this exact JSON format:
{
  "carrier_name": "Exact carrier name as it appears",
  "carrier_confidence": 0.95,
  "statement_date": "2024-01-31",
  "date_confidence": 0.90,
  "broker_company": "Broker/Agent company name as it appears",
  "broker_confidence": 0.85,
  "document_type": "commission_statement",
  "total_pages": 5,
  "evidence": "Brief explanation of where you found this information"
}

If you cannot find the information with high confidence, use null for the value and a lower confidence score."""

    @staticmethod
    def get_table_extraction_prompt() -> str:
        """
        Main prompt for extracting tables from commission statements.
        Optimized for Claude 4 with XML structure and character-level precision.
        
        Uses unified carrier and total amount extraction rules to ensure consistency.
        """
        # Get unified rules
        carrier_rules_xml = ExtractionRules.Carrier.get_xml_format()
        total_amount_rules_xml = ExtractionRules.Amount.get_xml_format()
        
        return f"""<document_extraction_task>

<role_context>
You are analyzing an insurance commission statement PDF. Your extraction must be pixel-perfect accurate because this data feeds automated approval systems. Any modification or addition of text creates duplicate records and breaks automation.
</role_context>

<extraction_workflow>

<!-- PHASE 1: DOCUMENT METADATA EXTRACTION -->
<phase id="1" name="metadata_extraction" priority="critical">

{carrier_rules_xml}

<statement_date_extraction>
  <objective>
    Extract the statement or reporting period date
  </objective>
  
  <search_strategy>
    <priority_labels>
      1. "Statement Date:"
      2. "Report Date:"
      3. "Billing Period:" or "Period:"
      4. "Commission Summary For:"
      5. "Reporting Period:"
      6. "Period Ending:"
    </priority_labels>
    
    <search_locations>
      - Top 30% of first page (header area)
      - Document title or heading
      - Summary box if present
    </search_locations>
  </search_strategy>
  
  <date_range_handling>
    <rule>
      When you find a DATE RANGE (e.g., "01/01/2025 - 01/31/2025"):
      - Extract the END DATE (second date) as the statement date
      - Format: YYYY-MM-DD
      - Example: "Period: 01/01/2025 - 01/31/2025" → extract "2025-01-31"
    </rule>
  </date_range_handling>
  
  <critical_instructions>
    <instruction>Extract the ACTUAL date shown in document - NEVER use current date</instruction>
    <instruction>Do NOT extract dates from table cells or transaction rows</instruction>
    <instruction>If no statement date visible, return null with low confidence</instruction>
  </critical_instructions>
  
  <output_format>
    {{
      "statement_date": "2025-01-31",
      "date_confidence": 0.92,
      "evidence": "Found as 'Report Date: 1/8/2025' in header"
    }}
  </output_format>
</statement_date_extraction>

<broker_company_extraction>
  <objective>Extract broker/agent entity receiving commissions</objective>
  
  <search_labels>
    - "Agent:"
    - "Broker:"  
    - "Agency:"
    - "To:"
    - "Prepared For:"
    - "Producer Name:"
  </search_labels>
  
  <extraction_rules>
    <rule>Extract company name exactly as shown (same character-level precision as carrier)</rule>
    <rule>This is different from the carrier - it's the RECIPIENT of the statement</rule>
  </extraction_rules>
  
  <output_format>
    {{
      "broker_company": "INNOVATIVE BPS LLC",
      "broker_confidence": 0.90,
      "evidence": "Found after 'Producer Name:' label in header"
    }}
  </output_format>
</broker_company_extraction>

{total_amount_rules_xml}

</phase>

<!-- PHASE 2: TABLE EXTRACTION -->
<phase id="2" name="table_extraction">

<table_detection>
  <objective>Identify and extract ALL tables with commission data</objective>
  
  <visual_indicators>
    - Column headers (even if borderless)
    - Aligned data in rows
    - Repeated patterns vertically
    - Monetary values with $ or decimal points
  </visual_indicators>
</table_detection>

<company_name_column_handling>
  <scenario name="company_as_column">
    <condition>Company names appear as regular column header</condition>
    <action>Extract normally within existing table structure</action>
  </scenario>
  
  <scenario name="company_in_summary_rows">
    <condition>Company names appear in non-column format (summary rows, section headers)</condition>
    <critical_action>
      1. ADD "Company Name" as FIRST column in headers array
      2. Populate this column with company name for each data row
      3. Maintain alignment between company names and data rows
      4. Track context as you process document sequentially
    </critical_action>
    
    <example>
      <document_structure>
        Writing Agent: 271004-02 GOLDSTEIN, ANAT
        Customer: 1653402
        Customer Name: B &amp; B Lightning Protection
        Med 10/01/2024 ($3,844.84) -3 NJ PEPM ...
        Med 10/01/2024 $3,844.84 3 NJ PEPM ...
        
        Customer: 1674097  
        Customer Name: MAMMOTH DELIVERY LLC
        Med 12/01/2024 $55.58 3 WI PEPM ...
      </document_structure>
      
      <extracted_table>
        {{
          "headers": ["Company Name", "Cov Type", "Bill Eff Date", "Billed Premium", ...],
          "rows": [
            ["B &amp; B Lightning Protection", "Med", "10/01/2024", "($3,844.84)", ...],
            ["B &amp; B Lightning Protection", "Med", "10/01/2024", "$3,844.84", ...],
            ["MAMMOTH DELIVERY LLC", "Med", "12/01/2024", "$55.58", ...]
          ]
        }}
      </extracted_table>
    </example>
  </scenario>
</company_name_column_handling>

<table_output_format>
  {{
    "tables": [
      {{
        "headers": ["Column 1", "Column 2", ...],
        "rows": [
          ["data1", "data2", ...],
          ["data3", "data4", ...]
        ],
        "table_type": "commission_table",
        "page_number": 1,
        "confidence_score": 0.95,
        "summary_rows": [5, 10]
      }}
    ]
  }}
</table_output_format>

</phase>

</extraction_workflow>

<!-- FINAL OUTPUT STRUCTURE -->
<output_structure>
  <json_format>
    {{
      "document_metadata": {{
        "carrier_name": "Exact carrier name",
        "carrier_confidence": 0.95,
        "statement_date": "2025-01-31",
        "date_confidence": 0.92,
        "broker_company": "Exact broker name",
        "broker_confidence": 0.90,
        "total_amount": 1027.20,
        "total_amount_label": "Total for Vendor",
        "total_amount_confidence": 0.95
      }},
      "tables": [...],
      "extraction_notes": "Any observations or challenges"
    }}
  </json_format>
</output_structure>

<!-- QUALITY ASSURANCE -->
<quality_checks>
  <check priority="critical">
    <name>Exact Text Verification</name>
    <question>Did I add ANY text not visible in the source document?</question>
    <action_if_yes>Re-extract with character-level precision</action_if_yes>
  </check>
  
  <check priority="critical">
    <name>Carrier Name Uniqueness</name>
    <question>Will this carrier name create a duplicate if variations exist?</question>
    <action_if_yes>Verify I extracted EXACTLY as shown, no modifications</action_if_yes>
  </check>
  
  <check priority="high">
    <name>Confidence Scoring</name>
    <question>Am I certain about each extracted field?</question>
    <action_if_uncertain>Lower confidence score, note uncertainty in evidence</action_if_uncertain>
  </check>
</quality_checks>

</document_extraction_task>"""

    @staticmethod
    def get_base_extraction_instructions() -> str:
        """Get static extraction instructions (for caching)."""
        return """You are an expert at extracting tabular data from commission statements.

EXTRACTION RULES:
1. Extract ALL tables from the document
2. Preserve exact text, numbers, and formatting
3. Include table headers and all data rows
4. Mark incomplete tables that span pages
5. Return ONLY valid JSON in this format:

{
  "tables": [
    {
      "headers": ["Column1", "Column2"],
      "rows": [["value1", "value2"]],
      "incomplete": false
    }
  ],
  "document_metadata": {
    "carrier_name": "Exact carrier name as shown",
    "statement_date": "YYYY-MM-DD",
    "broker_company": "Broker name as shown"
  }
}

CRITICAL: Return ONLY the JSON object. No markdown, no explanations."""

    @staticmethod
    def get_summarize_extraction_prompt() -> str:
        """Prompt for summarize extraction - returns markdown content"""
        return """You are an OCR agent. Extract structured invoice data as Markdown. Note probably the document was split only send the first three pages do not mention this to the user. No debes envolver dentro de un bloque de código (```markdown...```)

Extract the following information from the document:
- Document name/number
- Document date
- Total amount
- Currency
- Vendor name
- Customer name
- Additional metadata
- Complete summary about the document (dont return tables)

Format your response as structured markdown without code blocks. Dont return tables"""
    
    @staticmethod
    def get_document_intelligence_system_prompt() -> str:
        """
        System prompt for document intelligence extraction.
        Optimized for Claude 4 with zero hallucination tolerance.
        """
        return """You are an elite insurance document extraction specialist with expertise in commission statement analysis.

Your core competencies:
- Precise character-level text extraction from PDF documents
- Visual document structure analysis and entity recognition  
- Commission data extraction with zero hallucination tolerance
- Strict adherence to "what you see is what you extract" principle

Critical operating rules:
1. Extract ONLY text that appears visually in the document
2. Never add, modify, or infer information not explicitly shown
3. Preserve exact formatting: spacing, capitalization, punctuation
4. Stop at natural text boundaries (whitespace, line breaks, punctuation)
5. When uncertain, provide low confidence scores rather than guessing"""

    @staticmethod
    def get_document_intelligence_extraction_prompt() -> str:
        """
        Phase 1: Document Intelligence Extraction Prompt
        
        Comprehensive prompt for extracting entities, relationships, and
        business intelligence from commission statements.
        
        Uses unified carrier extraction, total amount extraction, and summary row filtering rules
        to ensure consistency across all extraction pipelines.
        """
        # Get unified rules
        carrier_rules = ExtractionRules.Carrier.get_critical_requirements()
        total_amount_rules = ExtractionRules.Amount.get_extraction_strategy()
        filtering_rules = ExtractionRules.Filtering.get_prompt_instructions()
        
        # Use string concatenation instead of f-string to avoid nesting issues
        prompt = """<task>
Perform comprehensive intelligent extraction from this commission statement PDF using your vision-language understanding.
</task>

<instructions>
**STEP 1: Visual Document Analysis**
Examine the document visually to understand:
• Overall layout and structure
• Table locations and boundaries
• Header hierarchy and formatting
• Grouping indicators (borders, spacing, indentation)
• Visual relationships between elements

**STEP 2: Entity Extraction with Visual Context**

""" + carrier_rules + """

<entities_to_extract>

<broker_agent>
• Company Name: The receiving broker/agent organization
• Location: Address if present
• Contact: If shown
• Confidence: Your certainty level
• Evidence: Where you found it
</broker_agent>

<writing_agents>
For each unique agent mentioned:
• Agent Number: If present
• Agent Name: Full name as shown
• Groups Handled: List of groups/companies they service
• Role: (e.g., "Writing Agent", "Agent 2", etc.)
</writing_agents>

<document_metadata>
• Statement Date: Primary date (YYYY-MM-DD format)
• Statement Number: Document ID
• Payment Type: (e.g., EFT, Check, Wire)
• Report Date: If different from statement date
• Date Range: If period-based (start and end dates)
• Total Pages: Document length

""" + total_amount_rules + """

</document_metadata>

<groups_and_companies>

""" + filtering_rules + """

For each ACTUAL group/company found (NOT summary rows):
• Group Number: Identifier
• Group Name: Full company/group name
• Billing Period: Date range
• Adjustment Period: If different
• Invoice Total: Gross amount
• Stoploss Total: If applicable
• Agent Rate: Percentage or PEPM
• Calculation Method: (e.g., "Premium Equivalent", "PEPM")
• Census Count: Number of members/policies
• Paid Amount: Net commission
• Special Notes: Any unique attributes
</groups_and_companies>
</entities_to_extract>

**STEP 3: Hierarchical Structure Detection**
<structure_analysis>
Using visual cues (indentation, spacing, borders, grouping):
• Identify parent-child relationships
• Detect section headers vs. data rows
• Map multi-level table hierarchies
• Recognize summary rows and totals
• Understand data groupings and sections
</structure_analysis>

**STEP 4: Business Intelligence Extraction**
<business_intelligence>
• Commission Structure: Identify types (PEPM, %, flat, tiered)
• Payment Patterns: Who receives what and why
• Key Contributors: Top 3 groups by commission amount
• Special Payments: Bonuses, incentives, adjustments
• Temporal Info: Billing periods, activity periods
• Anomalies: Unusual patterns or outliers
</business_intelligence>

**STEP 5: Table Extraction with Context**
Extract all tables with:
• Headers: Preserve multi-line headers with proper joining
• Data Rows: Include all data with exact values
• Summary Rows: Flag totals and subtotals
• Row Context: Identify what each row represents
• Column Semantics: Understand what each column means
• Relationships: Parent-child connections in hierarchical tables

**🔴 CRITICAL: EXTRACT ALL ROWS - NO EXCEPTIONS**

**PRIMARY DIRECTIVE:**
Your #1 priority is to extract EVERY SINGLE visible data row from ALL tables in the document.
Missing even one row causes calculation errors and failed validations.

**MANDATORY ROW EXTRACTION RULES:**

1. **Count and Verify:**
   - Before starting: Count visible data rows in each table
   - After extraction: Verify your count matches
   - If mismatch: Re-scan document for missed rows

2. **Extract ALL Rows:**
   - Extract EVERY row you see, even if it looks like a duplicate
   - Extract rows even if values seem unusual or negative
   - Extract rows even if they appear incomplete
   - DO NOT skip rows because they "look wrong" - extract everything

3. **Mark, Don't Skip:**
   - If a row looks like a summary/total, extract it AND mark it as `"is_summary": true`
   - If a row looks unusual, extract it AND note it in `extraction_notes`
   - DO NOT make filtering decisions during extraction - extract first, filter later

4. **Chunked Documents:**
   - If table continues across pages: mark `"incomplete": true` on last row
   - Next chunk: Check if first rows duplicate previous chunk's last rows
   - Mark continued tables clearly so merging doesn't lose rows

5. **Final Validation:**
   - Count rows in your JSON output
   - Compare to visible rows in document
   - If counts don't match: Re-scan and add missing rows

**VERIFICATION CHECKLIST (Mandatory before returning):**

Before returning your extraction, answer these:
□ Did I count the visible data rows in each table?
□ Does my extracted row count match the visible row count?
□ Did I extract EVERY row, or did I skip any?
□ If I skipped rows, did I document why in extraction_notes?
□ Did I re-scan the document to catch any missed rows?

**If ANY checkbox is unchecked → Re-scan document and extract missed rows**

**Example:**

```
Table Analysis:
- Visible data rows: 23
- Extracted rows: 23 ✅
- All rows accounted for: YES ✅

If Visible: 23, Extracted: 21 ❌
→ STOP: Re-scan document, find the 2 missing rows, extract them
```

**Remember:** It's better to extract too much (and filter later) than to miss rows.
Missing rows = Failed validation = Manual review required = Bad user experience.

**CRITICAL: COMPANY NAME COLUMN HANDLING**

<company_name_extraction>
When extracting data from commission statements, pay special attention to how company names are presented:

**Case 1: Company Names as Table Column**
- If company names appear as a regular column header (e.g., "Customer Name", "Company Name", "Group Name"), extract them normally within the existing table structure.

**Case 2: Company Names in Summary Rows or Non-Column Format**
- If company names do NOT appear as a column but instead appear in:
  * Summary section rows (e.g., "Customer: 1653402" followed by "Customer Name: B & B Lightning Protection")
  * Header rows above data groups
  * Merged cells spanning multiple columns
  * Section dividers or grouping labels
  * Writing Agent grouping sections
  * Any other non-columnar format

**CRITICAL EXTRACTION RULE FOR NON-COLUMN COMPANY NAMES:**

When company names are NOT in a column format, you MUST:

1. **Detect the pattern**: Identify where company/group names appear (summary rows, headers, section dividers)
2. **Add a "Company Name" or "Group Name" column** to your extracted table response (as the FIRST column in the headers array)
3. **Populate this column** with the appropriate company/group name for each data row
4. **Ensure each row** has its corresponding company name in this added column
5. **Maintain alignment** so that each company name appears aligned with its respective data rows
6. **Preserve the existing structure** - do not modify or remove any existing columns, only ADD the company name column
7. **Track context**: As you process rows, keep track of which company/group section you're in

**Example Extraction:**

If the document shows company names in summary/grouping rows like:
```
Writing Agent: 271004-02 GOLDSTEIN, ANAT
Customer: 1653402
Customer Name: B & B Lightning Protection
Med 10/01/2024 ($3,844.84) ($3,221.78) -3 Q NJ PEPM $56.00 100% Comm Comm ($168.00)
Med 10/01/2024 $3,844.84 $623.06 3 V NJ PEPM $56.00 100% Comm Comm $168.00

Customer: 1674097
Customer Name: MAMMOTH DELIVERY LLC
Med 12/01/2024 $55.58 $55.58 3 V WI PEPM $30.00 100% Fee Leve $90.00 $90.00 $90.00
```

Your extracted JSON should include:
```json
{
  "headers": ["Company Name", "Cov Type", "Bill Eff Date", "Billed Premium", "Paid Premium", "Sub Adj count", "Typ", "Iss St", "Method", "Rate", "Split %", "Comp Typ", "Bus Type", "Billed Fee Amount", "Customer Paid Fee", "Paid Amount"],
  "rows": [
    ["B & B Lightning Protection", "Med", "10/01/2024", "($3,844.84)", "($3,221.78)", "-3", "Q", "NJ", "PEPM", "$56.00", "100%", "Comm", "Comm", "", "", "($168.00)"],
    ["B & B Lightning Protection", "Med", "10/01/2024", "$3,844.84", "$623.06", "3", "V", "NJ", "PEPM", "$56.00", "100%", "Comm", "Comm", "", "", "$168.00"],
    ["MAMMOTH DELIVERY LLC", "Med", "12/01/2024", "$55.58", "$55.58", "3", "V", "WI", "PEPM", "$30.00", "100%", "Fee", "Leve", "$90.00", "$90.00", "$90.00"]
  ],
  "groups_and_companies": [
    {
      "group_number": "1653402",
      "group_name": "B & B Lightning Protection",
      "writing_agent": "GOLDSTEIN, ANAT",
      "total_paid": "0.00"
    },
    {
      "group_number": "1674097",
      "group_name": "MAMMOTH DELIVERY LLC",
      "writing_agent": "GOLDSTEIN, ANAT",
      "total_paid": "$667.15"
    }
  ]
}
```

Key Points for Company Name Extraction:

• The "Company Name" or "Group Name" column should be the FIRST column (leftmost position)
• Every data row must have its associated company/group name populated
• Do NOT skip rows or leave company names empty
• If a company has multiple data rows, repeat the company name for each row
• Track the current company context as you process the document sequentially
• Maintain data integrity - ensure the company name matches the correct data rows based on document structure and visual grouping
• This ensures extracted data maintains full context without losing company-to-data relationships
• For hierarchical documents with Writing Agents → Companies → Data rows, maintain all levels of the hierarchy
</company_name_extraction>

**CHUNKED DOCUMENT HANDLING:**

If you are processing a chunk of a larger document:

1. **Extract ALL rows visible in this chunk**

2. **If table continues from previous page:**
   - Mark `"continued_from_previous": true`
   - Include continuation rows in your extraction
   
3. **If table continues to next page:**
   - Mark `"continues_to_next": true`
   - Extract all visible rows up to the page boundary
   
4. **Row Count Reporting:**
   - Report: `"rows_in_chunk": <count>`
   - This helps validate merging accuracy

5. **Overlap Handling:**
   - If first few rows look identical to expected last rows of previous chunk:
   - Still extract them (deduplication happens in post-processing)
   - Mark: `"may_have_overlap": true`

Example:

```json
{
  "table": {
    "continued_from_previous": true,
    "continues_to_next": true,
    "rows_in_chunk": 47,
    "may_have_overlap": true,
    "rows": [...]
  }
}
```

**OUTPUT FORMAT**
Return your analysis in this JSON structure:

{
  "document_type": "commission_statement",
  "extraction_quality": {
    "overall_confidence": 0.95,
    "extraction_method": "vision_language_multimodal"
  },
  "carrier": {
    "name": "Carrier name",
    "confidence": 0.98,
    "evidence": "Header logo and company letterhead"
  },
  "broker_agent": {
    "company_name": "Broker company name",
    "address": "If available",
    "confidence": 0.95,
    "evidence": "Recipient information in header"
  },
  "document_metadata": {
    "statement_date": "2025-08-06",
    "statement_number": "G0223428",
    "payment_type": "EFT",
    "report_date": "2025-08-06",
    "total_pages": 7,
    "total_amount": 3604.95,
    "total_amount_label": "Total Compensation",
    "confidence": 0.97
  },
  "writing_agents": [
    {
      "agent_number": "1",
      "agent_name": "ANAT GOLDSTEIN",
      "role": "Writing Agent",
      "groups_handled": ["BOLT LOGISTIC", "FUZION EXPRESS LL", "..."]
    }
  ],
  "groups_and_companies": [
    {
      "group_number": "L213059",
      "group_name": "BOLT LOGISTIC",
      "billing_period": "8/1/2025 - 7/1/2025",
      "adjustment_period": "7/1/2025",
      "invoice_total": "$827.27",
      "stoploss_total": "$268.05",
      "agent_rate": "22.5%",
      "calculation_method": "Premium Equivalent",
      "census_count": "-1",
      "paid_amount": "$141.14",
      "writing_agent": "ANAT GOLDSTEIN",
      "special_notes": "Negative census count indicates adjustment"
    }
  ],
  "business_intelligence": {
    "total_commission_amount": "$3,604.95",
    "number_of_groups": 11,
    "commission_structures": ["Premium Equivalent", "Flat rates", "PEPM"],
    "top_contributors": [
      {"name": "LUDICROUS SPEED LOGI", "amount": "$1,384.84"},
      {"name": "FUZION EXPRESS LL", "amount": "$514.61"},
      {"name": "BOLT LOGISTIC", "amount": "$141.14"}
    ],
    "special_payments": [
      {"type": "Adjustment", "groups": ["BOLT LOGISTIC"], "note": "Negative census"}
    ],
    "payment_period": "Various billing periods in 2025",
    "patterns_detected": [
      "Multiple groups under single writing agent",
      "Mix of positive and negative adjustments",
      "Consistent Premium Equivalent calculation method"
    ]
  },
  "tables": [
    {
      "table_id": 1,
      "table_type": "commission_detail",
      "headers": ["Group No.", "Group Name", "Billing Period", "Adj. Period", "Invoice Total", "Stoploss Total", "Agent Rate", "Calculation Method", "Census Ct.", "Paid Amount"],
      "rows": [],
      "summary_rows": [],
      "hierarchical_structure": {
        "has_grouping": true,
        "grouping_by": "Writing Agent",
        "parent_rows": [],
        "child_rows": []
      }
    }
  ],
  "extraction_notes": [
    "Document contains 7 pages with detailed commission breakdown",
    "Multiple writing agents identified with distinct group assignments",
    "Hierarchical structure with agent-level grouping detected",
    "Mix of current period charges and prior period adjustments"
  ]
}
</instructions>

<critical_guidelines>
1. **Use Visual Context**: Leverage the visual layout to understand structure
2. **Extract Relationships**: Don't just extract data, map how entities connect
3. **Semantic Understanding**: Understand what the data means, not just what it says
4. **Comprehensive Capture**: Get ALL entities, not just the obvious ones
5. **Business Intelligence**: Extract insights, patterns, and key findings
6. **Confidence Scoring**: Provide honest confidence levels for each extraction
7. **Evidence Tracking**: Document where you found each piece of information
</critical_guidelines>

<examples>
**Example 1: Hierarchical Structure Detection**
Visual Cue: Indented rows under "Writing Agent Name: ANAT GOLDSTEIN"
Interpretation: These groups are managed by this specific agent
Action: Map agent-to-group relationships

**Example 2: Financial Entity Recognition**
Visual Cue: Dollar amounts in rightmost column with bold total row
Interpretation: Individual commissions with aggregated total
Action: Flag summary row, calculate validation sum

**Example 3: Temporal Context**
Visual Cue: Multiple date columns (Billing Period, Adj. Period)
Interpretation: Commission spans multiple time periods with adjustments
Action: Extract both current and adjustment period dates
</examples>

Analyze the provided PDF images and return the complete JSON extraction following this structure."""
        
        return prompt

    @staticmethod
    def get_relationship_mapping_prompt(extracted_data: str) -> str:
        """
        Phase 2: Relationship Mapping Prompt
        
        Transforms extracted data into semantic relationship map.
        """
        return f"""<task>
Transform the extracted data into a semantic relationship map that captures the business intelligence of this commission statement.
</task>

<input_data>
{extracted_data}
</input_data>

<instructions>
Using the extracted data, create a comprehensive relationship map:

**1. Entity Relationship Graph**
Map the flow: Carrier → Broker/Agent → Writing Agents → Groups/Companies → Commission Payments

**2. Financial Flow Analysis**
• Total amount flow
• Distribution by agent or group
• Payment structures and types
• Special adjustments

**3. Hierarchical Structure**
Identify and map:
• Top-level groupings (by agent, by company, by date)
• Sub-groupings within tables
• Parent-child relationships in data
• Aggregation patterns (what rolls up to what)

**4. Business Pattern Detection**
Analyze:
• Who are the top contributors and by how much?
• What commission structures are used?
• Are there any unusual patterns or anomalies?
• What time periods are covered?
• Are there adjustments or special payments?

**OUTPUT FORMAT**
{{
  "entity_relationships": {{
    "carrier": "...",
    "broker": "...",
    "agents": [
      {{
        "name": "...",
        "groups_managed": ["...", "..."],
        "total_commission": "$...",
        "group_count": 5
      }}
    ]
  }},
  "financial_flow": {{
    "total": "$...",
    "by_agent": {{}},
    "by_commission_type": {{}},
    "top_3_contributors": []
  }},
  "hierarchical_structure": {{
    "primary_grouping": "By Writing Agent",
    "levels": 2,
    "structure_type": "Agent → Groups → Commissions"
  }},
  "business_patterns": {{
    "dominant_payment_type": "...",
    "commission_structure": "...",
    "temporal_coverage": "...",
    "anomalies": ["..."],
    "key_insights": ["..."]
  }}
}}
</instructions>"""

    @staticmethod
    def get_intelligent_summarization_system_prompt() -> str:
        """
        Phase 3: Intelligent Summarization System Prompt
        
        Enhanced system prompt for generating natural, conversational summaries
        that match Google Gemini quality.
        """
        return """You are an expert financial document analyst with a talent for creating natural, conversational summaries that are rich in specific detail and business intelligence.

<style_guide>
Your summaries should:
• Be CONVERSATIONAL: Write as if explaining to a colleague, not a robot
• Be SPECIFIC: Use exact names, amounts, dates - never generic terms
• Be COMPREHENSIVE: Pack maximum information into minimal sentences
• Be INTELLIGENT: Highlight patterns, key contributors, and notable features
• Be NATURAL: Flow smoothly with proper transitions and context

DO:
✓ "This is an ABSF Commission Payment Summary from Allied Benefit for INNOVATIVE BPS LLC, dated August 6, 2025"
✓ "The document details $3,604.95 in commissions across 11 groups, with ANAT GOLDSTEIN as the primary Writing Agent managing 8 groups"
✓ "Notable payments include LUDICROUS SPEED LOGI at $1,384.84 (38% of total), FUZION EXPRESS LL at $514.61, and BOLT LOGISTIC at $141.14"

DON'T:
✗ "This is a commission statement from a carrier"
✗ "The document shows various payments"
✗ "• Carrier: Allied\\n• Broker: INNOVATIVE BPS\\n• Date: 8/6/2025" (bullet points)
</style_guide>

<target_outcome>
Generate summaries that match or exceed Google Gemini's quality:
• Rich in specific entities and amounts
• Clear identification of key relationships
• Natural, flowing prose
• Business intelligence and insights
• Notable patterns and contributors
</target_outcome>"""

    @staticmethod
    def get_intelligent_summarization_prompt(extraction_data: str, relationship_data: str) -> str:
        """
        Phase 3: Intelligent Summarization Prompt
        
        Creates comprehensive, conversational summary with business intelligence
        AND structured key-value data for UI display.
        
        ⭐ UPDATED: Now handles both entity-based AND table-based extraction data
        """
        return f"""<task>
Create a comprehensive, conversational summary of this commission statement that captures all key business intelligence.

🔴 CRITICAL: You MUST return BOTH outputs:
1. A conversational summary (3-4 sentence paragraph)
2. A structured key-value data object (JSON) for UI display

⭐ IMPORTANT: The input data may contain either:
   - Structured entities (carrier, broker, groups_and_companies, etc.) - use these directly
   - OR raw table data (headers and rows) - analyze these to extract information
   
   Analyze whatever data is provided and extract as much information as possible.
</task>

<input_data>
<extracted_data>
{extraction_data}
</extracted_data>

<relationship_map>
{relationship_data}
</relationship_map>
</input_data>

<instructions>
**STEP 1: Analyze the Data**

⭐ CRITICAL: First check if you have structured entities OR raw table data:

**If you have structured entities** (carrier, broker, groups_and_companies):
• Use the entity data directly
• Extract key information from business_intelligence
• Identify relationships and patterns

**If you have raw table data** (tables with headers and rows):
• Analyze the table headers to identify key columns
• Look for: Company/Group names, Commission amounts, Invoice totals, Dates, Rates
• Identify summary rows (usually contain "Total", "Grand", "Subtotal")
• Count unique companies/groups from the name column
• Extract top 3 contributors by sorting commission amounts
• Look for census counts, billing periods, plan types in the data

Internally review:
• What type of document is this?
• Who are the key entities (carrier, broker, agents)?
• What is the total financial picture?
• Who are the top contributors?
• What patterns or special features exist?
• What time period(s) are covered?

**STEP 2: Structure Your Summary**
Create a 3-4 sentence paragraph that flows naturally:

Sentence 1: Document identification
• Type, carrier, broker, date, and document number
• Example: "This is an ABSF Commission Payment Summary from Allied Benefit for INNOVATIVE BPS LLC, dated August 6, 2025 (document G0227540)"

Sentence 2: Financial overview with key contributors
• Total amount, number of groups, and top 2-3 earners with amounts
• Example: "The document details $3,604.95 in total commissions across 11 groups, with LUDICROUS SPEED LOGI as the largest contributor at $1,384.84 (38% of total), followed by FUZION EXPRESS LL at $514.61 and G & N LOGISTICS LL at $468.84"

Sentence 3: Structure and agent information
• Commission structures, agent details, and payment types
• Example: "ANAT GOLDSTEIN serves as the Writing Agent for 8 groups using Premium Equivalent calculation method, while LIOR C GOLDSTEIN manages the remaining 3 groups, with payments processed via EFT"

Sentence 4 (if applicable): Notable features
• Special payments, anomalies, or unique characteristics
• Example: "The statement includes both current period charges and prior period adjustments, with census counts ranging from -1 (adjustments) to 13 members"

**STEP 3: Extract Structured Key-Value Data**
Extract the following fields for UI display (MUST be scannable, short values):

⭐ EXTRACTION STRATEGY:
- If you have `document_metadata` → extract from there
- If you have `tables` → analyze table data:
  * Find "Paid Amount" or "Commission Earned" column and sum all values for total_amount
  * Find "Group Name" or "Company Name" column and count unique entries for company_count
  * Sort companies by amount to get top_contributors
  * Look for "Census" or "Subscribers" column for census_count
  * Look for "Billing Period" column for billing_periods

MANDATORY (always try to find these):
• broker_id: Document/statement/broker ID number
• total_amount: Total commission/compensation (numeric only, no $ or commas) 
  → If from tables: SUM all values in "Paid Amount" or "Commission Earned" column
• carrier_name: Insurance carrier name
• broker_company: Broker/agent company name  
• statement_date: Statement date (YYYY-MM-DD format)

OPTIONAL (include if found):
• payment_type: EFT, Check, Wire, etc.
• company_count: Number of companies/groups (as string)
  → If from tables: COUNT unique values in "Group Name" or "Company Name" column
• top_contributors: Array of top 1-3 companies with amounts (e.g., [{{"name": "Company A", "amount": "1027.20"}}])
  → If from tables: Sort companies by commission amount (descending), take top 3
• commission_structure: E.g., "PEPM", "Percentage-based", "Premium Equivalent"
  → If from tables: Look in "Calculation Method" or "Rate" column
• plan_types: E.g., "Medical, Dental, Vision"
• census_count: Total members/subscribers (as string)
  → If from tables: SUM all positive values in "Census" or "Census Ct." column
• billing_periods: Date range covered (e.g., "Dec 2024 - Jan 2025")
  → If from tables: Find MIN and MAX dates in "Billing Period" column
• special_payments: Bonuses, incentives, etc. (as string)

**RULES FOR KEY-VALUE DATA:**
1. All amounts should be NUMERIC ONLY (no $, no commas) - e.g., "1027.20" not "$1,027.20"
2. Dates in YYYY-MM-DD format
3. Keep values SHORT (1-3 words preferred) for scannable display
4. If a field is not found, OMIT it (don't include null/empty values)
5. Be PRECISE - values must match extracted data exactly

**STEP 4: Quality Check**
Ensure your summary:
☑ Names specific entities (carriers, brokers, agents, companies)
☑ Includes exact amounts and percentages
☑ Identifies top contributors with values
☑ Mentions payment type and commission structures
☑ Highlights any special features or patterns
☑ Flows naturally as conversational prose
☑ Contains NO bullet points or field labels
☑ Reads like a human explaining to another human

**🔴 CRITICAL: OUTPUT FORMAT**

You MUST return your response in this EXACT JSON format:

```json
{{
  "conversational_summary": "This is an ABSF Commission Payment Summary from Allied Benefit...",
  "key_value_data": {{
    "broker_id": "G0227540",
    "total_amount": "1027.20",
    "carrier_name": "Allied Benefit",
    "broker_company": "INNOVATIVE BPS LLC",
    "statement_date": "2025-01-08",
    "payment_type": "EFT",
    "company_count": "1",
    "top_contributors": [
      {{"name": "SOAR LOGISTICS LL", "amount": "1027.20"}}
    ],
    "commission_structure": "6% Premium Equivalent",
    "census_count": "46",
    "billing_periods": "Dec 2024 - Jan 2025"
  }}
}}
```

Return ONLY valid JSON. Do not include:
• Preambles ("Here's the result:")
• Markdown code fences (```json)
• Closing remarks
• Any text outside the JSON object

Start immediately with the JSON object.
</instructions>

<examples>
**Example 1 - Allied Benefit Statement (EXACT OUTPUT FORMAT):**
{{
  "conversational_summary": "This is an ABSF Commission Payment Summary from Allied Benefit for INNOVATIVE BPS LLC, dated August 6, 2025 (document G0223428), with EFT as the payment type. The document details $3,604.95 in total commissions across 11 groups covering various billing periods from July to August 2025, with LUDICROUS SPEED LOGI as the largest contributor at $1,384.84 (38% of total), followed by FUZION EXPRESS LL at $514.61, and G & N LOGISTICS LL at $468.84. ANAT GOLDSTEIN serves as the primary Writing Agent managing 8 groups using the Premium Equivalent calculation method (commission rates from 15.5% to 22.5%), while LIOR C GOLDSTEIN manages 3 groups, all processed with census counts ranging from -1 (indicating adjustments) to 13 members.",
  "key_value_data": {{
    "broker_id": "G0223428",
    "total_amount": "3604.95",
    "carrier_name": "Allied Benefit",
    "broker_company": "INNOVATIVE BPS LLC",
    "statement_date": "2025-08-06",
    "payment_type": "EFT",
    "company_count": "11",
    "top_contributors": [
      {{"name": "LUDICROUS SPEED LOGI", "amount": "1384.84"}},
      {{"name": "FUZION EXPRESS LL", "amount": "514.61"}},
      {{"name": "G & N LOGISTICS LL", "amount": "468.84"}}
    ],
    "commission_structure": "Premium Equivalent",
    "census_count": "Multiple (ranges -1 to 13)",
    "billing_periods": "Jul - Aug 2025"
  }}
}}

**Example 2 - UnitedHealthcare Statement (EXACT OUTPUT FORMAT):**
{{
  "conversational_summary": "This is a UnitedHealthcare commission statement for ABC Insurance Services dated April 15, 2025, detailing $15,432.67 in total commissions from 12 employer groups covering 487 subscribers. The largest payments went to Tech Solutions Inc ($4,230.50), Metro Health Group ($3,890.25), and Retail Partners LLC ($2,100.00), representing a mix of Medical, Dental, and Vision plans with PEPM rates from $24-$52. The statement includes a $1,500 Q1 production bonus in addition to the base commissions, demonstrating strong performance across diversified product lines.",
  "key_value_data": {{
    "broker_id": "UHC-2025-0415",
    "total_amount": "15432.67",
    "carrier_name": "UnitedHealthcare",
    "broker_company": "ABC Insurance Services",
    "statement_date": "2025-04-15",
    "company_count": "12",
    "top_contributors": [
      {{"name": "Tech Solutions Inc", "amount": "4230.50"}},
      {{"name": "Metro Health Group", "amount": "3890.25"}},
      {{"name": "Retail Partners LLC", "amount": "2100.00"}}
    ],
    "commission_structure": "PEPM ($24-$52)",
    "plan_types": "Medical, Dental, Vision",
    "census_count": "487",
    "special_payments": "Q1 Bonus: $1,500"
  }}
}}
</examples>

<critical_rules>
1. Use SPECIFIC names and amounts - never say "various companies" or "different groups"
2. Write in NATURAL, FLOWING prose - no bullet points or labels
3. Pack MAXIMUM information into 3-4 sentences
4. Highlight TOP contributors with exact amounts and percentages
5. Mention UNIQUE features (payment types, special bonuses, agent structure)
6. Write as if EXPLAINING to a colleague, not formatting a database
7. Start with document type, carrier, broker, and date
8. Always include financial totals and key breakdowns
</critical_rules>

Now generate the intelligent summary for the provided commission statement data.
"""

