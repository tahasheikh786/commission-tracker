"""
Claude-specific prompts for PDF table extraction.

This module contains sophisticated prompts optimized for Claude's document analysis capabilities.
"""

from .carrier_extraction_rules import CarrierExtractionRules
from .total_amount_extraction_rules import TotalAmountExtractionRules


class ClaudePrompts:
    """Prompts for Claude Document AI extraction"""
    
    @staticmethod
    def get_table_extraction_prompt() -> str:
        """
        Main prompt for extracting tables from commission statements.
        Optimized for Claude 4 with XML structure and character-level precision.
        
        Uses unified carrier and total amount extraction rules to ensure consistency.
        """
        # Get unified rules
        carrier_rules_xml = CarrierExtractionRules.get_xml_format()
        total_amount_rules_xml = TotalAmountExtractionRules.get_xml_format()
        
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
    def get_quality_assessment_prompt() -> str:
        """Prompt for assessing extraction quality"""
        return """You are a quality assurance expert for document extraction systems.

Your task is to assess the quality of the extracted data and identify any issues.

Review the extracted tables and metadata, then provide:

1. **Overall Confidence Score** (0.0-1.0)
   - How confident are you in the extraction accuracy?
   
2. **Table Structure Score** (0.0-1.0)
   - Are table structures preserved correctly?
   - Are headers and rows properly aligned?
   
3. **Data Completeness** (0.0-1.0)
   - Is all visible data captured?
   - Are there any obvious missing values?
   
4. **Issues Detected**
   - List any problems: missing data, misalignment, unclear text, etc.

5. **Quality Grade**
   - A: Excellent (95-100%)
   - B: Good (85-94%)
   - C: Acceptable (75-84%)
   - D: Poor (65-74%)
   - F: Failed (<65%)

Return assessment in this JSON format:
{
  "overall_confidence": 0.92,
  "table_structure_score": 0.95,
  "data_completeness": 0.88,
  "extraction_accuracy": 0.90,
  "issues_detected": ["Some text unclear in footer", "One table partially cut off"],
  "quality_grade": "A"
}"""

    @staticmethod
    def get_large_document_summary_prompt(page_range: str) -> str:
        """Prompt for summarizing large documents before detailed extraction"""
        return f"""You are analyzing pages {page_range} of a large commission statement.

First, provide a quick overview:
1. How many tables do you see on these pages?
2. What is the general structure and layout?
3. Are there any challenges or complexities?
4. What is the carrier name if visible?

This helps optimize the extraction process for large documents.

Return a brief summary in JSON format:
{{
  "table_count": 5,
  "layout_type": "multi_column" or "single_column",
  "complexity": "simple", "moderate", or "complex",
  "carrier_visible": true/false,
  "challenges": ["borderless tables", "hierarchical data", etc.]
}}"""

    @staticmethod
    def get_chunk_extraction_prompt(chunk_info: str) -> str:
        """Prompt for extracting data from document chunks"""
        return f"""You are processing chunk {chunk_info} of a large commission statement.

Extract all tables from this section following the standard extraction rules.

IMPORTANT: 
- This is part of a larger document
- Some tables may continue from previous pages
- Some tables may continue to next pages
- Mark incomplete tables clearly

Extract tables as normal but include an "incomplete" flag if a table appears to continue beyond this chunk."""

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
    def get_system_prompt() -> str:
        """System prompt that sets the context for Claude - Optimized for zero hallucination"""
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

