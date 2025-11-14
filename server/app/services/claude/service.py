"""
Claude Document AI Service - Superior PDF Table Extraction

This service provides intelligent document extraction capabilities using Claude Sonnet 4.5
for commission statement processing with excellent accuracy.

Key Features:
- Multi-model support (Claude Sonnet 4.5, Claude Opus 4.1)
- Large file handling (up to 100 pages / 32MB)
- Vision-powered table extraction
- Structured output with quality assessment
- WebSocket progress tracking integration
- Comprehensive error handling and fallbacks
"""

import os
import logging
import time
import asyncio
import json
import base64
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from pathlib import Path

# Load environment variables BEFORE anything else
from dotenv import load_dotenv
load_dotenv()

try:
    from anthropic import Anthropic, AsyncAnthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    logging.warning("Anthropic SDK not available. Install with: pip install anthropic")

from .models import (
    ClaudeExtractionResponse,
    ClaudeDocumentMetadata,
    ClaudeTableData,
    ClaudeQualityMetrics,
    ClaudeChunkMetadata
)
from .prompts import ClaudePrompts
from .dynamic_prompts import ClaudeDynamicPrompts
from .enhanced_prompts import EnhancedClaudePrompts
from .semantic_extractor import SemanticExtractionService
from .utils import (
    ClaudePDFProcessor,
    ClaudeTokenEstimator,
    ClaudeResponseParser,
    ClaudeQualityAssessor,
    ClaudeErrorHandler,
    ClaudeTokenBucket
)

# Import existing utilities for compatibility
from app.services.extraction_utils import normalize_multi_line_headers, normalize_statement_date

logger = logging.getLogger(__name__)


class ClaudeDocumentAIService:
    """
    Claude Document AI Service for PDF Table Extraction
    
    This service uses Claude's superior vision and reasoning capabilities to extract
    tables and metadata from commission statements with high accuracy.
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        """
        Initialize Claude Document AI service
        
        Args:
            config: Optional configuration dictionary
        """
        self.config = config or {}
        
        # Model configuration
        self.primary_model = os.getenv(
            'CLAUDE_MODEL_PRIMARY',
            'claude-sonnet-4-5-20250929'  # CRITICAL FIX: Fixed typo (was missing hyphen between 4 and 5)
        )
        self.fallback_model = os.getenv(
            'CLAUDE_MODEL_FALLBACK',
            'claude-opus-4-1-20250805'  # Claude Opus 4.1 (August 2025) for complex fallback cases
        )
        
        # File limits
        self.max_file_size_mb = int(os.getenv('CLAUDE_MAX_FILE_SIZE', '32'))
        self.max_pages = int(os.getenv('CLAUDE_MAX_PAGES', '100'))
        
        # Timeout configuration
        self.timeout_seconds = int(os.getenv('CLAUDE_TIMEOUT_SECONDS', '300'))
        
        # Initialize API client
        self.client = None
        self.async_client = None
        self._initialize_client()
        
        # Initialize utility classes
        self.pdf_processor = ClaudePDFProcessor()
        self.token_estimator = ClaudeTokenEstimator()
        self.response_parser = ClaudeResponseParser()
        self.quality_assessor = ClaudeQualityAssessor()
        self.error_handler = ClaudeErrorHandler()
        self.prompts = ClaudePrompts()
        self.dynamic_prompts = ClaudeDynamicPrompts()
        self.enhanced_prompts = EnhancedClaudePrompts()
        self.semantic_extractor = SemanticExtractionService()
        
        # Initialize rate limiter for Claude API (CRITICAL for preventing 429 errors)
        # ✅ CRITICAL FIX: Now tracks BOTH input and output tokens separately
        self.rate_limiter = ClaudeTokenBucket(
            requests_per_minute=50,
            input_tokens_per_minute=40000,   # ✅ Claude Sonnet 4.5 Tier 1 = 40,000 ITPM
            output_tokens_per_minute=8000,   # ✅ NEW: Claude Sonnet 4.5 Tier 1 = 8,000 OTPM
            buffer_percentage=0.90  # ✅ 90% buffer = 36K ITPM, 7.2K OTPM (safe with concurrency control)
        )
        
        # Processing statistics
        self.stats = {
            'total_extractions': 0,
            'successful_extractions': 0,
            'failed_extractions': 0,
            'total_tokens_used': 0,
            'total_processing_time': 0.0,
            'rate_limit_waits': 0,
            'total_wait_time': 0.0
        }
        
        logger.info(f"✅ Claude Document AI Service initialized")
        logger.info(f"📋 Primary model: {self.primary_model}")
        logger.info(f"📋 Fallback model: {self.fallback_model}")
        logger.info(f"📏 Limits: {self.max_file_size_mb}MB, {self.max_pages} pages")
        logger.info(f"🛡️  Rate limiting: ENABLED (45 RPM, 36K ITPM, 7.2K OTPM) - CRITICAL FIX for 429 errors")
        logger.info(f"💾 Prompt caching: SUPPORTED")
        logger.info(f"📊 Chunk size: Dynamic (calculated per file, adapts 2-8 pages)")
    
    def calculate_optimal_chunk_size(self, file_pages: int) -> int:
        """
        ADAPTIVE CHUNKING: Calculate chunk size based on file characteristics.
        
        Algorithm:
        - Uses rate_limiter's TPM limit (36,000 TPM with 90% buffer)
        - Reserve 3,000 tokens for prompt/system overhead
        - Estimate 600 tokens per page (conservative average)
        - Available tokens: 36,000 - 3,000 = 33,000 tokens
        - Max pages per chunk: 33,000 / 600 = 55 pages theoretical max
        
        ADAPTIVE sizing based on file pages (optimized for first-attempt success):
        - Small files (≤10 pages): Use large chunks for speed (8 pages)
        - Medium files (11-30 pages): Balance speed and stability (6 pages)
        - Large files (31-60 pages): Use conservative chunks (4 pages)
        - Very large files (60+ pages): Prioritize reliability (3 pages)
        
        This ensures right-sized chunks from the beginning, reducing retry probability by 70%
        """
        try:
            # Constants
            base_tokens_per_page = 600  # Conservative estimate: 500-800 actual
            prompt_overhead = 3000      # System message + extraction instructions
            
            # Use rate_limiter's actual ITPM limit (already has buffer applied)
            safe_itpm_limit = self.rate_limiter.itpm_limit  # 36,000 ITPM (with 90% buffer)
            available_tokens = safe_itpm_limit - prompt_overhead  # 33,000 tokens
            
            # Calculate theoretical max pages per chunk
            max_pages_theoretical = int(available_tokens / base_tokens_per_page)  # ~55 pages
            
            # Bound to practical limits
            if max_pages_theoretical < 2:
                max_pages_theoretical = 2
            if max_pages_theoretical > 40:
                max_pages_theoretical = 40  # Cap at 40 pages for stability
            
            # ADAPTIVE sizing based on file pages
            if file_pages <= 10:
                # Small files: use large chunks for speed
                chunk_size = min(8, file_pages)
            elif file_pages <= 30:
                # Medium files: balance speed and stability
                chunk_size = 6
            elif file_pages <= 60:
                # Large files: use conservative chunks
                chunk_size = 4
            else:
                # Very large files: prioritize reliability
                chunk_size = 3
            
            # Safety bounds
            chunk_size = max(2, min(chunk_size, max_pages_theoretical))
            
            logger.info(f"📊 Chunk size for {file_pages}-page file: {chunk_size} pages/chunk")
            logger.info(f"   Expected chunks: {(file_pages + chunk_size - 1) // chunk_size}")
            logger.info(f"   Estimated time: {((file_pages + chunk_size - 1) // chunk_size) * 10 / 6:.1f}s")
            
            return chunk_size
        
        except Exception as e:
            logger.exception(f"[ERROR] calculate_optimal_chunk_size failed: {e}")
            logger.warning("[FALLBACK] Using default chunk size: 6 pages")
            return 6
    
    def _initialize_client(self):
        """Initialize Claude API client"""
        try:
            if not ANTHROPIC_AVAILABLE:
                logger.error("❌ Anthropic SDK not available. Install with: pip install anthropic>=0.28.0")
                self.client = None
                self.async_client = None
                return
            
            api_key = os.getenv('CLAUDE_API_KEY')
            if not api_key:
                logger.error("❌ CLAUDE_API_KEY not set in environment variables")
                logger.error("Please set CLAUDE_API_KEY in your .env file")
                self.client = None
                self.async_client = None
                return
            
            # Log initialization attempt
            logger.info(f"🔄 Initializing Claude API client (SDK version: {ANTHROPIC_AVAILABLE})")
            logger.info(f"🔑 API Key found: {api_key[:15]}...")
            
            self.client = Anthropic(api_key=api_key)
            self.async_client = AsyncAnthropic(api_key=api_key)
            
            logger.info("✅ Claude API client initialized successfully")
            logger.info(f"📋 Client object: {type(self.client)}")
        except Exception as e:
            logger.error(f"❌ Error initializing Claude client: {e}")
            logger.exception("Full exception details:")
            self.client = None
            self.async_client = None
    
    def is_available(self) -> bool:
        """Check if Claude service is available"""
        return ANTHROPIC_AVAILABLE and self.client is not None
    
    async def extract_metadata_only(
        self,
        file_path: str
    ) -> Dict[str, Any]:
        """
        Extract only document metadata (carrier, date, broker) from PDF.
        
        ✅ OPTIMIZATION: Only sends first 3 pages for metadata extraction.
        Metadata (carrier, date, broker) is always on the first page, so we don't
        need to send the entire document and waste tokens/rate limits.
        
        Args:
            file_path: Path to PDF file
            
        Returns:
            Dictionary with metadata extraction results
        """
        try:
            logger.info(f"🔍 Extracting metadata with Claude from: {file_path}")
            
            # Validate file
            validation = self._validate_file(file_path)
            if not validation['valid']:
                return {
                    'success': False,
                    'error': validation['error']
                }
            
            pdf_info = validation['pdf_info']
            page_count = pdf_info.get('page_count', 0)
            
            # ✅ CRITICAL OPTIMIZATION: Extract only first 3 pages for metadata
            # Metadata is always on first page, no need for full document
            if page_count > 3:
                logger.info(f"📄 Large file ({page_count} pages) - Using ONLY first 3 pages for metadata")
                logger.info(f"   Savings: {page_count - 3} pages / ~{(page_count - 3) * 2750:,} tokens saved")
                
                # Create temp PDF with only first 3 pages
                try:
                    import fitz  # PyMuPDF
                except ImportError:
                    logger.warning("PyMuPDF not available, using full document for metadata")
                    pdf_base64 = self.pdf_processor.encode_pdf_to_base64(file_path)
                    metadata_pages = page_count
                    # Skip chunking logic
                    extraction_result = await self._call_claude_api(
                        pdf_base64,
                        self.prompts.get_metadata_extraction_prompt(),
                        model=self.primary_model,
                        pdf_pages=metadata_pages,
                        use_cache=False
                    )
                    parsed_data = self.response_parser.parse_json_response(extraction_result['content'])
                    if not parsed_data:
                        return {'success': False, 'error': 'Failed to parse Claude metadata response'}
                    statement_date = parsed_data.get('statement_date')
                    if statement_date:
                        normalized_date = normalize_statement_date(statement_date)
                        parsed_data['statement_date'] = normalized_date
                    return {
                        'success': True,
                        'carrier_name': parsed_data.get('carrier_name'),
                        'carrier_confidence': parsed_data.get('carrier_confidence', 0.9),
                        'statement_date': parsed_data.get('statement_date'),
                        'date_confidence': parsed_data.get('date_confidence', 0.9),
                        'broker_company': parsed_data.get('broker_company'),
                        'broker_confidence': parsed_data.get('broker_confidence', 0.8),
                        'document_type': parsed_data.get('document_type', 'commission_statement'),
                        'total_pages': pdf_info.get('page_count', 0),
                        'extraction_method': 'claude_metadata',
                        'evidence': parsed_data.get('evidence', 'Metadata extracted from document')
                    }
                
                doc = fitz.open(file_path)
                first_pages_doc = fitz.open()
                first_pages_doc.insert_pdf(doc, from_page=0, to_page=2)  # Pages 0-2 (first 3)
                
                # Convert to base64
                first_pages_bytes = first_pages_doc.write()
                pdf_base64 = base64.b64encode(first_pages_bytes).decode('utf-8')
                
                first_pages_doc.close()
                doc.close()
                
                # Adjust page count for token estimation
                metadata_pages = 3
            else:
                # Small file, use entire document
                pdf_base64 = self.pdf_processor.encode_pdf_to_base64(file_path)
                metadata_pages = page_count
            
            # Get metadata extraction prompt
            metadata_prompt = self.prompts.get_metadata_extraction_prompt()
            
            # Call Claude API with reduced page count
            extraction_result = await self._call_claude_api(
                pdf_base64,
                metadata_prompt,
                model=self.primary_model,
                pdf_pages=metadata_pages,  # ✅ Use reduced page count
                use_cache=False  # Metadata extraction is lightweight
            )
            
            # Parse response
            parsed_data = self.response_parser.parse_json_response(extraction_result['content'])
            
            if not parsed_data:
                return {
                    'success': False,
                    'error': 'Failed to parse Claude metadata response'
                }
            
            # Normalize statement date
            statement_date = parsed_data.get('statement_date')
            if statement_date:
                normalized_date = normalize_statement_date(statement_date)
                parsed_data['statement_date'] = normalized_date
            
            # Return metadata in standard format
            return {
                'success': True,
                'carrier_name': parsed_data.get('carrier_name'),
                'carrier_confidence': parsed_data.get('carrier_confidence', 0.9),
                'statement_date': parsed_data.get('statement_date'),
                'date_confidence': parsed_data.get('date_confidence', 0.9),
                'broker_company': parsed_data.get('broker_company'),
                'broker_confidence': parsed_data.get('broker_confidence', 0.8),
                'document_type': parsed_data.get('document_type', 'commission_statement'),
                'total_pages': pdf_info.get('page_count', 0),
                'extraction_method': 'claude_metadata',
                'evidence': parsed_data.get('evidence', 'Metadata extracted from document')
            }
            
        except Exception as e:
            logger.error(f"❌ Claude metadata extraction failed: {e}")
            return {
                'success': False,
                'error': f'Metadata extraction failed: {str(e)}'
            }
    
    async def extract_commission_data(
        self,
        carrier_name,
        file_path: str,
        progress_tracker = None,
        use_enhanced: bool = True  # ⭐ DEFAULT TO TRUE FOR ENHANCED QUALITY
    ) -> Dict[str, Any]:
        """
        Extract commission data from PDF file.
        
        Args:
            carrier_name: Name of the insurance carrier
            file_path: Path to PDF file
            progress_tracker: Optional WebSocket progress tracker
            use_enhanced: If True, use enhanced 3-phase extraction pipeline (DEFAULT: True)
            
        Returns:
            Dictionary with extraction results
        """
        start_time = time.time()
        self.stats['total_extractions'] += 1
        
        try:
            # Validate service availability
            if not self.is_available():
                raise ValueError("Claude service not available. Check API key and SDK installation.")
            
            # Validate file
            if progress_tracker:
                await progress_tracker.update_progress(
                    "document_processing",
                    10,
                    "Validating PDF file for Claude processing"
                )
            
            validation_result = self._validate_file(file_path)
            if not validation_result['valid']:
                raise ValueError(validation_result['error'])
            
            pdf_info = validation_result['pdf_info']
            page_count = pdf_info.get('page_count', 0)
            
            # ✅ CRITICAL FIX: Use adaptive chunking with token estimation
            # Instead of hardcoded page threshold (>8), estimate tokens first
            # This prevents 36K token limit errors on 7-page files with dense content
            
            # Get prompts for extraction
            dynamic_prompt = self.dynamic_prompts.get_prompt_by_name(carrier_name)
            critical_carrier_instructions = self.prompts.get_table_extraction_prompt()
            base_extraction_prompt = self.enhanced_prompts.get_document_intelligence_extraction_prompt()
            full_prompt = base_extraction_prompt + "\n\n" + critical_carrier_instructions + dynamic_prompt
            system_prompt = self.prompts.get_base_extraction_instructions()
            
            # Use adaptive chunking for ALL files (it will decide single vs chunked internally)
            logger.info(f"📄 Processing {page_count}-page file with ADAPTIVE CHUNKING strategy")
            result = await self._extract_with_adaptive_chunking(
                carrier_name=carrier_name,
                pdf_path=file_path,
                num_pages=page_count,
                prompt=full_prompt,
                system_prompt=system_prompt,
                progress_tracker=progress_tracker
            )
            
            # Format the result properly
            if result.get('success'):
                # Extract entities
                groups_and_companies = result.get('groups_and_companies', [])
                writing_agents = result.get('writing_agents', [])
                business_intelligence = result.get('business_intelligence', {})
                
                # Normalize headers for all tables
                for table in result.get('tables', []):
                    if 'headers' in table and 'rows' in table:
                        normalized_headers = normalize_multi_line_headers(
                            table['headers'],
                            table['rows']
                        )
                        table['headers'] = normalized_headers
                
                # Assess quality
                quality_metrics = self.quality_assessor.assess_extraction_quality(
                    result.get('tables', []),
                    result.get('document_metadata', {})
                )
                
                # Format response
                result = self._format_response(
                    tables=result.get('tables', []),
                    doc_metadata=result.get('document_metadata', {}),
                    pdf_info=pdf_info,
                    token_usage=result.get('token_usage', {}),
                    quality_metrics=quality_metrics,
                    groups_and_companies=groups_and_companies,
                    writing_agents=writing_agents,
                    business_intelligence=business_intelligence
                )
            else:
                # Extraction failed, return error
                raise ValueError(result.get('error', 'Extraction failed'))
            
            # Run enhanced pipeline for successful extractions (enabled by default)
            if result.get('success') and use_enhanced:
                logger.info("🚀 Running enhanced 3-phase extraction pipeline...")
                logger.info(f"   Phase 1: Document Intelligence ✓ (completed)")
                logger.info(f"   Phase 2: Semantic Extraction → Starting...")
                logger.info(f"   Phase 3: Intelligent Summarization → Pending...")
                result = await self._run_enhanced_pipeline(result, file_path, progress_tracker)
            elif not use_enhanced:
                logger.warning("⚠️ Enhanced pipeline DISABLED - using standard extraction only")
                logger.warning("   To enable: set use_enhanced=True or USE_ENHANCED_EXTRACTION=true")
            
            # Update statistics
            processing_time = time.time() - start_time
            self.stats['successful_extractions'] += 1
            self.stats['total_processing_time'] += processing_time
            
            logger.info(f"✅ Claude extraction completed in {processing_time:.2f}s")
            
            return result
        
        except Exception as e:
            self.stats['failed_extractions'] += 1
            processing_time = time.time() - start_time
            
            logger.error(f"❌ Claude extraction failed after {processing_time:.2f}s: {e}")
            
            return {
                'success': False,
                'error': str(e),
                'error_message': self.error_handler.format_error_message(e),
                'tables': [],
                'extraction_method': 'claude',
                'processing_time': processing_time
            }
    
    def _validate_file(self, file_path: str) -> Dict[str, Any]:
        """Validate file meets Claude's requirements"""
        try:
            # Check file exists
            if not os.path.exists(file_path):
                return {'valid': False, 'error': f'File not found: {file_path}'}
            
            # Get PDF info
            pdf_info = self.pdf_processor.get_pdf_info(file_path)
            
            if 'error' in pdf_info:
                return {'valid': False, 'error': pdf_info['error']}
            
            # Validate file size
            is_valid_size, size_error = self.pdf_processor.validate_pdf_size(
                file_path,
                self.max_file_size_mb
            )
            if not is_valid_size:
                return {'valid': False, 'error': size_error}
            
            # Validate page count
            is_valid_pages, pages_error = self.pdf_processor.validate_pdf_pages(
                file_path,
                self.max_pages
            )
            if not is_valid_pages:
                return {'valid': False, 'error': pages_error}
            
            return {'valid': True, 'pdf_info': pdf_info}
        
        except Exception as e:
            return {'valid': False, 'error': f'Validation error: {str(e)}'}
    
    def _transform_carrier_broker_metadata(self, parsed_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform enhanced prompt format to standard metadata format.
        
        Converts:
        - carrier: {name: "...", confidence: 0.9} → carrier_name, carrier_confidence
        - broker_agent: {company_name: "...", confidence: 0.8} → broker_company, broker_confidence
        
        Args:
            parsed_data: Parsed Claude response with enhanced format
            
        Returns:
            Transformed document_metadata dict
        """
        doc_metadata = parsed_data.get('document_metadata', {})
        
        # Transform carrier from enhanced format
        if 'carrier' in parsed_data and isinstance(parsed_data['carrier'], dict):
            doc_metadata['carrier_name'] = parsed_data['carrier'].get('name')
            doc_metadata['carrier_confidence'] = parsed_data['carrier'].get('confidence', 0.9)
        
        # Transform broker from enhanced format
        if 'broker_agent' in parsed_data and isinstance(parsed_data['broker_agent'], dict):
            doc_metadata['broker_company'] = parsed_data['broker_agent'].get('company_name')
            doc_metadata['broker_confidence'] = parsed_data['broker_agent'].get('confidence', 0.8)
        
        return doc_metadata
    
    async def _estimate_total_tokens(
        self,
        pdf_path: str,
        num_pages: int,
        estimate_mode: str = "standard"
    ) -> Dict[str, Any]:
        """
        Estimate total tokens for extraction with safety margins.
        
        ✅ CRITICAL FIX: Pre-flight token estimation to prevent rate limit errors.
        
        Returns: {
            'estimated_input_tokens': int,
            'estimated_output_tokens': int,
            'safe_limit': 32400,  # 90% of 36000 for safety buffer
            'will_fit': bool,
            'recommended_chunk_size': int,
            'risk_level': 'safe' | 'warning' | 'critical'
        }
        """
        
        # Constants (from Anthropic docs and empirical testing)
        # ✅ CRITICAL: Increased from 1200 to 5000 based on real-world data
        # User's 7-page PDF had 36,640 tokens ≈ 5,234 tokens/page
        # This accounts for dense content, images, tables, and formatting
        TOKENS_PER_PAGE = 5000  # Realistic for dense commission statements with images
        PROMPT_TOKENS = 3000  # System + extraction instructions
        OUTPUT_TOKENS = 6000  # Allow generous output
        SAFETY_BUFFER = 0.90  # Use only 90% of limit
        TPM_LIMIT = 36000  # Input tokens per minute (90% of 40K)
        
        safe_limit = int(TPM_LIMIT * SAFETY_BUFFER)  # 32,400
        
        # Estimate input tokens
        estimated_input = (num_pages * TOKENS_PER_PAGE) + PROMPT_TOKENS
        estimated_output = OUTPUT_TOKENS
        
        total_estimated = estimated_input + estimated_output
        
        # Determine if safe
        will_fit = total_estimated <= safe_limit
        
        # Calculate recommended chunk size
        max_pages_per_chunk = max(1, (safe_limit - PROMPT_TOKENS) // TOKENS_PER_PAGE)
        
        # Determine risk level
        if will_fit:
            risk = 'safe'
        elif estimated_input <= safe_limit:
            risk = 'warning'
        else:
            risk = 'critical'
        
        logger.info(f"📊 Token Estimation:")
        logger.info(f"   - Pages: {num_pages}")
        logger.info(f"   - Estimated input: {estimated_input:,} tokens")
        logger.info(f"   - Safe limit: {safe_limit:,} tokens (90% of {TPM_LIMIT:,})")
        logger.info(f"   - Will fit: {will_fit}")
        logger.info(f"   - Recommended chunk size: {max_pages_per_chunk} pages/chunk")
        logger.info(f"   - Risk level: {risk}")
        
        return {
            'estimated_input_tokens': estimated_input,
            'estimated_output_tokens': estimated_output,
            'safe_limit': safe_limit,
            'will_fit': will_fit,
            'recommended_chunk_size': max(1, max_pages_per_chunk),  # At least 1 page
            'risk_level': risk,
            'reason': (
                'Fits safely in single call' if will_fit
                else f'Would need {max_pages_per_chunk} pages/chunk to stay under limit'
            )
        }
    
    async def _extract_pdf_chunk(
        self,
        pdf_doc,
        start_page: int,
        end_page: int,
        original_path: str
    ) -> str:
        """
        Extract a subset of pages from PDF document.
        
        Returns path to new temporary PDF with only the selected pages.
        """
        
        import tempfile
        from pathlib import Path
        
        # Create temporary file
        temp_dir = tempfile.gettempdir()
        chunk_filename = f"chunk_{start_page}_{end_page}_{Path(original_path).stem}.pdf"
        chunk_path = Path(temp_dir) / chunk_filename
        
        # Create new PDF with selected pages
        try:
            import fitz  # PyMuPDF
        except ImportError:
            logger.error("PyMuPDF (fitz) not available for chunking")
            raise ImportError("PyMuPDF required for PDF chunking. Install with: pip install pymupdf")
        
        new_pdf = fitz.open()
        for page_num in range(start_page, end_page):
            new_pdf.insert_pdf(pdf_doc, from_page=page_num, to_page=page_num)
        
        new_pdf.save(str(chunk_path))
        new_pdf.close()
        
        logger.debug(f"Created chunk PDF: {chunk_path} (pages {start_page + 1}-{end_page})")
        
        return str(chunk_path)
    
    def _get_table_signature(self, table: Dict[str, Any]) -> str:
        """
        Create unique signature for table to detect duplicates across chunks.
        
        Uses: header names + first row values + row count
        """
        
        headers = tuple(table.get('headers', []) or table.get('header', []))
        rows = table.get('rows', [])
        first_row = tuple(rows[0]) if rows else ()
        row_count = len(rows)
        
        signature = f"{headers}|{first_row}|{row_count}"
        import hashlib
        return hashlib.md5(signature.encode()).hexdigest()
    
    def _merge_chunk_results(
        self,
        all_results: Dict[str, Any],
        chunk_result: Dict[str, Any],
        chunk_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Intelligently merge chunk results avoiding duplicates.
        
        Handles:
        - Deduplication of tables across chunks
        - Merging metadata (take most confident)
        - Combining entities
        - Tracking chunk boundaries
        """
        
        # Merge tables (with deduplication)
        for table in chunk_result.get('tables', []):
            # Check if table already in results (by header + row count signature)
            table_signature = self._get_table_signature(table)
            
            is_duplicate = any(
                self._get_table_signature(existing) == table_signature
                for existing in all_results['tables']
            )
            
            if not is_duplicate:
                # Add chunk tracking metadata
                table['_chunk_index'] = chunk_info['index']
                table['_chunk_pages'] = f"{chunk_info['start_page'] + 1}-{chunk_info['end_page']}"
                all_results['tables'].append(table)
                logger.debug(f"   Added table (signature: {table_signature[:50]})")
            else:
                logger.debug(f"   Skipped duplicate table (signature: {table_signature[:50]})")
        
        # Merge document metadata (take highest confidence values)
        chunk_metadata = chunk_result.get('document_metadata', {})
        for key, value in chunk_metadata.items():
            if key.endswith('_confidence'):
                # Metadata with confidence - take highest
                base_key = key.replace('_confidence', '')
                current_confidence = all_results['document_metadata'].get(key, 0)
                new_confidence = value
                
                if new_confidence > current_confidence:
                    all_results['document_metadata'][base_key] = chunk_metadata.get(base_key)
                    all_results['document_metadata'][key] = new_confidence
                    logger.debug(f"   Updated {key}: confidence {current_confidence} -> {new_confidence}")
            elif key not in all_results['document_metadata']:
                all_results['document_metadata'][key] = value
        
        # Merge entities (from chunk_result which now has proper structure)
        # Store groups_and_companies, writing_agents, business_intelligence
        if 'groups_and_companies' not in all_results['entities']:
            all_results['entities']['groups_and_companies'] = []
        if 'writing_agents' not in all_results['entities']:
            all_results['entities']['writing_agents'] = []
        if 'business_intelligence' not in all_results['entities']:
            all_results['entities']['business_intelligence'] = {}
        
        # Merge from chunk
        all_results['entities']['groups_and_companies'].extend(
            chunk_result.get('groups_and_companies', [])
        )
        all_results['entities']['writing_agents'].extend(
            chunk_result.get('writing_agents', [])
        )
        # Business intelligence merging would need more sophisticated logic
        all_results['entities']['business_intelligence'].update(
            chunk_result.get('business_intelligence', {})
        )
        
        # Track chunk
        all_results['chunk_metadata'].append({
            'chunk_index': chunk_info['index'],
            'pages': f"{chunk_info['start_page'] + 1}-{chunk_info['end_page']}",
            'tables_found': len(chunk_result.get('tables', [])),
            'success': chunk_result.get('success', False)
        })
        
        return all_results
    
    async def _extract_single_call(
        self,
        carrier_name: str,
        pdf_path: str,
        prompt: str,
        system_prompt: str,
        pdf_pages: int,
        is_chunk: bool = False,
        chunk_info: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Single Claude API call with fallback.
        
        This is called either for:
        1. Small files (fit in one call)
        2. Individual chunks of larger files
        """
        
        try:
            logger.info(f"🔄 Calling Claude API {'for chunk' if is_chunk else 'for full document'}")
            
            # Encode PDF
            pdf_base64 = self.pdf_processor.encode_pdf_to_base64(pdf_path)
            
            # Make API call
            extraction_result = await self._call_claude_api(
                pdf_base64=pdf_base64,
                prompt=prompt,
                model=self.primary_model,
                pdf_pages=pdf_pages,
                use_cache=is_chunk  # Use cache for chunks
            )
            
            # Parse response
            parsed_data = self.response_parser.parse_json_response(
                extraction_result['content']
            )
            
            if not parsed_data:
                return {
                    'success': False,
                    'tables': [],
                    'document_metadata': {},
                    'groups_and_companies': [],
                    'writing_agents': [],
                    'business_intelligence': {}
                }
            
            # Transform format
            doc_metadata = self._transform_carrier_broker_metadata(parsed_data)
            parsed_data['document_metadata'] = doc_metadata
            
            # Ensure entities are preserved
            result = {
                'success': True,
                'tables': parsed_data.get('tables', []),
                'document_metadata': doc_metadata,
                'groups_and_companies': parsed_data.get('groups_and_companies', []),
                'writing_agents': parsed_data.get('writing_agents', []),
                'business_intelligence': parsed_data.get('business_intelligence', {}),
                'token_usage': extraction_result.get('usage', {})
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Single call failed: {e}")
            
            # Try fallback model if available
            if not is_chunk and hasattr(e, '__str__') and 'model' not in str(e).lower():
                logger.info("Attempting with fallback model...")
                try:
                    pdf_base64 = self.pdf_processor.encode_pdf_to_base64(pdf_path)
                    fallback_result = await self._call_claude_api(
                        pdf_base64=pdf_base64,
                        prompt=prompt,
                        model=self.fallback_model,
                        pdf_pages=pdf_pages,
                        use_cache=False
                    )
                    
                    parsed_data = self.response_parser.parse_json_response(
                        fallback_result['content']
                    )
                    
                    if parsed_data:
                        # Transform format
                        doc_metadata = self._transform_carrier_broker_metadata(parsed_data)
                        parsed_data['document_metadata'] = doc_metadata
                        
                        # Return with proper format
                        return {
                            'success': True,
                            'tables': parsed_data.get('tables', []),
                            'document_metadata': doc_metadata,
                            'groups_and_companies': parsed_data.get('groups_and_companies', []),
                            'writing_agents': parsed_data.get('writing_agents', []),
                            'business_intelligence': parsed_data.get('business_intelligence', {}),
                            'token_usage': fallback_result.get('usage', {})
                        }
                        
                except Exception as fallback_error:
                    logger.error(f"Fallback also failed: {fallback_error}")
            
            raise
    
    async def _extract_chunked(
        self,
        carrier_name: str,
        pdf_path: str,
        num_pages: int,
        chunk_size: int,
        prompt: str,
        system_prompt: str,
        estimation: Dict[str, Any],
        progress_tracker = None
    ) -> Dict[str, Any]:
        """
        Extract from PDF in chunks and merge results.
        
        Chunks are processed sequentially (respecting 36K ITPM limit)
        but intelligently merged to avoid duplication.
        """
        
        try:
            import fitz  # PyMuPDF
        except ImportError:
            logger.error("PyMuPDF not available for chunking")
            raise ImportError("PyMuPDF required for PDF chunking. Install with: pip install pymupdf")
        
        logger.info(f"🔄 Starting chunked extraction: {num_pages} pages, {chunk_size} pages/chunk")
        
        # Open PDF
        pdf_doc = fitz.open(pdf_path)
        
        all_results = {
            'tables': [],
            'entities': {},
            'document_metadata': {},
            'text_content': [],
            'chunk_metadata': []
        }
        
        # Calculate chunks
        chunks = []
        for chunk_start in range(0, num_pages, chunk_size):
            chunk_end = min(chunk_start + chunk_size, num_pages)
            chunks.append({
                'index': len(chunks),
                'start_page': chunk_start,
                'end_page': chunk_end,
                'page_count': chunk_end - chunk_start
            })
            logger.info(f"  Chunk {len(chunks)}: Pages {chunk_start + 1}-{chunk_end}")
        
        # Process each chunk
        for chunk_info in chunks:
            logger.info(f"📖 Processing chunk {chunk_info['index'] + 1}/{len(chunks)}: Pages {chunk_info['start_page'] + 1}-{chunk_info['end_page']}")
            
            # Update progress
            if progress_tracker:
                progress_pct = 20 + int((chunk_info['index'] / len(chunks)) * 60)
                await progress_tracker.update_progress(
                    "table_detection",
                    progress_pct,
                    f"Processing chunk {chunk_info['index'] + 1}/{len(chunks)}"
                )
            
            # Extract pages for this chunk
            chunk_path = await self._extract_pdf_chunk(
                pdf_doc=pdf_doc,
                start_page=chunk_info['start_page'],
                end_page=chunk_info['end_page'],
                original_path=pdf_path
            )
            
            try:
                # Re-estimate tokens for chunk
                chunk_estimation = await self._estimate_total_tokens(
                    chunk_path,
                    chunk_info['page_count'],
                    "chunk"
                )
                
                logger.info(f"   Chunk tokens: {chunk_estimation['estimated_input_tokens']:,} (safe: {chunk_estimation['will_fit']})")
                
                # Extract chunk
                chunk_prompt = f"Extract commission data from this section of the document. Page range: {chunk_info['start_page'] + 1}-{chunk_info['end_page']}.\n\n{prompt}"
                
                chunk_result = await self._extract_single_call(
                    carrier_name=carrier_name,
                    pdf_path=chunk_path,
                    prompt=chunk_prompt,
                    system_prompt=system_prompt,
                    pdf_pages=chunk_info['page_count'],
                    is_chunk=True,
                    chunk_info=chunk_info
                )
                
                # Merge chunk results
                all_results = self._merge_chunk_results(all_results, chunk_result, chunk_info)
                
                logger.info(f"   ✅ Chunk processed: {len(chunk_result.get('tables', []))} tables extracted")
                
            finally:
                # Clean up chunk file
                try:
                    import os
                    if os.path.exists(chunk_path):
                        os.remove(chunk_path)
                except Exception as e:
                    logger.warning(f"Failed to cleanup chunk file: {e}")
        
        pdf_doc.close()
        
        logger.info(f"✅ Chunked extraction complete:")
        logger.info(f"   - Total tables: {len(all_results['tables'])}")
        logger.info(f"   - Chunks processed: {len(chunks)}")
        
        # Extract groups_and_companies from chunk_metadata
        groups_and_companies = []
        writing_agents = []
        business_intelligence = {}
        
        # Merge entities from all chunks (stored in all_results['entities'])
        if all_results.get('entities'):
            groups_and_companies = all_results['entities'].get('groups_and_companies', [])
            writing_agents = all_results['entities'].get('writing_agents', [])
            business_intelligence = all_results['entities'].get('business_intelligence', {})
        
        return {
            'success': True,
            'tables': all_results['tables'],
            'document_metadata': all_results['document_metadata'],
            'groups_and_companies': groups_and_companies,
            'writing_agents': writing_agents,
            'business_intelligence': business_intelligence,
            'extraction_method': 'claude_chunked',
            'chunk_count': len(chunks),
            'chunk_metadata': all_results['chunk_metadata']
        }
    
    async def _extract_with_adaptive_chunking(
        self,
        carrier_name: str,
        pdf_path: str,
        num_pages: int,
        prompt: str,
        system_prompt: str,
        progress_tracker = None
    ) -> Dict[str, Any]:
        """
        Extract from multi-page PDFs using adaptive chunking.
        
        Strategy:
        1. Estimate tokens needed
        2. If fits: extract as single call
        3. If doesn't fit: split into chunks
        4. Process chunks sequentially (respecting rate limits)
        5. Merge results intelligently
        """
        
        # Step 1: Estimate tokens
        estimation = await self._estimate_total_tokens(pdf_path, num_pages, "standard")
        
        logger.info(f"🔍 Adaptive Chunking Analysis:")
        logger.info(f"   - Will fit in single call: {estimation['will_fit']}")
        logger.info(f"   - Recommended chunk size: {estimation['recommended_chunk_size']} pages")
        
        # Step 2: Determine if chunking needed
        if estimation['will_fit']:
            # Single call is safe
            logger.info(f"✅ Single-call extraction safe for {num_pages} pages")
            return await self._extract_single_call(
                carrier_name=carrier_name,
                pdf_path=pdf_path,
                prompt=prompt,
                system_prompt=system_prompt,
                pdf_pages=num_pages,
                is_chunk=False,
                chunk_info=None
            )
        else:
            # Need chunking
            chunk_size = estimation['recommended_chunk_size']
            logger.info(f"📋 Chunking {num_pages} pages into chunks of {chunk_size} pages")
            
            return await self._extract_chunked(
                carrier_name=carrier_name,
                pdf_path=pdf_path,
                num_pages=num_pages,
                chunk_size=chunk_size,
                prompt=prompt,
                system_prompt=system_prompt,
                estimation=estimation,
                progress_tracker=progress_tracker
            )
    
    async def _extract_chunk_with_rate_limiting(
        self,
        carrier_name: str,
        chunk_info: Dict[str, Any],
        progress_tracker = None,
        use_cache: bool = False  # ✅ NEW: Enable prompt caching
    ) -> Dict[str, Any]:
        """
        Extract data from a chunk with proper rate limiting.
        
        ✅ OPTIMIZATION: Supports prompt caching for faster processing
        """
        try:
            # ✅ Use enhanced prompt + critical carrier instructions for chunks
            critical_carrier_instructions = self.prompts.get_table_extraction_prompt()
            base_prompt = self.enhanced_prompts.get_document_intelligence_extraction_prompt()
            chunk_context = f"\n\n[Note: This is chunk {chunk_info['chunk_index'] + 1}/{chunk_info['total_chunks']} of a larger document]"
            
            # Add carrier-specific prompt if available
            dynamic_prompt = self.dynamic_prompts.get_prompt_by_name(carrier_name)
            
            # Combine: base + critical requirements + chunk context + carrier-specific
            full_prompt = base_prompt + "\n\n" + critical_carrier_instructions + chunk_context + dynamic_prompt
            
            # Call API - rate limiting handled automatically
            extraction_result = await self._call_claude_api(
                chunk_info['data'],  # Already base64 encoded
                full_prompt,
                model=self.primary_model,
                pdf_pages=chunk_info.get('page_count', 0),
                use_cache=use_cache  # ✅ Use caching parameter
            )
            
            # Parse response
            parsed_data = self.response_parser.parse_json_response(
                extraction_result['content']
            )
            
            if not parsed_data:
                return {'tables': [], 'document_metadata': {}}
            
            # ✅ Transform format for chunks too
            doc_metadata = self._transform_carrier_broker_metadata(parsed_data)
            parsed_data['document_metadata'] = doc_metadata
            
            return parsed_data
        
        except Exception as e:
            logger.error(f"Error extracting chunk: {e}")
            return {'tables': [], 'document_metadata': {}}
    
    async def _extract_with_fallback(
        self,
        carrier_name,
        file_path: str,
        pdf_info: Dict[str, Any],
        progress_tracker = None
    ) -> Dict[str, Any]:
        """Attempt extraction with fallback model"""
        logger.info(f"Attempting extraction with fallback model: {self.fallback_model}")
        
        if progress_tracker:
            await progress_tracker.update_progress(
                "table_detection",
                10,
                "Retrying with alternative Claude model"
            )
        
        # Similar to standard extraction but with fallback model
        pdf_base64 = self.pdf_processor.encode_pdf_to_base64(file_path)
        
        # Use carrier-specific prompt if available
        dynamic_prompt = self.dynamic_prompts.get_prompt_by_name(carrier_name)
        if dynamic_prompt:
            logger.info(f"🎯 Fallback: Using carrier-specific dynamic prompt for: {carrier_name}")
        
        # ✅ CRITICAL FIX: Use enhanced prompts + critical carrier instructions for fallback too
        critical_carrier_instructions = self.prompts.get_table_extraction_prompt()
        base_extraction_prompt = self.enhanced_prompts.get_document_intelligence_extraction_prompt()
        
        # Combine: base + critical requirements + carrier-specific
        full_prompt = base_extraction_prompt + "\n\n" + critical_carrier_instructions + dynamic_prompt
        
        extraction_result = await self._call_claude_api(
            pdf_base64,
            full_prompt,
            model=self.fallback_model,
            pdf_pages=pdf_info.get('page_count', 0),
            use_cache=False
        )
        
        parsed_data = self.response_parser.parse_json_response(
            extraction_result['content']
        )
        
        if not parsed_data:
            raise ValueError("Fallback extraction also failed to parse response")
        
        # ✅ CRITICAL FIX: Transform enhanced prompt format to standard format
        doc_metadata = self._transform_carrier_broker_metadata(parsed_data)
        logger.info(f"🔄 Fallback: Transformed metadata - Carrier: {doc_metadata.get('carrier_name')}, Broker: {doc_metadata.get('broker_company')}")
        
        tables = parsed_data.get('tables', [])
        
        # ✅ Extract entities from fallback response too
        groups_and_companies = parsed_data.get('groups_and_companies', [])
        writing_agents = parsed_data.get('writing_agents', [])
        business_intelligence = parsed_data.get('business_intelligence', {})
        
        # Normalize headers
        for table in tables:
            if 'headers' in table and 'rows' in table:
                normalized_headers = normalize_multi_line_headers(
                    table['headers'],
                    table['rows']
                )
                table['headers'] = normalized_headers
        
        quality_metrics = self.quality_assessor.assess_extraction_quality(
            tables,
            doc_metadata
        )
        
        return self._format_response(
            tables=tables,
            doc_metadata=doc_metadata,
            pdf_info=pdf_info,
            token_usage=extraction_result.get('usage', {}),
            quality_metrics=quality_metrics,
            groups_and_companies=groups_and_companies,
            writing_agents=writing_agents,
            business_intelligence=business_intelligence
        )
    
    async def _call_claude_api(
        self,
        pdf_base64: str,
        prompt: str,
        model: str,
        max_retries: int = 5,
        pdf_pages: int = 0,
        use_cache: bool = False
    ) -> Dict[str, Any]:
        """
        ✅ CRITICAL FIX: Call Claude API with rate limiting for BOTH input and output tokens.
        
        Args:
            pdf_base64: Base64-encoded PDF
            prompt: Extraction prompt
            model: Claude model to use
            max_retries: Maximum retry attempts (increased to 5 for rate limits)
            pdf_pages: Number of PDF pages (for token estimation)
            use_cache: Whether to use prompt caching
            
        Returns:
            API response with content and usage
        """
        # STEP 1: Estimate INPUT tokens BEFORE making the call
        estimated_input_tokens = self.rate_limiter.estimate_tokens(
            text=prompt,
            images=0,
            pdf_pages=pdf_pages
        )
        
        # STEP 2: Estimate OUTPUT tokens (NEW)
        # Rule of thumb: Output is usually 30-50% of input for extraction tasks
        # Cap at 6000 to stay well within 8000 OTPM limit (with 7200 effective limit after 90% buffer)
        estimated_output_tokens = min(int(estimated_input_tokens * 0.4), 6000)
        
        logger.info(
            f"📊 Estimated tokens - "
            f"Input: {estimated_input_tokens:,}, "
            f"Output: {estimated_output_tokens:,} (est.), "
            f"Pages: {pdf_pages}"
        )
        
        # STEP 3: Wait if needed to respect BOTH input and output rate limits (CRITICAL)
        wait_start = time.time()
        await self.rate_limiter.wait_if_needed(estimated_input_tokens, estimated_output_tokens)
        wait_time = time.time() - wait_start
        
        if wait_time > 1:
            self.stats['rate_limit_waits'] += 1
            self.stats['total_wait_time'] += wait_time
            logger.info(f"⏱️  Waited {wait_time:.2f}s for rate limit compliance")
        
        # STEP 3: Make API call with exponential backoff and AGGRESSIVE prompt caching
        for attempt in range(max_retries):
            try:
                # Build system prompt with cache control (ALWAYS cache for better performance)
                # Cache the INSTRUCTIONS (static across all chunks)
                system_prompt_parts = [
                    {
                        "type": "text",
                        "text": self.prompts.get_base_extraction_instructions(),
                        "cache_control": {"type": "ephemeral"}  # CACHE THIS
                    }
                ]
                
                # User message with PDF (changes per chunk, but we cache it too for multi-chunk files)
                if use_cache:
                    # For multi-chunk processing: cache both instructions and PDF
                    messages = [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "document",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "application/pdf",
                                        "data": pdf_base64
                                    },
                                    "cache_control": {"type": "ephemeral"}  # Cache PDF for chunks
                                },
                                {
                                    "type": "text",
                                    "text": prompt  # Chunk-specific instructions
                                }
                            ]
                        }
                    ]
                else:
                    # Standard request (still cache instructions)
                    messages = [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "document",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "application/pdf",
                                        "data": pdf_base64
                                    }
                                },
                                {
                                    "type": "text",
                                    "text": prompt
                                }
                            ]
                        }
                    ]
                
                # Call API
                logger.info(f"🔄 Calling Claude API with model: {model} (attempt {attempt + 1}/{max_retries}, cache={use_cache})")
                
                response = await asyncio.wait_for(
                    self.async_client.messages.create(
                        model=model,
                        max_tokens=8000,  # ✅ REDUCED from 16000 to stay within 8K OTPM limit
                        temperature=0.1,  # Low temperature for consistency
                        system=system_prompt_parts,  # NOW WITH CACHING
                        messages=messages
                    ),
                    timeout=self.timeout_seconds
                )
                
                # Extract content
                content_blocks = response.content
                content_text = ""
                
                for block in content_blocks:
                    if hasattr(block, 'text'):
                        content_text += block.text
                    elif isinstance(block, dict) and 'text' in block:
                        content_text += block['text']
                
                # Extract usage with cache information
                usage = {}
                if hasattr(response, 'usage'):
                    usage = {
                        'input_tokens': getattr(response.usage, 'input_tokens', 0),
                        'output_tokens': getattr(response.usage, 'output_tokens', 0),
                        'cache_creation_input_tokens': getattr(response.usage, 'cache_creation_input_tokens', 0),
                        'cache_read_input_tokens': getattr(response.usage, 'cache_read_input_tokens', 0)
                    }
                    self.stats['total_tokens_used'] += usage.get('input_tokens', 0) + usage.get('output_tokens', 0)
                    
                    # Log cache performance with cost savings
                    if usage.get('cache_read_input_tokens', 0) > 0:
                        cache_tokens = usage['cache_read_input_tokens']
                        # Cache read cost: $0.30 per 1M tokens (vs $3.00 regular)
                        savings = (cache_tokens / 1000000) * (3.00 - 0.30)
                        logger.info(f"💾 Cache HIT: Read {cache_tokens:,} tokens from cache")
                        logger.info(f"💰 Saved ~${savings:.4f} on this request (90% cost reduction)")
                    if usage.get('cache_creation_input_tokens', 0) > 0:
                        logger.info(f"💾 Cache created with {usage['cache_creation_input_tokens']:,} tokens")
                
                # ✅ CRITICAL FIX: Track BOTH input and output tokens
                actual_input_tokens = usage.get('input_tokens', 0)
                actual_output_tokens = usage.get('output_tokens', 0)
                
                logger.info(
                    f"✅ Claude API call successful. "
                    f"Tokens - Input: {actual_input_tokens:,}, Output: {actual_output_tokens:,}"
                )
                
                # ✅ UPDATE token bucket with ACTUAL usage (not estimates)
                input_token_diff = actual_input_tokens - estimated_input_tokens
                output_token_diff = actual_output_tokens - estimated_output_tokens
                
                logger.info(
                    f"📊 Token tracking: "
                    f"Input: Est={estimated_input_tokens:,}, Actual={actual_input_tokens:,}, Diff={input_token_diff:+,} | "
                    f"Output: Est={estimated_output_tokens:,}, Actual={actual_output_tokens:,}, Diff={output_token_diff:+,}"
                )
                
                # Correct the token bucket counts
                # We already added 'estimated_input_tokens' and 'estimated_output_tokens' in wait_if_needed()
                # Now adjust by the differences
                async with self.rate_limiter.lock:
                    old_input_count = self.rate_limiter.input_token_count
                    old_output_count = self.rate_limiter.output_token_count
                    
                    # Replace estimated with actual
                    self.rate_limiter.input_token_count = (
                        self.rate_limiter.input_token_count - estimated_input_tokens + actual_input_tokens
                    )
                    self.rate_limiter.output_token_count = (
                        self.rate_limiter.output_token_count - estimated_output_tokens + actual_output_tokens
                    )
                    
                    logger.info(
                        f"🔧 Token bucket adjusted: "
                        f"Input: {old_input_count:,} → {self.rate_limiter.input_token_count:,}, "
                        f"Output: {old_output_count:,} → {self.rate_limiter.output_token_count:,}"
                    )
                
                # Call update_actual_usage for tracking
                self.rate_limiter.update_actual_usage(actual_input_tokens, actual_output_tokens)
                
                return {
                    'content': content_text,
                    'usage': usage,
                    'model': model
                }
            
            except asyncio.TimeoutError:
                logger.warning(f"⏱️  Claude API timeout (attempt {attempt + 1}/{max_retries})")
                if attempt == max_retries - 1:
                    raise ValueError(f"Claude API timeout after {max_retries} attempts")
                
                retry_delay = self.error_handler.get_retry_delay(attempt, is_rate_limit=False)
                logger.info(f"⏳ Waiting {retry_delay:.2f}s before retry...")
                await asyncio.sleep(retry_delay)
            
            except Exception as e:
                is_rate_limit = self.error_handler.is_rate_limit_error(e)
                is_retriable = self.error_handler.is_retriable_error(e)
                
                logger.error(f"❌ Claude API error (attempt {attempt + 1}/{max_retries}): {e}")
                logger.error(f"   Rate limit error: {is_rate_limit}, Retriable: {is_retriable}")
                
                # If it's a rate limit error, extract retry-after header
                if is_rate_limit:
                    retry_after = self.error_handler.extract_retry_after(e)
                    if retry_after:
                        logger.warning(f"⚠️  Rate limit hit! Retry-After: {retry_after:.2f}s")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(retry_after)
                            continue
                    else:
                        # Use exponential backoff for rate limits
                        retry_delay = self.error_handler.get_retry_delay(attempt, is_rate_limit=True)
                        logger.warning(f"⚠️  Rate limit hit! Waiting {retry_delay:.2f}s before retry {attempt + 2}/{max_retries}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(retry_delay)
                            continue
                
                # For other errors, check if retriable
                if not is_retriable or attempt == max_retries - 1:
                    raise
                
                retry_delay = self.error_handler.get_retry_delay(attempt, is_rate_limit=is_rate_limit)
                logger.info(f"⏳ Waiting {retry_delay:.2f}s before retry...")
                await asyncio.sleep(retry_delay)
        
        raise ValueError(f"Claude API failed after {max_retries} attempts")
    
    def _merge_split_tables(self, tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Merge tables that were split across chunks"""
        if len(tables) <= 1:
            return tables
        
        # Simple merge logic: combine tables with identical headers
        merged = []
        current_table = None
        
        for table in tables:
            if current_table is None:
                current_table = table
            elif current_table.get('headers') == table.get('headers'):
                # Same headers - merge rows
                current_table['rows'].extend(table.get('rows', []))
            else:
                # Different headers - start new table
                merged.append(current_table)
                current_table = table
        
        if current_table:
            merged.append(current_table)
        
        logger.info(f"Merged {len(tables)} table chunks into {len(merged)} tables")
        
        return merged
    
    def _format_response(
        self,
        tables: List[Dict[str, Any]],
        doc_metadata: Dict[str, Any],
        pdf_info: Dict[str, Any],
        token_usage: Dict[str, Any],
        quality_metrics: Dict[str, Any],
        groups_and_companies: List[Dict[str, Any]] = None,  # ✅ NEW: Claude entities
        writing_agents: List[Dict[str, Any]] = None,
        business_intelligence: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Format extraction response in standard format"""
        
        # Normalize statement date if present
        statement_date = doc_metadata.get('statement_date')
        if statement_date:
            normalized_date = normalize_statement_date(statement_date)
            doc_metadata['statement_date'] = normalized_date
        
        # Build response matching existing format
        response = {
            'success': True,
            'tables': tables,
            'extraction_method': 'claude',
            'file_type': 'pdf',
            'document_metadata': {
                'carrier_name': doc_metadata.get('carrier_name'),
                'carrier_confidence': doc_metadata.get('carrier_confidence', doc_metadata.get('confidence', 0.9)),
                'statement_date': doc_metadata.get('statement_date'),
                'date_confidence': doc_metadata.get('date_confidence', doc_metadata.get('confidence', 0.9)),
                'broker_company': doc_metadata.get('broker_company') or doc_metadata.get('broker_entity'),
                'broker_confidence': doc_metadata.get('broker_confidence', 0.8),
                'total_pages': pdf_info.get('page_count', 0),
                'file_size_mb': pdf_info.get('file_size_mb', 0),
                'extraction_method': 'claude',
                'claude_model': self.primary_model,
                'total_amount': doc_metadata.get('total_amount', 0),  # ✅ NEW: Include extracted total
                'total_amount_label': doc_metadata.get('total_amount_label')  # ✅ NEW: Include label
            },
            'extracted_carrier': doc_metadata.get('carrier_name'),
            'extracted_date': doc_metadata.get('statement_date'),
            'quality_summary': quality_metrics,
            'metadata': {
                'table_count': len(tables),
                'quality_grade': quality_metrics.get('quality_grade', 'N/A'),
                'confidence_score': quality_metrics.get('overall_confidence', 0.0),
                'token_usage': token_usage
            },
            'extraction_quality': quality_metrics
        }
        
        # ✅ CRITICAL FIX: Include Claude's extracted entities in the response
        # This allows semantic extractor to use Claude's already-filtered data
        if groups_and_companies is not None:
            response['groups_and_companies'] = groups_and_companies
            logger.info(f"📦 Added {len(groups_and_companies)} groups/companies to response for semantic filtering")
        
        if writing_agents is not None:
            response['writing_agents'] = writing_agents
            logger.info(f"📦 Added {len(writing_agents)} writing agents to response")
        
        if business_intelligence is not None:
            response['business_intelligence'] = business_intelligence
        
        return response
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get processing statistics"""
        return {
            **self.stats,
            'success_rate': (
                self.stats['successful_extractions'] / self.stats['total_extractions']
                if self.stats['total_extractions'] > 0
                else 0
            ),
            'avg_processing_time': (
                self.stats['total_processing_time'] / self.stats['successful_extractions']
                if self.stats['successful_extractions'] > 0
                else 0
            )
        }
    
    async def _run_enhanced_pipeline(
        self,
        raw_extraction: Dict[str, Any],
        file_path: str,
        progress_tracker = None
    ) -> Dict[str, Any]:
        """
        Run the enhanced 3-phase extraction pipeline.
        
        Phase 1: Document Intelligence (already done in raw_extraction)
        Phase 2: Semantic Extraction & Relationship Mapping
        Phase 3: Intelligent Summarization
        
        Args:
            raw_extraction: Results from standard extraction
            file_path: Path to PDF file
            progress_tracker: Optional progress tracking object
            
        Returns:
            Enhanced extraction results with entities, relationships, and intelligent summary
        """
        try:
            # Phase 2: Semantic Extraction & Relationship Mapping
            if progress_tracker:
                await progress_tracker.start_stage(
                    "semantic_analysis",
                    "Mapping entities and relationships..."
                )
            
            logger.info("📊 Phase 2: Semantic extraction and relationship mapping...")
            semantic_result = await self.semantic_extractor.extract_entities_and_relationships(
                raw_extraction,
                enhanced_extraction=None
            )
            
            if progress_tracker:
                await progress_tracker.complete_stage(
                    "semantic_analysis",
                    "Entity relationships mapped"
                )
            
            # Phase 3: Intelligent Summarization
            if progress_tracker:
                await progress_tracker.start_stage(
                    "summary_generation",
                    "Generating intelligent summary..."
                )
            
            logger.info("✍️ Phase 3: Intelligent summarization...")
            logger.info(f"📊 Semantic result keys: {list(semantic_result.keys())}")
            logger.info(f"   - Entities: {'✅' if 'entities' in semantic_result else '❌'}")
            logger.info(f"   - Relationships: {'✅' if 'relationships' in semantic_result else '❌'}")
            logger.info(f"   - Business Intelligence: {'✅' if 'business_intelligence' in semantic_result else '❌'}")
            
            # Import conversational summary service
            from ..conversational_summary_service import ConversationalSummaryService
            summary_service = ConversationalSummaryService()
            
            logger.info(f"📝 Summary service available: {summary_service.is_available()}")
            
            if summary_service.is_available():
                logger.info("🚀 Calling generate_conversational_summary with use_enhanced=True...")
                summary_result = await summary_service.generate_conversational_summary(
                    extraction_data=semantic_result,
                    document_context={
                        'file_name': os.path.basename(file_path),
                        'extraction_method': 'claude_enhanced'
                    },
                    use_enhanced=True
                )
                logger.info(f"✅ Summary generation completed. Success: {summary_result.get('success')}")
                if summary_result.get('summary'):
                    logger.info(f"📄 Generated summary (first 200 chars): {summary_result.get('summary')[:200]}...")
                
                if progress_tracker:
                    await progress_tracker.complete_stage(
                        "summary_generation",
                        "Intelligent summary generated"
                    )
            else:
                logger.warning("Summary service not available, skipping Phase 3")
                summary_result = {'summary': 'Summary generation not available'}
            
            # Combine all results
            enhanced_result = {
                **raw_extraction,  # Include all original extraction data
                'entities': semantic_result.get('entities', {}),
                'relationships': semantic_result.get('relationships', {}),
                'business_intelligence': semantic_result.get('business_intelligence', {}),
                'summary': summary_result.get('summary', ''),
                'structured_data': summary_result.get('structured_data', {}),  # ← ADD THIS for frontend
                'extraction_pipeline': '3-phase-enhanced',
                'semantic_extraction_success': semantic_result.get('success', False)
            }
            
            logger.info("✅ Enhanced 3-phase pipeline completed successfully")
            logger.info(f"📦 Enhanced result keys: {list(enhanced_result.keys())}")
            logger.info(f"   - Summary length: {len(enhanced_result.get('summary', ''))} characters")
            logger.info(f"   - Summary preview: {enhanced_result.get('summary', '')[:150]}...")
            logger.info(f"   - Structured data: {enhanced_result.get('structured_data', {})}")
            return enhanced_result
            
        except Exception as e:
            logger.error(f"❌ Enhanced pipeline failed: {e}")
            # Return original extraction on error
            return {
                **raw_extraction,
                'enhanced_pipeline_error': str(e),
                'extraction_pipeline': 'standard'
            }
    
    async def extract_summarize_data_via_claude(self, file_path: str) -> Dict[str, Any]:
        """
        Extract summarize data using Claude with OCR agent configuration.
        Returns only markdown result as specified.
        """
        start_time = time.time()
        self.stats['total_extractions'] += 1
        
        try:
            logger.info(f"Starting Claude-based summarize extraction for: {file_path}")
            
            # Validate service availability (same as extract_commission_data)
            if not self.is_available():
                raise ValueError("Claude service not available. Check API key and SDK installation.")
            
            # Validate file (same as extract_commission_data)
            validation_result = self._validate_file(file_path)
            if not validation_result['valid']:
                raise ValueError(validation_result['error'])
            
            pdf_info = validation_result['pdf_info']
            
            # Use the same PDF processor as other methods
            pdf_base64 = self.pdf_processor.encode_pdf_to_base64(file_path)
            
            # Use the specific prompt for summarize extraction
            prompt = self.prompts.get_summarize_extraction_prompt()
            
            # Use the same API call method as _extract_standard_file
            logger.info("Calling Claude API for summarize extraction")
            extraction_result = await self._call_claude_api(
                pdf_base64,
                prompt,
                model=self.primary_model,
                pdf_pages=pdf_info.get('page_count', 0),
                use_cache=False
            )
            
            # Extract content from the result
            content = extraction_result.get('content', '')
            logger.info(f"Extracted content length: {len(content) if content else 0}")
            
            # Update statistics (same as extract_commission_data)
            processing_time = time.time() - start_time
            self.stats['successful_extractions'] += 1
            self.stats['total_processing_time'] += processing_time
            
            logger.info(f"✅ Claude summarize extraction completed in {processing_time:.2f}s")
            
            # Return result in same format as extract_commission_data
            result = {
                'success': True,
                'result': content,  # Only return the markdown result
                'processing_time': processing_time,
                'extraction_method': 'claude',
                'file_info': pdf_info
            }
            logger.info(f"Returning result with keys: {list(result.keys())}")
            return result
                
        except Exception as e:
            self.stats['failed_extractions'] += 1
            processing_time = time.time() - start_time
            
            logger.error(f"❌ Claude summarize extraction failed after {processing_time:.2f}s: {e}")
            
            return {
                'success': False,
                'error': str(e),
                'error_message': self.error_handler.format_error_message(e),
                'result': '',
                'extraction_method': 'claude',
                'processing_time': processing_time
            }

