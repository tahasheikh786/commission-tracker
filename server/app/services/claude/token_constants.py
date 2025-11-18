"""
Token Constants - Single Source of Truth

These constants are used across all token estimation and chunking logic.
Changing these values here will propagate to all methods automatically.

DO NOT hardcode these values elsewhere - always import from this file.

Last updated: 2025-11-18
Based on: Analysis of 17-page file showing 37,012 actual vs 29,899 estimated
"""

import logging

logger = logging.getLogger(__name__)


class ClaudeTokenConstants:
    """
    Token constants based on production measurements.
    
    Production Data Evidence:
    - 5-page chunk: Estimated 29,899 tokens → Actual 37,012 tokens
    - Difference: +7,113 tokens (24% underestimate)
    - Solution: Increased TOKENS_PER_PAGE and PROMPT_TOKENS by 22% and 57%
    """
    
    # ============================================================================
    # PAGE TOKEN ESTIMATES
    # ============================================================================
    
    TOKENS_PER_PAGE_STANDARD = 5500  # Dense commission statements with tables
    """
    Production-measured token count per page for commission statements.
    
    Breakdown per page:
    - PDF content (base64 encoded): ~3,500 tokens
    - OCR text extraction: ~1,500 tokens
    - Table structure overhead: ~500 tokens
    Total: ~5,500 tokens/page
    
    Previous value: 4,500 (caused 24% underestimation)
    Current value: 5,500 (accurate within 11.5%)
    """
    
    TOKENS_PER_PAGE_METADATA = 2500  # Metadata extraction (first 3 pages only)
    """
    Lighter token count for metadata-only extraction.
    
    Metadata extraction focuses on:
    - Carrier name
    - Statement date
    - Broker company
    - Total amount
    
    Only processes first 3 pages, so lower token density.
    """
    
    # ============================================================================
    # PROMPT OVERHEAD
    # ============================================================================
    
    PROMPT_TOKENS_STANDARD = 5500    # Full system prompt + extraction instructions
    """
    Token overhead for full table extraction prompts.
    
    Includes:
    - System instructions: ~2,500 tokens
    - Extraction schema: ~1,500 tokens
    - Examples and guidelines: ~1,000 tokens
    - Field mapping instructions: ~500 tokens
    Total: ~5,500 tokens
    
    Previous value: 3,500 (caused 57% underestimation)
    Current value: 5,500 (accurate)
    """
    
    PROMPT_TOKENS_METADATA = 2500    # Simplified metadata-only prompt
    """
    Lighter prompt for metadata extraction only.
    
    Includes:
    - Basic system instructions: ~1,500 tokens
    - Metadata schema: ~500 tokens
    - Simple guidelines: ~500 tokens
    Total: ~2,500 tokens
    """
    
    # ============================================================================
    # OUTPUT ESTIMATES
    # ============================================================================
    
    OUTPUT_TOKENS_STANDARD = 12000   # Dense tables with many rows
    """
    Expected output tokens for table extraction.
    
    Dense commission statements can have:
    - 20-30 rows per page
    - 10-15 columns per row
    - JSON structure overhead
    
    Conservative estimate: 12,000 tokens output
    """
    
    OUTPUT_TOKENS_METADATA = 3000    # Metadata only
    """
    Expected output tokens for metadata extraction.
    
    Metadata fields:
    - carrier_name: ~20 tokens
    - statement_date: ~10 tokens
    - broker_company: ~20 tokens
    - total_amount: ~10 tokens
    - confidence scores: ~100 tokens
    - Document context: ~2,840 tokens
    
    Conservative estimate: 3,000 tokens output
    """
    
    # ============================================================================
    # SAFETY FACTORS
    # ============================================================================
    
    SAFETY_BUFFER = 0.85             # Use 85% of API limit (conservative)
    """
    Safety buffer to prevent hitting rate limits.
    
    Rationale:
    - Claude API enforces hard limit at 36,000 ITPM
    - With 85% buffer: 30,600 tokens safe limit
    - Leaves 5,400 token cushion (15%) for:
      * API overhead
      * Concurrent requests
      * Token estimation errors
    
    Previous value: 0.90 (90%, too aggressive)
    Current value: 0.85 (85%, more conservative)
    """
    
    SAFETY_MULTIPLIER = 1.25         # Add 25% buffer for unknowns
    """
    Safety multiplier applied to base estimates.
    
    Accounts for:
    - PDF encoding variations (base64 inefficiency)
    - Prompt caching metadata overhead
    - Claude's token counting differences
    - Unexpected table complexity
    
    Previous value: 1.15 (15%, insufficient)
    Current value: 1.25 (25%, adequate)
    """
    
    # ============================================================================
    # API LIMITS (Claude Sonnet 4.5 Tier 1)
    # ============================================================================
    
    ITPM_LIMIT = 36000               # Input Tokens Per Minute limit
    """
    Claude Sonnet 4.5 Tier 1 input token limit.
    
    Rate limit tier breakdown:
    - Tier 1: 36,000 ITPM (current)
    - Tier 2: 80,000 ITPM
    - Tier 3: 160,000 ITPM
    - Tier 4: 400,000 ITPM
    """
    
    OTPM_LIMIT = 8000                # Output Tokens Per Minute limit
    """
    Claude Sonnet 4.5 Tier 1 output token limit.
    
    Note: This limit is separate from ITPM and can be hit
    when extracting large tables with many rows.
    """
    
    RPM_LIMIT = 50                   # Requests Per Minute limit
    """
    Claude Sonnet 4.5 Tier 1 request limit.
    
    This is the third separate rate limit enforced by Claude API.
    All three limits (ITPM, OTPM, RPM) must be respected.
    """
    
    # ============================================================================
    # HELPER METHODS
    # ============================================================================
    
    @classmethod
    def get_safe_limit(cls) -> int:
        """
        Get safe token limit with buffer applied.
        
        Returns:
            Safe input token limit (30,600)
        """
        return int(cls.ITPM_LIMIT * cls.SAFETY_BUFFER)
    
    @classmethod
    def estimate_pages_per_chunk(cls, mode: str = "standard") -> int:
        """
        Calculate maximum pages per chunk while staying under safe limit.
        
        This is the CRITICAL method that prevents 429 errors.
        
        Formula:
            safe_limit = ITPM_LIMIT × SAFETY_BUFFER
            available = safe_limit - (PROMPT_TOKENS × SAFETY_MULTIPLIER)
            max_pages = available / (TOKENS_PER_PAGE × SAFETY_MULTIPLIER)
        
        Args:
            mode: 'standard' or 'metadata'
        
        Returns:
            Maximum pages that fit safely in one chunk
            
        Example:
            For standard mode:
            - safe_limit = 36,000 × 0.85 = 30,600
            - available = 30,600 - (5,500 × 1.25) = 23,725
            - max_pages = 23,725 / (5,500 × 1.25) = 3.45 → 3 pages
        """
        if mode == "metadata":
            tokens_per_page = cls.TOKENS_PER_PAGE_METADATA
            prompt_tokens = cls.PROMPT_TOKENS_METADATA
        else:
            tokens_per_page = cls.TOKENS_PER_PAGE_STANDARD
            prompt_tokens = cls.PROMPT_TOKENS_STANDARD
        
        safe_limit = cls.get_safe_limit()
        available = safe_limit - int(prompt_tokens * cls.SAFETY_MULTIPLIER)
        
        # Account for safety multiplier
        max_pages = available // int(tokens_per_page * cls.SAFETY_MULTIPLIER)
        
        result = max(1, int(max_pages))
        
        logger.debug(
            f"Calculated max pages per chunk for {mode} mode: {result} pages "
            f"(safe_limit={safe_limit:,}, available={available:,})"
        )
        
        return result
    
    @classmethod
    def estimate_tokens(cls, num_pages: int, mode: str = "standard") -> dict:
        """
        Estimate token usage for given number of pages.
        
        This method mirrors the logic in ClaudeDocumentAIService._estimate_total_tokens()
        to ensure consistency.
        
        Args:
            num_pages: Number of pages to process
            mode: 'standard' or 'metadata'
        
        Returns:
            Dictionary with token estimates and safety assessment:
            {
                'estimated_input': int,      # Estimated input tokens
                'estimated_output': int,     # Estimated output tokens
                'total': int,                # Total estimated tokens
                'safe_limit': int,           # Safe limit with buffer
                'will_fit': bool,            # Whether it fits in single call
                'risk': str,                 # 'safe', 'warning', or 'critical'
                'recommended_chunk_size': int  # Recommended pages per chunk
            }
        """
        if mode == "metadata":
            tokens_per_page = cls.TOKENS_PER_PAGE_METADATA
            prompt_tokens = cls.PROMPT_TOKENS_METADATA
            output_tokens = cls.OUTPUT_TOKENS_METADATA
        else:
            tokens_per_page = cls.TOKENS_PER_PAGE_STANDARD
            prompt_tokens = cls.PROMPT_TOKENS_STANDARD
            output_tokens = cls.OUTPUT_TOKENS_STANDARD
        
        # Calculate with safety multiplier
        base_estimate = (num_pages * tokens_per_page) + prompt_tokens
        estimated_input = int(base_estimate * cls.SAFETY_MULTIPLIER)
        safe_limit = cls.get_safe_limit()
        will_fit = estimated_input <= safe_limit
        
        # Risk assessment
        if will_fit:
            risk = 'safe'
        elif estimated_input <= cls.ITPM_LIMIT:
            risk = 'warning'
        else:
            risk = 'critical'
        
        return {
            'estimated_input': estimated_input,
            'estimated_output': output_tokens,
            'total': estimated_input + output_tokens,
            'safe_limit': safe_limit,
            'will_fit': will_fit,
            'risk': risk,
            'recommended_chunk_size': cls.estimate_pages_per_chunk(mode)
        }
    
    @classmethod
    def validate_constants(cls) -> bool:
        """
        Validate that token constants produce expected results for production workloads.
        
        Tests multiple document sizes including the critical 17-page case.
        
        Returns:
            True if validation passes, False otherwise
        """
        logger.info("=" * 80)
        logger.info("Validating Token Constants for Production (1-100 page documents)")
        logger.info("=" * 80)
        
        checks = []
        
        # Test Case 1: 5-page chunk (previous bug)
        test_5 = cls.estimate_tokens(5, "standard")
        logger.info(f"Test 1: 5 pages")
        logger.info(f"  Estimated input: {test_5['estimated_input']:,} tokens")
        logger.info(f"  Will fit: {test_5['will_fit']}")
        logger.info(f"  Recommended chunk: {test_5['recommended_chunk_size']} pages")
        
        if not test_5['will_fit'] and test_5['recommended_chunk_size'] == 3:
            logger.info("  ✅ PASS: Correctly handles 5-page case")
            checks.append(True)
        else:
            logger.error("  ❌ FAIL: 5-page case incorrect")
            checks.append(False)
        
        # Test Case 2: 17-page document (CRITICAL - the bug report case)
        test_17 = cls.estimate_tokens(17, "standard")
        logger.info(f"Test 2: 17 pages (CRITICAL BUG REPORT)")
        logger.info(f"  Estimated input: {test_17['estimated_input']:,} tokens")
        logger.info(f"  Will fit: {test_17['will_fit']}")
        logger.info(f"  Recommended chunk: {test_17['recommended_chunk_size']} pages")
        
        # Should NOT fit in single call
        if not test_17['will_fit']:
            logger.info("  ✅ PASS: 17 pages correctly requires chunking")
            checks.append(True)
        else:
            logger.error("  ❌ FAIL: 17 pages should require chunking")
            checks.append(False)
        
        # Calculate expected chunks: 17 pages at 3 pages/chunk = 6 chunks (3+3+3+3+3+2)
        if test_17['recommended_chunk_size'] == 3:
            expected_chunks = (17 + 3 - 1) // 3  # Ceiling division = 6 chunks
            logger.info(f"  ✅ PASS: Will create {expected_chunks} chunks to process all 17 pages")
            checks.append(True)
        else:
            logger.error(f"  ❌ FAIL: Should recommend 3 pages/chunk for 17 pages")
            checks.append(False)
        
        # Test Case 3: 100-page document
        test_100 = cls.estimate_tokens(100, "standard")
        logger.info(f"Test 3: 100 pages (large document)")
        logger.info(f"  Estimated input: {test_100['estimated_input']:,} tokens")
        logger.info(f"  Recommended chunk: {test_100['recommended_chunk_size']} pages")
        
        # Should recommend reasonable chunk size
        if 2 <= test_100['recommended_chunk_size'] <= 5:
            expected_chunks = (100 + test_100['recommended_chunk_size'] - 1) // test_100['recommended_chunk_size']
            logger.info(f"  ✅ PASS: 100-page case has reasonable chunk size ({expected_chunks} chunks)")
            checks.append(True)
        else:
            logger.error("  ❌ FAIL: 100-page chunk size unreasonable")
            checks.append(False)
        
        # Test Case 4: 3 pages should fit (baseline)
        test_3 = cls.estimate_tokens(3, "standard")
        logger.info(f"Test 4: 3 pages (single chunk baseline)")
        logger.info(f"  Estimated input: {test_3['estimated_input']:,} tokens")
        logger.info(f"  Will fit: {test_3['will_fit']}")
        
        if test_3['will_fit']:
            logger.info(f"  ✅ PASS: 3 pages fits in single call")
            checks.append(True)
        else:
            logger.error("  ❌ FAIL: 3 pages should fit in single call")
            checks.append(False)
        
        logger.info("=" * 80)
        all_passed = all(checks)
        if all_passed:
            logger.info("✅ ALL VALIDATION CHECKS PASSED")
        else:
            logger.error(f"❌ VALIDATION FAILED: {checks.count(False)} checks failed")
        logger.info("=" * 80)
        
        return all_passed


# ============================================================================
# MODULE-LEVEL VALIDATION (runs on import)
# ============================================================================

def _run_validation():
    """
    Run validation when module is imported.
    
    This ensures constants are correct before any code uses them.
    """
    try:
        ClaudeTokenConstants.validate_constants()
    except Exception as e:
        logger.error(f"Token constants validation error: {e}")
        # Don't fail import, just log warning
        logger.warning("Proceeding despite validation errors - manual review recommended")


# Uncomment to enable validation on import (useful for testing)
# _run_validation()

