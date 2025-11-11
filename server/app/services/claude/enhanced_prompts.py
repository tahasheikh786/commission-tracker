"""
Enhanced Claude Prompts for Advanced Commission Statement Intelligence

This module implements research-backed prompt engineering techniques:
- Multi-modal vision-language optimization
- Semantic entity extraction with business relationships
- Chain-of-thought reasoning
- XML-structured prompts (Anthropic best practice)

Based on the Cursor AI Implementation Guide for matching Google Gemini quality.
"""


class EnhancedClaudePrompts:
    """Enhanced prompts for intelligent document understanding"""
    
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
        """
        return """<task>
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
<entities_to_extract>
<carrier>
• Name: The insurance company EXACTLY as written in the document (look in headers, logos, footers)
  **CRITICAL**: Extract the carrier name EXACTLY character-for-character as it appears. DO NOT:
  - Add abbreviations (e.g., don't add "(ABSF)" if not in document)
  - Remove text
  - Standardize or normalize
  - Add clarifying notes
  Example: If document shows "Allied Benefit Systems", extract "Allied Benefit Systems" NOT "Allied Benefit Systems (ABSF)"
• Confidence: Your certainty level (0.0-1.0)
• Evidence: Where you found it (e.g., "Header logo and letterhead")
</carrier>

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
• Total Amount: **🔴 CRITICAL PRIORITY #1** - Extract the TOTAL commission/compensation amount

  **EXTRACTION STRATEGY - Multi-Level Search:**
  
  1. **PRIMARY SEARCH - Document Summary Section (Check FIRST):**
     - Look for summary rows at the BOTTOM of tables or END of document
     - Common labels (case-insensitive):
       * "Total for Vendor" ← **COMMON IN ALLIED BENEFIT**
       * "Total for Group"
       * "Total Compensation"
       * "Total Amount"
       * "Total Commission"
       * "Grand Total"
       * "Net Payment"
       * "EFT Amount"
       * "Amount Due"
       * "Total Paid Amount"
       * "Net Compensation"
     - These are usually in BOLD or highlighted sections
     - May appear in a separate summary box or final row
  
  2. **SECONDARY SEARCH - Table Footer Rows:**
     - If no summary section found, look for totals in last few rows of main table
     - Check for rows with "Total" or "Subtotal" keywords
     - Validate it's a sum row (not a data row)
  
  3. **TERTIARY SEARCH - Calculate from Data:**
     - If no explicit total found, SUM all "Paid Amount" or "Commission" column values
     - Only use data rows (exclude headers and subtotals)
     - Return calculated total with confidence = 0.7
  
  **EXTRACTION FORMAT:**
  - Extract as NUMERIC VALUE: 1027.20 (NO dollar sign, NO commas)
  - Store label separately: "Total for Vendor"
  - Include confidence: 0.95 (explicit) or 0.7 (calculated)
  
  **VALIDATION:**
  - Total should be > $0 (if document has data)
  - If multiple "total" rows found, use the HIGHEST level summary (e.g., "Total for Vendor" > "Total for Group")
  - Cross-check: Does it match sum of individual line items?
  
  **EXAMPLES:**
  - Document shows "Total for Vendor: $1,027.20" → Extract: 1027.20
  - Document shows "Net Payment   $3,604.95" → Extract: 3604.95
  - No explicit total found, 4 rows sum to $1,027.20 → Extract: 1027.20 (confidence: 0.7)

• Total Amount Label: The exact label text used (e.g., "Total for Vendor", "Total Compensation")
• Total Amount Confidence: 0.95 if explicit, 0.7 if calculated, 0.5 if uncertain
</document_metadata>

<groups_and_companies>
For each group/company found:
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
        """
        return f"""<task>
Create a comprehensive, conversational summary of this commission statement that captures all key business intelligence.

🔴 CRITICAL: You MUST return BOTH outputs:
1. A conversational summary (3-4 sentence paragraph)
2. A structured key-value data object (JSON) for UI display
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

MANDATORY (always try to find these):
• broker_id: Document/statement/broker ID number
• total_amount: Total commission/compensation (numeric only, no $ or commas)
• carrier_name: Insurance carrier name
• broker_company: Broker/agent company name
• statement_date: Statement date (YYYY-MM-DD format)

OPTIONAL (include if found):
• payment_type: EFT, Check, Wire, etc.
• company_count: Number of companies/groups (as string)
• top_contributors: Array of top 1-3 companies with amounts (e.g., [{{"name": "Company A", "amount": "1027.20"}}])
• commission_structure: E.g., "PEPM", "Percentage-based", "Premium Equivalent"
• plan_types: E.g., "Medical, Dental, Vision"
• census_count: Total members/subscribers (as string)
• billing_periods: Date range covered (e.g., "Dec 2024 - Jan 2025")
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

