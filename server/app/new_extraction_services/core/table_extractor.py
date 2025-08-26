"""Table extraction for document processing."""

import time
import re
from typing import Dict, Any, List, Optional, Tuple
from itertools import zip_longest

from .table_validator import TableValidator


class TableExtractor:
    """Extract and process tables from documents."""
    
    def __init__(self, logger):
        """Initialize table extractor."""
        self.logger = logger
        self.validator = TableValidator(logger)
    
    def extract_tables_from_document(self, document) -> List[Any]:
        """
        Extract table objects from Docling v2 document.
        
        Args:
            document: Docling v2 assembled document object
            
        Returns:
            List of table objects
        """
        tables = []
        
        try:
            # In Docling v2, tables are in the elements list
            if hasattr(document, 'elements'):
                for element in document.elements:
                    # Check if element is a table by class name
                    if hasattr(element, '__class__') and 'Table' in element.__class__.__name__:
                        if self.validator.is_valid_table_element(element):
                            tables.append(element)
                            self.logger.logger.info(f"Found valid table element: {element.__class__.__name__}")
                        else:
                            self.logger.logger.debug(f"Skipping invalid table element: {element.__class__.__name__}")
                
                self.logger.logger.info(f"Found {len(tables)} valid tables via document.elements")
            
            self.logger.logger.info(f"Total found {len(tables)} tables in document")
            
        except Exception as e:
            self.logger.logger.error(f"Error extracting tables from document: {e}")
        
        return tables
    
    def _debug_docling_table_structure(self, table, table_index: int):
        """CRITICAL: See what Docling actually extracts."""
        self.logger.logger.info(f"🔍 DEBUGGING Table {table_index}:")
        
        # Debug available attributes
        table_attrs = [attr for attr in dir(table) if not attr.startswith('_')]
        self.logger.logger.info(f"  Available attributes: {table_attrs}")
        
        # Debug table_cells
        if hasattr(table, 'table_cells') and table.table_cells:
            self.logger.logger.info(f"  table_cells count: {len(table.table_cells)}")
            for i, cell in enumerate(table.table_cells[:10]):
                self.logger.logger.info(f"    Cell {i}: '{cell.text}' at row {cell.start_row_offset_idx}")
        
        # Debug dataframe export
        if hasattr(table, 'export_to_dataframe'):
            try:
                df = table.export_to_dataframe()
                if df is not None and not df.empty:
                    self.logger.logger.info(f"  DataFrame: {df.shape} - {df.columns.tolist()}")
            except Exception as e:
                self.logger.logger.error(f"  DataFrame failed: {e}")

    def extract_table_data(self, table, table_index: int, pdf_path: str) -> Optional[Dict[str, Any]]:
        """
        Extract data from a single Docling table with robust structure handling.
        
        Args:
            table: Docling table object
            table_index: Index of the table
            pdf_path: Original PDF path for metadata
            
        Returns:
            Normalized table dictionary with consistent structure
        """
        try:
            # === ADD THIS FIRST ===
            self._debug_docling_table_structure(table, table_index)
            
            # Try multiple extraction methods
            extraction_results = []
            
            # Method 1: table_cells (your current approach)
            headers_1, rows_1 = self._extract_via_table_cells(table)
            if headers_1 and headers_1 != ['Column_1']:
                extraction_results.append(("table_cells", headers_1, rows_1))
            
            # Method 2: dataframe export  
            headers_2, rows_2 = self._extract_via_dataframe(table)
            if headers_2 and rows_2:
                extraction_results.append(("dataframe", headers_2, rows_2))
            
            # Method 3: direct attributes
            headers_3, rows_3 = self._extract_via_attributes(table) 
            if headers_3 and rows_3:
                extraction_results.append(("attributes", headers_3, rows_3))
            
            # Use best result
            if extraction_results:
                method, headers, rows = max(extraction_results, 
                    key=lambda x: len(x[1]) + len(x[2]))
                self.logger.logger.info(f"✅ Using {method}: {len(headers)} headers, {len(rows)} rows")
            else:
                self.logger.logger.error("❌ ALL extraction methods failed!")
                return None
            
            # **NEW: Validate table quality and skip if it's likely metadata/header content**
            if not self.validator.is_valid_financial_table_lenient(headers, rows):
                self.logger.logger.warning(f"Table {table_index} appears to be metadata/header content, skipping")
                return None
            
            # Extract footers if available
            footers = self._extract_footers(table)
            
            # **CRITICAL: Handle row expansion for split headers**
            if len(headers) > 9:  # We expect more than the original 9 due to header splitting
                rows = self._expand_rows_for_split_headers(rows, headers)
            
            # Ensure all rows have the same length as headers
            rows = self._normalize_row_lengths(rows, len(headers))
            
            # Get table metadata
            metadata = self._extract_table_metadata(table, table_index, pdf_path)
            
            # Create cells structure for validation compatibility
            cells = self._create_cells_from_headers_and_rows(headers, rows)
            
            # Create columns structure
            columns = [{"name": header, "index": i} for i, header in enumerate(headers)]
            
            # Create consistent table structure
            table_data = {
                "headers": headers,
                "rows": rows,
                "cells": cells,  # Required by validation
                "columns": columns,  # Required by validation
                "footers": footers,
                "metadata": metadata,
                "row_count": len(rows),
                "column_count": len(headers),
                "table_index": table_index,
                "extractor": "TableExtractor"
            }
            
            return table_data
            
        except Exception as e:
            self.logger.logger.error(f"Error extracting table data: {e}")
            # Return minimal valid structure on error
            return {
                "headers": ["Column_1"],
                "rows": [],
                "footers": [],
                "metadata": {
                    "error": str(e),
                    "status": "error",
                    "table_index": table_index,
                    "extractor": "TableExtractor"
                },
                "row_count": 0,
                "column_count": 1,
                "table_index": table_index,
                "extractor": "TableExtractor"
            }
    
    def _extract_headers(self, table) -> List[str]:
        """Extract headers with robust multi-row header handling and complex document support."""
        try:
            headers = []
            
            # For Docling v2 table elements, extract from table_cells structure
            if hasattr(table, 'table_cells') and table.table_cells:
                cells_by_row = self._group_cells_by_row_v2(table.table_cells)
                
                self.logger.logger.info(f"🔍 DEBUG: Found {len(cells_by_row)} rows in table, {len(table.table_cells)} total cells")
                
                if cells_by_row:
                    best_header_row = None
                    best_score = -1
                    
                    for row_idx, header_cells in cells_by_row.items():
                        row_headers = [self._clean_text(cell.text) for cell in header_cells]
                        
                        # ✅ FIXED: More flexible column requirements for complex documents
                        if len(row_headers) < 1:  # Changed from 3 to 1
                            continue
                        
                        # ✅ ENHANCED: Multi-tier scoring system
                        score = self._calculate_enhanced_header_score(row_headers, cells_by_row, row_idx)
                        
                        self.logger.logger.info(f"🔍 DEBUG: Row {row_idx} ({len(row_headers)} cols): {row_headers[:8]}... Score: {score:.2f}")
                        
                        if score > best_score:
                            best_score = score
                            best_header_row = row_headers
                    
                    if best_header_row:
                        # ✅ ENHANCED: Smart header processing for complex docs
                        headers = self._process_headers_for_complex_docs(best_header_row)
                        self.logger.logger.info(f"🔧 COMPLEX DOC: Processed headers: {headers}")
                        return headers
            
            # Try to export to dataframe first (most reliable)
            if hasattr(table, 'export_to_dataframe'):
                try:
                    df = table.export_to_dataframe()
                    if df is not None and not df.empty:
                        headers = [self._clean_text(str(col).strip()) for col in df.columns]
                        self.logger.logger.info(f"Extracted headers from dataframe: {headers}")
                        return headers
                except Exception as e:
                    self.logger.logger.warning(f"Error getting headers from dataframe: {e}")
            
            # Try different header extraction methods
            if hasattr(table, 'headers') and table.headers:
                headers = [self._clean_text(str(h).strip()) for h in table.headers if h]
            elif hasattr(table, 'header_rows') and table.header_rows:
                headers = self._process_multi_row_headers(table.header_rows)
            elif hasattr(table, 'columns') and table.columns:
                headers = [self._clean_text(str(col.get('header', f'Column_{i+1}')).strip()) 
                          for i, col in enumerate(table.columns)]
            
            # Final fallback: generate headers based on table width
            if not headers or all(not h.strip() for h in headers):
                max_columns = self._get_table_width(table)
                headers = [f"Column_{i+1}" for i in range(max_columns)]
            
            self.logger.logger.info(f"Extracted {len(headers)} headers: {headers}")
            return headers
            
        except Exception as e:
            self.logger.logger.error(f"Error extracting headers: {e}")
            return ["Column_1"]

    def _calculate_enhanced_header_score(self, headers: List[str], all_rows: Dict, row_idx: int) -> float:
        """Enhanced scoring system for complex documents."""
        if not headers:
            return 0.0
        
        score = 0.0
        
        # Base score from validator (existing logic)
        base_score = self.validator.score_potential_headers(headers)
        score += base_score * 0.4
        
        # ✅ NEW: Position-based scoring (earlier rows more likely to be headers)
        position_score = max(0, (10 - row_idx) / 10)  # Higher score for earlier rows
        score += position_score * 0.2
        
        # ✅ NEW: Content diversity scoring
        diversity_score = self._calculate_content_diversity(headers)
        score += diversity_score * 0.2
        
        # ✅ NEW: Complex document pattern recognition
        complex_doc_score = self._assess_complex_document_patterns(headers)
        score += complex_doc_score * 0.2
        
        return score

    def _calculate_content_diversity(self, headers: List[str]) -> float:
        """Calculate content diversity score."""
        if not headers:
            return 0.0
        
        # Check for diverse content types in headers
        has_text = any(re.search(r'[a-zA-Z]', str(h)) for h in headers)
        has_numbers = any(re.search(r'\d', str(h)) for h in headers)
        has_mixed = len(set(len(str(h).split()) for h in headers)) > 1
        
        diversity_indicators = sum([has_text, has_numbers, has_mixed])
        return diversity_indicators / 3.0

    def _assess_complex_document_patterns(self, headers: List[str]) -> float:
        """Assess patterns specific to complex documents."""
        if not headers:
            return 0.0
        
        complex_indicators = 0
        header_text = ' '.join(str(h).lower() for h in headers)
        
        # Look for section indicators
        section_terms = ['summary', 'detail', 'breakdown', 'analysis', 'report', 'statement']
        if any(term in header_text for term in section_terms):
            complex_indicators += 1
        
        # Look for multi-level structure indicators
        if any(len(str(h).split()) > 2 for h in headers):  # Multi-word headers
            complex_indicators += 1
        
        # Look for varied header lengths (indicates structured content)
        header_lengths = [len(str(h)) for h in headers]
        if len(set(header_lengths)) > 1:
            complex_indicators += 1
        
        return min(1.0, complex_indicators / 3.0)

    def _process_headers_for_complex_docs(self, headers: List[str]) -> List[str]:
        """Process headers specifically for complex documents."""
        processed = []
        
        for header in headers:
            header_str = str(header).strip()
            if not header_str:
                header_str = f"Column_{len(processed) + 1}"
            processed.append(header_str)
        
        # ✅ ENHANCED: Ensure minimum headers for complex docs
        while len(processed) < 2:  # Ensure at least 2 columns
            processed.append(f"Column_{len(processed) + 1}")
        
        return processed

    def _extract_via_table_cells(self, table) -> Tuple[List[str], List[List[str]]]:
        """Method 1: Extract via table_cells structure."""
        try:
            headers = []
            rows = []
            
            if hasattr(table, 'table_cells') and table.table_cells:
                cells_by_row = self._group_cells_by_row_v2(table.table_cells)
                
                if cells_by_row:
                    # Extract headers from first row
                    first_row_idx = min(cells_by_row.keys())
                    header_cells = cells_by_row[first_row_idx]
                    headers = [self._clean_text(cell.text) for cell in header_cells]
                    
                    # Extract data rows (skip first row)
                    sorted_row_indices = sorted(cells_by_row.keys())
                    for row_idx in sorted_row_indices[1:]:
                        row_cells = cells_by_row[row_idx]
                        row_data = [self._clean_text(cell.text) for cell in row_cells]
                        rows.append(row_data)
            
            self.logger.logger.info(f"  Method 1 (table_cells): {len(headers)} headers, {len(rows)} rows")
            return headers, rows
            
        except Exception as e:
            self.logger.logger.error(f"Method 1 failed: {e}")
            return [], []

    def _extract_via_dataframe(self, table) -> Tuple[List[str], List[List[str]]]:
        """Method 2: Extract via dataframe export."""
        try:
            headers = []
            rows = []
            
            if hasattr(table, 'export_to_dataframe'):
                df = table.export_to_dataframe()
                if df is not None and not df.empty:
                    headers = [self._clean_text(str(col).strip()) for col in df.columns]
                    
                    for _, row in df.iterrows():
                        processed_row = [str(cell).strip() if cell else "" for cell in row]
                        rows.append(processed_row)
            
            self.logger.logger.info(f"  Method 2 (dataframe): {len(headers)} headers, {len(rows)} rows")
            return headers, rows
            
        except Exception as e:
            self.logger.logger.error(f"Method 2 failed: {e}")
            return [], []

    def _extract_via_attributes(self, table) -> Tuple[List[str], List[List[str]]]:
        """Method 3: Extract via direct attributes."""
        try:
            headers = []
            rows = []
            
            # Try different header extraction methods
            if hasattr(table, 'headers') and table.headers:
                headers = [self._clean_text(str(h).strip()) for h in table.headers if h]
            elif hasattr(table, 'header_rows') and table.header_rows:
                headers = self._process_multi_row_headers(table.header_rows)
            elif hasattr(table, 'columns') and table.columns:
                headers = [self._clean_text(str(col.get('header', f'Column_{i+1}')).strip()) 
                          for i, col in enumerate(table.columns)]
            
            # Try different row extraction methods
            if hasattr(table, 'data') and table.data:
                if hasattr(table.data, 'rows') and table.data.rows:
                    for row in table.data.rows:
                        processed_row = self._flatten_row_data(row)
                        rows.append(processed_row)
                elif hasattr(table.data, '__iter__'):
                    for row in table.data:
                        processed_row = self._flatten_row_data(row)
                        rows.append(processed_row)
            
            # Fallback to rows attribute
            if not rows and hasattr(table, 'rows') and table.rows:
                for row in table.rows:
                    processed_row = self._flatten_row_data(row)
                    rows.append(processed_row)
            
            # Final fallback: generate headers based on table width
            if not headers or all(not h.strip() for h in headers):
                max_columns = self._get_table_width(table)
                headers = [f"Column_{i+1}" for i in range(max_columns)]
            
            self.logger.logger.info(f"  Method 3 (attributes): {len(headers)} headers, {len(rows)} rows")
            return headers, rows
            
        except Exception as e:
            self.logger.logger.error(f"Method 3 failed: {e}")
            return [], []
    
    def _group_cells_by_row_v2(self, table_cells) -> Dict[int, List]:
        """Group Docling v2 table cells by row using the new structure."""
        cells_by_row = {}
        
        try:
            for cell in table_cells:
                # Use start_row_offset_idx for row grouping
                row_idx = cell.start_row_offset_idx
                if row_idx not in cells_by_row:
                    cells_by_row[row_idx] = []
                cells_by_row[row_idx].append(cell)
            
            # Sort cells within each row by column position
            for row_idx in cells_by_row:
                cells_by_row[row_idx].sort(key=lambda cell: cell.start_col_offset_idx)
            
            return cells_by_row
            
        except Exception as e:
            self.logger.logger.error(f"Error grouping cells by row: {e}")
            return {}
    
    def _extract_rows(self, table) -> List[List[str]]:
        """Extract rows with consistent data handling."""
        try:
            rows = []
            
            # For Docling v2 table elements, extract from table_cells structure
            if hasattr(table, 'table_cells') and table.table_cells:
                # Group cells by row using the new Docling v2 structure
                cells_by_row = self._group_cells_by_row_v2(table.table_cells)
                
                if cells_by_row:
                    # Skip the first row (headers) and extract data rows
                    sorted_row_indices = sorted(cells_by_row.keys())
                    for row_idx in sorted_row_indices[1:]:  # Skip first row (headers)
                        row_cells = cells_by_row[row_idx]
                        row_data = [self._clean_text(cell.text) for cell in row_cells]
                        rows.append(row_data)
                    
                    self.logger.logger.info(f"Extracted {len(rows)} rows from cell structure")
                    return rows
            
            # Try to export to dataframe first (most reliable)
            if hasattr(table, 'export_to_dataframe'):
                try:
                    df = table.export_to_dataframe()
                    if df is not None and not df.empty:
                        self.logger.logger.info("Using dataframe export for table data")
                        for _, row in df.iterrows():
                            processed_row = [str(cell).strip() if cell else "" for cell in row]
                            rows.append(processed_row)
                        return rows
                except Exception as e:
                    self.logger.logger.warning(f"Error exporting to dataframe: {e}")
            
            # Try to access table data directly
            if hasattr(table, 'data') and table.data:
                try:
                    if hasattr(table.data, 'rows') and table.data.rows:
                        for row in table.data.rows:
                            processed_row = self._flatten_row_data(row)
                            rows.append(processed_row)
                    elif hasattr(table.data, '__iter__'):
                        for row in table.data:
                            processed_row = self._flatten_row_data(row)
                            rows.append(processed_row)
                except Exception as e:
                    self.logger.logger.warning(f"Error accessing table.data: {e}")
            
            # Fallback to rows attribute
            if not rows and hasattr(table, 'rows') and table.rows:
                try:
                    for row in table.rows:
                        processed_row = self._flatten_row_data(row)
                        rows.append(processed_row)
                except Exception as e:
                    self.logger.logger.warning(f"Error accessing table.rows: {e}")
            
            self.logger.logger.info(f"Extracted {len(rows)} rows from table")
            return rows
            
        except Exception as e:
            self.logger.logger.error(f"Error extracting rows: {e}")
            return []
    
    def _extract_footers(self, table) -> List[str]:
        """Extract footer information from table if available."""
        try:
            footers = []
            if hasattr(table, 'footers') and table.footers:
                footers = [self._clean_text(str(f).strip()) for f in table.footers if f]
            elif hasattr(table, 'footer_rows') and table.footer_rows:
                for row in table.footer_rows:
                    footer_text = " ".join([str(cell).strip() for cell in row if cell])
                    if footer_text:
                        footers.append(self._clean_text(footer_text))
            return footers
        except Exception as e:
            self.logger.logger.warning(f"Error extracting footers: {e}")
            return []
    
    def _extract_table_metadata(self, table, table_index: int, pdf_path: str) -> Dict[str, Any]:
        """Extract metadata about the table."""
        metadata = {
            "table_index": table_index,
            "source_file": pdf_path,
            "extraction_method": "docling",
            "timestamp": time.time()
        }
        
        try:
            if hasattr(table, 'bbox'):
                metadata['bbox'] = table.bbox
            if hasattr(table, 'page'):
                metadata['page_number'] = table.page
            if hasattr(table, 'confidence'):
                metadata['confidence'] = table.confidence
        except Exception as e:
            self.logger.logger.warning(f"Error extracting table metadata: {e}")
        
        return metadata
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text content."""
        if not text:
            return ""
        
        # Basic cleaning
        cleaned = " ".join(text.split()).strip()
        
        # Apply deduplication to remove repeated text patterns
        cleaned = self._deduplicate_text(cleaned)
        
        return cleaned
    
    def _flatten_row_data(self, row) -> List[str]:
        """Flatten row data into a list of strings."""
        try:
            if isinstance(row, (list, tuple)):
                return [str(cell).strip() if cell else "" for cell in row]
            elif hasattr(row, '__iter__') and not isinstance(row, str):
                return [str(cell).strip() if cell else "" for cell in row]
            else:
                return [str(row).strip()]
        except Exception:
            return [str(row)]
    
    def _get_table_width(self, table) -> int:
        """Determine the width (number of columns) of a table."""
        try:
            if hasattr(table, 'export_to_dataframe'):
                try:
                    df = table.export_to_dataframe()
                    if df is not None:
                        return len(df.columns)
                except:
                    pass
            
            if hasattr(table, 'columns') and table.columns:
                return len(table.columns)
            
            if hasattr(table, 'headers') and table.headers:
                return len(table.headers)
            
            # Fallback: check first row
            if hasattr(table, 'rows') and table.rows and len(table.rows) > 0:
                return len(table.rows[0]) if hasattr(table.rows[0], '__len__') else 1
            
            return 1
        except:
            return 1
    
    def _normalize_row_lengths(self, rows: List[List[str]], target_length: int) -> List[List[str]]:
        """Ensure all rows have the same length by padding with empty strings."""
        normalized_rows = []
        for row in rows:
            if len(row) < target_length:
                padded_row = row + [""] * (target_length - len(row))
                normalized_rows.append(padded_row)
            elif len(row) > target_length:
                normalized_rows.append(row[:target_length])
            else:
                normalized_rows.append(row)
        return normalized_rows
    
    def _process_multi_row_headers(self, header_rows: List) -> List[str]:
        """Process multi-row headers into a single header row."""
        try:
            if not header_rows:
                return []
            
            # Process all header rows to lists of strings
            processed = [[str(cell).strip() for cell in row] for row in header_rows]
            
            # Use zip_longest to align columns across all header rows
            columns = list(zip_longest(*processed, fillvalue=""))
            
            # Join each column's header parts with space, filtering out empty elements
            headers = [" ".join(filter(None, col)).strip() for col in columns]
            return [self._clean_text(header) for header in headers]
            
        except Exception as e:
            self.logger.logger.error(f"Error processing multi-row headers: {e}")
            return []
    
    def _split_compound_headers(self, headers: List[str]) -> List[str]:
        """Split compound headers like 'Census Ct. Paid Amount' into separate columns."""
        split_headers = []
        
        for header in headers:
            header_text = str(header).strip()
            
            # Check for specific known compound patterns that should be split
            if 'Census Ct. Paid Amount' in header_text:
                # Split this into two separate headers
                split_headers.extend(['Census Ct.', 'Paid Amount'])
                self.logger.logger.info(f"🔧 SPLIT: '{header_text}' → ['Census Ct.', 'Paid Amount']")
            elif 'Census Ct.' in header_text and 'Paid' in header_text:
                # Handle variations of this pattern
                split_headers.extend(['Census Ct.', 'Paid Amount'])
                self.logger.logger.info(f"🔧 SPLIT: '{header_text}' → ['Census Ct.', 'Paid Amount']")
            # DO NOT split financial headers that should remain intact
            elif any(keyword in header_text.lower() for keyword in [
                'total premium', 'commissionable', 'non-commissionable', 
                'commission earned', 'commission due', 'previous comm',
                'billed period', 'group name', 'master group', 'group id',
                'prod type', 'cr%', 'spl%'
            ]):
                # Keep financial headers intact - don't split them
                split_headers.append(header_text)
                self.logger.logger.info(f"🔧 KEEP INTACT: '{header_text}' (financial header)")
            elif len(header_text) > 25 and ' ' in header_text:
                # For other long headers with spaces, try intelligent splitting
                parts = header_text.split()
                mid_point = len(parts) // 2
                if mid_point > 0:
                    left_part = ' '.join(parts[:mid_point])
                    right_part = ' '.join(parts[mid_point:])
                    split_headers.extend([left_part, right_part])
                    self.logger.logger.info(f"🔧 SPLIT: '{header_text}' → ['{left_part}', '{right_part}']")
                else:
                    split_headers.append(header_text)
            else:
                split_headers.append(header_text)
        
        return split_headers
    
    def _is_financial_table(self, headers: List[str]) -> bool:
        """Check if the table appears to be a financial/commission statement table."""
        if not headers:
            return False
        
        # Convert headers to lowercase for easier matching
        header_text = ' '.join(headers).lower()
        
        # Financial table indicators
        financial_indicators = [
            'premium', 'commission', 'billed', 'group', 'client', 'invoice',
            'total', 'amount', 'due', 'paid', 'rate', 'percentage', 'period',
            'earned', 'allocated', 'non-commissionable', 'commissionable'
        ]
        
        # Count how many financial indicators are present
        indicator_count = sum(1 for indicator in financial_indicators if indicator in header_text)
        
        # If more than 3 financial indicators are found, it's likely a financial table
        is_financial = indicator_count >= 3
        
        self.logger.logger.info(f"🔍 FINANCIAL DETECTION: {indicator_count}/{len(financial_indicators)} indicators found - Financial table: {is_financial}")
        
        return is_financial
    
    def _expand_rows_for_split_headers(self, rows: List[List[str]], headers: List[str]) -> List[List[str]]:
        """Expand data rows to match split headers, specifically handling Census Ct./Paid Amount split."""
        expanded_rows = []
        
        for row in rows:
            if len(row) == 9 and len(headers) == 10:  # Common case: 9 original → 10 with split
                # Find the last column value and split it if it contains multiple values
                expanded_row = row[:8]  # First 8 columns stay the same
                
                # The 9th column (index 8) might contain both Census Ct. and Paid Amount
                last_cell = str(row[8]).strip()
                
                # Try to intelligently split the last cell
                if ' ' in last_cell and len(last_cell) > 3:
                    # If it has spaces, split it
                    parts = last_cell.split()
                    if len(parts) >= 2:
                        expanded_row.extend([parts[0], ' '.join(parts[1:])])
                    else:
                        expanded_row.extend([last_cell, ''])
                elif last_cell and last_cell != '':
                    # Single value goes to first new column
                    expanded_row.extend([last_cell, ''])
                else:
                    # Empty value
                    expanded_row.extend(['', ''])
                
                expanded_rows.append(expanded_row)
            else:
                # No expansion needed or unusual case
                expanded_rows.append(row)
        
        return expanded_rows
    
    def _create_cells_from_headers_and_rows(self, headers: List[str], rows: List[List[str]]) -> List[Dict[str, Any]]:
        """Create cells structure from headers and rows for validation compatibility."""
        cells = []
        
        # Add header cells
        for col_idx, header in enumerate(headers):
            cells.append({
                "row": 0,
                "column": col_idx,
                "text": header,
                "is_header": True,
                "confidence": 1.0,
                "bbox": [0, 0, 0, 0]  # Placeholder bbox
            })
        
        # Add data cells
        for row_idx, row in enumerate(rows):
            for col_idx, cell_text in enumerate(row):
                if col_idx < len(headers):  # Ensure we don't exceed column count
                    cells.append({
                        "row": row_idx + 1,  # +1 because row 0 is headers
                        "column": col_idx,
                        "text": cell_text,
                        "is_header": False,
                        "confidence": 1.0,
                        "bbox": [0, 0, 0, 0]  # Placeholder bbox
                    })
        
        return cells
    
    def _deduplicate_text(self, text: str) -> str:
        """Remove duplicate words/phrases from text while preserving meaningful content."""
        if not text:
            return text
        
        # Split into words
        words = text.split()
        if len(words) <= 3:
            return text
        
        # Look for obvious repetitive patterns - be conservative to preserve content
        # Only remove clear duplicates like "LLC LLC LLC" or "Logistics Logistics"
        result_text = text
        
        # Simple pattern: remove exact word repetitions (2+ times)
        for word in set(words):
            if len(word) > 2:  # Only for meaningful words
                # Look for 3+ repetitions of the same word
                pattern = f' {word} {word} {word}'
                if pattern in result_text:
                    # Replace with single occurrence
                    result_text = result_text.replace(pattern, f' {word}')
                    self.logger.logger.info(f"🧹 DEDUPLICATED word: '{word}' (removed repetitions)")
        
        # Pattern: remove phrase duplications like "Development, LLC Development, LLC"
        import re
        # Look for patterns like "word, word word, word" or "and word word and word word"
        phrase_patterns = [
            r'(\b\w+,?\s+\w+)\s+\1',  # "Development, LLC Development, LLC"
            r'(\band\s+\w+\s+\w+)\s+\1',  # "and Transport LLC and Transport LLC"
            r'(\b\w+\s+\w+\s+\w+)\s+\1',  # "Delivery Logistics LLC Delivery Logistics LLC"
        ]
        
        for pattern in phrase_patterns:
            matches = re.findall(pattern, result_text)
            for match in matches:
                # Replace duplicate phrase with single occurrence
                duplicate_pattern = f'{match} {match}'
                if duplicate_pattern in result_text:
                    result_text = result_text.replace(duplicate_pattern, match)
                    self.logger.logger.info(f"🧹 DEDUPLICATED phrase: '{match}' (removed duplication)")
        
        # Log the deduplication if significant changes were made
        if len(result_text) < len(text) * 0.8:  # If we removed more than 20% of the text
            self.logger.logger.info(f"🧹 DEDUPLICATED: '{text[:50]}...' → '{result_text[:50]}...'")
        
        return result_text.strip()
