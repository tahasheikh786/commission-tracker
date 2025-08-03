import os
import json
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from .extractor_docling import DoclingExtractor
from .extractor_google_docai import GoogleDocAIExtractor
from .extraction_utils import (
    detect_pdf_type, 
    stitch_multipage_tables, 
    validate_table_structure,
    convert_to_csv,
    convert_to_excel
)
import base64


class TableExtractionPipeline:
    """
    Advanced table extraction pipeline with intelligent fallback mechanisms.
    Handles any type of PDF: scanned, digital, multipage, multi-table, complex layouts.
    
    Features:
    - Intelligent PDF type detection
    - Prioritized extractor calling based on PDF type
    - Comprehensive logging and metadata tracking
    - Robust error handling and fallback mechanisms
    """
    
    def __init__(self):
        self.extractors = []
        self.extraction_log = []
        self._initialize_extractors()
    
    def _initialize_extractors(self):
        """
        Initialize available extractors in order of preference.
        """
        print("🚀 Initializing Table Extraction Pipeline...")
        
        # Docling (best for complex tables with multi-row headers, merged cells)
        docling_extractor = DoclingExtractor()
        if docling_extractor.is_available():
            self.extractors.append(docling_extractor)
            print(f"✅ Docling extractor loaded")
        else:
            print(f"❌ Docling extractor not available")
        
        # Google Document AI (best for scanned PDFs with borderless tables)
        google_docai_extractor = GoogleDocAIExtractor()
        if google_docai_extractor.is_available():
            self.extractors.append(google_docai_extractor)
            print(f"✅ Google Document AI extractor loaded")
        else:
            print(f"❌ Google Document AI extractor not available")
        
        print(f"🎯 Pipeline initialized with {len(self.extractors)} extractors: {[e.name for e in self.extractors]}")
    
    def extract_tables(self, pdf_path: str, output_format: str = "json", force_extractor: Optional[str] = None) -> Dict[str, Any]:
        """
        Main extraction method with intelligent fallback and comprehensive logging.
        
        Args:
            pdf_path: Path to the PDF file
            output_format: "json", "csv", or "excel"
            force_extractor: Force specific extractor ("docling", "google_docai") (optional)
        
        Returns:
            Dictionary containing extracted tables and detailed metadata
        """
        # Reset extraction log for this run
        self.extraction_log = []
        
        if not os.path.exists(pdf_path):
            return self._create_error_response("PDF file not found")
        
        try:
            print(f"\n🔍 Starting extraction for: {pdf_path}")
            
            # Detect PDF type
            pdf_type = detect_pdf_type(pdf_path)
            print(f"📄 Detected PDF type: {pdf_type}")
            
            # Determine extractor order based on force_extractor or optimal order
            if force_extractor:
                print(f"🎯 Forcing extractor: {force_extractor}")
                extractor_order = self._sort_extractors_by_preference([force_extractor])
                # Only include the forced extractor
                extractor_order = [e for e in extractor_order if e.name == force_extractor]
            else:
                extractor_order = self._get_optimal_extractor_order(pdf_type)
                print(f"🎯 Optimal extractor order: {[e.name for e in extractor_order]}")
            
            # Check if any extractors are available
            if not extractor_order:
                return self._create_error_response("No extractors available. Please check that Docling is properly installed and configured.")
            
            # Extract tables using intelligent fallback
            all_tables = []
            extraction_errors = []
            successful_extractors = []
            
            # Try extractors in optimal order with timeout protection
            for extractor in extractor_order:
                try:
                    print(f"\n🔧 Trying {extractor.name} extractor...")
                    
                    # Record extraction attempt
                    extraction_attempt = {
                        "extractor": extractor.name,
                        "pdf_type": pdf_type,
                        "timestamp": datetime.now().isoformat(),
                        "status": "attempting"
                    }
                    
                    # Extract tables without aggressive timeout
                    # Let the extractor take as long as needed for accurate results
                    tables = extractor.extract_tables(pdf_path)
                    
                    if tables:
                        print(f"✅ {extractor.name}: Successfully extracted {len(tables)} tables")
                        all_tables.extend(tables)
                        successful_extractors.append(extractor.name)
                        
                        # Update extraction log
                        extraction_attempt.update({
                            "status": "success",
                            "tables_count": len(tables),
                            "tables": [{"index": t.get("table_index", i), "rows": len(t.get("rows", [])), "cols": len(t.get("headers", []))} for i, t in enumerate(tables)]
                        })
                        
                        # Stop after first successful extraction to save resources
                        print(f"🎯 {extractor.name}: Successfully extracted tables, stopping extraction")
                        break
                    else:
                        print(f"⚠️ {extractor.name}: No tables found")
                        extraction_attempt.update({
                            "status": "no_tables",
                            "tables_count": 0
                        })
                
                except Exception as e:
                    error_msg = f"{extractor.name} extraction failed: {str(e)}"
                    print(f"❌ {error_msg}")
                    extraction_errors.append(error_msg)
                    
                    extraction_attempt.update({
                        "status": "failed",
                        "error": str(e),
                        "tables_count": 0
                    })
                    continue
                
                finally:
                    self.extraction_log.append(extraction_attempt)
            
            # If no tables found, try remaining extractors as fallback
            if not all_tables:
                print("\n🔄 No tables found with primary extractors, trying fallback...")
                remaining_extractors = [e for e in self.extractors if e.name not in successful_extractors]
                
                for extractor in remaining_extractors:
                    try:
                        print(f"🔄 Fallback: Trying {extractor.name}...")
                        
                        # Be more selective about PDFPlumber fallback
                        if extractor.name == "pdfplumber" and any(e in successful_extractors for e in ["gmft", "paddleocr"]):
                            print(f"🔄 Skipping PDFPlumber fallback since better extractors already succeeded")
                            continue
                        
                        tables = extractor.extract_tables(pdf_path)
                        
                        if tables:
                            print(f"✅ {extractor.name}: Fallback successful - {len(tables)} tables")
                            all_tables.extend(tables)
                            successful_extractors.append(extractor.name)
                        else:
                            print(f"⚠️ {extractor.name}: Fallback failed - no tables")
                            
                    except Exception as e:
                        fallback_error = f"{extractor.name} fallback failed: {str(e)}"
                        print(f"❌ {fallback_error}")
                        extraction_errors.append(fallback_error)
            
            # Check if any tables were found
            if not all_tables:
                error_msg = "No tables found in the uploaded PDF. "
                if extraction_errors:
                    error_msg += f"Extraction errors: {'; '.join(extraction_errors)}"
                else:
                    error_msg += "Please check that the PDF contains tables and try adjusting extraction parameters."
                return self._create_error_response(error_msg)
            
            # Post-process extracted tables
            processed_tables = self._post_process_tables(all_tables)
            
            # Create comprehensive response
            response = self._create_success_response(
                processed_tables, 
                pdf_type, 
                extraction_errors,
                output_format,
                successful_extractors
            )
            
            # Add extraction log to response
            response["extraction_log"] = self.extraction_log
            
            print(f"\n🎯 Extraction completed: {len(processed_tables)} tables from {len(successful_extractors)} extractors")
            return response
            
        except Exception as e:
            error_response = self._create_error_response(f"Extraction pipeline failed: {str(e)}")
            error_response["extraction_log"] = self.extraction_log
            return error_response
    
    def _get_optimal_extractor_order(self, pdf_type: str) -> List:
        """
        Determine optimal extractor order based on PDF type.
        
        Args:
            pdf_type: Detected PDF type ("digital" or "scanned")
            
        Returns:
            List of extractors in optimal order
        """
        # For production environments, use only one extractor to save resources
        # This prevents the 502 timeout issues
        if pdf_type == "scanned":
            # For scanned PDFs, use Google Document AI for better OCR
            return self._sort_extractors_by_preference(["google_docai"])
        else:
            # For digital PDFs, use Docling for better structure understanding
            return self._sort_extractors_by_preference(["docling"])
    
    def _sort_extractors_by_preference(self, preferred_order: List[str]) -> List:
        """
        Sort extractors by preferred order.
        
        Args:
            preferred_order: List of extractor names in preferred order
            
        Returns:
            Sorted list of extractors
        """
        sorted_extractors = []
        
        # Add extractors in preferred order
        for name in preferred_order:
            for extractor in self.extractors:
                if extractor.name == name and extractor not in sorted_extractors:
                    sorted_extractors.append(extractor)
        
        # Add any remaining extractors
        for extractor in self.extractors:
            if extractor not in sorted_extractors:
                sorted_extractors.append(extractor)
        
        return sorted_extractors
    
    def _post_process_tables(self, tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Post-process extracted tables: stitching, validation, normalization.
        
        Args:
            tables: List of raw extracted tables
            
        Returns:
            List of processed and validated tables
        """
        if not tables:
            return []
        
        try:
            print(f"🔧 Post-processing {len(tables)} tables...")
            
            # 1. Stitch multipage tables
            print(f"🔍 Before stitching: {len(tables)} tables")
            for i, table in enumerate(tables):
                headers = table.get("headers", [])
                rows = table.get("rows", [])
                print(f"   Table {i}: {len(headers)} headers, {len(rows)} rows")
            
            stitched_tables = stitch_multipage_tables(tables)
            print(f"📎 After stitching: {len(stitched_tables)} tables")
            for i, table in enumerate(stitched_tables):
                headers = table.get("headers", [])
                rows = table.get("rows", [])
                metadata = table.get("metadata", {})
                print(f"   Stitched table {i}: {len(headers)} headers, {len(rows)} rows, metadata: {metadata}")
            
            # 2. Validate each table
            validated_tables = []
            for i, table in enumerate(stitched_tables):
                try:
                    validated_table = validate_table_structure(table)
                    validated_tables.append(validated_table)
                    
                    # Log validation results
                    validation = validated_table.get("validation", {})
                    if not validation.get("is_valid", True):
                        print(f"⚠️ Table {i}: Validation warnings - {validation.get('warnings', [])}")
                    
                except Exception as e:
                    print(f"❌ Error validating table {i}: {e}")
                    validated_tables.append(table)  # Keep original table
            
            # 3. Add global metadata
            for i, table in enumerate(validated_tables):
                table["global_index"] = i
                table["total_tables"] = len(validated_tables)
                
                # Add processing metadata
                if "metadata" not in table:
                    table["metadata"] = {}
                table["metadata"].update({
                    "post_processed": True,
                    "stitched": len(stitched_tables) < len(tables),
                    "validated": True
                })
            
            print(f"✅ Post-processing completed: {len(validated_tables)} tables")
            return validated_tables
            
        except Exception as e:
            print(f"❌ Error in post-processing: {e}")
            return tables  # Return original tables if post-processing fails
    
    def _create_success_response(self, tables: List[Dict[str, Any]], pdf_type: str, 
                               errors: List[str], output_format: str, successful_extractors: List[str]) -> Dict[str, Any]:
        """
        Create comprehensive success response with detailed metadata.
        
        Args:
            tables: List of processed tables
            pdf_type: Detected PDF type
            errors: List of extraction errors
            output_format: Requested output format
            successful_extractors: List of extractors that succeeded
            
        Returns:
            Comprehensive response dictionary
        """
        # Calculate extraction statistics
        total_rows = sum(len(table.get("rows", [])) for table in tables)
        total_columns = sum(len(table.get("headers", [])) for table in tables)
        avg_confidence = sum(table.get("confidence", 0.0) for table in tables) / len(tables) if tables else 0.0
        
        response = {
            "success": True,
            "timestamp": datetime.now().isoformat(),
            "pdf_type": pdf_type,
            "total_tables": len(tables),
            "tables": tables,
            "extraction_stats": {
                "total_rows": total_rows,
                "total_columns": total_columns,
                "average_confidence": avg_confidence,
                "successful_extractors": successful_extractors,
                "failed_extractors": [e.name for e in self.extractors if e.name not in successful_extractors]
            },
            "metadata": {
                "extraction_methods_used": successful_extractors,
                "pdf_type": pdf_type,
                "extraction_errors": errors,
                "pipeline_version": "2.0",
                "extractors_available": [e.name for e in self.extractors],
                "extractors_used": successful_extractors
            }
        }
        
        # Add format-specific outputs
        if output_format == "csv" and tables:
            response["csv_output"] = {
                table.get("table_index", i): convert_to_csv(table) 
                for i, table in enumerate(tables)
            }
        elif output_format == "excel" and tables:
            excel_data = convert_to_excel(tables)
            response["excel_output"] = {
                "data": excel_data,
                "filename": f"extracted_tables_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            }
        
        return response
    
    def _create_error_response(self, error_message: str) -> Dict[str, Any]:
        """
        Create comprehensive error response with debugging information.
        
        Args:
            error_message: Error message
            
        Returns:
            Error response dictionary
        """
        return {
            "success": False,
            "timestamp": datetime.now().isoformat(),
            "error": error_message,
            "tables": [],
            "total_tables": 0,
            "extraction_stats": {
                "total_rows": 0,
                "total_columns": 0,
                "average_confidence": 0.0,
                "successful_extractors": [],
                "failed_extractors": [e.name for e in self.extractors]
            },
            "metadata": {
                "extraction_methods_used": [],
                "extraction_errors": [error_message],
                "pipeline_version": "2.0",
                "extractors_available": [e.name for e in self.extractors],
                "extractors_used": []
            }
        }
    
    def get_extractor_status(self) -> Dict[str, Any]:
        """
        Get comprehensive status of all available extractors.
        
        Returns:
            Dictionary with extractor status information
        """
        status = {}
        for extractor in self.extractors:
            status[extractor.name] = {
                "available": extractor.is_available(),
                "description": extractor.description,
                "name": extractor.name
            }
        return status
    
    def extract_single_table(self, pdf_path: str, table_index: int = 0, force_extractor: Optional[str] = None) -> Dict[str, Any]:
        """
        Extract a single table by index with full pipeline processing.
        
        Args:
            pdf_path: Path to the PDF file
            table_index: Index of the table to extract
            force_extractor: Force specific extractor ("docling", "google_docai") (optional)
            
        Returns:
            Single table response with metadata
        """
        full_result = self.extract_tables(pdf_path, "json", force_extractor)
        
        if not full_result.get("success", False):
            return full_result
        
        tables = full_result.get("tables", [])
        
        if table_index >= len(tables):
            return self._create_error_response(f"Table index {table_index} not found. Available: 0-{len(tables)-1}")
        
        # Return single table with full metadata
        return {
            "success": True,
            "table": tables[table_index],
            "total_tables": len(tables),
            "timestamp": datetime.now().isoformat(),
            "extraction_log": full_result.get("extraction_log", []),
            "metadata": full_result.get("metadata", {})
        } 