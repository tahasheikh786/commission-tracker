"""
Context-Aware Extraction Service - LLM-Driven Summary Row Detection

This module implements intelligent summary row detection using Claude's contextual
understanding instead of hard-coded patterns. It uses a three-pass approach:
1. Analyze table structure and infer meaning
2. Classify each row based on context
3. Validate and reconcile amounts

Key Features:
- Zero carrier-specific configuration
- Automatically adapts to new table structures
- Handles edge cases intelligently
- Provides confidence scores and reasoning
- More accurate than rule-based systems
"""

import json
import logging
from typing import Dict, List, Any, Tuple, Optional
import os

logger = logging.getLogger(__name__)


class ContextAwarePrompts:
    """
    Context-aware prompts for intelligent summary row detection.
    Uses Claude's reasoning to identify patterns without hard-coded rules.
    """
    
    @staticmethod
    def get_table_analysis_prompt(table_text: str, is_financial: bool = True) -> str:
        """
        First pass: Analyze table structure and infer meaning.
        
        Args:
            table_text: Raw table content
            is_financial: Whether this is a financial table
            
        Returns:
            Prompt for table structure analysis
        """
        return f"""You are an expert at analyzing financial and data tables in documents.
Your task is to UNDERSTAND the structure and meaning of this table.

TABLE TEXT:
{table_text}

ANALYSIS TASK:
1. First, examine ALL rows in the table carefully
2. Infer what each column represents (don't assume names, look at data patterns)
3. Identify the hierarchical structure of the data
4. Determine what type of data this is (detail rows vs summary rows)

THINK THROUGH THESE QUESTIONS:
- What is the primary purpose of each column?
- Is there a natural grouping or hierarchy in the data?
- Do any rows appear to be aggregations of other rows?
- What patterns do you see in the data?
- Are amounts in columns increasing, decreasing, or varying?
- Do you see repeated patterns that suggest sections?

PROVIDE YOUR ANALYSIS IN THIS FORMAT:
{{
  "table_type": "What type of table is this?",
  "purpose": "What is the purpose of this table?",
  "columns": [
    {{"column_index": 0, "likely_content": "What does this column contain?", "data_pattern": "Examples of values"}},
    {{"column_index": 1, "likely_content": "...", "data_pattern": "..."}}
  ],
  "data_structure": "Describe the hierarchy and structure",
  "observations": "Key observations about the data patterns",
  "potential_summary_indicators": "What might indicate a summary row in this table?"
}}

IMPORTANT:
- Base your analysis on actual data patterns, not column header names
- Look at row relationships, not just individual rows
- Identify natural aggregation points in the data
- Don't assume anything - derive from the data itself

Return ONLY the JSON object, no additional text."""
    
    @staticmethod
    def get_row_classification_prompt(
        table_text: str,
        column_analysis: dict,
        document_context: str = ""
    ) -> str:
        """
        Second pass: Classify each row based on contextual understanding.
        
        Args:
            table_text: Raw table content
            column_analysis: Analysis from first pass
            document_context: Context about the document
            
        Returns:
            Prompt for row classification
        """
        return f"""Based on your analysis of this table's structure, classify each row as either:
- "DATA_ROW": Contains individual detail/transaction data
- "SUMMARY_ROW": Aggregates or summarizes data from other rows
- "METADATA_ROW": Contains metadata or non-data information
- "SUBTOTAL_ROW": Partial aggregation or section total

TABLE TEXT:
{table_text}

YOUR PREVIOUS ANALYSIS:
{json.dumps(column_analysis, indent=2)}

DOCUMENT CONTEXT:
{document_context or "This appears to be a financial/data summary table"}

CLASSIFICATION LOGIC:
For each row, determine if it's a summary by reasoning:

1. AMOUNT RECONCILIATION: If this row has amounts, could they be the sum of other rows?
2. IDENTIFIER PATTERNS: Does this row have the same identifiers as groups of other rows?
3. SPARSE DATA: Is this row less populated than detail rows (suggesting aggregation)?
4. POSITION & CONTEXT: Does its position suggest it's a total? (last row, after grouped section?)
5. SEMANTIC MEANING: Does the text explicitly suggest it's a total/summary?
6. HIERARCHICAL ROLE: Does this row appear above or below detail rows in a way that suggests aggregation?

IMPORTANT EDGE CASES:
- Company names like "Total Logistics LLC" or "Subtotal Services" are DATA rows, not summaries
- Check if "Total" is part of a company name (has LLC, INC, CORP) vs a summary label
- Empty identifier columns combined with populated amount columns often indicate summary rows
- Single transaction rows are DATA rows even if amounts are large

PROVIDE CLASSIFICATION IN THIS EXACT FORMAT:
{{
  "rows": [
    {{
      "row_index": 0,
      "row_text": "First few cells of row",
      "classification": "DATA_ROW",
      "confidence": 0.95,
      "reasoning": "Explain your reasoning based on the logic above",
      "key_indicators": ["indicator1", "indicator2"],
      "is_summary": false
    }},
    {{
      "row_index": 1,
      "row_text": "First few cells of row",
      "classification": "SUMMARY_ROW",
      "confidence": 0.92,
      "reasoning": "This row appears to aggregate amounts from previous rows",
      "key_indicators": ["empty_identifiers", "large_amount", "last_row_position"],
      "is_summary": true
    }}
  ],
  "pattern_summary": "What patterns did you use to classify rows?",
  "confidence_notes": "Any rows you're uncertain about?"
}}

CRITICAL INSTRUCTIONS:
- Classify EVERY row - do not skip any
- Base classification on data patterns, not assumptions
- Be explicit about your reasoning
- If uncertain, provide lower confidence but still classify
- Consider the overall table structure when classifying
- Think about whether the amounts make logical sense

Return ONLY the JSON object, no additional text."""
    
    @staticmethod
    def get_validation_and_reconciliation_prompt(
        table_text: str,
        row_classifications: dict,
        known_total: Optional[float] = None
    ) -> str:
        """
        Third pass: Validate classifications and reconcile amounts.
        
        Args:
            table_text: Raw table content
            row_classifications: Classifications from second pass
            known_total: Known document total if available
            
        Returns:
            Prompt for validation and reconciliation
        """
        total_info = f"KNOWN DOCUMENT TOTAL: ${known_total:,.2f}" if known_total else "KNOWN DOCUMENT TOTAL: Not provided"
        
        return f"""Based on the row classifications you provided, validate and reconcile the data.

TABLE TEXT:
{table_text}

ROW CLASSIFICATIONS:
{json.dumps(row_classifications, indent=2)}

{total_info}

VALIDATION TASKS:

1. AMOUNT RECONCILIATION:
   For each row classified as SUMMARY_ROW, verify:
   - Do its amounts equal the sum of detail rows they should represent?
   - Are there any amount mismatches that suggest misclassification?
   - Flag any anomalies

2. CLASSIFICATION VALIDATION:
   - Are there any rows that should be reclassified based on the overall pattern?
   - Are all DATA_ROWs consistent with each other?
   - Do SUMMARY_ROWs appear in logical positions?

3. LOGICAL CONSISTENCY:
   - Do the hierarchical relationships make sense?
   - Are there any grouped sections that don't have a summary?
   - Are summary rows positioned logically (at section ends)?

4. TOTAL RECONCILIATION:
   {f"- Sum up all DATA_ROWs only and compare to ${known_total:,.2f}" if known_total else "- Calculate the sum of all DATA_ROWs"}
   - Flag if there's a mismatch > 1%

PROVIDE VALIDATION RESULTS:
{{
  "validation_status": "PASS or FAIL",
  "data_row_count": 0,
  "summary_row_count": 0,
  "calculated_total": 0.0,
  "known_total": {known_total if known_total else "null"},
  "total_matches": true,
  "reconciliation_issues": [
    {{"row_index": 0, "issue": "description", "suggested_fix": "what to do"}}
  ],
  "reclassifications_needed": [
    {{"row_index": 5, "current": "DATA_ROW", "suggested": "SUMMARY_ROW", "reason": "..."}}
  ],
  "final_classification": [
    {{"row_index": 0, "final_class": "DATA_ROW", "confidence": 0.95}}
  ],
  "data_quality_assessment": "Overall assessment of data quality and confidence"
}}

IMPORTANT:
- Be honest about any mismatches or issues
- Flag rows that don't make logical sense
- Suggest reclassifications if amounts don't reconcile
- Provide clear reasoning for any corrections

Return ONLY the JSON object, no additional text."""
    
    @staticmethod
    def get_combined_prompt(
        table_text: str,
        document_context: str = "",
        known_total: Optional[float] = None
    ) -> str:
        """
        Combined prompt: All-in-one intelligent detection.
        Use this for simpler tables or faster processing.
        
        Args:
            table_text: Raw table content
            document_context: Context about the document
            known_total: Known document total if available
            
        Returns:
            Combined prompt for single-pass extraction
        """
        total_info = f"Document Total: ${known_total:,.2f}" if known_total else "Document Total: Unknown"
        
        return f"""You are an expert at understanding financial and data tables.
Analyze this table intelligently to identify and classify all rows.

TABLE DATA:
{table_text}

DOCUMENT TYPE: {document_context or "Financial/Commission Statement"}
{total_info}

YOUR TASK:
Examine the table and for EACH ROW, determine if it's:
- A DATA ROW: Individual transaction or data point
- A SUMMARY ROW: Aggregates data from multiple other rows
- A SUBTOTAL: Partial summary within a group
- METADATA: Headers, notes, or non-data content

THINK LIKE A BUSINESS ANALYST:
- What is this table tracking?
- How is the data organized?
- Where do totals/summaries logically appear?
- Do amounts add up correctly?
- What patterns suggest hierarchy?

CRITICAL EDGE CASES:
- Company names like "Total Logistics LLC" are DATA rows, not summaries
- Check if "Total" is part of a company name (has LLC, INC, CORP)
- Empty identifier columns + populated amounts often = summary row
- Single large transactions are still DATA rows

FOR EACH ROW, PROVIDE:
1. Your best classification
2. Confidence (0.0 to 1.0)
3. Why you classified it that way
4. Key indicators that led to this classification

PROVIDE OUTPUT AS VALID JSON:
{{
  "table_analysis": {{
    "identified_purpose": "What is this table for?",
    "data_hierarchy": "How is data organized?",
    "total_rows": 0,
    "estimated_detail_rows": 0,
    "estimated_summary_rows": 0
  }},
  "row_classifications": [
    {{
      "row_index": 0,
      "sample_content": "Show first 2-3 cells",
      "type": "DATA_ROW",
      "confidence": 0.95,
      "reasoning": "Why this classification?",
      "indicators": ["indicator1", "indicator2", "indicator3"]
    }}
  ],
  "summary_rows_identified": [],
  "data_rows_identified": [],
  "reconciliation": {{
    "sum_of_data_rows": 0.0,
    "expected_total": "{total_info}",
    "reconciliation_notes": "Do amounts make sense?"
  }},
  "confidence_assessment": {{
    "high_confidence_count": 0,
    "medium_confidence_count": 0,
    "low_confidence_count": 0,
    "overall_quality": "High"
  }},
  "potential_issues": [
    {{"issue": "description", "impact": "high", "suggestion": "how to resolve"}}
  ]
}}

CRITICAL GUIDELINES:
✓ Classify every single row - no skipping
✓ Think about CONTEXT, not just keywords
✓ Consider the logical structure of the data
✓ Validate amounts make sense
✓ Be explicit about your reasoning
✓ Flag any uncertainty or inconsistencies
✓ Provide JSON that is valid and parseable

If you see:
- Amount totals that don't match → Note it
- Rows that don't fit the pattern → Note it
- Logical inconsistencies → Note it
- High uncertainty → Lower the confidence score

Return ONLY the JSON object, no additional text."""


class ContextAwareExtractionService:
    """
    Three-pass intelligent extraction service.
    
    Uses Claude's reasoning to detect summary rows without hard-coded patterns:
    1. Analyze table structure and infer meaning
    2. Classify each row based on context
    3. Validate and reconcile amounts
    """
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize context-aware extraction service.
        
        Args:
            api_key: Optional Anthropic API key (uses env var if not provided)
        """
        try:
            from anthropic import Anthropic
            self.api_key = api_key or os.getenv("CLAUDE_API_KEY")
            if not self.api_key:
                raise ValueError("CLAUDE_API_KEY not found in environment variables")
            self.client = Anthropic(api_key=self.api_key)
            self.model = "claude-sonnet-4-5-20250929"
            logger.info("✅ Context-aware extraction service initialized")
        except ImportError:
            logger.error("Anthropic SDK not available. Install with: pip install anthropic")
            raise
        except Exception as e:
            logger.error(f"Failed to initialize context-aware extraction service: {e}")
            raise
    
    def extract_with_context(
        self,
        table_text: str,
        document_context: str = "",
        document_total: Optional[float] = None,
        use_combined_prompt: bool = False
    ) -> Dict[str, Any]:
        """
        Extract table data with intelligent summary row detection.
        
        Args:
            table_text: Raw table content from PDF/image
            document_context: Context about the document (carrier, statement type)
            document_total: Known document total (if available)
            use_combined_prompt: If True, use single combined prompt; if False, use 3-pass approach
            
        Returns:
            Structured extraction with row classifications
        """
        try:
            if use_combined_prompt:
                return self._extract_combined_pass(
                    table_text=table_text,
                    document_context=document_context,
                    document_total=document_total
                )
            else:
                return self._extract_three_pass(
                    table_text=table_text,
                    document_context=document_context,
                    document_total=document_total
                )
        except Exception as e:
            logger.error(f"Context-aware extraction failed: {e}")
            return {
                "status": "error",
                "error": str(e),
                "summary_rows": [],
                "data_rows": []
            }
    
    def _extract_three_pass(
        self,
        table_text: str,
        document_context: str,
        document_total: Optional[float]
    ) -> Dict[str, Any]:
        """
        Three-pass extraction process for maximum accuracy.
        
        Args:
            table_text: Raw table content
            document_context: Context about the document
            document_total: Known document total
            
        Returns:
            Structured extraction results
        """
        # PASS 1: Analyze table structure
        logger.info("PASS 1: Analyzing table structure and inferring meaning...")
        analysis = self._pass_one_analyze_structure(table_text)
        logger.info(f"Table analysis complete: {analysis.get('table_type', 'Unknown')}")
        
        # PASS 2: Classify rows based on context
        logger.info("PASS 2: Classifying rows based on contextual understanding...")
        classifications = self._pass_two_classify_rows(
            table_text=table_text,
            column_analysis=analysis,
            document_context=document_context
        )
        
        rows_data = classifications.get('rows', [])
        summary_count = len([r for r in rows_data if r.get('is_summary')])
        logger.info(f"Classification complete: {summary_count} summary rows identified")
        
        # PASS 3: Validate and reconcile
        logger.info("PASS 3: Validating classifications and reconciling amounts...")
        validation = self._pass_three_validate(
            table_text=table_text,
            classifications=classifications,
            document_total=document_total
        )
        logger.info(f"Validation complete: {validation.get('validation_status', 'Unknown')}")
        
        # Combine results
        result = {
            "status": "success",
            "table_analysis": analysis,
            "row_classifications": classifications,
            "validation": validation,
            "summary_rows": [
                r["row_index"] for r in rows_data
                if r.get("is_summary", False)
            ],
            "data_rows": [
                r["row_index"] for r in rows_data
                if not r.get("is_summary", False) and r.get("classification") == "DATA_ROW"
            ]
        }
        
        return result
    
    def _pass_one_analyze_structure(self, table_text: str) -> Dict[str, Any]:
        """
        Pass 1: Analyze table structure.
        
        Args:
            table_text: Raw table content
            
        Returns:
            Table structure analysis
        """
        prompt = ContextAwarePrompts.get_table_analysis_prompt(table_text)
        
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}]
            )
            
            response_text = response.content[0].text
            analysis = self._extract_json_from_response(response_text)
            return analysis
            
        except Exception as e:
            logger.error(f"Pass 1 failed: {e}")
            return {"error": str(e), "raw_response": str(e)}
    
    def _pass_two_classify_rows(
        self,
        table_text: str,
        column_analysis: Dict[str, Any],
        document_context: str
    ) -> Dict[str, Any]:
        """
        Pass 2: Classify rows based on context.
        
        Args:
            table_text: Raw table content
            column_analysis: Analysis from pass 1
            document_context: Document context
            
        Returns:
            Row classifications
        """
        prompt = ContextAwarePrompts.get_row_classification_prompt(
            table_text=table_text,
            column_analysis=column_analysis,
            document_context=document_context
        )
        
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4000,
                messages=[{"role": "user", "content": prompt}]
            )
            
            response_text = response.content[0].text
            classifications = self._extract_json_from_response(response_text)
            return classifications
            
        except Exception as e:
            logger.error(f"Pass 2 failed: {e}")
            return {"error": str(e), "rows": []}
    
    def _pass_three_validate(
        self,
        table_text: str,
        classifications: Dict[str, Any],
        document_total: Optional[float]
    ) -> Dict[str, Any]:
        """
        Pass 3: Validate and reconcile.
        
        Args:
            table_text: Raw table content
            classifications: Classifications from pass 2
            document_total: Known document total
            
        Returns:
            Validation results
        """
        prompt = ContextAwarePrompts.get_validation_and_reconciliation_prompt(
            table_text=table_text,
            row_classifications=classifications,
            known_total=document_total
        )
        
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}]
            )
            
            response_text = response.content[0].text
            validation = self._extract_json_from_response(response_text)
            return validation
            
        except Exception as e:
            logger.error(f"Pass 3 failed: {e}")
            return {"error": str(e), "validation_status": "FAIL"}
    
    def _extract_combined_pass(
        self,
        table_text: str,
        document_context: str,
        document_total: Optional[float]
    ) -> Dict[str, Any]:
        """
        Single-pass extraction (faster, less accurate).
        Use for simple tables or when speed is critical.
        
        Args:
            table_text: Raw table content
            document_context: Document context
            document_total: Known document total
            
        Returns:
            Extraction results
        """
        prompt = ContextAwarePrompts.get_combined_prompt(
            table_text=table_text,
            document_context=document_context,
            known_total=document_total
        )
        
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4000,
                messages=[{"role": "user", "content": prompt}]
            )
            
            response_text = response.content[0].text
            extraction = self._extract_json_from_response(response_text)
            
            # Convert to standardized format
            result = {
                "status": "success",
                "extraction": extraction,
                "summary_rows": extraction.get("summary_rows_identified", []),
                "data_rows": extraction.get("data_rows_identified", [])
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Combined pass failed: {e}")
            return {
                "status": "error",
                "error": str(e),
                "summary_rows": [],
                "data_rows": []
            }
    
    def _extract_json_from_response(self, response_text: str) -> Dict[str, Any]:
        """
        Extract JSON from Claude's response.
        
        Args:
            response_text: Raw response from Claude
            
        Returns:
            Parsed JSON object
        """
        try:
            # Try to find JSON in the response
            start_idx = response_text.find('{')
            end_idx = response_text.rfind('}') + 1
            
            if start_idx != -1 and end_idx > start_idx:
                json_str = response_text[start_idx:end_idx]
                return json.loads(json_str)
            else:
                logger.warning("No JSON found in response")
                return {"raw_response": response_text}
                
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {e}")
            return {"raw_response": response_text, "parse_error": str(e)}

