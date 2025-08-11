"""Main table extraction pipeline orchestrator."""

import asyncio
import time
from typing import List, Dict, Any, Optional, Union
from pathlib import Path
from dataclasses import dataclass, field
from enum import Enum
import json
import re

from ..core.document_processor import DocumentProcessor, ProcessedDocument
from ..core.multipage_handler import MultiPageTableHandler
from ..models.tableformer import TableFormerModel, OCREngine, TableStructure
from ..models.advanced_tableformer import ProductionTableFormer
from ..models.advanced_ocr_engine import AdvancedOCREngine
from ..processors.financial_processor import SmartFinancialDocumentProcessor
from ..evaluation.advanced_metrics import AdvancedEvaluationMetrics
from ..utils.config import Config
from ..utils.logging_utils import get_logger, LogExtractionOperation
from ..utils.validation import ExtractionResultValidator, ValidationResult


class ExtractionStage(Enum):
    """Extraction pipeline stages."""
    DOCUMENT_PROCESSING = "document_processing"
    TABLE_DETECTION = "table_detection"
    STRUCTURE_RECOGNITION = "structure_recognition"
    TEXT_EXTRACTION = "text_extraction"
    POST_PROCESSING = "post_processing"
    VALIDATION = "validation"


@dataclass
class TableExtractionResult:
    """Result container for table extraction."""
    tables: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    confidence_scores: Dict[str, float] = field(default_factory=dict)
    processing_time: float = 0.0
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    document_path: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format."""
        return {
            'tables': self.tables,
            'metadata': self.metadata,
            'confidence_scores': self.confidence_scores,
            'processing_time': self.processing_time,
            'warnings': self.warnings,
            'errors': self.errors,
            'document_path': self.document_path
        }
    
    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), indent=2, default=str)


@dataclass
class ExtractionOptions:
    """Options for table extraction."""
    enable_ocr: bool = True
    enable_multipage: bool = True
    confidence_threshold: float = 0.5
    max_tables_per_page: int = 10
    output_format: str = "json"
    include_raw_data: bool = False
    enable_quality_checks: bool = True
    enable_advanced_tableformer: bool = True
    enable_ensemble_ocr: bool = True
    enable_financial_processing: bool = True
    enable_advanced_metrics: bool = True


class ExtractionPipeline:
    """Main orchestrator for the table extraction pipeline."""
    
    def __init__(self, config: Config):
        """Initialize extraction pipeline."""
        self.config = config
        self.logger = get_logger(__name__, config)
        
        # Initialize components
        self._initialize_components()
        
        # Validator
        self.validator = ExtractionResultValidator()
        
        # Pipeline statistics
        self.stats = {
            'total_documents_processed': 0,
            'total_tables_extracted': 0,
            'average_processing_time': 0.0,
            'success_rate': 0.0
        }
    
    def _initialize_components(self):
        """Initialize all pipeline components."""
        try:
            self.logger.logger.info("Initializing pipeline components...")
            
            # Document processor
            self.document_processor = DocumentProcessor(self.config)
            
            # TableFormer models (both legacy and advanced)
            self.tableformer = TableFormerModel(self.config)
            
            # Advanced components
            try:
                self.advanced_tableformer = ProductionTableFormer(self.config)
                self.logger.logger.info("Advanced TableFormer initialized")
            except Exception as e:
                self.logger.logger.warning(f"Advanced TableFormer failed to initialize: {e}")
                self.advanced_tableformer = None
            
            # Multi-page handler
            self.multipage_handler = MultiPageTableHandler(self.config)
            
            # Smart Financial processor - INTELLIGENT, NO HARDCODED PATTERNS
            self.financial_processor = SmartFinancialDocumentProcessor(self.config)
            
            # Advanced metrics
            self.metrics_engine = AdvancedEvaluationMetrics()
            
            # OCR engines
            if self.config.processing.enable_ocr:
                self.ocr_engine = OCREngine(self.config)
                try:
                    self.advanced_ocr_engine = AdvancedOCREngine(self.config)
                    self.logger.logger.info("Advanced OCR engine initialized")
                except Exception as e:
                    self.logger.logger.warning(f"Advanced OCR failed to initialize: {e}")
                    self.advanced_ocr_engine = None
            else:
                self.ocr_engine = None
                self.advanced_ocr_engine = None
            
            self.logger.logger.info("Pipeline components initialized successfully")
            
        except Exception as e:
            self.logger.logger.error(f"Failed to initialize pipeline components: {e}")
            raise
    
    async def extract_tables(
        self, 
        document_path: Union[str, Path],
        options: Optional[ExtractionOptions] = None
    ) -> TableExtractionResult:
        """Main extraction method."""
        if options is None:
            options = ExtractionOptions()
        
        document_path = Path(document_path)
        start_time = time.time()
        
        result = TableExtractionResult(
            document_path=str(document_path)
        )
        
        with LogExtractionOperation(self.logger, str(document_path), "table_extraction"):
            try:
                # Stage 1: Document preprocessing
                self.logger.log_extraction_progress(
                    ExtractionStage.DOCUMENT_PROCESSING.value, 0.1
                )
                processed_doc = await self._process_document(document_path)
                
                # Stage 2: Table detection and extraction
                self.logger.log_extraction_progress(
                    ExtractionStage.TABLE_DETECTION.value, 0.3
                )
                tables = await self._extract_tables_from_document(
                    processed_doc, options
                )
                
                # Stage 3: Multi-page linking (if enabled)
                if options.enable_multipage and len(tables) > 0:
                    self.logger.log_extraction_progress("multipage_linking", 0.6)
                    tables = await self._link_multipage_tables(tables, processed_doc)
                
                # Stage 4: Financial processing (if enabled)
                if options.enable_financial_processing:
                    self.logger.log_extraction_progress("financial_processing", 0.7)
                    tables = await self._process_financial_tables(tables, options)
                
                # Stage 5: Merge tables with identical headers
                self.logger.log_extraction_progress("table_merging", 0.75)
                tables = await self._merge_identical_tables(tables)
                
                # Stage 6: Post-processing and validation
                self.logger.log_extraction_progress(
                    ExtractionStage.POST_PROCESSING.value, 0.8
                )
                final_tables = await self._postprocess_tables(tables, options)
                
                # Stage 4: Validation
                self.logger.log_extraction_progress(
                    ExtractionStage.VALIDATION.value, 0.9
                )
                
                # Compile final results
                result.tables = final_tables
                result.metadata = self._generate_metadata(processed_doc, options)
                result.confidence_scores = self._calculate_confidence_scores(final_tables)
                result.processing_time = time.time() - start_time
                
                # Validate results
                validation_result = self.validator.validate_extraction_result(
                    result.to_dict()
                )
                
                if validation_result.warnings:
                    result.warnings.extend(validation_result.warnings)
                
                if not validation_result.is_valid:
                    result.errors.extend(validation_result.errors)
                
                # Update statistics
                self._update_statistics(result)
                
                self.logger.log_extraction_success(
                    str(document_path),
                    len(result.tables),
                    result.processing_time,
                    result.confidence_scores
                )
                
                return result
                
            except Exception as e:
                result.errors.append(str(e))
                result.processing_time = time.time() - start_time
                
                self.logger.log_extraction_error(
                    str(document_path),
                    e,
                    context={'options': options.__dict__}
                )
                
                return result
    
    async def _process_document(self, document_path: Path) -> ProcessedDocument:
        """Process the input document."""
        try:
            processed_doc = await self.document_processor.process_document(document_path)
            
            self.logger.logger.info(
                f"Document processed: {processed_doc.num_pages} pages, "
                f"format: {processed_doc.format.value}"
            )
            
            return processed_doc
            
        except Exception as e:
            self.logger.logger.error(f"Document processing failed: {e}")
            raise
    
    async def _extract_tables_from_document(
        self, 
        processed_doc: ProcessedDocument,
        options: ExtractionOptions
    ) -> List[Dict[str, Any]]:
        """Extract tables from processed document."""
        all_tables = []
        
        # First, check if we already have extracted tables from document processing
        if hasattr(processed_doc, 'extracted_tables') and processed_doc.extracted_tables:
            self.logger.logger.info(f"Using pre-extracted tables: {len(processed_doc.extracted_tables)}")
            
            # Apply confidence filtering and format the extracted tables
            tables_with_scores = []
            for table_data in processed_doc.extracted_tables:
                # Apply confidence threshold
                table_confidence = table_data.get('metadata', {}).get('confidence', 1.0)
                tables_with_scores.append((table_data, table_confidence))
                
                if table_confidence >= options.confidence_threshold:
                    # Format for pipeline output
                    formatted_table = {
                        "table_id": table_data.get('table_index', 0),
                        "headers": table_data.get('headers', []),
                        "rows": table_data.get('rows', []),
                        "cells": table_data.get('cells', []),  # Include cells for validation
                        "columns": table_data.get('columns', []),  # Include columns for validation
                        "metadata": table_data.get('metadata', {}),
                        "confidence": table_confidence,
                        "extraction_method": "docling",
                        "row_count": table_data.get('row_count', 0),
                        "column_count": table_data.get('column_count', 0)
                    }
                    all_tables.append(formatted_table)
                    
                    self.logger.logger.info(
                        f"Added table {table_data.get('table_index', 0)}: {len(table_data.get('rows', []))} rows, confidence: {table_confidence:.2f}"
                    )
            
            # If no tables passed the threshold, try progressively lower thresholds
            if not all_tables and tables_with_scores:
                self.logger.logger.warning(f"No tables found with confidence threshold {options.confidence_threshold}")
                self.logger.logger.info("🔍 Trying adaptive threshold strategy...")
                
                # Show all detected tables with their confidence scores
                self.logger.logger.info("📊 All detected tables:")
                for i, (table_data, confidence) in enumerate(tables_with_scores):
                    rows_count = len(table_data.get('rows', []))
                    headers_count = len(table_data.get('headers', []))
                    self.logger.logger.info(f"  Table {i}: confidence={confidence:.3f}, headers={headers_count}, rows={rows_count}")
                
                # Try progressively lower thresholds
                adaptive_thresholds = [0.5, 0.3, 0.2, 0.1]
                
                for threshold in adaptive_thresholds:
                    candidate_tables = []
                    for table_data, table_confidence in tables_with_scores:
                        if table_confidence >= threshold:
                            # Format for pipeline output
                            formatted_table = {
                                "table_id": table_data.get('table_index', 0),
                                "headers": table_data.get('headers', []),
                                "rows": table_data.get('rows', []),
                                "cells": table_data.get('cells', []),  # Include cells for validation
                                "columns": table_data.get('columns', []),  # Include columns for validation
                                "metadata": table_data.get('metadata', {}),
                                "confidence": table_confidence,
                                "extraction_method": "docling_adaptive",
                                "adaptive_threshold": threshold,  # Mark for debugging
                                "row_count": table_data.get('row_count', 0),
                                "column_count": table_data.get('column_count', 0)
                            }
                            candidate_tables.append(formatted_table)
                    
                    if candidate_tables:
                        all_tables.extend(candidate_tables)
                        self.logger.logger.info(f"✅ Found {len(candidate_tables)} tables with adaptive threshold {threshold}")
                        for table in candidate_tables:
                            self.logger.logger.info(
                                f"  📋 Table {table['table_id']}: {table['row_count']} rows, confidence: {table['confidence']:.3f}"
                            )
                        break
                
                if not all_tables:
                    self.logger.logger.warning("❌ No tables found even with lowest threshold - document may not contain detectable tables")
            
            return all_tables
        
        # Fallback: extract from pages if no pre-extracted tables
        for page_num in range(processed_doc.num_pages):
            try:
                page_tables = await self._extract_tables_from_page(
                    processed_doc, page_num, options
                )
                all_tables.extend(page_tables)
                
                self.logger.logger.info(
                    f"Page {page_num}: extracted {len(page_tables)} tables"
                )
                
            except Exception as e:
                self.logger.logger.error(
                    f"Failed to extract tables from page {page_num}: {e}"
                )
                continue
        
        return all_tables
    
    async def _extract_tables_from_page(
        self,
        processed_doc: ProcessedDocument,
        page_num: int,
        options: ExtractionOptions
    ) -> List[Dict[str, Any]]:
        """Extract tables from a specific page."""
        page_tables = []
        
        try:
            # Get page images
            if processed_doc.raw_images and page_num < len(processed_doc.raw_images):
                page_image = processed_doc.raw_images[page_num]
            else:
                # Extract page image from document
                page_images = await self.document_processor.extract_images_from_pages(
                    processed_doc
                )
                if page_num < len(page_images):
                    page_image = page_images[page_num]
                else:
                    self.logger.logger.warning(f"No image available for page {page_num}")
                    return page_tables
            
            # Use TableFormer for end-to-end processing
            detected_tables = await self.tableformer.process_table_end_to_end(page_image)
            
            for i, table_info in enumerate(detected_tables):
                # Skip tables with low confidence
                if (table_info.get('detection_confidence', 0) < 
                    options.confidence_threshold):
                    continue
                
                # Extract text from cells if OCR is enabled
                if options.enable_ocr and self.ocr_engine:
                    table_info = await self._extract_text_from_table(
                        page_image, table_info
                    )
                
                # Add page and document metadata
                table_info.update({
                    'page_number': page_num,
                    'table_index': i,
                    'document_path': processed_doc.document_path,
                    'extraction_timestamp': time.time()
                })
                
                page_tables.append(table_info)
                
                # Limit number of tables per page
                if len(page_tables) >= options.max_tables_per_page:
                    break
            
        except Exception as e:
            self.logger.logger.error(f"Table extraction from page {page_num} failed: {e}")
            raise
        
        return page_tables
    
    async def _link_multipage_tables(
        self, 
        tables: List[Dict[str, Any]], 
        processed_doc: ProcessedDocument
    ) -> List[Dict[str, Any]]:
        """Link tables that span multiple pages."""
        try:
            # Skip multipage processing if only one page or no page info
            if processed_doc.num_pages <= 1:
                self.logger.logger.info("Skipping multipage linking: single page document")
                return tables
            
            # Group tables by page
            page_tables = {}
            for table in tables:
                page_num = table.get('page_number', 0)
                if page_num not in page_tables:
                    page_tables[page_num] = []
                page_tables[page_num].append(table)
            
            # If all tables are on page 0 (Docling default), treat as single page
            if len(page_tables) == 1 and 0 in page_tables:
                self.logger.logger.info("All tables on page 0, treating as single page document")
                return tables
            
            # Convert to list format expected by multipage handler
            max_page = max(page_tables.keys()) if page_tables else 0
            page_tables_list = [page_tables.get(i, []) for i in range(max_page + 1)]
            
            # Link multipage tables
            linked_tables = await self.multipage_handler.link_multipage_tables(page_tables_list)
            
            self.logger.logger.info(f"Multipage linking: {len(tables)} -> {len(linked_tables)} tables")
            return linked_tables
            
        except Exception as e:
            self.logger.logger.error(f"Multipage linking failed: {e}")
            return tables
    
    async def _process_financial_tables(
        self, 
        tables: List[Dict[str, Any]], 
        options: ExtractionOptions
    ) -> List[Dict[str, Any]]:
        """Process tables with financial document specialization."""
        try:
            processed_tables = []
            
            for table in tables:
                # Apply financial processing
                financial_table = await self.financial_processor.process_financial_table(table)
                processed_tables.append(financial_table)
            
            self.logger.logger.info(f"Financial processing completed for {len(processed_tables)} tables")
            return processed_tables
            
        except Exception as e:
            self.logger.logger.error(f"Financial processing failed: {e}")
            return tables
    
    async def _merge_identical_tables(self, tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Merge tables with identical or very similar headers."""
        if len(tables) <= 1:
            return tables
        
        try:
            merged_tables = []
            processed_indices = set()
            
            for i, table in enumerate(tables):
                if i in processed_indices:
                    continue
                
                # Find all tables with similar headers
                similar_tables = [table]
                table_headers = table.get('headers', [])
                
                for j, other_table in enumerate(tables[i+1:], i+1):
                    if j in processed_indices:
                        continue
                    
                    other_headers = other_table.get('headers', [])
                    similarity = self._calculate_header_similarity(table_headers, other_headers)
                    
                    if similarity >= 0.95:  # 95% similarity threshold
                        similar_tables.append(other_table)
                        processed_indices.add(j)
                        self.logger.logger.info(f"🔗 MERGING: Table {j} with Table {i} (similarity: {similarity:.2f})")
                
                # Merge the similar tables
                if len(similar_tables) > 1:
                    merged_table = await self._merge_table_group(similar_tables)
                    merged_tables.append(merged_table)
                    self.logger.logger.info(f"✅ MERGED: {len(similar_tables)} tables into 1 with {len(merged_table.get('rows', []))} total rows")
                else:
                    merged_tables.append(table)
                
                processed_indices.add(i)
            
            self.logger.logger.info(f"📊 TABLE MERGING: {len(tables)} → {len(merged_tables)} tables")
            return merged_tables
            
        except Exception as e:
            self.logger.logger.error(f"Error merging tables: {e}")
            return tables
    
    def _calculate_header_similarity(self, headers1: List[str], headers2: List[str]) -> float:
        """Calculate similarity between two header sets."""
        if not headers1 or not headers2:
            return 0.0
        
        if len(headers1) != len(headers2):
            return 0.0
        
        matches = 0
        for h1, h2 in zip(headers1, headers2):
            h1_clean = str(h1).lower().strip()
            h2_clean = str(h2).lower().strip()
            
            # Exact match
            if h1_clean == h2_clean:
                matches += 1
            # Partial match for similar terms
            elif h1_clean in h2_clean or h2_clean in h1_clean:
                matches += 0.8
        
        return matches / len(headers1)
    
    async def _merge_table_group(self, table_group: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Merge a group of tables with similar headers into one table."""
        if not table_group:
            return {}
        
        if len(table_group) == 1:
            return table_group[0]
        
        # Find the table with the best/most complete headers
        best_table = self._find_best_header_table(table_group)
        merged_table = best_table.copy()
        base_headers = merged_table.get('headers', [])
        all_rows = list(merged_table.get('rows', []))
        
        # Merge rows from all other tables  
        for table in table_group:
            if table == best_table:
                continue  # Skip the base table
                
            table_headers = table.get('headers', [])
            table_rows = table.get('rows', [])
            
            # If this table has headers as first row, treat first row as data
            if self._headers_look_like_data(table_headers, base_headers):
                # The "headers" are actually data, so include them as first row
                data_rows = [table_headers] + table_rows
            else:
                # Filter out header-like rows and metadata rows  
                data_rows = []
                for row in table_rows:
                    if not self._is_header_like_row(row, base_headers):
                        data_rows.append(row)
            
            # Align columns to match base headers
            aligned_rows = self._align_rows_to_headers(data_rows, base_headers)
            all_rows.extend(aligned_rows)
        
        # Update the merged table
        merged_table['headers'] = base_headers  # Ensure consistent headers
        merged_table['rows'] = all_rows
        merged_table['row_count'] = len(all_rows)
        if 'metadata' in merged_table:
            merged_table['metadata']['merged_from'] = len(table_group)
        merged_table['name'] = f"Merged Table ({len(table_group)} sources)"
        
        return merged_table
    
    def _find_best_header_table(self, table_group: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Find the table with the best headers (most columns and proper header structure)."""
        best_table = table_group[0]
        best_score = 0
        
        for table in table_group:
            headers = table.get('headers', [])
            score = 0
            
            # Score based on number of columns
            score += len(headers)
            
            # Score based on header quality (financial terms, proper structure)
            for header in headers:
                header_lower = str(header).lower()
                if any(term in header_lower for term in ['group', 'billing', 'premium', 'commission', 'rate', 'subscriber']):
                    score += 2
                if 'due' in header_lower or 'amount' in header_lower:
                    score += 3
            
            # Penalty for headers that look like data
            if self._headers_look_like_data(headers, None):
                score -= 10
                
            if score > best_score:
                best_score = score
                best_table = table
        
        return best_table
    
    def _headers_look_like_data(self, headers: List[str], reference_headers: List[str] = None) -> bool:
        """Check if headers actually look like data rows."""
        if not headers:
            return False
        
        # Check for patterns that suggest these are data, not headers
        data_indicators = 0
        
        for header in headers:
            header_str = str(header).strip()
            
            # Company names, IDs, state codes, dollar amounts indicate data
            if any(pattern in header_str for pattern in ['LLC', 'Inc', 'Corp', 'UT', '$']):
                data_indicators += 1
            
            # State codes (2 letters)  
            if len(header_str) == 2 and header_str.isupper():
                data_indicators += 1
                
            # Numbers that look like subscriber counts
            if header_str.isdigit() and 1 <= int(header_str) <= 100:
                data_indicators += 1
        
        # If more than half look like data, treat as data row
        return data_indicators > len(headers) / 2
    
    def _align_rows_to_headers(self, rows: List[List[str]], target_headers: List[str]) -> List[List[str]]:
        """Align rows to match the target header structure."""
        aligned_rows = []
        target_col_count = len(target_headers)
        
        for row in rows:
            # Ensure row has the right number of columns
            aligned_row = row[:target_col_count] if len(row) > target_col_count else row
            
            # Pad with empty strings if row is too short
            while len(aligned_row) < target_col_count:
                aligned_row.append('')
            
            aligned_rows.append(aligned_row)
        
        return aligned_rows
    
    def _is_header_like_row(self, row: List[str], headers: List[str]) -> bool:
        """Check if a row looks like headers (to avoid duplicating headers in merged table)."""
        if not row or not headers:
            return False
        
        row_text = ' '.join(str(cell).lower().strip() for cell in row)
        header_text = ' '.join(str(header).lower().strip() for header in headers)
        
        # Check for high similarity with headers
        if len(row_text) > 0 and len(header_text) > 0:
            # Simple similarity check
            common_words = set(row_text.split()) & set(header_text.split())
            total_words = set(row_text.split()) | set(header_text.split())
            
            if total_words and len(common_words) / len(total_words) > 0.6:
                return True
        
        return False
    
    async def _extract_text_from_table(
        self,
        image,
        table_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Extract text from table cells using OCR."""
        if not self.ocr_engine and not self.advanced_ocr_engine:
            return table_info
        
        try:
            cells = table_info.get('cells', [])
            
            for cell in cells:
                bbox = cell.get('bbox')
                if bbox:
                    # Use advanced OCR if available
                    if self.advanced_ocr_engine:
                        ocr_result = await self.advanced_ocr_engine.extract_text_ensemble(image, bbox)
                        cell['text'] = ocr_result.text
                        cell['ocr_confidence'] = ocr_result.confidence
                        cell['ocr_engine'] = ocr_result.engine
                    else:
                        # Fallback to basic OCR
                        text = await self.ocr_engine.extract_text_from_cell(image, bbox)
                        cell['text'] = text
            
            table_info['cells'] = cells
            
        except Exception as e:
            self.logger.logger.error(f"OCR text extraction failed: {e}")
        
        return table_info
    
    async def _postprocess_tables(
        self,
        tables: List[Dict[str, Any]],
        options: ExtractionOptions
    ) -> List[Dict[str, Any]]:
        """Post-process extracted tables."""
        processed_tables = []
        
        for table in tables:
            try:
                # Clean and validate table data
                cleaned_table = self._clean_table_data(table)
                
                # Apply quality checks
                if options.enable_quality_checks:
                    quality_score = self._assess_table_quality(cleaned_table)
                    cleaned_table['quality_score'] = quality_score
                    
                    # Skip low-quality tables
                    if quality_score < 0.3:
                        self.logger.logger.warning(
                            f"Skipping low-quality table (score: {quality_score:.2f})"
                        )
                        continue
                
                processed_tables.append(cleaned_table)
                
            except Exception as e:
                self.logger.logger.error(f"Table post-processing failed: {e}")
                continue
        
        return processed_tables
    
    def _clean_table_data(self, table: Dict[str, Any]) -> Dict[str, Any]:
        """Clean and normalize table data."""
        cleaned_table = table.copy()
        
        # Clean cell text
        cells = cleaned_table.get('cells', [])
        for cell in cells:
            if 'text' in cell:
                # Remove extra whitespace and normalize
                cell['text'] = ' '.join(cell['text'].split())
                
                # Remove special characters if needed
                # cell['text'] = re.sub(r'[^\w\s.-]', '', cell['text'])
        
        # Ensure required fields exist
        if 'structure' not in cleaned_table:
            cleaned_table['structure'] = {
                'rows': 0,
                'columns': 0,
                'confidence': 0.0
            }
        
        return cleaned_table
    
    def _assess_table_quality(self, table: Dict[str, Any]) -> float:
        """Intelligently assess table quality using adaptive algorithms."""
        
        # Use intelligent metadata if available
        intelligent_metadata = table.get('intelligent_metadata', {})
        if intelligent_metadata:
            # Use the intelligent confidence score
            confidence_score = intelligent_metadata.get('confidence_score', 0.0)
            processing_insights = intelligent_metadata.get('processing_insights', {})
            
            # Combine intelligent factors
            processing_quality = processing_insights.get('processing_quality', 0.5)
            data_consistency = processing_insights.get('data_consistency', 0.5)
            structure_coherence = processing_insights.get('structure_coherence', 0.5)
            
            # Weighted intelligent quality score
            intelligent_quality = (
                confidence_score * 0.4 +
                processing_quality * 0.3 +
                data_consistency * 0.2 +
                structure_coherence * 0.1
            )
            
            return min(1.0, intelligent_quality)
        
        # Fallback: intelligent assessment without metadata
        return self._assess_table_quality_fallback(table)

    def _assess_table_quality_fallback(self, table: Dict[str, Any]) -> float:
        """Fallback intelligent quality assessment"""
        quality_factors = []
        
        # Assess content richness
        content_richness = self._assess_content_richness(table)
        quality_factors.append(content_richness * 0.3)
        
        # Assess structural integrity
        structural_integrity = self._assess_structural_integrity(table)
        quality_factors.append(structural_integrity * 0.3)
        
        # Assess data coherence
        data_coherence = self._assess_data_coherence(table)
        quality_factors.append(data_coherence * 0.2)
        
        # Assess semantic completeness
        semantic_completeness = self._assess_semantic_completeness(table)
        quality_factors.append(semantic_completeness * 0.2)
        
        return sum(quality_factors)

    def _assess_content_richness(self, table: Dict[str, Any]) -> float:
        """Assess richness of table content"""
        cells = table.get('cells', [])
        if not cells:
            return 0.0
        
        non_empty_cells = sum(1 for cell in cells if cell.get('text', '').strip())
        content_ratio = non_empty_cells / len(cells)
        
        # Bonus for diverse content types
        content_types = set()
        for cell in cells:
            text = cell.get('text', '').strip()
            if re.search(r'[\d.,]', text):
                content_types.add('numeric')
            if re.search(r'[\$€£¥%]', text):
                content_types.add('financial')
            if re.match(r'^[a-zA-Z\s]+$', text):
                content_types.add('text')
        
        diversity_bonus = len(content_types) * 0.1
        return min(1.0, content_ratio + diversity_bonus)

    def _assess_structural_integrity(self, table: Dict[str, Any]) -> float:
        """Assess structural integrity of table"""
        headers = table.get('headers', [])
        rows = table.get('rows', [])
        
        integrity_score = 0.0
        
        # Check header quality
        if headers:
            non_empty_headers = sum(1 for h in headers if str(h).strip())
            header_ratio = non_empty_headers / len(headers)
            integrity_score += header_ratio * 0.4
        
        # Check row consistency
        if rows and headers:
            consistent_rows = sum(1 for row in rows if len(row) == len(headers))
            consistency_ratio = consistent_rows / len(rows)
            integrity_score += consistency_ratio * 0.4
        
        # Check size appropriateness
        table_size = len(headers) * len(rows) if headers and rows else 0
        if 6 <= table_size <= 500:  # Reasonable table size
            integrity_score += 0.2
        
        return min(1.0, integrity_score)

    def _assess_data_coherence(self, table: Dict[str, Any]) -> float:
        """Assess coherence of data within table"""
        cells = table.get('cells', [])
        if not cells:
            return 0.0
        
        # Group cells by column
        columns = {}
        for cell in cells:
            col = cell.get('column', 0)
            if col not in columns:
                columns[col] = []
            columns[col].append(cell.get('text', ''))
        
        # Assess column coherence
        coherence_scores = []
        for col_data in columns.values():
            if col_data:
                coherence = self._assess_column_coherence(col_data)
                coherence_scores.append(coherence)
        
        return sum(coherence_scores) / len(coherence_scores) if coherence_scores else 0.0

    def _assess_column_coherence(self, column_data: List[str]) -> float:
        """Assess coherence within a single column"""
        if not column_data:
            return 0.0
        
        # Check for consistent data patterns
        numeric_count = sum(1 for data in column_data if re.search(r'\d', data))
        text_count = sum(1 for data in column_data if re.match(r'^[a-zA-Z\s]+$', data))
        
        total_items = len(column_data)
        
        # High coherence if most items follow same pattern
        if numeric_count > total_items * 0.8:
            return 0.9  # Mostly numeric
        elif text_count > total_items * 0.8:
            return 0.8  # Mostly text
        elif numeric_count + text_count > total_items * 0.8:
            return 0.7  # Mixed but consistent
        else:
            return 0.5  # Mixed patterns

    def _assess_semantic_completeness(self, table: Dict[str, Any]) -> float:
        """Assess semantic completeness of table"""
        headers = table.get('headers', [])
        if not headers:
            return 0.0
        
        # Look for semantic indicators in headers
        semantic_indicators = 0
        for header in headers:
            header_lower = str(header).lower().strip()
            if any(term in header_lower for term in ['name', 'id', 'date', 'amount', 'total', 'type']):
                semantic_indicators += 1
        
        semantic_ratio = semantic_indicators / len(headers)
        return min(1.0, semantic_ratio)
    
    def _generate_metadata(
        self,
        processed_doc: ProcessedDocument,
        options: ExtractionOptions
    ) -> Dict[str, Any]:
        """Generate metadata for extraction result."""
        return {
            'document_format': processed_doc.format.value,
            'num_pages': processed_doc.num_pages,
            'extraction_options': options.__dict__,
            'pipeline_version': '1.0.0',
            'models_used': {
                'document_processor': 'docling-1.20.0',
                'table_detection': 'tableformer-custom',
                'advanced_tableformer': 'microsoft-table-transformer' if self.advanced_tableformer else None,
                'ocr_engine': self.config.models.ocr_engine if options.enable_ocr else None,
                'advanced_ocr': 'ensemble-ocr' if self.advanced_ocr_engine else None,
                'multipage_handler': 'advanced-linking' if options.enable_multipage else None,
                'financial_processor': 'financial-specialized' if options.enable_financial_processing else None
            },
            'processing_config': {
                'confidence_threshold': options.confidence_threshold,
                'max_image_size': self.config.processing.max_image_size,
                'device': self.config.models.device
            }
        }
    
    def _calculate_confidence_scores(self, tables: List[Dict[str, Any]]) -> Dict[str, float]:
        """Calculate overall confidence scores."""
        if not tables:
            return {'overall': 0.0}
        
        detection_scores = [
            table.get('detection_confidence', 0.0) for table in tables
        ]
        structure_scores = [
            table.get('structure_confidence', 0.0) for table in tables
        ]
        quality_scores = [
            table.get('quality_score', 0.0) for table in tables
        ]
        
        return {
            'overall': sum(detection_scores) / len(detection_scores),
            'detection': sum(detection_scores) / len(detection_scores),
            'structure': sum(structure_scores) / len(structure_scores),
            'quality': sum(quality_scores) / len(quality_scores) if quality_scores else 0.0
        }
    
    def _update_statistics(self, result: TableExtractionResult):
        """Update pipeline statistics."""
        self.stats['total_documents_processed'] += 1
        self.stats['total_tables_extracted'] += len(result.tables)
        
        # Update average processing time
        current_avg = self.stats['average_processing_time']
        total_docs = self.stats['total_documents_processed']
        
        self.stats['average_processing_time'] = (
            (current_avg * (total_docs - 1) + result.processing_time) / total_docs
        )
        
        # Update success rate
        if not result.errors:
            success_count = self.stats.get('successful_extractions', 0) + 1
            self.stats['successful_extractions'] = success_count
            self.stats['success_rate'] = success_count / total_docs
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get pipeline statistics."""
        return self.stats.copy()
    
    async def extract_tables_batch(
        self,
        document_paths: List[Union[str, Path]],
        options: Optional[ExtractionOptions] = None
    ) -> List[TableExtractionResult]:
        """Extract tables from multiple documents."""
        results = []
        
        for doc_path in document_paths:
            try:
                result = await self.extract_tables(doc_path, options)
                results.append(result)
                
            except Exception as e:
                self.logger.logger.error(f"Batch processing failed for {doc_path}: {e}")
                error_result = TableExtractionResult(
                    document_path=str(doc_path),
                    errors=[str(e)]
                )
                results.append(error_result)
        
        return results
