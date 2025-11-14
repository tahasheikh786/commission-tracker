"""
Utility functions for Claude Document AI service.

This module provides helper functions for PDF processing, token estimation,
error handling, and quality assessment.
"""

import os
import base64
import logging
import time
import threading
import asyncio
import random
from collections import deque
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
import json
import re

try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    logging.warning("PyMuPDF not available. PDF processing will be limited.")

try:
    import tiktoken
    TIKTOKEN_AVAILABLE = True
except ImportError:
    TIKTOKEN_AVAILABLE = False
    logging.warning("tiktoken not available. Token estimation will be approximate.")

logger = logging.getLogger(__name__)


class ClaudeTokenBucket:
    """
    Token bucket algorithm for Claude API rate limiting.
    
    OPTIMIZED LIMITS (Based on Claude Sonnet 4.5 Tier 2):
    - Requests: 50 RPM → 45 RPM (with 90% buffer)
    - Tokens: 40,000 TPM → 36,000 TPM (with 90% buffer) ✅ UPDATED
    - Use 90% buffer (safe with concurrency control)
    
    This prevents rate limit errors before they occur by managing token consumption proactively.
    """
    
    def __init__(
        self,
        requests_per_minute: int = 50,
        tokens_per_minute: int = 40000,  # Claude Sonnet 4.5 Tier 2 = 40,000 TPM
        buffer_percentage: float = 0.90  # ✅ INCREASED to 90% (was 80%) - we have concurrency control now
    ):
        """
        Initialize token bucket rate limiter with INTELLIGENT WAITING.
        
        Args:
            requests_per_minute: Maximum requests per minute (50 for Tier 2)
            tokens_per_minute: Maximum tokens per minute (40,000 for Claude Tier 2)
            buffer_percentage: Use 90% of limits (safe with concurrency control)
        """
        self.rpm_limit = int(requests_per_minute * buffer_percentage)  # 45 RPM
        self.tpm_limit = int(tokens_per_minute * buffer_percentage)    # 36,000 TPM
        
        # Current usage tracking
        self.request_count = 0
        self.token_count = 0
        
        # Timestamp tracking
        self.window_start = time.time()
        self.lock = asyncio.Lock()  # ✅ Changed to asyncio.Lock for async compatibility
        
        self.logger = logging.getLogger(__name__)
        self.logger.info(f"🔧 Token Bucket initialized:")
        self.logger.info(f"   RPM Limit: {self.rpm_limit} (from {requests_per_minute})")
        self.logger.info(f"   TPM Limit: {self.tpm_limit:,} (from {tokens_per_minute:,})")
        self.logger.info(f"   Buffer: {buffer_percentage * 100:.0f}%")
        # Calculate max pages per chunk
        available_tokens_for_pages = self.tpm_limit - 3000  # Reserve 3K for prompt
        max_pages_per_chunk = int(available_tokens_for_pages / 2750)  # DIVIDE to get pages
        self.logger.info(f"   Max chunk: {max_pages_per_chunk} pages = {max_pages_per_chunk * 2750:,} tokens + 3K prompt")
    
    def estimate_tokens(self, text: str, images: int = 0, pdf_pages: int = 0) -> int:
        """
        Estimate token count for a request.
        PDF pages: ~2,500-3,000 tokens per page
        Images: ~3,000 tokens per image
        """
        # Text tokens: rough estimation (1 token ≈ 4 characters)
        text_tokens = len(text) // 4
        
        # Image tokens
        image_tokens = images * 3000
        
        # PDF tokens (more accurate for PDFs)
        pdf_tokens = pdf_pages * 2750  # Avg tokens per page
        
        # Add 20% buffer for safety
        total = int((text_tokens + image_tokens + pdf_tokens) * 1.2)
        
        return total
    
    async def wait_if_needed(self, estimated_tokens: int) -> float:
        """
        Intelligent waiting - only wait for what's needed (not full reset).
        
        OPTIMIZATION: Partial reset strategy with intelligent minimum waiting
        
        Returns:
            Wait time in seconds (0.0 if no wait needed)
        """
        async with self.lock:
            current_time = time.time()
            elapsed = current_time - self.window_start
            
            # Reset window if 60 seconds passed
            if elapsed >= 60:
                self.request_count = 0
                self.token_count = 0
                self.window_start = current_time
                self.logger.info("✅ Token bucket reset (60s window)")
                
                # Reserve tokens immediately
                self.request_count += 1
                self.token_count += estimated_tokens
                return 0.0
            
            # Check if we need to wait
            requests_available = self.request_count < self.rpm_limit
            tokens_available = (self.token_count + estimated_tokens) <= self.tpm_limit
            
            if requests_available and tokens_available:
                # Reserve tokens immediately
                self.request_count += 1
                self.token_count += estimated_tokens
                return 0.0
            
            # Calculate MINIMUM wait time (not full reset)
            time_until_reset = 60 - elapsed
            
            # Partial reset strategy: wait only for tokens to decay
            if not tokens_available:
                # Calculate how many tokens will decay in next few seconds
                tokens_needed = (self.token_count + estimated_tokens) - self.tpm_limit
                # Assume linear decay over 60s window
                seconds_to_wait = (tokens_needed / self.tpm_limit) * 60
                seconds_to_wait = min(seconds_to_wait, time_until_reset)
            else:
                # Just wait for request window
                seconds_to_wait = time_until_reset
            
            # Wait only the minimum required time
            self.logger.info(f"⏳ Rate limit: waiting {seconds_to_wait:.1f}s (was waiting full {time_until_reset:.1f}s)")
            await asyncio.sleep(seconds_to_wait)
            
            # After waiting, reset appropriately
            elapsed_after_wait = time.time() - self.window_start
            if elapsed_after_wait >= 60:
                self.request_count = 0
                self.token_count = 0
                self.window_start = time.time()
            
            # Reserve tokens
            self.request_count += 1
            self.token_count += estimated_tokens
            
            self.logger.info(
                f"📊 Rate limit status: "
                f"{self.request_count}/{self.rpm_limit} RPM, "
                f"{self.token_count:,}/{self.tpm_limit:,} TPM"
            )
            
            return seconds_to_wait
    
    def update_actual_usage(self, actual_tokens: int):
        """Update token count with actual usage after API call."""
        # Adjust the token count if actual usage is known
        # This helps improve accuracy over time
        pass  # Current implementation uses estimated tokens which is safer


class ClaudePDFProcessor:
    """Handles PDF processing for Claude API"""
    
    @staticmethod
    def get_pdf_info(file_path: str) -> Dict[str, Any]:
        """Get PDF file information"""
        try:
            file_size_bytes = os.path.getsize(file_path)
            file_size_mb = file_size_bytes / (1024 * 1024)
            
            if not PYMUPDF_AVAILABLE:
                return {
                    'file_size_bytes': file_size_bytes,
                    'file_size_mb': file_size_mb,
                    'page_count': 0,
                    'error': 'PyMuPDF not available'
                }
            
            doc = fitz.open(file_path)
            page_count = len(doc)
            doc.close()
            
            return {
                'file_size_bytes': file_size_bytes,
                'file_size_mb': file_size_mb,
                'page_count': page_count,
                'is_large_file': file_size_mb > 20 or page_count > 50
            }
        except Exception as e:
            logger.error(f"Error getting PDF info: {e}")
            return {
                'file_size_bytes': 0,
                'file_size_mb': 0,
                'page_count': 0,
                'error': str(e)
            }
    
    @staticmethod
    def encode_pdf_to_base64(file_path: str) -> str:
        """Encode PDF file to base64 for API transmission"""
        try:
            with open(file_path, 'rb') as f:
                pdf_data = f.read()
            return base64.b64encode(pdf_data).decode('utf-8')
        except Exception as e:
            logger.error(f"Error encoding PDF to base64: {e}")
            raise
    
    @staticmethod
    def validate_pdf_size(file_path: str, max_size_mb: int = 32) -> Tuple[bool, Optional[str]]:
        """Validate PDF size against Claude's limits"""
        try:
            file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
            
            if file_size_mb > max_size_mb:
                return False, f"File size {file_size_mb:.2f}MB exceeds maximum {max_size_mb}MB"
            
            return True, None
        except Exception as e:
            return False, f"Error validating file size: {str(e)}"
    
    @staticmethod
    def validate_pdf_pages(file_path: str, max_pages: int = 100) -> Tuple[bool, Optional[str]]:
        """Validate PDF page count against Claude's limits"""
        try:
            if not PYMUPDF_AVAILABLE:
                return True, None  # Skip validation if PyMuPDF not available
            
            doc = fitz.open(file_path)
            page_count = len(doc)
            doc.close()
            
            if page_count > max_pages:
                return False, f"Document has {page_count} pages, exceeds maximum {max_pages}"
            
            return True, None
        except Exception as e:
            return False, f"Error validating page count: {str(e)}"
    
    @staticmethod
    def chunk_large_pdf(file_path: str, max_pages_per_chunk: int = 20) -> List[Dict[str, Any]]:
        """
        Split large PDF into smaller chunks while preserving context.
        Returns list of chunks with actual PDF data for processing.
        
        Strategy: Split by page ranges with optimal chunk size for rate limiting
        ✅ REDUCED FROM 25 TO 20 pages per chunk for better rate limit management
        """
        try:
            if not PYMUPDF_AVAILABLE:
                raise ValueError("PyMuPDF required for PDF chunking")
            
            doc = fitz.open(file_path)
            total_pages = len(doc)
            
            chunks = []
            total_chunks = (total_pages + max_pages_per_chunk - 1) // max_pages_per_chunk
            
            for i in range(0, total_pages, max_pages_per_chunk):
                chunk_start = i
                chunk_end = min(i + max_pages_per_chunk, total_pages)
                
                # Create sub-PDF for this chunk
                chunk_doc = fitz.open()
                chunk_doc.insert_pdf(doc, from_page=chunk_start, to_page=chunk_end - 1)
                
                # Convert to base64
                chunk_bytes = chunk_doc.write()
                chunk_base64 = base64.b64encode(chunk_bytes).decode('utf-8')
                
                estimated_tokens = (chunk_end - chunk_start) * 2750  # Avg tokens per page
                
                chunks.append({
                    'chunk_index': len(chunks),
                    'total_chunks': total_chunks,
                    'start_page': chunk_start + 1,  # 1-indexed for display
                    'end_page': chunk_end,
                    'page_count': chunk_end - chunk_start,
                    'data': chunk_base64,
                    'estimated_tokens': estimated_tokens
                })
                
                chunk_doc.close()
                
                logger.info(
                    f"📄 Created chunk {len(chunks)}/{total_chunks}: "
                    f"Pages {chunk_start + 1}-{chunk_end} "
                    f"(~{estimated_tokens:,} tokens)"
                )
            
            doc.close()
            
            return chunks
        except Exception as e:
            logger.error(f"Error chunking PDF: {e}")
            raise
    
    @staticmethod
    def should_chunk_pdf(file_path: str, max_pages: int = 30) -> bool:
        """
        Determine if PDF should be chunked based on size and token estimates.
        
        Args:
            file_path: Path to PDF file
            max_pages: Maximum pages before chunking (default 30)
            
        Returns:
            True if PDF should be chunked
        """
        try:
            if not PYMUPDF_AVAILABLE:
                return False
            
            doc = fitz.open(file_path)
            page_count = len(doc)
            doc.close()
            
            # Chunk if > 30 pages OR estimated tokens > 25,000
            estimated_tokens = page_count * 2750
            
            return page_count > max_pages or estimated_tokens > 25000
        except Exception as e:
            logger.error(f"Error checking if PDF should chunk: {e}")
            return False


class ClaudeTokenEstimator:
    """Estimates token usage for cost optimization"""
    
    def __init__(self):
        self.encoder = None
        if TIKTOKEN_AVAILABLE:
            try:
                # Use cl100k_base encoding (similar to Claude's tokenization)
                self.encoder = tiktoken.get_encoding("cl100k_base")
            except Exception as e:
                logger.warning(f"Could not initialize tiktoken encoder: {e}")
    
    def estimate_tokens(self, text: str) -> int:
        """Estimate token count for text"""
        if self.encoder:
            return len(self.encoder.encode(text))
        else:
            # Rough approximation: ~4 characters per token
            return len(text) // 4
    
    def estimate_pdf_tokens(self, file_path: str) -> Dict[str, Any]:
        """Estimate token usage for PDF processing"""
        try:
            pdf_info = ClaudePDFProcessor.get_pdf_info(file_path)
            
            # Rough estimation: ~500-1000 tokens per page for typical documents
            estimated_input_tokens = pdf_info.get('page_count', 0) * 750
            # Assume output is ~30% of input for table extraction
            estimated_output_tokens = int(estimated_input_tokens * 0.3)
            
            return {
                'estimated_input_tokens': estimated_input_tokens,
                'estimated_output_tokens': estimated_output_tokens,
                'estimated_total_tokens': estimated_input_tokens + estimated_output_tokens,
                'page_count': pdf_info.get('page_count', 0)
            }
        except Exception as e:
            logger.error(f"Error estimating PDF tokens: {e}")
            return {
                'estimated_input_tokens': 0,
                'estimated_output_tokens': 0,
                'estimated_total_tokens': 0,
                'error': str(e)
            }


class ClaudeResponseParser:
    """Parses and validates Claude API responses"""
    
    @staticmethod
    def parse_json_response(response_text: str) -> Optional[Dict[str, Any]]:
        """
        Parse JSON response from Claude - ROBUST HANDLING of multiple formats.
        
        Handles:
        - Pure JSON: {"key": "value"}
        - Markdown wrapped: ```json\n{...}\n```
        - Conversational with JSON: "Here's the data:\n```json\n{...}\n```"
        - Markdown tables (fallback)
        
        Returns empty structure on failure to prevent downstream errors
        """
        if not response_text:
            logger.error("Empty response from Claude")
            return ClaudeResponseParser._create_empty_structure()
        
        # Try 1: Parse as pure JSON
        try:
            return json.loads(response_text.strip())
        except json.JSONDecodeError:
            pass
        
        # Try 2: Extract JSON from markdown code blocks
        # Pattern: ```json\n{...}\n```
        json_pattern = r'```(?:json)?\s*\n?(.*?)\n?```'
        matches = re.findall(json_pattern, response_text, re.DOTALL)
        
        for match in matches:
            try:
                parsed = json.loads(match.strip())
                return ClaudeResponseParser._validate_and_fix_structure(parsed)
            except json.JSONDecodeError:
                continue
        
        # Try 3: Find JSON object anywhere in response
        # Look for {..."tables"...}
        json_obj_pattern = r'\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}'
        matches = re.findall(json_obj_pattern, response_text, re.DOTALL)
        
        for match in matches:
            try:
                data = json.loads(match)
                if "tables" in data:  # Validate it's our expected format
                    return ClaudeResponseParser._validate_and_fix_structure(data)
            except json.JSONDecodeError:
                continue
        
        # Try 4: Extract tables from markdown format
        logger.warning("Could not find JSON, attempting to parse markdown tables")
        markdown_result = ClaudeResponseParser._parse_markdown_tables(response_text)
        if markdown_result and markdown_result.get("tables"):
            return markdown_result
        
        # All strategies failed - return empty structure
        logger.error("All parsing strategies failed")
        logger.error(f"Response text (first 500 chars): {response_text[:500]}")
        if len(response_text) > 500:
            logger.error(f"Response text (last 200 chars): ...{response_text[-200:]}")
        return ClaudeResponseParser._create_empty_structure()
    
    @staticmethod
    def _parse_markdown_tables(response_text: str) -> Dict[str, Any]:
        """Fallback: Parse markdown tables into JSON format."""
        tables = []
        
        # Pattern for markdown tables: | header | header |\n|---|---|\n| data | data |
        table_pattern = r'\|(.+?)\|(?:\n\|[-:| ]+\|)?\n((?:\|.+?\|\n?)+)'
        matches = re.findall(table_pattern, response_text, re.MULTILINE)
        
        for header_row, data_rows in matches:
            headers = [h.strip() for h in header_row.split('|') if h.strip()]
            
            rows = []
            for row in data_rows.strip().split('\n'):
                if row.strip():
                    cells = [c.strip() for c in row.split('|')[1:-1]]  # Skip first/last empty
                    if cells:
                        rows.append(cells)
            
            if headers and rows:
                tables.append({
                    "headers": headers,
                    "rows": rows,
                    "incomplete": False
                })
        
        return {"tables": tables, "document_metadata": {}} if tables else ClaudeResponseParser._create_empty_structure()
    
    @staticmethod
    def _validate_and_fix_structure(parsed: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate and fix parsed JSON structure to ensure it has required fields.
        """
        # Ensure tables field exists and is a list
        if 'tables' not in parsed:
            parsed['tables'] = []
        elif not isinstance(parsed['tables'], list):
            logger.warning(f"'tables' field is not a list, converting: {type(parsed['tables'])}")
            parsed['tables'] = []
        
        # Ensure document_metadata field exists
        if 'document_metadata' not in parsed:
            parsed['document_metadata'] = {}
        elif not isinstance(parsed['document_metadata'], dict):
            logger.warning(f"'document_metadata' field is not a dict, resetting")
            parsed['document_metadata'] = {}
        
        # Validate each table has required fields
        valid_tables = []
        for idx, table in enumerate(parsed['tables']):
            if not isinstance(table, dict):
                logger.warning(f"Table {idx} is not a dict, skipping")
                continue
            
            # Ensure headers and rows exist
            if 'headers' not in table:
                table['headers'] = []
            if 'rows' not in table:
                table['rows'] = []
            
            # Only include tables with actual content
            if table['headers'] or table['rows']:
                valid_tables.append(table)
        
        parsed['tables'] = valid_tables
        return parsed
    
    @staticmethod
    def _create_empty_structure() -> Dict[str, Any]:
        """
        Create a valid empty extraction structure.
        This prevents None values from causing downstream errors.
        """
        return {
            'tables': [],
            'document_metadata': {
                'carrier_name': None,
                'carrier_confidence': 0.0,
                'statement_date': None,
                'date_confidence': 0.0,
                'broker_company': None,
                'broker_confidence': 0.0
            },
            'extraction_quality': {
                'overall_confidence': 0.0,
                'quality_grade': 'F',
                'issues_detected': ['Failed to parse Claude response - no valid JSON found']
            }
        }
    
    @staticmethod
    def validate_carrier_extraction(extracted_name: str, pdf_text: str = None) -> Dict[str, Any]:
        """
        Verify carrier name was extracted exactly as shown.
        Returns validation results with flagged issues.
        
        This validation helps prevent duplicate carrier entries by detecting
        when text has been added or modified during extraction.
        
        Args:
            extracted_name: The carrier name extracted by Claude
            pdf_text: Optional PDF text content for verification (if available)
            
        Returns:
            Dict with validation results:
            - is_exact_match: Whether name appears in source text
            - found_in_source: Whether name was found (if pdf_text provided)
            - has_additions: Whether suspicious additions detected
            - warnings: List of specific issues found
            - quality_score: Overall quality score (0.0-1.0)
        """
        validation = {
            'is_exact_match': True,
            'found_in_source': None,
            'has_additions': False,
            'warnings': [],
            'quality_score': 1.0
        }
        
        if not extracted_name:
            validation['warnings'].append("Carrier name is empty")
            validation['quality_score'] = 0.0
            return validation
        
        # Check if carrier name appears in source PDF text (if provided)
        if pdf_text:
            if extracted_name in pdf_text:
                validation['found_in_source'] = True
                validation['is_exact_match'] = True
            else:
                validation['found_in_source'] = False
                validation['is_exact_match'] = False
                validation['warnings'].append(f"Carrier name '{extracted_name}' not found in source document")
                validation['quality_score'] -= 0.3
        
        # Check for common additions that indicate hallucination
        suspicious_patterns = [
            (r'\([A-Z]+\)$', 'Abbreviation in parentheses at end', 0.4),  # (ABSF), (UHC), etc.
            (r'\([A-Za-z\s]+\)$', 'Text in parentheses at end', 0.3),  # (United Health), etc.
            (r'\[[A-Z]+\]$', 'Abbreviation in brackets at end', 0.4),  # [ABSF]
            (r'\s+LLC$', 'Added LLC suffix', 0.2),  # Added LLC
            (r'\s+Inc\.$', 'Added Inc. suffix', 0.2),  # Added Inc.
            (r'\s+Corp\.$', 'Added Corp. suffix', 0.2),  # Added Corp.
            (r'\s+\(.*?\)\s+', 'Parentheses in middle of name', 0.3),  # Text (something) more text
        ]
        
        for pattern, description, penalty in suspicious_patterns:
            if re.search(pattern, extracted_name):
                validation['has_additions'] = True
                validation['warnings'].append(f"Suspicious pattern detected: {description}")
                validation['quality_score'] -= penalty
        
        # Additional checks for common formatting issues
        
        # Check for double spaces (might indicate incorrect parsing)
        if '  ' in extracted_name:
            validation['warnings'].append("Double spaces detected in carrier name")
            validation['quality_score'] -= 0.1
        
        # Check for leading/trailing whitespace
        if extracted_name != extracted_name.strip():
            validation['warnings'].append("Leading or trailing whitespace detected")
            validation['quality_score'] -= 0.1
        
        # Check for unusual characters that might indicate OCR errors
        unusual_chars = re.findall(r'[^a-zA-Z0-9\s\.,&\-\']', extracted_name)
        if unusual_chars:
            validation['warnings'].append(f"Unusual characters detected: {', '.join(set(unusual_chars))}")
            validation['quality_score'] -= 0.1
        
        # Ensure quality score doesn't go below 0
        validation['quality_score'] = max(0.0, validation['quality_score'])
        
        # Log validation results
        if validation['warnings']:
            logger.warning(f"Carrier extraction validation issues for '{extracted_name}': {', '.join(validation['warnings'])}")
        else:
            logger.debug(f"Carrier extraction validation passed for '{extracted_name}'")
        
        return validation
    
    @staticmethod
    def validate_table_structure(table_data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """Validate extracted table structure"""
        required_fields = ['headers', 'rows']
        
        for field in required_fields:
            if field not in table_data:
                return False, f"Missing required field: {field}"
        
        headers = table_data.get('headers', [])
        rows = table_data.get('rows', [])
        
        if not isinstance(headers, list):
            return False, "Headers must be a list"
        
        if not isinstance(rows, list):
            return False, "Rows must be a list"
        
        # Check that all rows have the same number of columns as headers
        header_count = len(headers)
        for i, row in enumerate(rows):
            if not isinstance(row, list):
                return False, f"Row {i} must be a list"
            
            if len(row) != header_count:
                logger.warning(f"Row {i} has {len(row)} columns, expected {header_count}")
                # Don't fail validation, just log warning
        
        return True, None


class ClaudeQualityAssessor:
    """Assesses quality of Claude extractions"""
    
    @staticmethod
    def assess_extraction_quality(
        tables: List[Dict[str, Any]],
        document_metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Assess overall extraction quality"""
        try:
            # Calculate various quality metrics
            table_count = len(tables)
            
            if table_count == 0:
                return {
                    'overall_confidence': 0.0,
                    'table_structure_score': 0.0,
                    'data_completeness': 0.0,
                    'extraction_accuracy': 0.0,
                    'issues_detected': ['No tables extracted'],
                    'quality_grade': 'F'
                }
            
            # Assess table structure
            structure_scores = []
            completeness_scores = []
            
            for table in tables:
                # Structure score based on headers and row consistency
                headers = table.get('headers', [])
                rows = table.get('rows', [])
                
                if headers and rows:
                    structure_scores.append(1.0)
                    
                    # Completeness: percentage of non-empty cells
                    total_cells = len(headers) * len(rows)
                    non_empty_cells = sum(
                        1 for row in rows for cell in row if cell and str(cell).strip()
                    )
                    completeness = non_empty_cells / total_cells if total_cells > 0 else 0
                    completeness_scores.append(completeness)
                else:
                    structure_scores.append(0.5)
                    completeness_scores.append(0.5)
            
            avg_structure = sum(structure_scores) / len(structure_scores) if structure_scores else 0
            avg_completeness = sum(completeness_scores) / len(completeness_scores) if completeness_scores else 0
            
            # Calculate overall confidence
            metadata_confidence = document_metadata.get('carrier_confidence', 0.5)
            overall_confidence = (avg_structure + avg_completeness + metadata_confidence) / 3
            
            # Determine quality grade
            if overall_confidence >= 0.95:
                quality_grade = 'A'
            elif overall_confidence >= 0.85:
                quality_grade = 'B'
            elif overall_confidence >= 0.75:
                quality_grade = 'C'
            elif overall_confidence >= 0.65:
                quality_grade = 'D'
            else:
                quality_grade = 'F'
            
            # Detect issues
            issues = []
            if avg_completeness < 0.7:
                issues.append('Low data completeness detected')
            if avg_structure < 0.8:
                issues.append('Inconsistent table structures')
            if metadata_confidence < 0.7:
                issues.append('Low confidence in metadata extraction')
            
            return {
                'overall_confidence': round(overall_confidence, 2),
                'table_structure_score': round(avg_structure, 2),
                'data_completeness': round(avg_completeness, 2),
                'extraction_accuracy': round(overall_confidence, 2),
                'issues_detected': issues,
                'quality_grade': quality_grade,
                'table_count': table_count
            }
        except Exception as e:
            logger.error(f"Error assessing quality: {e}")
            return {
                'overall_confidence': 0.5,
                'table_structure_score': 0.5,
                'data_completeness': 0.5,
                'extraction_accuracy': 0.5,
                'issues_detected': [f'Error during assessment: {str(e)}'],
                'quality_grade': 'C'
            }


class ClaudeErrorHandler:
    """Handles errors and retries for Claude API calls"""
    
    @staticmethod
    def is_retriable_error(error: Exception) -> bool:
        """Determine if an error is retriable"""
        error_str = str(error).lower()
        
        retriable_patterns = [
            'rate limit',
            '429',
            'ratelimiterror',
            'timeout',
            'connection',
            'network',
            'overloaded',
            'unavailable',
            'service_unavailable',
            '503'
        ]
        
        return any(pattern in error_str for pattern in retriable_patterns)
    
    @staticmethod
    def is_rate_limit_error(error: Exception) -> bool:
        """Check if error is specifically a rate limit error (429)"""
        error_str = str(error).lower()
        error_type = type(error).__name__.lower()
        
        return '429' in error_str or 'rate limit' in error_str or 'ratelimit' in error_type
    
    @staticmethod
    def get_retry_delay(attempt: int, is_rate_limit: bool = False) -> float:
        """
        Calculate retry delay with exponential backoff and jitter.
        
        Args:
            attempt: Current retry attempt number (0-indexed)
            is_rate_limit: True if error is a 429 rate limit error
            
        Returns:
            Delay in seconds
        """
        if is_rate_limit:
            # For rate limits, use longer delays
            base_delay = 5.0
            wait_time = min(base_delay * (2 ** attempt), 60)  # Cap at 60 seconds
        else:
            # For other errors, use standard exponential backoff
            base_delay = 2.0
            wait_time = min(base_delay * (2 ** attempt), 30)  # Cap at 30 seconds
        
        # Add jitter to prevent thundering herd
        jitter = random.uniform(0, 1)
        return wait_time + jitter
    
    @staticmethod
    def extract_retry_after(error: Exception) -> Optional[float]:
        """
        Extract retry-after header value from rate limit error if available.
        
        Returns:
            Seconds to wait, or None if not available
        """
        try:
            if hasattr(error, 'response') and error.response:
                headers = getattr(error.response, 'headers', {})
                retry_after = headers.get('retry-after') or headers.get('Retry-After')
                if retry_after:
                    return float(retry_after)
        except Exception:
            pass
        
        return None
    
    @staticmethod
    def format_error_message(error: Exception) -> str:
        """Format error message for user display"""
        error_str = str(error)
        
        # Map common errors to user-friendly messages
        if '429' in error_str or 'rate limit' in error_str.lower():
            return "API rate limit reached. The system will automatically retry with backoff."
        elif 'timeout' in error_str.lower():
            return "Request timed out. The document may be too large or complex."
        elif 'invalid' in error_str.lower() and 'api' in error_str.lower():
            return "Invalid API configuration. Please check your Claude API key."
        else:
            return f"Extraction error: {error_str}"

