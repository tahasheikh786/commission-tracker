import os
import json
import tempfile
from typing import Dict, List, Any, Optional
from itertools import zip_longest
from docling import document_converter
from docling.datamodel.base_models import DocInputType


class DoclingExtractor:
    """
    Table extraction using Docling for complex table structures.
    Best for multi-row headers, merged/nested cells, and multi-page tables.
    
    Docling provides:
    - Advanced table structure detection
    - Multi-row header support
    - Merged cell handling
    - Multi-page table stitching
    - High accuracy for complex layouts
    """
    
    def __init__(self):
        self.name = "docling"
        self.description = "Docling-based table extraction for complex table structures"
        self.converter = None
        self._initialize_converter()
    
    def _initialize_converter(self):
        """
        Initialize Docling DocumentConverter for table extraction.
        """
        try:
            # Initialize the document converter with PDF support
            self.converter = document_converter.DocumentConverter()
            print(f"✅ {self.name}: DocumentConverter initialized successfully")
            
        except Exception as e:
            print(f"❌ {self.name}: DocumentConverter initialization failed - {e}")
            self.converter = None
    
    def extract_tables(self, pdf_path: str) -> List[Dict[str, Any]]:
        """
        Extract tables using Docling with robust error handling.
        
        Args:
            pdf_path: Path to the PDF file
            
        Returns:
            List of extracted table dictionaries with consistent structure
        """
        if not self.converter:
            print(f"❌ {self.name}: DocumentConverter not initialized")
            return []
        
        try:
            print(f"🔍 {self.name}: Starting extraction for {pdf_path}")
            extracted_tables = []
            
            # Convert PDF using Docling
            result = self.converter.convert(pdf_path)
            
            if not result or not result.document:
                print(f"⚠️ {self.name}: No document content found")
                return []
            
            # Extract tables from the converted document
            tables = self._extract_tables_from_document(result.document)
            
            for table_index, table in enumerate(tables):
                try:
                    print(f"📊 {self.name}: Processing table {table_index + 1}/{len(tables)}")
                    
                    # Extract table data with robust structure
                    table_data = self._extract_table_data(table, table_index, pdf_path)
                    
                    if table_data:
                        extracted_tables.append(table_data)
                        print(f"✅ {self.name}: Successfully extracted table {table_index + 1}")
                    else:
                        print(f"⚠️ {self.name}: Failed to extract table {table_index + 1}")
                
                except Exception as e:
                    print(f"❌ {self.name}: Error processing table {table_index + 1}: {e}")
                    continue
            
            print(f"🎯 {self.name}: Total tables extracted: {len(extracted_tables)}")
            return extracted_tables
            
        except Exception as e:
            print(f"❌ {self.name}: Extraction failed - {e}")
            return []
    
    def _extract_tables_from_document(self, document) -> List[Any]:
        """
        Extract table objects from Docling document.
        
        Args:
            document: Docling document object
            
        Returns:
            List of table objects
        """
        tables = []
        
        try:
            # Look for tables in the document structure
            if hasattr(document, 'tables') and document.tables:
                tables = document.tables
            elif hasattr(document, 'elements'):
                # Search through document elements for tables
                for element in document.elements:
                    if hasattr(element, 'type') and element.type == 'table':
                        tables.append(element)
                    elif hasattr(element, 'tables') and element.tables:
                        tables.extend(element.tables)
            
            print(f"📄 {self.name}: Found {len(tables)} tables in document")
            
        except Exception as e:
            print(f"❌ {self.name}: Error extracting tables from document: {e}")
        
        return tables
    
    def _extract_table_data(self, table, table_index: int, pdf_path: str) -> Optional[Dict[str, Any]]:
        """
        Extract data from a single Docling table with robust structure handling.
        Includes validation and normalization for consistent output.
        
        Args:
            table: Docling table object
            table_index: Index of the table
            pdf_path: Original PDF path for metadata
            
        Returns:
            Normalized table dictionary with consistent structure
        """
        try:
            # Extract headers with robust multi-row handling
            headers = self._extract_headers(table)
            
            # Extract rows with consistent column alignment
            rows = self._extract_rows(table)
            
            # Extract footers if available
            footers = self._extract_footers(table)
            
            # Ensure all rows have the same length as headers
            rows = self._normalize_row_lengths(rows, len(headers))
            
            # Get table metadata
            metadata = self._extract_table_metadata(table, table_index, pdf_path)
            
            # Create consistent table structure
            table_data = {
                "headers": headers,
                "rows": rows,
                "footers": footers,
                "metadata": metadata,
                "row_count": len(rows),
                "column_count": len(headers),
                "table_index": table_index,
                "extractor": self.name
            }
            
            # Validate table structure using utils
            try:
                from .utils import validate_table_structure
                validated_table = validate_table_structure(table_data)
                return validated_table
            except ImportError:
                # If utils not available, return as-is
                return table_data
            
        except Exception as e:
            print(f"❌ {self.name}: Error extracting table data: {e}")
            # Return minimal valid structure on error
            return {
                "headers": ["Column_1"],
                "rows": [],
                "footers": [],
                "metadata": {
                    "error": str(e),
                    "status": "error",
                    "table_index": table_index,
                    "extractor": self.name
                },
                "row_count": 0,
                "column_count": 1,
                "table_index": table_index,
                "extractor": self.name
            }
    
    def _extract_headers(self, table) -> List[str]:
        """
        Extract headers with robust multi-row header handling and fallback logic.
        
        Args:
            table: Docling table object
            
        Returns:
            List of header strings, flattened from multi-row headers
        """
        try:
            headers = []
            
            # Try different header extraction methods in order of preference
            if hasattr(table, 'headers') and table.headers:
                # Single row headers
                headers = [str(h).strip() for h in table.headers if h]
            elif hasattr(table, 'header_rows') and table.header_rows:
                # Multi-row headers - flatten them
                headers = self._process_multi_row_headers(table.header_rows)
            elif hasattr(table, 'columns') and table.columns:
                # Extract from column definitions
                headers = [str(col.get('header', f'Column_{i+1}')).strip() 
                          for i, col in enumerate(table.columns)]
            elif hasattr(table, 'data') and table.data:
                # Try to get headers from data structure
                try:
                    if hasattr(table.data, 'columns'):
                        headers = [str(col).strip() for col in table.data.columns]
                    elif hasattr(table.data, 'headers'):
                        headers = [str(h).strip() for h in table.data.headers]
                except Exception as e:
                    print(f"⚠️ {self.name}: Error accessing data headers: {e}")
            else:
                # Fallback: try to extract from first row
                if hasattr(table, 'rows') and table.rows:
                    first_row = table.rows[0]
                    headers = [str(cell).strip() for cell in first_row if cell]
            
            # Try to export to dataframe and get column names
            if not headers and hasattr(table, 'export_to_dataframe'):
                try:
                    df = table.export_to_dataframe()
                    if df is not None and not df.empty:
                        headers = [str(col).strip() for col in df.columns]
                except Exception as e:
                    print(f"⚠️ {self.name}: Error getting headers from dataframe: {e}")
            
            # Final fallback: generate headers based on longest row
            if not headers or all(not h.strip() for h in headers):
                max_columns = self._get_table_width(table)
                headers = [f"Column_{i+1}" for i in range(max_columns)]
            
            print(f"📝 {self.name}: Extracted {len(headers)} headers: {headers}")
            return headers
            
        except Exception as e:
            print(f"❌ {self.name}: Error extracting headers: {e}")
            # Emergency fallback
            max_columns = self._get_table_width(table)
            return [f"Column_{i+1}" for i in range(max_columns)]
    
    def _process_multi_row_headers(self, header_rows: List) -> List[str]:
        """
        Process multi-row headers into a single header row using zip_longest.
        Clean implementation that strips spaces and joins non-empty elements.
        
        Args:
            header_rows: List of header rows from Docling
            
        Returns:
            Flattened header row as list of strings
        """
        try:
            if not header_rows:
                return []
            
            # Process all header rows to lists of strings
            processed = [[str(cell).strip() for cell in row] for row in header_rows]
            
            # Use zip_longest to align columns across all header rows
            columns = list(zip_longest(*processed, fillvalue=""))
            
            # Join each column's header parts with space, filtering out empty elements
            return [" ".join(filter(None, col)).strip() for col in columns]
            
        except Exception as e:
            print(f"❌ {self.name}: Error processing multi-row headers: {e}")
            return []
    
    def _extract_rows(self, table) -> List[List[str]]:
        """
        Extract rows with consistent data handling and data flattening.
        Ensures all cells are strings and handles nested data structures.
        
        Args:
            table: Docling table object
            
        Returns:
            List of rows, each row is a list of strings
        """
        try:
            rows = []
            
            # Try to export to dataframe first (most reliable)
            if hasattr(table, 'export_to_dataframe'):
                try:
                    df = table.export_to_dataframe()
                    if df is not None and not df.empty:
                        print(f"📊 {self.name}: Using dataframe export for table data")
                        for _, row in df.iterrows():
                            processed_row = [str(cell).strip() if cell else "" for cell in row]
                            rows.append(processed_row)
                        return rows
                except Exception as e:
                    print(f"⚠️ {self.name}: Error exporting to dataframe: {e}")
            
            # Try to access table data directly
            if hasattr(table, 'data') and table.data:
                try:
                    # Check if data has rows
                    if hasattr(table.data, 'rows') and table.data.rows:
                        for row in table.data.rows:
                            processed_row = self._flatten_row_data(row)
                            rows.append(processed_row)
                    # Check if data is iterable
                    elif hasattr(table.data, '__iter__'):
                        for row in table.data:
                            processed_row = self._flatten_row_data(row)
                            rows.append(processed_row)
                    # Try to convert to list
                    else:
                        data_list = list(table.data) if hasattr(table.data, '__iter__') else [table.data]
                        for row in data_list:
                            processed_row = self._flatten_row_data(row)
                            rows.append(processed_row)
                except Exception as e:
                    print(f"⚠️ {self.name}: Error accessing table.data: {e}")
            
            # Fallback to rows attribute
            if not rows and hasattr(table, 'rows') and table.rows:
                try:
                    for row in table.rows:
                        processed_row = self._flatten_row_data(row)
                        rows.append(processed_row)
                except Exception as e:
                    print(f"⚠️ {self.name}: Error accessing table.rows: {e}")
            
            # Try to access cells directly
            if not rows and hasattr(table, 'cells') and table.cells:
                try:
                    # Group cells by row
                    cell_groups = {}
                    for cell in table.cells:
                        if hasattr(cell, 'row') and hasattr(cell, 'col') and hasattr(cell, 'text'):
                            row_idx = cell.row
                            col_idx = cell.col
                            if row_idx not in cell_groups:
                                cell_groups[row_idx] = {}
                            cell_groups[row_idx][col_idx] = str(cell.text).strip()
                    
                    # Convert to rows
                    for row_idx in sorted(cell_groups.keys()):
                        row_data = cell_groups[row_idx]
                        max_col = max(row_data.keys()) if row_data else 0
                        row = [row_data.get(col_idx, "") for col_idx in range(max_col + 1)]
                        rows.append(row)
                except Exception as e:
                    print(f"⚠️ {self.name}: Error accessing table.cells: {e}")
            
            # Parse raw table data string (fallback for complex cases)
            if not rows:
                try:
                    # Try to get text representation and parse it
                    table_text = str(table)
                    if table_text and table_text != "None":
                        rows = self._parse_raw_table_text(table_text)
                except Exception as e:
                    print(f"⚠️ {self.name}: Error extracting text content: {e}")
            
            print(f"📊 {self.name}: Extracted {len(rows)} rows from table")
            return rows
            
        except Exception as e:
            print(f"❌ {self.name}: Error extracting rows: {e}")
            return []
    
    def _parse_raw_table_text(self, table_text: str) -> List[List[str]]:
        """
        Parse raw table text to extract actual table content.
        This handles the case where Docling returns raw table data structure.
        
        Args:
            table_text: Raw table text from Docling
            
        Returns:
            List of rows with actual table content
        """
        try:
            import re
            
            rows = []
            current_row = {}
            
            # Extract text content from the raw table data
            # Pattern to match text='...' in the raw data
            text_pattern = r"text='([^']*)'"
            row_pattern = r"start_row_offset_idx=(\d+)"
            col_pattern = r"start_col_offset_idx=(\d+)"
            
            # Find all text entries with their positions
            text_matches = re.finditer(text_pattern, table_text)
            
            for match in text_matches:
                text_content = match.group(1).strip()
                if not text_content:
                    continue
                
                # Find the position of this text in the table
                start_pos = match.start()
                text_section = table_text[max(0, start_pos-200):start_pos+200]
                
                # Extract row and column indices
                row_match = re.search(row_pattern, text_section)
                col_match = re.search(col_pattern, text_section)
                
                if row_match and col_match:
                    row_idx = int(row_match.group(1))
                    col_idx = int(col_match.group(1))
                    
                    if row_idx not in current_row:
                        current_row[row_idx] = {}
                    current_row[row_idx][col_idx] = text_content
            
            # Convert to rows
            if current_row:
                max_row = max(current_row.keys())
                for row_idx in range(max_row + 1):
                    if row_idx in current_row:
                        row_data = current_row[row_idx]
                        max_col = max(row_data.keys()) if row_data else 0
                        row = [row_data.get(col_idx, "") for col_idx in range(max_col + 1)]
                        rows.append(row)
            
            return rows
            
        except Exception as e:
            print(f"⚠️ {self.name}: Error parsing raw table text: {e}")
            return []
    
    def _flatten_row_data(self, row) -> List[str]:
        """
        Flatten row data to ensure all cells are strings.
        Handles nested lists/tuples by joining with spaces.
        
        Args:
            row: Row data (can be list, tuple, or single value)
            
        Returns:
            List of string cells
        """
        try:
            if isinstance(row, (list, tuple)):
                flattened_cells = []
                for cell in row:
                    if isinstance(cell, (list, tuple)):
                        # Join nested data with spaces
                        cell_str = " ".join(str(item).strip() for item in cell if item)
                    else:
                        cell_str = str(cell).strip() if cell else ""
                    flattened_cells.append(cell_str)
                return flattened_cells
            else:
                # Single value row
                return [str(row).strip() if row else ""]
                
        except Exception as e:
            print(f"❌ {self.name}: Error flattening row data: {e}")
            return [""]
    
    def _extract_footers(self, table) -> List[str]:
        """
        Extract footers if available.
        
        Args:
            table: Docling table object
            
        Returns:
            List of footer strings
        """
        try:
            footers = []
            
            if hasattr(table, 'footers') and table.footers:
                footers = [str(footer).strip() for footer in table.footers if footer]
            elif hasattr(table, 'footer_rows') and table.footer_rows:
                for row in table.footer_rows:
                    if isinstance(row, (list, tuple)):
                        footer_parts = [str(cell).strip() for cell in row if cell]
                        footers.extend(footer_parts)
                    else:
                        footers.append(str(row).strip())
            
            return footers
            
        except Exception as e:
            print(f"❌ {self.name}: Error extracting footers: {e}")
            return []
    
    def _normalize_row_lengths(self, rows: List[List[str]], header_length: int) -> List[List[str]]:
        """
        Ensure all rows have the same length as headers.
        
        Args:
            rows: List of rows
            header_length: Length of headers
            
        Returns:
            Normalized rows with consistent length
        """
        normalized_rows = []
        
        for row in rows:
            if len(row) < header_length:
                # Pad with empty strings
                normalized_row = row + [""] * (header_length - len(row))
            elif len(row) > header_length:
                # Truncate to header length
                normalized_row = row[:header_length]
            else:
                normalized_row = row
            
            normalized_rows.append(normalized_row)
        
        return normalized_rows
    
    def _get_table_width(self, table) -> int:
        """
        Get the width (number of columns) of the table.
        
        Args:
            table: Docling table object
            
        Returns:
            Number of columns
        """
        try:
            if hasattr(table, 'columns') and table.columns:
                return len(table.columns)
            elif hasattr(table, 'headers') and table.headers:
                return len(table.headers)
            elif hasattr(table, 'rows') and table.rows:
                # Find the maximum row length
                max_length = 0
                for row in table.rows:
                    if isinstance(row, (list, tuple)):
                        max_length = max(max_length, len(row))
                    else:
                        max_length = max(max_length, 1)
                return max_length
            else:
                return 1  # Default to single column
                
        except Exception as e:
            print(f"❌ {self.name}: Error getting table width: {e}")
            return 1
    
    def _extract_table_metadata(self, table, table_index: int, pdf_path: str) -> Dict[str, Any]:
        """
        Extract metadata from Docling table.
        
        Args:
            table: Docling table object
            table_index: Table index
            pdf_path: Original PDF path
            
        Returns:
            Dictionary of table metadata
        """
        metadata = {
            "table_id": getattr(table, 'id', f"table_{table_index}"),
            "table_type": getattr(table, 'type', 'unknown'),
            "confidence": getattr(table, 'confidence', 0.0),
            "bbox": getattr(table, 'bbox', []),
            "page_number": getattr(table, 'page_number', 0),
            "extraction_method": f"{self.name}_Docling",
            "structure_version": "Docling",
            "status": "success"
        }
        
        # Add additional Docling-specific attributes if available
        for attr in ['title', 'caption', 'summary']:
            if hasattr(table, attr):
                value = getattr(table, attr)
                if value:
                    metadata[attr] = str(value)
        
        return metadata
    
    def export_tables(self, pdf_path: str, output_format: str = "json") -> Dict[str, Any]:
        """
        Export tables in various formats using Docling's export capabilities.
        
        Args:
            pdf_path: Path to the PDF file
            output_format: "json", "markdown", "csv", or "excel"
            
        Returns:
            Dictionary containing exported data and metadata
        """
        try:
            print(f"📤 {self.name}: Exporting tables in {output_format} format")
            
            # Extract tables first
            tables = self.extract_tables(pdf_path)
            
            if output_format == "json":
                # Return tables as JSON
                return {
                    "format": output_format,
                    "content": json.dumps(tables, indent=2),
                    "table_count": len(tables),
                    "extractor": self.name
                }
            elif output_format == "markdown":
                # Convert to markdown format
                markdown_content = self._convert_to_markdown(tables)
                return {
                    "format": output_format,
                    "content": markdown_content,
                    "table_count": len(tables),
                    "extractor": self.name
                }
            else:
                # For other formats, convert from extracted tables
                return {
                    "format": output_format,
                    "content": f"Export to {output_format} not implemented",
                    "table_count": len(tables),
                    "extractor": self.name
                }
                
        except Exception as e:
            print(f"❌ {self.name}: Export failed - {e}")
            return {
                "format": output_format,
                "error": str(e),
                "extractor": self.name
            }
    
    def _convert_to_markdown(self, tables: List[Dict[str, Any]]) -> str:
        """
        Convert extracted tables to markdown format.
        
        Args:
            tables: List of extracted table dictionaries
            
        Returns:
            Markdown string representation
        """
        markdown_lines = []
        
        for i, table in enumerate(tables):
            markdown_lines.append(f"## Table {i+1}")
            markdown_lines.append("")
            
            headers = table.get("headers", [])
            rows = table.get("rows", [])
            
            if headers:
                # Add headers
                markdown_lines.append("| " + " | ".join(headers) + " |")
                markdown_lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
                
                # Add rows
                for row in rows:
                    markdown_lines.append("| " + " | ".join(row) + " |")
            
            markdown_lines.append("")
        
        return "\n".join(markdown_lines)
    
    def is_available(self) -> bool:
        """
        Check if Docling is available.
        
        Returns:
            True if Docling can be imported and used
        """
        try:
            from docling import document_converter
            return self.converter is not None
        except ImportError:
            return False
    
    def get_capabilities(self) -> Dict[str, Any]:
        """
        Get Docling's capabilities and features.
        
        Returns:
            Dictionary describing Docling's capabilities
        """
        return {
            "name": self.name,
            "description": self.description,
            "features": [
                "Multi-row header support",
                "Merged cell handling",
                "Multi-page table stitching",
                "Complex table structure detection",
                "High accuracy for complex layouts",
                "JSON/Markdown export",
                "Table metadata extraction"
            ],
            "best_for": [
                "Complex table structures",
                "Multi-row headers",
                "Merged/nested cells",
                "Multi-page tables",
                "High-accuracy extraction"
            ],
            "limitations": [
                "Requires internet for some features",
                "May be slower than simpler extractors",
                "Memory intensive for large documents"
            ]
        } 