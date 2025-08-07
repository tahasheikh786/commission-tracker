import os
import sys
import json
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from .extraction_pipeline import TableExtractionPipeline
from .format_learning_service import FormatLearningService
from app.db import crud
from app.utils.db_retry import with_db_retry

class EnhancedExtractionPipeline(TableExtractionPipeline):
    """
    Enhanced table extraction pipeline with format learning capabilities.
    Extends the base extraction pipeline with intelligent format matching and learning.
    """
    
    def __init__(self):
        super().__init__()
        self.format_learning_service = FormatLearningService()
    
    async def extract_tables_with_format_learning(
        self, 
        pdf_path: str, 
        company_id: str,
        db: AsyncSession,
        output_format: str = "json", 
        force_extractor: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract tables with format learning capabilities.
        
        Args:
            pdf_path: Path to the PDF file
            company_id: Company ID for format learning
            db: Database session
            output_format: "json", "csv", or "excel"
            force_extractor: Force specific extractor
        
        Returns:
            Dictionary containing extracted tables and format learning metadata
        """
        # First, perform normal extraction
        extraction_result = self.extract_tables(pdf_path, output_format, force_extractor)
        
        if not extraction_result.get("success"):
            return extraction_result
        
        # Add format learning analysis
        format_learning_result = await self._analyze_with_format_learning(
            extraction_result, company_id, db
        )
        
        # Merge results
        extraction_result.update(format_learning_result)
        
        return extraction_result
    
    async def _analyze_with_format_learning(
        self, 
        extraction_result: Dict[str, Any], 
        company_id: str, 
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Analyze extracted tables with format learning.
        """
        format_learning_metadata = {
            "format_learning": {
                "found_matching_format": False,
                "match_score": 0.0,
                "learned_format": None,
                "validation_results": None,
                "suggested_mapping": None,
                "confidence_score": 0
            }
        }
        
        try:
            tables = extraction_result.get("tables", [])
            if not tables:
                return format_learning_metadata
            
            # Analyze each table for format matching
            for table in tables:
                headers = table.get("header", [])
                rows = table.get("rows", [])
                
                if not headers or not rows:
                    continue
                
                # Analyze table structure
                table_structure = self.format_learning_service.analyze_table_structure(rows, headers)
                
                # Find matching format
                learned_format, match_score = await self.format_learning_service.find_matching_format(
                    db=db,
                    company_id=company_id,
                    headers=headers,
                    table_structure=table_structure
                )
                
                if learned_format and match_score > 0.8:  # High confidence threshold
                    format_learning_metadata["format_learning"].update({
                        "found_matching_format": True,
                        "match_score": match_score,
                        "learned_format": learned_format,
                        "suggested_mapping": learned_format.get("field_mapping", {}),
                        "confidence_score": learned_format.get("confidence_score", 0)
                    })
                    
                    # Validate data against learned format
                    validation_results = self.format_learning_service.validate_data_against_learned_format(
                        table_data=rows,
                        headers=headers,
                        learned_format=learned_format
                    )
                    
                    format_learning_metadata["format_learning"]["validation_results"] = validation_results
                    
                    # Add suggestions to the response
                    format_learning_metadata["format_learning"]["suggestions"] = self._generate_suggestions(
                        validation_results, learned_format
                    )
                    
                    break  # Use the first matching table
            
        except Exception as e:
            print(f"Error in format learning analysis: {e}")
            format_learning_metadata["format_learning"]["error"] = str(e)
        
        return format_learning_metadata
    
    def _generate_suggestions(self, validation_results: Dict[str, Any], learned_format: Dict[str, Any]) -> List[str]:
        """
        Generate suggestions based on validation results.
        """
        suggestions = []
        
        if validation_results.get("overall_score", 0) > 0.9:
            suggestions.append("High confidence match found. Consider using the suggested field mapping.")
        
        if validation_results.get("overall_score", 0) < 0.7:
            suggestions.append("Low confidence match. Please review the field mapping carefully.")
        
        # Check for data type mismatches
        data_type_validation = validation_results.get("data_type_validation", {})
        for column, validation in data_type_validation.items():
            if not validation.get("match", True):
                suggestions.append(
                    f"Column '{column}' has unexpected data type. "
                    f"Expected: {validation['expected']}, Found: {validation['actual']}"
                )
        
        # Check for warnings
        warnings = validation_results.get("warnings", [])
        suggestions.extend(warnings)
        
        return suggestions
    
    async def apply_learned_mapping(
        self, 
        tables: List[Dict[str, Any]], 
        learned_format: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Apply learned field mapping to extracted tables.
        """
        if not learned_format or "field_mapping" not in learned_format:
            return tables
        
        field_mapping = learned_format["field_mapping"]
        mapped_tables = []
        
        for table in tables:
            headers = table.get("header", [])
            rows = table.get("rows", [])
            
            if not headers or not rows:
                mapped_tables.append(table)
                continue
            
            # Create reverse mapping (column_name -> field_name)
            reverse_mapping = {v: k for k, v in field_mapping.items()}
            
            # Map headers to field names
            mapped_headers = []
            for header in headers:
                mapped_headers.append(reverse_mapping.get(header, header))
            
            # Create mapped table
            mapped_table = {
                **table,
                "header": mapped_headers,
                "original_header": headers,
                "applied_mapping": field_mapping
            }
            
            mapped_tables.append(mapped_table)
        
        return mapped_tables
    
    async def extract_and_learn(
        self, 
        pdf_path: str, 
        company_id: str,
        db: AsyncSession,
        table_data: List[List[str]],
        headers: List[str],
        field_mapping: Dict[str, str],
        output_format: str = "json", 
        force_extractor: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract tables and learn from the processed data.
        """
        # Perform extraction
        extraction_result = await self.extract_tables_with_format_learning(
            pdf_path, company_id, db, output_format, force_extractor
        )
        
        if not extraction_result.get("success"):
            return extraction_result
        
        # Learn from the processed data
        try:
            await self.format_learning_service.learn_from_processed_file(
                db=db,
                company_id=company_id,
                table_data=table_data,
                headers=headers,
                field_mapping=field_mapping,
                confidence_score=85  # Higher confidence for user-processed data
            )
            
            extraction_result["format_learning"]["learning_success"] = True
            extraction_result["format_learning"]["learning_message"] = "Format learned successfully"
            
        except Exception as e:
            extraction_result["format_learning"]["learning_success"] = False
            extraction_result["format_learning"]["learning_error"] = str(e)
        
        return extraction_result
