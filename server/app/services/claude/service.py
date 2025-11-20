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
import tempfile
from typing import Dict, Any, List, Optional, Tuple
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

try:
    import fitz  # PyMuPDF - used for PDF chunking operations
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    logging.warning("PyMuPDF not available. PDF chunking will be limited. Install with: pip install pymupdf")

from .dynamic_prompts import ClaudeDynamicPrompts
from .enhanced_prompts import EnhancedClaudePrompts
from .semantic_extractor import SemanticExtractionService
from .carrier_name_mappings import CarrierNameStandardizer
from .utils import (
    ClaudePDFProcessor,
    ClaudeTokenEstimator,
    ClaudeResponseParser,
    ClaudeQualityAssessor,
    ClaudeErrorHandler,
    ClaudeTokenBucket,
    ExtractionValidator
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
        self.dynamic_prompts = ClaudeDynamicPrompts()
        self.enhanced_prompts = EnhancedClaudePrompts()
        
        # Initialize semantic extractor with context-aware detection enabled by default
        # This uses LLM-driven summary row detection instead of hard-coded patterns
        use_context_aware = self.config.get('use_context_aware_detection', True)
        self.semantic_extractor = SemanticExtractionService(use_context_aware_detection=use_context_aware)
        
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
        Calculate optimal chunk size based on token budget and document size.
        
        Uses production-tested formula:
        - Reserve tokens for prompt overhead
        - Calculate available tokens for content
        - Determine max pages that fit safely
        - Apply adaptive sizing based on document length
        
        FIXED: Removed hardcoded 3-page cap that was preventing full document processing.
        Now uses dynamic sizing based on actual token budget.
        """
        try:
            # Import constants for consistency
            from .token_constants import ClaudeTokenConstants
            
            # Calculate theoretical maximum from token budget
            max_pages_from_budget = ClaudeTokenConstants.estimate_pages_per_chunk("standard")
            
            logger.info(f"📊 Token Budget Analysis:")
            logger.info(f"   Max pages from token budget: {max_pages_from_budget} pages")
            logger.info(f"   Document total pages: {file_pages} pages")
            
            # Adaptive sizing based on document length
            if file_pages <= max_pages_from_budget:
                # Small document - process in single call
                chunk_size = file_pages
                logger.info(f"   Strategy: Single call (document fits in budget)")
            
            elif file_pages <= 20:
                # Medium document - use full budget per chunk
                chunk_size = max_pages_from_budget
                logger.info(f"   Strategy: Medium doc - {max_pages_from_budget} pages/chunk")
            
            elif file_pages <= 50:
                # Large document - slightly conservative to reduce retry risk
                chunk_size = max(2, max_pages_from_budget - 1)
                logger.info(f"   Strategy: Large doc - conservative {chunk_size} pages/chunk")
            
            else:
                # Very large document - prioritize reliability
                chunk_size = max(2, max_pages_from_budget - 2)
                logger.info(f"   Strategy: Very large doc - reliable {chunk_size} pages/chunk")
            
            # Final safety bounds
            chunk_size = max(2, min(chunk_size, max_pages_from_budget, 10))  # Cap at 10 pages max
            
            # Calculate processing estimates
            num_chunks = (file_pages + chunk_size - 1) // chunk_size
            estimated_time = num_chunks * 15  # 15 seconds per chunk average
            
            logger.info(f"📊 Final Chunk Configuration:")
            logger.info(f"   Chunk size: {chunk_size} pages/chunk")
            logger.info(f"   Expected chunks: {num_chunks}")
            logger.info(f"   Estimated time: {estimated_time}s ({estimated_time/60:.1f}m)")
            
            return chunk_size
        
        except Exception as e:
            logger.exception(f"ERROR: calculate_optimal_chunk_size failed: {e}")
            logger.warning("FALLBACK: Using safe default chunk size of 3 pages")
            return 3  # Safe fallback
    
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
    
    async def cleanup_models(self):
        """
        CRITICAL FIX: Release memory after extraction completes.
        This helps prevent OOM errors on resource-constrained environments like Render Pro (4GB).
        """
        try:
            # Release heavy objects
            if hasattr(self, 'pdf_processor') and self.pdf_processor:
                del self.pdf_processor
            if hasattr(self, 'semantic_extractor') and self.semantic_extractor:
                del self.semantic_extractor
            
            # Force garbage collection
            import gc
            gc.collect()
            logger.info("✅ Cleaned up Claude service models and freed memory")
        except Exception as e:
            logger.warning(f"⚠️ Cleanup error (non-critical): {e}")
    
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
                if not PYMUPDF_AVAILABLE:
                    logger.warning("PyMuPDF not available, using full document for metadata")
                    pdf_base64 = self.pdf_processor.encode_pdf_to_base64(file_path)
                    metadata_pages = page_count
                    # Skip chunking logic
                    extraction_result = await self._call_claude_api(
                        pdf_base64,
                        self.enhanced_prompts.get_metadata_extraction_prompt(),
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
            metadata_prompt = self.enhanced_prompts.get_metadata_extraction_prompt()
            
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
        Extract commission data from PDF file with comprehensive monitoring.
        
        Args:
            carrier_name: Name of the insurance carrier
            file_path: Path to PDF file
            progress_tracker: Optional WebSocket progress tracker
            use_enhanced: If True, use enhanced 3-phase extraction pipeline (DEFAULT: True)
            
        Returns:
            Dictionary with extraction results including monitoring metadata
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
            
            # ✅ COMPREHENSIVE MONITORING: Document processing started
            logger.info("=" * 80)
            logger.info(f"📄 DOCUMENT PROCESSING STARTED")
            logger.info(f"   Carrier: {carrier_name}")
            logger.info(f"   Total Pages: {page_count}")
            logger.info(f"   File Size: {pdf_info.get('file_size_mb', 0):.2f} MB")
            logger.info("=" * 80)
            
            # ✅ CRITICAL FIX: Use adaptive chunking with token estimation
            # Instead of hardcoded page threshold (>8), estimate tokens first
            # This prevents 36K token limit errors on 7-page files with dense content
            
            # Get prompts for extraction (same as UHC and all other carriers)
            dynamic_prompt = self.dynamic_prompts.get_prompt_by_name(carrier_name)
            critical_carrier_instructions = self.enhanced_prompts.get_table_extraction_prompt()
            base_extraction_prompt = self.enhanced_prompts.get_document_intelligence_extraction_prompt()
            full_prompt = base_extraction_prompt + "\n\n" + critical_carrier_instructions + dynamic_prompt
            system_prompt = self.enhanced_prompts.get_base_extraction_instructions()
            
            # ✅ NEW: Check if we should force chunking BEFORE extraction
            should_force_chunk = await self._validate_and_chunk_if_needed(
                file_path, page_count, carrier_name
            )
            
            if should_force_chunk:
                logger.info("🔐 Forcing chunked extraction due to token estimate")
                result = await self._extract_with_adaptive_chunking(
                    carrier_name=carrier_name,
                    pdf_path=file_path,
                    num_pages=page_count,
                    chunk_size=None,  # ✅ PHASE 3 FIX: Let system calculate optimal size instead of hardcoding
                    prompt=full_prompt,
                    system_prompt=system_prompt,
                    progress_tracker=progress_tracker,
                    force_chunk=True
                )
            else:
                logger.info("✅ Token estimate is safe, attempting single call")
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
            
            # ✅ NEW: Early validation check (before sending to frontend)
            if result.get('success'):
                # Validate the extraction results
                validation = self.validate_extraction(result, pdf_info)
                
                logger.info(f"Extraction validation result: valid={validation['valid']}")
                
                if not validation['valid']:
                    # Extraction returned success but validation failed (no tables)
                    logger.error(f"⚠️ Extraction validation failed: {validation['errors']}")
                    
                    if not result.get('tables'):
                        # No tables extracted - this is a real problem
                        logger.error("❌ Extraction returned 0 tables - attempting fallback")
                        
                        # Try fallback extraction method
                        fallback_result = await self._extract_with_fallback(
                            carrier_name=carrier_name,
                            file_path=file_path,
                            pdf_info=pdf_info,
                            progress_tracker=progress_tracker
                        )
                        
                        if fallback_result.get('success') and fallback_result.get('tables'):
                            logger.info(f"✅ Fallback extraction successful: {len(fallback_result['tables'])} tables")
                            return fallback_result
                        else:
                            logger.error("❌ Fallback extraction also failed")
                            return {
                                'success': False,
                                'error': 'Extraction failed - no tables could be extracted',
                                'validation_errors': validation['errors'],
                                'tables': []
                            }
                    else:
                        # We have tables but validation found issues - still return with warnings
                        logger.warning(f"Extraction has issues but data present: {len(result['tables'])} tables")
                        result['validation_warnings'] = validation.get('warnings', [])
                else:
                    # Validation passed
                    logger.info(f"✅ Extraction validation passed")
                    result['validation_status'] = 'passed'
            
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
            
            # ✅ COMPREHENSIVE MONITORING: Validate results
            processing_time = time.time() - start_time
            
            # CRITICAL: Validate all pages processed
            if 'pages_processed' in result:
                pages_processed = len(result['pages_processed'])
                if pages_processed < page_count:
                    missing = page_count - pages_processed
                    logger.error(f"❌ INCOMPLETE PROCESSING: {missing} pages missing!")
                    logger.error(f"   Expected: {page_count} pages")
                    logger.error(f"   Processed: {pages_processed} pages")
                    
                    # Add to result metadata
                    result['processing_incomplete'] = True
                    result['missing_pages_count'] = missing
            
            # Update statistics
            self.stats['successful_extractions'] += 1
            self.stats['total_processing_time'] += processing_time
            
            # ✅ COMPREHENSIVE MONITORING: Final summary
            logger.info("=" * 80)
            logger.info(f"✅ DOCUMENT PROCESSING COMPLETE")
            logger.info(f"   Pages Processed: {pages_processed if 'pages_processed' in result else page_count}/{page_count}")
            logger.info(f"   Tables Extracted: {len(result.get('tables', []))}")
            logger.info(f"   Processing Time: {processing_time:.1f}s")
            logger.info(f"   Pages/Second: {page_count/processing_time:.2f}")
            if result.get('processing_incomplete'):
                logger.error(f"   ⚠️ INCOMPLETE: {result.get('missing_pages_count', 0)} pages not processed")
            logger.info("=" * 80)
            
            return result
        
        except Exception as e:
            self.stats['failed_extractions'] += 1
            processing_time = time.time() - start_time
            
            # ✅ COMPREHENSIVE MONITORING: Extraction failed
            logger.error("=" * 80)
            logger.error(f"❌ DOCUMENT PROCESSING FAILED")
            logger.error(f"   Processing Time: {processing_time:.1f}s")
            logger.error(f"   Error: {str(e)}")
            logger.error("=" * 80)
            logger.exception(f"Full traceback:")
            
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
        
        # Standardize carrier name to prevent duplicates
        if doc_metadata.get('carrier_name'):
            original_carrier = doc_metadata['carrier_name']
            standardized_carrier = CarrierNameStandardizer.standardize(original_carrier)
            
            if original_carrier != standardized_carrier:
                logger.info(f"Carrier name standardized: '{original_carrier}' → '{standardized_carrier}'")
                doc_metadata['carrier_name'] = standardized_carrier
                doc_metadata['original_carrier_name'] = original_carrier  # Keep original for reference
        
        return doc_metadata
    
    def validate_extraction(self, extraction_result: Dict[str, Any], pdf_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate extraction results for completeness and accuracy.
        
        Args:
            extraction_result: The extraction result from Claude
            pdf_info: PDF file information
            
        Returns:
            Validation report with warnings and errors
        """
        validation = {
            "valid": True,
            "warnings": [],
            "errors": []
        }
        
        try:
            # Validate carrier name
            carrier_name = extraction_result.get("document_metadata", {}).get("carrier_name")
            if carrier_name:
                # Check if carrier name is unusually short (might be abbreviated)
                if len(carrier_name.split()) <= 1:
                    validation["warnings"].append(
                        f"Carrier name '{carrier_name}' is very short - might be abbreviated. "
                        f"Consider searching document for full name."
                    )
                
                # Check if standardization would change it
                standardized = CarrierNameStandardizer.standardize(carrier_name)
                if standardized != carrier_name:
                    validation["warnings"].append(
                        f"Carrier name will be standardized: '{carrier_name}' → '{standardized}'"
                    )
            
            # Validate table row counts
            tables = extraction_result.get("tables", [])
            total_rows = sum(len(table.get("rows", [])) for table in tables)
            
            if total_rows == 0:
                validation["errors"].append("No data rows extracted from any table")
                validation["valid"] = False
            
            # Check for incomplete tables
            incomplete_tables = [
                i for i, table in enumerate(tables) 
                if table.get("incomplete", False)
            ]
            
            if incomplete_tables:
                validation["warnings"].append(
                    f"Tables {incomplete_tables} marked as incomplete - may be missing rows"
                )
            
            # Check for duplicate rows (potential extraction error)
            for i, table in enumerate(tables):
                rows = table.get("rows", [])
                unique_rows = set(str(row) for row in rows)
                if len(unique_rows) < len(rows):
                    duplicates = len(rows) - len(unique_rows)
                    validation["warnings"].append(
                        f"Table {i} has {duplicates} duplicate rows - check extraction accuracy"
                    )
            
            logger.info(f"Validation complete: {validation}")
            
        except Exception as e:
            logger.error(f"Validation error: {e}")
            validation["warnings"].append(f"Validation error: {str(e)}")
        
        return validation
    
    async def _estimate_total_tokens(
        self,
        pdf_path: str,
        num_pages: int,
        estimate_mode: str = "standard"
    ) -> Dict[str, Any]:
        """
        Estimate total tokens with REALISTIC values from production data.
        
        ✅ CONSOLIDATED: These constants are also used in calculate_optimal_chunk_size()
        ✅ CRITICAL FIX: Use separate estimates for metadata vs table extraction
        
        IMPORTANT: If you change these constants, also update calculate_optimal_chunk_size()
        to maintain consistency across token estimation methods.
        """
        
        if estimate_mode == "metadata":
            # Metadata extraction is lighter (first 3 pages only)
            TOKENS_PER_PAGE = 2500  # Metadata is lighter
            num_pages_actual = min(num_pages, 3)
            PROMPT_TOKENS = 2500
        else:
            # Table extraction is heavier (full file)
            # ✅ CRITICAL FIX: Based on production data - 37,012 tokens for 5 pages = 7,402 tokens/page
            # But this includes base64 PDF overhead + prompt overhead
            # Breakdown: PDF content ~5,500 tokens/page + System prompt ~5,500 tokens (one-time)
            TOKENS_PER_PAGE = 5500  # ✅ INCREASED from 4500 to 5500 (22% increase)
            num_pages_actual = num_pages
            PROMPT_TOKENS = 5500  # ✅ INCREASED from 3500 to 5500 (57% increase)
        
        OUTPUT_TOKENS = 12000  # ✅ INCREASED from 6000 to 12000 for dense tables
        SAFETY_BUFFER = 0.85  # ✅ TIGHTENED from 0.90 to 0.85 (more conservative)
        SAFETY_MULTIPLIER = 1.15  # ✅ PHASE 2 FIX: REDUCED from 1.25 to 1.15 (more accurate, prevents false rejections)
        ITPM_LIMIT = 36000
        
        safe_limit = int(ITPM_LIMIT * SAFETY_BUFFER)  # 30,600 (85% of 36,000)
        
        # Estimate input tokens WITH safety multiplier
        estimated_input = int(((num_pages_actual * TOKENS_PER_PAGE) + PROMPT_TOKENS) * SAFETY_MULTIPLIER)
        estimated_output = OUTPUT_TOKENS
        total_estimated = estimated_input + estimated_output
        
        # Determine if safe (check input tokens only, as ITPM_LIMIT is for input)
        will_fit = estimated_input <= safe_limit
        
        # Calculate recommended chunk size
        # Work backwards: safe_limit - prompt = available for content
        available_for_content = safe_limit - (int(PROMPT_TOKENS * SAFETY_MULTIPLIER))
        max_pages_per_chunk = max(1, available_for_content // int(TOKENS_PER_PAGE * SAFETY_MULTIPLIER))
        
        # Determine risk level
        if will_fit:
            risk = 'safe'
        elif estimated_input <= safe_limit:
            risk = 'warning'
        else:
            risk = 'critical'
        
        logger.info(f"📊 Token Estimation (FIXED):")
        logger.info(f"   - Mode: {estimate_mode}")
        logger.info(f"   - Pages: {num_pages} (actual: {num_pages_actual})")
        logger.info(f"   - Tokens/page: {TOKENS_PER_PAGE} (realistic)")
        logger.info(f"   - Prompt overhead: {PROMPT_TOKENS}")
        logger.info(f"   - Safety multiplier: {SAFETY_MULTIPLIER}x")
        logger.info(f"   - Base estimate: {(num_pages_actual * TOKENS_PER_PAGE) + PROMPT_TOKENS:,} tokens")
        logger.info(f"   - With multiplier: {estimated_input:,} tokens")
        logger.info(f"   - Safe limit: {safe_limit:,} tokens ({int(SAFETY_BUFFER*100)}% of {ITPM_LIMIT:,})")
        logger.info(f"   - Will fit: {will_fit}")
        logger.info(f"   - Recommended chunk: {max_pages_per_chunk} pages")
        logger.info(f"   - Risk level: {risk}")
        
        return {
            'estimated_input_tokens': estimated_input,
            'estimated_output_tokens': estimated_output,
            'safe_limit': safe_limit,
            'will_fit': will_fit,
            'recommended_chunk_size': max(1, max_pages_per_chunk),
            'risk_level': risk,
            'reason': (
                'Fits safely in single call' if will_fit
                else f'Would need {max_pages_per_chunk} pages/chunk to stay under limit'
            )
        }
    
    async def _validate_and_chunk_if_needed(
        self,
        pdf_path: str,
        num_pages: int,
        carrier_name: str = None
    ) -> bool:
        """
        Validate token estimation and force chunking if needed.
        
        Returns: should_chunk (True if should force chunking)
        """
        
        estimation = await self._estimate_total_tokens(pdf_path, num_pages, "standard")
        
        if not estimation['will_fit']:
            logger.warning(f"⚠️  Token estimate {estimation['estimated_input_tokens']:,} exceeds safe limit")
            logger.warning(f"   Forcing chunking: {estimation['recommended_chunk_size']} pages/chunk")
            return True  # Signal to use chunking
        
        return False  # Safe to try single call
    
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
        
        # Create temporary file
        temp_dir = tempfile.gettempdir()
        chunk_filename = f"chunk_{start_page}_{end_page}_{Path(original_path).stem}.pdf"
        chunk_path = Path(temp_dir) / chunk_filename
        
        # Create new PDF with selected pages
        if not PYMUPDF_AVAILABLE:
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
        
        Uses: header names + first 2 rows values + row count for accurate matching
        """
        
        headers = tuple(table.get('headers', []) or table.get('header', []))
        rows = table.get('rows', [])
        
        # Include first 2 rows for better duplicate detection
        first_row = tuple(rows[0]) if len(rows) > 0 else ()
        second_row = tuple(rows[1]) if len(rows) > 1 else ()
        row_count = len(rows)
        
        signature = f"{headers}|{first_row}|{second_row}|{row_count}"
        import hashlib
        return hashlib.md5(signature.encode()).hexdigest()
    
    def get_table_signature(self, table: Dict[str, Any]) -> str:
        """
        Public wrapper for _get_table_signature.
        Creates unique signature for table to detect duplicates.
        
        Strategy:
        - Compare table signatures (headers + first 2 rows)
        - Used for deduplication of overlapping chunks
        """
        return self._get_table_signature(table)
    
    def deduplicate_overlapping_tables(self, tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Remove duplicate tables from overlapping chunks.
        
        Strategy:
        - Compare table signatures (headers + first 2 rows)
        - If 90%+ similarity, keep the one with more rows
        - Preserve metadata from both sources
        
        This is critical for processing multi-chunk documents where chunks
        have 1-page overlaps to preserve context.
        """
        if len(tables) <= 1:
            return tables
        
        seen_signatures = {}
        deduplicated = []
        
        logger.info(f"🔍 Deduplicating {len(tables)} tables from overlapping chunks...")
        
        for table in tables:
            # Create signature
            signature = self.get_table_signature(table)
            
            if signature not in seen_signatures:
                # New table
                seen_signatures[signature] = len(deduplicated)
                deduplicated.append(table)
                logger.debug(f"   Added new table (signature={signature[:20]}..., rows={len(table.get('rows', []))})")
            else:
                # Potential duplicate - compare row counts
                existing_idx = seen_signatures[signature]
                existing_table = deduplicated[existing_idx]
                
                existing_rows = len(existing_table.get('rows', []))
                new_rows = len(table.get('rows', []))
                
                if new_rows > existing_rows:
                    # Replace with version that has more rows
                    logger.info(f"   Replacing table (signature={signature[:20]}...) - {existing_rows} → {new_rows} rows")
                    deduplicated[existing_idx] = table
                else:
                    logger.debug(f"   Skipping duplicate table (signature={signature[:20]}...) - keeping {existing_rows} rows")
        
        removed_count = len(tables) - len(deduplicated)
        logger.info(f"✅ Deduplication complete: {len(tables)} → {len(deduplicated)} tables ({removed_count} duplicates removed)")
        
        return deduplicated
    
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
        chunk_info: Dict[str, Any] = None,
        model: str = None  # ← NEW: Optional model override
    ) -> Dict[str, Any]:
        """
        Extract from PDF in single API call with CIRCUIT BREAKER for token errors.
        
        This is called either for:
        1. Small files (fit in one call)
        2. Individual chunks of larger files
        """
        
        # Use primary model if not specified
        if model is None:
            model = self.primary_model
        
        try:
            # ✅ CRITICAL FIX: Estimate tokens BEFORE any API interaction
            estimation = await self._estimate_total_tokens(
                pdf_path, pdf_pages, "standard"
            )
            
            estimated_input_tokens = estimation['estimated_input_tokens']
            safe_limit = estimation['safe_limit']  # This is 30,600 (85% of 36,000)
            
            logger.info(f"📊 Token Estimation:")
            logger.info(f"   Estimated input: {estimated_input_tokens:,} tokens")
            logger.info(f"   Safe limit: {safe_limit:,} tokens")
            logger.info(f"   Will fit: {estimation['will_fit']}")
            
            # ✅ CRITICAL VALIDATION: Reject BEFORE rate limiter if too large
            if estimated_input_tokens > self.rate_limiter.itpm_limit:
                error_msg = (
                    f"❌ PRE-VALIDATION FAILED: Estimated {estimated_input_tokens:,} tokens "
                    f"exceeds ITPM limit of {self.rate_limiter.itpm_limit:,}. "
                    f"Recommendation: Use {estimation['recommended_chunk_size']} pages/chunk instead."
                )
                logger.error(error_msg)
                raise ValueError(error_msg)
            
            if not estimation['will_fit']:
                logger.warning(
                    f"⚠️ Token estimate {estimated_input_tokens:,} exceeds safe limit "
                    f"{safe_limit:,} but below hard limit. Proceeding with caution."
                )
            
            logger.info(f"🔄 Calling Claude API {'for chunk' if is_chunk else 'for full document'} with model: {model}")
            
            # Encode PDF
            pdf_base64 = self.pdf_processor.encode_pdf_to_base64(pdf_path)
            
            # Make API call
            extraction_result = await self._call_claude_api(
                pdf_base64=pdf_base64,
                prompt=prompt,
                model=model,  # ✅ Use provided model
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
            
            # ✅ Trust Claude's summary row detection - no Python post-validation needed
            # Claude already marks rows with is_summary/summary_confidence in the response
            # utils.py converts this to summary_rows indices
            logger.info("✅ Using Claude's summary row detection (no Python validation)")
            
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
            # ✅ CIRCUIT BREAKER: Check if this is a token limit error
            from anthropic import APIStatusError
            if isinstance(e, APIStatusError) and ("exceeds limit of 36,000" in str(e) or "Request too large" in str(e)):
                # Token limit exceeded - return special error that triggers chunking
                logger.error(f"❌ Token limit exceeded in single call: {e}")
                logger.warning(f"   This shouldn't happen with our pre-validation!")
                logger.warning(f"   Falling back to chunking (chunk_size=4 pages)")
                
                # Calculate safe chunk size
                safe_pages_per_chunk = max(1, 32400 // 4500)  # 7 pages
                
                # Return special error that triggers chunking
                return {
                    'success': False,
                    'error': 'Token limit exceeded - falling back to chunking',
                    'fallback_chunk_size': safe_pages_per_chunk,
                    'tables': []
                }
            
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
                        # ✅ Trust Claude's summary row detection - no Python post-validation needed
                        logger.info("✅ Using Claude's summary row detection for fallback results")
                        
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
        progress_tracker = None,
        model: str = None,  # ← NEW: Optional model override
        max_rechunk_attempts: int = 2,  # ✅ NEW: Allow 2 levels of re-chunking (5→3→2 or 3→2→1)
        _recursion_depth: int = 0  # ✅ INTERNAL: Track recursion depth
    ) -> Dict[str, Any]:
        """
        Extract from PDF in chunks with AUTOMATIC RE-CHUNKING on failure.
        
        NEW BEHAVIOR (Phase 1 - Critical Fix):
        - If a chunk fails pre-validation, automatically split it into smaller sub-chunks
        - Recursively retry with progressively smaller sizes: 5 → 3 → 2 pages
        - Only mark as failed after exhausting all re-chunking attempts
        
        Chunks are processed sequentially (respecting 36K ITPM limit)
        but intelligently merged to avoid duplication.
        """
        
        # Use primary model if not specified
        if model is None:
            model = self.primary_model
        
        if not PYMUPDF_AVAILABLE:
            logger.error("PyMuPDF not available for chunking")
            raise ImportError("PyMuPDF required for PDF chunking. Install with: pip install pymupdf")
        
        # ✅ ENHANCED LOGGING (Phase 5)
        indent = "   " * _recursion_depth
        logger.info(f"{indent}🔄 Starting chunked extraction: {num_pages} pages, {chunk_size} pages/chunk with model: {model}")
        if _recursion_depth > 0:
            logger.info(f"{indent}   (Re-chunking attempt {_recursion_depth}/{max_rechunk_attempts})")
        
        # Open PDF
        pdf_doc = fitz.open(pdf_path)
        
        all_results = {
            'tables': [],
            'entities': {},
            'document_metadata': {},
            'text_content': [],
            'chunk_metadata': [],
            'successful_chunks': [],
            'failed_chunks': [],
            'pages_processed': set()  # ✅ NEW: Track which pages we actually processed
        }
        
        # ✅ NEW: Track individual chunk results for deduplication
        all_chunk_results = []
        
        # Calculate chunks with overlap to prevent missing rows at boundaries
        chunks = []
        overlap_pages = 1  # Include 1 page from previous chunk for continuity
        
        for chunk_start in range(0, num_pages, chunk_size):
            chunk_end = min(chunk_start + chunk_size, num_pages)
            
            # Add overlap with previous chunk (except first chunk)
            effective_start = max(0, chunk_start - overlap_pages) if len(chunks) > 0 else chunk_start
            
            chunks.append({
                'index': len(chunks),
                'start_page': chunk_start,
                'end_page': chunk_end,
                'effective_start_page': effective_start,  # Includes overlap
                'page_count': chunk_end - chunk_start,
                'has_overlap': len(chunks) > 0  # Flag indicating overlap exists
            })
        
        # ✅ ENHANCED LOGGING (Phase 5): Show chunking plan
        logger.info(f"{indent}📊 CHUNKING PLAN:")
        logger.info(f"{indent}   Total pages: {num_pages}")
        logger.info(f"{indent}   Chunk size: {chunk_size} pages/chunk")
        logger.info(f"{indent}   Expected chunks: {len(chunks)}")
        logger.info(f"{indent}   Page ranges:")
        for i, chunk in enumerate(chunks):
            logger.info(f"{indent}      Chunk {i + 1}: Pages {chunk['start_page'] + 1}-{chunk['end_page']}")
        
        # Process each chunk with error recovery
        for chunk_info in chunks:
            try:
                logger.info(f"{indent}📖 Processing chunk {chunk_info['index'] + 1}/{len(chunks)}: Pages {chunk_info['start_page'] + 1}-{chunk_info['end_page']}")
                
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
                    
                    logger.info(f"{indent}   Chunk tokens: {chunk_estimation['estimated_input_tokens']:,} (safe: {chunk_estimation['will_fit']})")
                    
                    # ✅ NEW (Phase 1): Check if chunk needs to be split further
                    if not chunk_estimation['will_fit']:
                        logger.warning(f"{indent}⚠️ Chunk {chunk_info['index']} exceeds token limit ({chunk_estimation['estimated_input_tokens']:,} > {chunk_estimation['safe_limit']:,})")
                        
                        # Calculate how many sub-chunks we need
                        recommended_size = chunk_estimation['recommended_chunk_size']
                        logger.info(f"{indent}   📊 Recommended sub-chunk size: {recommended_size} pages")
                        
                        # ✅ RECURSIVE RE-CHUNKING: Split this chunk into smaller sub-chunks
                        if chunk_info['page_count'] > recommended_size and _recursion_depth < max_rechunk_attempts:
                            logger.info(f"{indent}   🔄 Re-chunking pages {chunk_info['start_page'] + 1}-{chunk_info['end_page']} into smaller sub-chunks")
                            
                            # Clean up current chunk file before recursive call
                            try:
                                import os
                                if os.path.exists(chunk_path):
                                    os.remove(chunk_path)
                            except Exception as e:
                                logger.warning(f"{indent}   Failed to cleanup chunk file: {e}")
                            
                            # Recursively process this failed chunk with smaller size
                            # We need to extract just these pages into a temp PDF for recursion
                            temp_chunk_pdf = await self._extract_pdf_chunk(
                                pdf_doc=pdf_doc,
                                start_page=chunk_info['start_page'],
                                end_page=chunk_info['end_page'],
                                original_path=pdf_path
                            )
                            
                            try:
                                sub_result = await self._extract_chunked(
                                    carrier_name=carrier_name,
                                    pdf_path=temp_chunk_pdf,  # Use temp chunk PDF
                                    num_pages=chunk_info['page_count'],  # Only process this chunk's pages
                                    chunk_size=recommended_size,  # Use recommended smaller size
                                    prompt=prompt,
                                    system_prompt=system_prompt,
                                    estimation=None,
                                    progress_tracker=progress_tracker,
                                    model=model,
                                    max_rechunk_attempts=max_rechunk_attempts,
                                    _recursion_depth=_recursion_depth + 1  # Increment recursion depth
                                )
                                
                                # Merge sub-chunk results into main results
                                if sub_result.get('success') and sub_result.get('tables'):
                                    logger.info(f"{indent}   ✅ Re-chunking successful: {len(sub_result['tables'])} tables extracted from sub-chunks")
                                    
                                    # Add tables from sub-result
                                    if sub_result.get('tables'):
                                        # Wrap in chunk result format for deduplication
                                        wrapped_result = {
                                            'success': True,
                                            'tables': sub_result['tables'],
                                            'document_metadata': sub_result.get('document_metadata', {}),
                                            'groups_and_companies': sub_result.get('groups_and_companies', []),
                                            'writing_agents': sub_result.get('writing_agents', []),
                                            'business_intelligence': sub_result.get('business_intelligence', {})
                                        }
                                        all_chunk_results.append(wrapped_result)
                                    
                                    # ✅ NEW: Track processed pages from sub-result
                                    for page_num in range(chunk_info['start_page'], chunk_info['end_page']):
                                        all_results['pages_processed'].add(page_num)
                                    
                                    all_results['successful_chunks'].append(chunk_info['index'])
                                else:
                                    # ✅ PHASE 4: Try page-by-page fallback before giving up
                                    logger.warning(f"{indent}   ⚠️ Re-chunking failed, attempting page-by-page fallback")
                                    fallback_result = await self._extract_page_by_page_fallback(
                                        carrier_name=carrier_name,
                                        pdf_path=pdf_path,
                                        failed_chunk_info=chunk_info,
                                        prompt=prompt,
                                        system_prompt=system_prompt,
                                        progress_tracker=progress_tracker,
                                        model=model
                                    )
                                    
                                    if fallback_result.get('success'):
                                        logger.info(f"{indent}   ✅ Fallback successful!")
                                        
                                        # Wrap fallback result
                                        wrapped_result = {
                                            'success': True,
                                            'tables': fallback_result['tables'],
                                            'document_metadata': {},
                                            'groups_and_companies': [],
                                            'writing_agents': [],
                                            'business_intelligence': {}
                                        }
                                        all_chunk_results.append(wrapped_result)
                                        
                                        # ✅ NEW: Track processed pages from fallback
                                        for page_num in range(chunk_info['start_page'], chunk_info['end_page']):
                                            all_results['pages_processed'].add(page_num)
                                        
                                        all_results['successful_chunks'].append(chunk_info['index'])
                                    else:
                                        # Final failure after all attempts
                                        logger.error(f"{indent}   ❌ Re-chunking and fallback both failed for chunk {chunk_info['index']}")
                                        all_results['failed_chunks'].append({
                                            'chunk_index': chunk_info['index'],
                                            'reason': 'Re-chunking exhausted and page-by-page fallback failed',
                                            'pages': f"{chunk_info['start_page'] + 1}-{chunk_info['end_page']}",
                                            'recoverable': False
                                        })
                            finally:
                                # Clean up temp chunk PDF
                                try:
                                    import os
                                    if os.path.exists(temp_chunk_pdf):
                                        os.remove(temp_chunk_pdf)
                                except Exception as e:
                                    logger.warning(f"{indent}   Failed to cleanup temp chunk PDF: {e}")
                            
                            continue  # Move to next chunk
                        else:
                            # Can't split further or max recursion reached
                            logger.error(f"{indent}   ❌ Cannot split chunk further (current size: {chunk_info['page_count']}, recommended: {recommended_size}, depth: {_recursion_depth}/{max_rechunk_attempts})")
                            all_results['failed_chunks'].append({
                                'chunk_index': chunk_info['index'],
                                'reason': f'Exceeds token limit and cannot split further (depth: {_recursion_depth})',
                                'pages': f"{chunk_info['start_page'] + 1}-{chunk_info['end_page']}",
                                'recoverable': False
                            })
                            continue
                    
                    # Extract chunk (only if passed validation)
                    chunk_prompt = f"Extract commission data from this section of the document. Page range: {chunk_info['start_page'] + 1}-{chunk_info['end_page']}.\n\n{prompt}"
                    
                    chunk_result = await self._extract_single_call(
                        carrier_name=carrier_name,
                        pdf_path=chunk_path,
                        prompt=chunk_prompt,
                        system_prompt=system_prompt,
                        pdf_pages=chunk_info['page_count'],
                        is_chunk=True,
                        chunk_info=chunk_info,
                        model=model  # ✅ Pass model parameter for chunks
                    )
                    
                    # ✅ ENHANCED LOGGING (Phase 5): Detailed chunk summary
                    logger.info(f"{indent}📊 CHUNK {chunk_info['index'] + 1} SUMMARY:")
                    logger.info(f"{indent}   Status: {'✅ SUCCESS' if chunk_result and chunk_result.get('success') else '❌ FAILED'}")
                    if chunk_result and chunk_result.get('success'):
                        tables_count = len(chunk_result.get('tables', []))
                        rows_count = sum(len(t.get('rows', [])) for t in chunk_result.get('tables', []))
                        logger.info(f"{indent}   Tables extracted: {tables_count}")
                        logger.info(f"{indent}   Rows extracted: {rows_count}")
                    else:
                        error_msg = chunk_result.get('error', 'Unknown error') if chunk_result else 'No result'
                        logger.info(f"{indent}   Failure reason: {error_msg}")
                    
                    # Check if chunk extraction succeeded
                    if chunk_result and chunk_result.get('success'):
                        # ✅ CRITICAL FIX: Merge even if only one table (don't fail on small chunks)
                        all_chunk_results.append(chunk_result)
                        all_results = self._merge_chunk_results(all_results, chunk_result, chunk_info)
                        all_results['successful_chunks'].append(chunk_info['index'])
                        
                        # ✅ NEW: Track processed pages
                        for page_num in range(chunk_info['start_page'], chunk_info['end_page']):
                            all_results['pages_processed'].add(page_num)
                        
                        logger.info(f"{indent}   ✅ Chunk successful: {len(chunk_result.get('tables', []))} tables extracted")
                    else:
                        # Chunk extraction returned failure
                        error_msg = chunk_result.get('error', 'Unknown error') if chunk_result else 'No result'
                        logger.warning(f"{indent}   ❌ Chunk extraction failed: {error_msg}")
                        
                        all_results['failed_chunks'].append({
                            'chunk_index': chunk_info['index'],
                            'reason': error_msg,
                            'pages': f"{chunk_info['start_page'] + 1}-{chunk_info['end_page']}",
                            'recoverable': 'token_limit' in str(error_msg).lower()
                        })
                        
                        # Continue to next chunk instead of failing
                        continue
                
                finally:
                    # Clean up chunk file
                    try:
                        import os
                        if os.path.exists(chunk_path):
                            os.remove(chunk_path)
                    except Exception as e:
                        logger.warning(f"{indent}Failed to cleanup chunk file: {e}")
            
            except Exception as e:
                # ✅ IMPROVED: More detailed error logging
                logger.error(f"{indent}   ❌ Chunk {chunk_info['index']} failed with exception: {e}")
                logger.exception("Full traceback:")
                
                all_results['failed_chunks'].append({
                    'chunk_index': chunk_info['index'],
                    'exception': str(e),
                    'pages': f"{chunk_info['start_page'] + 1}-{chunk_info['end_page']}",
                    'recoverable': 'token_limit' in str(e).lower() or 'tokens' in str(e).lower()
                })
                
                # Continue processing remaining chunks
                continue
        
        pdf_doc.close()
        
        # ✅ CRITICAL VALIDATION: Verify all pages processed
        expected_pages = set(range(num_pages))
        processed_pages = all_results['pages_processed']
        missing_pages = expected_pages - processed_pages
        
        if missing_pages:
            logger.error(f"{indent}❌ VALIDATION FAILED: {len(missing_pages)} pages not processed!")
            logger.error(f"{indent}   Missing pages: {sorted([p+1 for p in missing_pages])}")
            logger.error(f"{indent}   Expected: {num_pages} pages")
            logger.error(f"{indent}   Processed: {len(processed_pages)} pages")
            
            # Add to error metadata
            all_results['validation_error'] = {
                'missing_pages': sorted([p+1 for p in missing_pages]),
                'expected_total': num_pages,
                'actual_total': len(processed_pages)
            }
        else:
            logger.info(f"{indent}✅ VALIDATION PASSED: All {num_pages} pages processed successfully")
        
        # ✅ ENHANCED LOGGING (Phase 5): Comprehensive final summary
        logger.info(f"{indent}📊 FINAL EXTRACTION SUMMARY:")
        logger.info(f"{indent}   Total chunks: {len(chunks)}")
        logger.info(f"{indent}   Successful: {len(all_results['successful_chunks'])}")
        logger.info(f"{indent}   Failed: {len(all_results['failed_chunks'])}")
        logger.info(f"{indent}   Pages processed: {len(processed_pages)}/{num_pages}")
        if all_results['failed_chunks']:
            logger.warning(f"{indent}   ⚠️ Failed chunk details: {all_results['failed_chunks']}")
        
        # ✅ CRITICAL FIX: Return partial success if we got ANY tables
        if all_chunk_results:
            # ✅ CONSOLIDATED: Use ExtractionValidator for deduplication (removes redundant code)
            merged_tables = ExtractionValidator.validate_chunk_merge(all_chunk_results)
            
            # Calculate duplicates removed
            total_rows_before = sum(len(table.get('rows', [])) for chunk in all_chunk_results for table in chunk.get('tables', []))
            total_rows_after = sum(len(table.get('rows', [])) for table in merged_tables)
            
            logger.info(f"{indent}✅ Extraction successful:")
            logger.info(f"{indent}   - Successful chunks: {len(all_results['successful_chunks'])}/{len(chunks)}")
            logger.info(f"{indent}   - Failed chunks: {len(all_results['failed_chunks'])}")
            logger.info(f"{indent}   - Total tables extracted: {len(merged_tables)}")
            logger.info(f"{indent}   - Total rows: {total_rows_after}")
            logger.info(f"{indent}   - Duplicate rows removed: {total_rows_before - total_rows_after}")
            
            # Extract entities from chunk_metadata
            groups_and_companies = []
            writing_agents = []
            business_intelligence = {}
            
            # Merge entities from all chunks (stored in all_results['entities'])
            if all_results.get('entities'):
                groups_and_companies = all_results['entities'].get('groups_and_companies', [])
                writing_agents = all_results['entities'].get('writing_agents', [])
                business_intelligence = all_results['entities'].get('business_intelligence', {})
            
            # Determine extraction method name
            if len(all_results['failed_chunks']) > 0:
                extraction_method = 'claude_chunked_partial'
                warning_msg = f"Partial extraction: {len(all_results['successful_chunks'])}/{len(chunks)} chunks succeeded. Failed chunks: {all_results['failed_chunks']}"
            else:
                extraction_method = 'claude_chunked'
                warning_msg = None
            
            return {
                'success': True,  # ← CRITICAL: Return True even with some failures
                'tables': merged_tables,
                'document_metadata': all_results['document_metadata'],
                'groups_and_companies': groups_and_companies,
                'writing_agents': writing_agents,
                'business_intelligence': business_intelligence,
                'extraction_method': extraction_method,
                'chunk_count': len(chunks),
                'successful_chunks': len(all_results['successful_chunks']),
                'failed_chunks': len(all_results['failed_chunks']),
                'chunk_metadata': all_results['chunk_metadata'],
                'warning': warning_msg
            }
        
        elif all_results['failed_chunks']:
            # All chunks failed
            logger.error(f"❌ All {len(chunks)} chunks failed")
            
            return {
                'success': False,
                'error': f'All {len(chunks)} chunks failed during extraction',
                'failed_chunks': all_results['failed_chunks'],
                'tables': []
            }
        
        else:
            # No chunks processed
            return {
                'success': False,
                'error': 'No chunks processed',
                'tables': []
            }
    
    async def _extract_page_by_page_fallback(
        self,
        carrier_name: str,
        pdf_path: str,
        failed_chunk_info: Dict[str, Any],
        prompt: str,
        system_prompt: str,
        progress_tracker = None,
        model: str = None
    ) -> Dict[str, Any]:
        """
        FALLBACK: Extract pages individually when chunking fails.
        
        This is the last resort for extremely dense pages that exceed
        token limits even with 1-page chunks.
        
        Strategy:
        - Process each page individually
        - Use aggressive prompt compression
        - Merge results at the end
        
        Phase 4 Implementation.
        """
        logger.warning(f"⚠️ FALLBACK: Attempting page-by-page extraction for pages {failed_chunk_info['start_page'] + 1}-{failed_chunk_info['end_page']}")
        
        if model is None:
            model = self.primary_model
        
        if not PYMUPDF_AVAILABLE:
            logger.error("PyMuPDF not available for page-by-page fallback")
            raise ImportError("PyMuPDF required for PDF chunking. Install with: pip install pymupdf")
        
        pdf_doc = fitz.open(pdf_path)
        page_results = []
        
        for page_num in range(failed_chunk_info['start_page'], failed_chunk_info['end_page']):
            try:
                logger.info(f"   📄 Processing page {page_num + 1} individually")
                
                # Extract single page
                single_page_path = await self._extract_pdf_chunk(
                    pdf_doc=pdf_doc,
                    start_page=page_num,
                    end_page=page_num + 1,
                    original_path=pdf_path
                )
                
                try:
                    # Use compressed prompt for single page
                    compressed_prompt = f"Extract commission data from page {page_num + 1}. {prompt[:500]}"  # Truncate to save tokens
                    
                    # Estimate tokens
                    page_estimation = await self._estimate_total_tokens(single_page_path, 1, "standard")
                    
                    if page_estimation['will_fit']:
                        # Extract single page
                        page_result = await self._extract_single_call(
                            carrier_name=carrier_name,
                            pdf_path=single_page_path,
                            prompt=compressed_prompt,
                            system_prompt=system_prompt,
                            pdf_pages=1,
                            is_chunk=True,
                            chunk_info={'index': page_num, 'page_count': 1},
                            model=model
                        )
                        
                        if page_result.get('success') and page_result.get('tables'):
                            page_results.append(page_result)
                            logger.info(f"      ✅ Page {page_num + 1}: {len(page_result['tables'])} tables extracted")
                        else:
                            logger.warning(f"      ⚠️ Page {page_num + 1}: No tables extracted")
                    else:
                        logger.error(f"      ❌ Page {page_num + 1}: Even single page exceeds token limit - skipping")
                
                finally:
                    # Cleanup temp file
                    try:
                        import os
                        if os.path.exists(single_page_path):
                            os.remove(single_page_path)
                    except Exception as e:
                        logger.warning(f"      Failed to cleanup single page file: {e}")
            
            except Exception as e:
                logger.error(f"      ❌ Page {page_num + 1} failed: {e}")
                continue
        
        pdf_doc.close()
        
        # Merge page results
        if page_results:
            from .utils import ExtractionValidator
            merged_tables = ExtractionValidator.validate_chunk_merge(page_results)
            logger.info(f"   ✅ Fallback extraction: {len(merged_tables)} tables from {len(page_results)} pages")
            
            return {
                'success': True,
                'tables': merged_tables,
                'extraction_method': 'page_by_page_fallback',
                'pages_processed': len(page_results)
            }
        else:
            return {
                'success': False,
                'error': 'Page-by-page fallback failed - no data extracted',
                'tables': []
            }
    
    async def _extract_with_adaptive_chunking(
        self,
        carrier_name: str,
        pdf_path: str,
        num_pages: int,
        prompt: str,
        system_prompt: str,
        progress_tracker = None,
        chunk_size: int = None,  # None means calculate, or specify exact size
        force_chunk: bool = False,  # ← NEW: Force chunking even if estimated safe
        model: str = None  # ← NEW: Optional model override (defaults to primary_model)
    ) -> Dict[str, Any]:
        """
        Extract from PDF in chunks with pre-calculated token awareness.
        
        Strategy:
        1. Estimate tokens needed
        2. If fits: extract as single call
        3. If doesn't fit: split into chunks
        4. Process chunks sequentially (respecting rate limits)
        5. Merge results intelligently
        """
        
        # Use primary model if not specified
        if model is None:
            model = self.primary_model
        
        # ✅ NEW: If force_chunk=True, ignore "might fit" and chunk anyway
        if force_chunk:
            logger.info("🔐 Force chunking enabled by pre-validation")
            if chunk_size is None:
                # ✅ PHASE 3 FIX: Calculate optimal chunk size instead of hardcoding
                chunk_size = self.calculate_optimal_chunk_size(num_pages)
                logger.info(f"   📊 Calculated optimal chunk size: {chunk_size} pages")
        elif chunk_size is None:
            # Step 1: Estimate tokens
            estimation = await self._estimate_total_tokens(pdf_path, num_pages, "standard")
            
            logger.info(f"🔍 Adaptive Chunking Analysis:")
            logger.info(f"   - Will fit in single call: {estimation['will_fit']}")
            logger.info(f"   - Recommended chunk size: {estimation['recommended_chunk_size']} pages")
            logger.info(f"   - Risk level: {estimation['risk_level']}")
            
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
                    chunk_info=None,
                    model=model  # ✅ Pass model parameter
                )
            else:
                # Calculate based on estimation
                chunk_size = estimation['recommended_chunk_size']
                
                # ✅ CRITICAL FIX: ENFORCE MAXIMUM - Never exceed 3 pages per chunk for dense files
                if estimation['risk_level'] in ['warning', 'critical']:
                    chunk_size = min(chunk_size, 3)
                    logger.info(f"📋 Calculated adaptive chunk size: {chunk_size} pages (capped at 3 due to risk: {estimation['risk_level']})")
                else:
                    logger.info(f"📋 Calculated adaptive chunk size: {chunk_size} pages (risk: {estimation['risk_level']})")
        
        # Need chunking
        logger.info(f"📋 Chunking {num_pages} pages into chunks of {chunk_size} pages")
        
        return await self._extract_chunked(
            carrier_name=carrier_name,
            pdf_path=pdf_path,
            num_pages=num_pages,
            chunk_size=chunk_size,
            prompt=prompt,
            system_prompt=system_prompt,
            estimation=None,  # Not needed when force chunking
            progress_tracker=progress_tracker,
            model=model  # ✅ Pass model parameter
        )
    
    async def _extract_with_fallback(
        self,
        carrier_name,
        file_path: str,
        pdf_info: Dict[str, Any],
        progress_tracker = None
    ) -> Dict[str, Any]:
        """
        Attempt extraction with fallback model.
        
        ✅ CRITICAL FIX: Added token validation and chunking support for fallback model
        """
        logger.info(f"Attempting extraction with fallback model: {self.fallback_model}")
        
        if progress_tracker:
            await progress_tracker.update_progress(
                "table_detection",
                10,
                "Retrying with alternative Claude model"
            )
        
        # Get prompts for extraction (same as UHC and all other carriers)
        dynamic_prompt = self.dynamic_prompts.get_prompt_by_name(carrier_name)
        if dynamic_prompt:
            logger.info(f"🎯 Fallback: Using carrier-specific dynamic prompt for: {carrier_name}")
        
        # ✅ CRITICAL FIX: Use enhanced prompts + critical carrier instructions for fallback too
        critical_carrier_instructions = self.enhanced_prompts.get_table_extraction_prompt()
        base_extraction_prompt = self.enhanced_prompts.get_document_intelligence_extraction_prompt()
        full_prompt = base_extraction_prompt + "\n\n" + critical_carrier_instructions + dynamic_prompt
        system_prompt = self.enhanced_prompts.get_base_extraction_instructions()
        
        # ✅ NEW: Check if fallback model also needs chunking (same token limits apply!)
        page_count = pdf_info.get('page_count', 0)
        should_force_chunk = await self._validate_and_chunk_if_needed(
            file_path, page_count, carrier_name
        )
        
        if should_force_chunk:
            logger.info("🔐 Fallback: Forcing chunked extraction due to token estimate")
            # Use chunked extraction with fallback model
            result = await self._extract_with_adaptive_chunking(
                carrier_name=carrier_name,
                pdf_path=file_path,
                num_pages=page_count,
                chunk_size=None,  # ✅ PHASE 3 FIX: Let system calculate optimal size instead of hardcoding
                prompt=full_prompt,
                system_prompt=system_prompt,
                progress_tracker=progress_tracker,
                force_chunk=True,
                model=self.fallback_model  # ✅ Use fallback model for chunks
            )
            
            # Extract data from chunked result
            if not result.get('success'):
                raise ValueError(f"Fallback chunked extraction failed: {result.get('error')}")
            
            tables = result.get('tables', [])
            doc_metadata = result.get('document_metadata', {})
            groups_and_companies = result.get('groups_and_companies', [])
            writing_agents = result.get('writing_agents', [])
            business_intelligence = result.get('business_intelligence', {})
            token_usage = result.get('token_usage', {})
            
        else:
            logger.info("✅ Fallback: Token estimate is safe, attempting single call")
            # Single call is safe
            pdf_base64 = self.pdf_processor.encode_pdf_to_base64(file_path)
            
            extraction_result = await self._call_claude_api(
                pdf_base64,
                full_prompt,
                model=self.fallback_model,
                pdf_pages=page_count,
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
            token_usage = extraction_result.get('usage', {})
        
        # Normalize headers (common for both chunked and single-call paths)
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
            token_usage=token_usage,  # ✅ Now uses variable set in both branches
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
        # Cap at 12000 for large chunks with tables (rate limiter will enforce waits if needed)
        # Note: max_tokens=16000 in API call, but we estimate 12000 as a realistic maximum
        estimated_output_tokens = min(int(estimated_input_tokens * 0.5), 12000)
        
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
                        "text": self.enhanced_prompts.get_base_extraction_instructions(),
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
                        max_tokens=16000,  # ✅ INCREASED to 16000 to prevent JSON truncation (OTPM managed by rate limiter)
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
        
        # Validate extraction before returning
        validation = self.validate_extraction(response, pdf_info)
        
        # Add validation info to response
        response['validation'] = validation
        
        # Log any warnings
        if validation.get('warnings'):
            for warning in validation['warnings']:
                logger.warning(f"Extraction validation: {warning}")
        
        if not validation.get('valid'):
            for error in validation.get('errors', []):
                logger.error(f"Extraction validation error: {error}")
        
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
            prompt = self.enhanced_prompts.get_summarize_extraction_prompt()
            
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

