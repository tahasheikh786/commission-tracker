"""
New Extraction Service - Integration of the new working solution
This service provides a unified interface to the new extraction pipeline
while maintaining compatibility with the existing server structure.
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
import tempfile
import os
from app.new_extraction_services.utils.compatibility import apply_compatibility_fixes

# Apply compatibility fixes
apply_compatibility_fixes()


# Import the new extraction solution
from app.new_extraction_services.utils.config import get_config
from app.new_extraction_services.utils.logging_utils import setup_logging, get_logger
from app.new_extraction_services.pipeline.extraction_pipeline import ExtractionPipeline, ExtractionOptions
from app.new_extraction_services.core.document_processor import DocumentProcessor
from app.new_extraction_services.models.advanced_tableformer import ProductionTableFormer
from app.new_extraction_services.models.advanced_ocr_engine import AdvancedOCREngine


class NewExtractionService:
    """
    New extraction service that uses the advanced extraction pipeline.
    This service replaces the Docling-based extraction while maintaining
    the same interface for the existing server.
    """
    
    def __init__(self, config_path: Optional[str] = None):
        """Initialize the new extraction service."""
        self.config = get_config(config_path)
        setup_logging(self.config)
        self.logger = get_logger(__name__, self.config)
        
        # Initialize the extraction pipeline
        self.pipeline = ExtractionPipeline(self.config)
        
        # Initialize document processor
        self.document_processor = DocumentProcessor(self.config)
        
        # Initialize models
        self.table_detector = ProductionTableFormer(self.config)
        self.ocr_engine = AdvancedOCREngine(self.config)
        
        self.logger.logger.info("New Extraction Service initialized successfully")
    
    async def extract_tables_from_file(
        self, 
        file_path: str, 
        file_type: str = "pdf",
        confidence_threshold: float = 0.5,
        enable_ocr: bool = True,
        enable_multipage: bool = True,
        max_tables_per_page: int = 10,
        output_format: str = "json"
    ) -> Dict[str, Any]:
        """
        Extract tables from a file using the new extraction pipeline.
        
        Args:
            file_path: Path to the file to process
            file_type: Type of file (pdf, image, etc.)
            confidence_threshold: Minimum confidence for table detection
            enable_ocr: Whether to enable OCR processing
            enable_multipage: Whether to process all pages
            max_tables_per_page: Maximum number of tables per page
            output_format: Output format (json, csv, xlsx)
            
        Returns:
            Dictionary containing extraction results
        """
        try:
            self.logger.logger.info(f"Starting extraction for file: {file_path}")
            
            # Create extraction options
            extraction_options = ExtractionOptions(
                enable_ocr=enable_ocr,
                enable_multipage=enable_multipage,
                confidence_threshold=confidence_threshold,
                max_tables_per_page=max_tables_per_page,
                output_format=output_format,
                enable_quality_checks=True
            )
            
            # Extract tables using the new pipeline
            result = await self.pipeline.extract_tables(file_path, extraction_options)
            
            # Convert result to the expected format
            extraction_result = self._convert_result_to_dict(result)
            
            self.logger.logger.info(f"Extraction completed successfully. Found {len(result.tables)} tables.")
            
            return extraction_result
            
        except Exception as e:
            self.logger.logger.error(f"Extraction failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "tables": [],
                "processing_time": 0,
                "confidence_scores": {"overall": 0.0}
            }
    
    async def extract_tables_from_bytes(
        self,
        file_bytes: bytes,
        file_name: str,
        file_type: str = "pdf",
        confidence_threshold: float = 0.5,
        enable_ocr: bool = True,
        enable_multipage: bool = True,
        max_tables_per_page: int = 10,
        output_format: str = "json"
    ) -> Dict[str, Any]:
        """
        Extract tables from file bytes using the new extraction pipeline.
        
        Args:
            file_bytes: File content as bytes
            file_name: Name of the file
            file_type: Type of file (pdf, image, etc.)
            confidence_threshold: Minimum confidence for table detection
            enable_ocr: Whether to enable OCR processing
            enable_multipage: Whether to process all pages
            max_tables_per_page: Maximum number of tables per page
            output_format: Output format (json, csv, xlsx)
            
        Returns:
            Dictionary containing extraction results
        """
        try:
            # Create temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_type}") as temp_file:
                temp_file.write(file_bytes)
                temp_file_path = temp_file.name
            
            try:
                # Extract tables from the temporary file
                result = await self.extract_tables_from_file(
                    temp_file_path,
                    file_type,
                    confidence_threshold,
                    enable_ocr,
                    enable_multipage,
                    max_tables_per_page,
                    output_format
                )
                
                return result
                
            finally:
                # Clean up temporary file
                if os.path.exists(temp_file_path):
                    os.unlink(temp_file_path)
                    
        except Exception as e:
            self.logger.logger.error(f"Extraction from bytes failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "tables": [],
                "processing_time": 0,
                "confidence_scores": {"overall": 0.0}
            }
    
    def _convert_result_to_dict(self, result) -> Dict[str, Any]:
        """
        Convert the extraction result to a dictionary format compatible
        with the existing server structure.
        
        Args:
            result: Extraction result from the new pipeline
            
        Returns:
            Dictionary representation of the result
        """
        tables = []
        
        for table in result.tables:
            # Debug: Print the actual table structure
            print(f"🔍 DEBUG: Converting table {len(tables)}")
            print(f"  - Table type: {type(table)}")
            print(f"  - Table keys: {list(table.keys()) if isinstance(table, dict) else 'Not a dict'}")
            
            if isinstance(table, dict):
                # Table is already a dictionary
                table_dict = {
                    "id": table.get("id", str(len(tables))),
                    "page_number": table.get("page_number", 1),
                    "bbox": table.get("bbox", [0, 0, 0, 0]),
                    "confidence": table.get("confidence", 0.0),
                    "data": table.get("data", []),
                    "headers": table.get("headers", []),
                    "rows": table.get("rows", []),
                    "table_type": table.get("table_type", "unknown"),
                    "name": table.get("name", f"Table_{len(tables)+1}")
                }
            else:
                # Table is an object, try to access attributes
                table_dict = {
                    "id": getattr(table, 'id', str(len(tables))),
                    "page_number": getattr(table, 'page_number', 1),
                    "bbox": getattr(table, 'bbox', [0, 0, 0, 0]),
                    "confidence": getattr(table, 'confidence', 0.0),
                    "data": getattr(table, 'data', []),
                    "headers": getattr(table, 'headers', []),
                    "rows": getattr(table, 'rows', []),
                    "table_type": getattr(table, 'table_type', "unknown"),
                    "name": getattr(table, 'name', f"Table_{len(tables)+1}")
                }
            
            # Debug: Print the extracted data
            print(f"  - Headers: {table_dict['headers']}")
            print(f"  - Rows count: {len(table_dict['rows'])}")
            if table_dict['rows']:
                print(f"  - First row: {table_dict['rows'][0]}")
            
            tables.append(table_dict)
        
        return {
            "success": True,
            "tables": tables,
            "processing_time": getattr(result, 'processing_time', 0),
            "confidence_scores": getattr(result, 'confidence_scores', {"overall": 0.0}),
            "warnings": getattr(result, 'warnings', []),
            "errors": getattr(result, 'errors', []),
            "total_tables": len(tables),
            "extraction_method": "new_advanced_pipeline"
        }
    
    async def get_extraction_status(self) -> Dict[str, Any]:
        """
        Get the status of the extraction service.
        
        Returns:
            Dictionary containing service status information
        """
        return {
            "service": "new_extraction_service",
            "status": "active",
            "version": "1.0.0",
            "models_loaded": {
                "table_detector": self.table_detector is not None,
                "ocr_engine": self.ocr_engine is not None
            },
            "config": {
                "confidence_threshold": getattr(self.config.processing, 'confidence_threshold', 0.5),
                "enable_ocr": getattr(self.config.processing, 'enable_ocr', True),
                "enable_multipage": getattr(self.config.processing, 'enable_multipage', True)
            }
        }
    
    async def validate_file(self, file_path: str) -> Dict[str, Any]:
        """
        Validate if a file can be processed by the extraction service.
        
        Args:
            file_path: Path to the file to validate
            
        Returns:
            Dictionary containing validation results
        """
        try:
            # Check if file exists
            if not os.path.exists(file_path):
                return {
                    "valid": False,
                    "error": "File does not exist",
                    "supported_formats": ["pdf", "png", "jpg", "jpeg", "tiff", "tif", "docx"]
                }
            
            # Check file extension
            file_ext = Path(file_path).suffix.lower()
            supported_extensions = {'.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.docx'}
            
            if file_ext not in supported_extensions:
                return {
                    "valid": False,
                    "error": f"Unsupported file format: {file_ext}",
                    "supported_formats": list(supported_extensions)
                }
            
            # Check file size (max 50MB)
            file_size = os.path.getsize(file_path)
            max_size = 50 * 1024 * 1024  # 50MB
            
            if file_size > max_size:
                return {
                    "valid": False,
                    "error": f"File too large: {file_size} bytes (max: {max_size} bytes)",
                    "file_size": file_size,
                    "max_size": max_size
                }
            
            return {
                "valid": True,
                "file_size": file_size,
                "file_type": file_ext,
                "supported_formats": list(supported_extensions)
            }
            
        except Exception as e:
            return {
                "valid": False,
                "error": str(e)
            }


# Create a global instance for easy access
_new_extraction_service = None

def get_new_extraction_service(config_path: Optional[str] = None) -> NewExtractionService:
    """
    Get or create a global instance of the new extraction service.
    
    Args:
        config_path: Optional path to configuration file
        
    Returns:
        NewExtractionService instance
    """
    global _new_extraction_service
    
    if _new_extraction_service is None:
        _new_extraction_service = NewExtractionService(config_path)
    
    return _new_extraction_service