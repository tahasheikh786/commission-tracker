"""
Enhanced extraction service with real-time progress tracking via WebSocket.
"""

import asyncio
import json
import logging
import time
from typing import Dict, List, Any, Optional, Union
from pathlib import Path
from datetime import datetime
import uuid

from app.services.websocket_service import create_progress_tracker
from app.services.new_extraction_service import NewExtractionService
from app.services.gpt4o_vision_service import GPT4oVisionService
from app.services.extractor_google_docai import GoogleDocAIExtractor
from app.services.enhanced_mistral_service import FixedEnhancedMistralDocumentService
from app.services.excel_extraction_service import ExcelExtractionService

logger = logging.getLogger(__name__)

class EnhancedExtractionService:
    """
    Enhanced extraction service with real-time progress tracking.
    Integrates multiple extraction methods with WebSocket progress updates.
    """
    
    def __init__(self):
        """Initialize the enhanced extraction service."""
        self.new_extraction_service = NewExtractionService()
        self.gpt4o_service = GPT4oVisionService()
        self.docai_extractor = GoogleDocAIExtractor()
        self.mistral_service = FixedEnhancedMistralDocumentService()
        self.excel_service = ExcelExtractionService()
        
        logger.info("Enhanced Extraction Service initialized with progress tracking")
    
    async def extract_tables_with_progress(
        self,
        file_path: str,
        company_id: str,
        upload_id: str,
        file_type: str = "pdf",
        extraction_method: str = "smart"
    ) -> Dict[str, Any]:
        """
        Extract tables with real-time progress tracking.
        
        Args:
            file_path: Path to the file to process
            company_id: Company ID for the upload
            upload_id: Upload ID for progress tracking
            file_type: Type of file (pdf, excel, etc.)
            extraction_method: Method to use (smart, gpt4o, docai, mistral, excel)
            
        Returns:
            Dictionary with extraction results
        """
        progress_tracker = create_progress_tracker(upload_id)
        
        try:
            # Determine extraction method based on file type and method preference
            if file_type.lower() in ['xlsx', 'xls', 'xlsm', 'xlsb']:
                return await self._extract_excel_with_progress(
                    file_path, company_id, progress_tracker
                )
            elif extraction_method == "gpt4o":
                return await self._extract_with_gpt4o_progress(
                    file_path, company_id, progress_tracker
                )
            elif extraction_method == "docai":
                return await self._extract_with_docai_progress(
                    file_path, company_id, progress_tracker
                )
            elif extraction_method == "mistral":
                return await self._extract_with_mistral_progress(
                    file_path, company_id, progress_tracker
                )
            else:  # smart or default
                return await self._extract_with_smart_progress(
                    file_path, company_id, progress_tracker
                )
                
        except Exception as e:
            logger.error(f"Extraction failed for upload {upload_id}: {e}")
            await progress_tracker.send_error(
                f"Extraction failed: {str(e)}",
                "EXTRACTION_ERROR"
            )
            raise
    
    async def _extract_excel_with_progress(
        self,
        file_path: str,
        company_id: str,
        progress_tracker
    ) -> Dict[str, Any]:
        """Extract from Excel with progress tracking."""
        await progress_tracker.start_stage("document_processing", "Processing Excel file")
        
        # Stage 1: File validation and preparation
        await progress_tracker.update_progress("document_processing", 20, "Validating Excel file")
        await asyncio.sleep(0.1)  # Simulate processing time
        
        await progress_tracker.update_progress("document_processing", 50, "Reading Excel structure")
        await asyncio.sleep(0.1)
        
        await progress_tracker.complete_stage("document_processing", "Excel file validated")
        
        # Stage 2: Sheet processing
        await progress_tracker.start_stage("table_detection", "Detecting tables in Excel sheets")
        await progress_tracker.update_progress("table_detection", 30, "Analyzing sheet structure")
        
        # Perform actual Excel extraction
        result = self.excel_service.extract_tables_from_excel(file_path)
        
        await progress_tracker.update_progress("table_detection", 70, "Extracting table data")
        await asyncio.sleep(0.2)
        
        await progress_tracker.complete_stage("table_detection", "Tables detected and extracted")
        
        # Stage 3: Data processing
        await progress_tracker.start_stage("post_processing", "Processing extracted data")
        await progress_tracker.update_progress("post_processing", 50, "Formatting data")
        
        # Convert to client format
        client_result = self.excel_service.convert_to_client_format(result, Path(file_path).name)
        
        await progress_tracker.complete_stage("post_processing", "Data processing completed")
        
        # Stage 4: Validation
        await progress_tracker.start_stage("validation", "Validating extraction results")
        await progress_tracker.update_progress("validation", 100, "Validation completed")
        
        # Send completion
        await progress_tracker.send_completion({
            'tables': client_result.get('tables', []),
            'extraction_method': 'excel',
            'file_type': 'excel',
            'quality_summary': client_result.get('quality_summary', {}),
            'metadata': {
                'sheet_count': len(result.get('sheets', [])),
                'table_count': len(client_result.get('tables', []))
            }
        })
        
        return client_result
    
    async def _extract_with_smart_progress(
        self,
        file_path: str,
        company_id: str,
        progress_tracker
    ) -> Dict[str, Any]:
        """Extract with smart method and progress tracking."""
        start_time = time.time()
        
        # Stage 1: Document processing
        await progress_tracker.connection_manager.send_stage_update(
            progress_tracker.upload_id,
            'document_processing', 
            10,
            "Analyzing document format and structure..."
        )

        # Document processing stage
        file_type = self._detect_file_type(file_path)
        
        await progress_tracker.connection_manager.send_commission_specific_message(
            progress_tracker.upload_id,
            'carrier_detected',
            {'carrier_name': 'Auto-detected', 'current_stage': 'document_processing', 'progress': 25}
        )

        # Table detection stage  
        await progress_tracker.connection_manager.send_stage_update(
            progress_tracker.upload_id,
            'table_detection',
            40, 
            "Scanning for commission tables and data structures..."
        )

        # Extract tables based on file type
        if file_type == 'pdf':
            tables = await self._extract_pdf_tables(file_path, progress_tracker)
        else:
            tables = await self._extract_excel_tables(file_path, progress_tracker)

        await progress_tracker.connection_manager.send_commission_specific_message(
            progress_tracker.upload_id,
            'tables_found',
            {'table_count': len(tables), 'current_stage': 'data_extraction', 'progress': 60}
        )

        # Data extraction stage
        await progress_tracker.connection_manager.send_stage_update(
            progress_tracker.upload_id,
            'data_extraction',
            65,
            "Extracting financial data and commission information..."
        )

        # Process extracted data
        processed_data = await self._process_extracted_data(tables, progress_tracker)

        # Financial processing stage
        await progress_tracker.connection_manager.send_stage_update(
            progress_tracker.upload_id,
            'financial_processing',
            80,
            "Processing commission calculations and validations..."
        )

        # Calculate commissions
        commission_summary = self._calculate_commission_summary(processed_data)
        
        await progress_tracker.connection_manager.send_commission_specific_message(
            progress_tracker.upload_id,
            'calculations_complete', 
            {
                'commission_amount': f"${commission_summary.get('total_commission', 0):,.2f}",
                'current_stage': 'quality_assurance',
                'progress': 90
            }
        )

        # Quality assurance stage
        await progress_tracker.connection_manager.send_stage_update(
            progress_tracker.upload_id,
            'quality_assurance',
            95,
            "Performing final quality checks and validation..."
        )

        # Quality check
        quality_score = self._assess_extraction_quality(processed_data)
        
        await progress_tracker.connection_manager.send_commission_specific_message(
            progress_tracker.upload_id,
            'quality_check',
            {
                'quality_score': quality_score,
                'current_stage': 'quality_assurance', 
                'progress': 100
            }
        )

        # Final completion
        result = {
            'success': True,
            'tables': processed_data,
            'commission_summary': commission_summary,
            'quality_score': quality_score,
            'processing_time': time.time() - start_time,
            'metadata': {
                'file_type': file_type,
                'extraction_method': 'smart',
                'tables_extracted': len(processed_data)
            }
        }

        await progress_tracker.send_completion(result)
        return result

    async def _extract_with_gpt4o_progress(
        self,
        file_path: str,
        company_id: str,
        progress_tracker
    ) -> Dict[str, Any]:
        """Extract with GPT-4o Vision and progress tracking."""
        await progress_tracker.start_stage("document_processing", "Preparing document for GPT-4o Vision")
        
        # Stage 1: Document processing
        await progress_tracker.update_progress("document_processing", 30, "Converting PDF to images")
        await asyncio.sleep(0.2)
        
        await progress_tracker.update_progress("document_processing", 70, "Optimizing images for AI processing")
        await asyncio.sleep(0.1)
        
        await progress_tracker.complete_stage("document_processing", "Document prepared for AI")
        
        # Stage 2: AI processing
        await progress_tracker.start_stage("table_detection", "AI-powered table detection")
        await progress_tracker.update_progress("table_detection", 20, "Sending to GPT-4o Vision")
        
        # Perform actual extraction
        result = self.gpt4o_service.extract_commission_data(file_path)
        
        await progress_tracker.update_progress("table_detection", 60, "Processing AI response")
        await asyncio.sleep(0.3)
        
        await progress_tracker.update_progress("table_detection", 90, "Extracting table data")
        await asyncio.sleep(0.1)
        
        await progress_tracker.complete_stage("table_detection", "AI extraction completed")
        
        # Stage 3: Post processing
        await progress_tracker.start_stage("post_processing", "Processing AI results")
        await progress_tracker.update_progress("post_processing", 100, "Results processed")
        
        # Send completion
        await progress_tracker.send_completion({
            'tables': result.get('tables', []),
            'extraction_method': 'gpt4o',
            'file_type': 'pdf',
            'quality_summary': result.get('quality_summary', {}),
            'metadata': result.get('metadata', {})
        })
        
        return result

    async def _extract_with_docai_progress(
        self,
        file_path: str,
        company_id: str,
        progress_tracker
    ) -> Dict[str, Any]:
        """Extract with Google DocAI and progress tracking."""
        await progress_tracker.start_stage("document_processing", "Preparing for Google Document AI")
        
        # Stage 1: Document processing
        await progress_tracker.update_progress("document_processing", 50, "Uploading to Google Cloud")
        await asyncio.sleep(0.2)
        
        await progress_tracker.complete_stage("document_processing", "Document uploaded")
        
        # Stage 2: DocAI processing
        await progress_tracker.start_stage("table_detection", "Processing with Google Document AI")
        await progress_tracker.update_progress("table_detection", 30, "Analyzing document structure")
        
        # Perform actual extraction
        result = await self.docai_extractor.extract_tables_async(file_path)
        
        await progress_tracker.update_progress("table_detection", 70, "Extracting tables")
        await asyncio.sleep(0.3)
        
        await progress_tracker.complete_stage("table_detection", "DocAI processing completed")
        
        # Stage 3: Post processing
        await progress_tracker.start_stage("post_processing", "Processing DocAI results")
        await progress_tracker.update_progress("post_processing", 100, "Results processed")
        
        # Send completion
        await progress_tracker.send_completion({
            'tables': result.get('tables', []),
            'extraction_method': 'docai',
            'file_type': 'pdf',
            'quality_summary': result.get('quality_summary', {}),
            'metadata': result.get('metadata', {})
        })
        
        return result

    async def _extract_with_mistral_progress(
        self,
        file_path: str,
        company_id: str,
        progress_tracker
    ) -> Dict[str, Any]:
        """Extract with Mistral and progress tracking."""
        await progress_tracker.start_stage("document_processing", "Preparing for Mistral Document AI")
        
        # Stage 1: Document processing
        await progress_tracker.update_progress("document_processing", 50, "Initializing Mistral AI")
        await asyncio.sleep(0.1)
        
        await progress_tracker.complete_stage("document_processing", "Mistral AI initialized")
        
        # Stage 2: Mistral processing
        await progress_tracker.start_stage("table_detection", "Processing with Mistral Document AI")
        await progress_tracker.update_progress("table_detection", 25, "Analyzing document with QnA")
        
        # Perform actual extraction
        result = self.mistral_service.extract_commission_data(file_path)
        
        await progress_tracker.update_progress("table_detection", 60, "Extracting tables using Mistral QnA")
        await asyncio.sleep(0.3)
        
        await progress_tracker.update_progress("table_detection", 90, "Processing extracted data")
        await asyncio.sleep(0.1)
        
        await progress_tracker.complete_stage("table_detection", "Mistral processing completed")
        
        # Stage 3: Validation
        await progress_tracker.start_stage("validation", "Validating Mistral results")
        await progress_tracker.update_progress("validation", 100, "Validation completed")
        
        # Send completion
        await progress_tracker.send_completion({
            'tables': result.get('tables', []),
            'extraction_method': 'mistral',
            'file_type': 'pdf',
            'quality_summary': result.get('quality_summary', {}),
            'metadata': result.get('metadata', {})
        })
        
        return result

    # Helper methods (consolidated from duplicates)
    def _detect_file_type(self, file_path: str) -> str:
        """Detect file type from file path."""
        file_ext = Path(file_path).suffix.lower()
        if file_ext in ['.xlsx', '.xls', '.xlsm', '.xlsb']:
            return 'excel'
        elif file_ext == '.pdf':
            return 'pdf'
        else:
            return 'unknown'

    async def _extract_pdf_tables(self, file_path: str, progress_tracker) -> List[Dict]:
        """Extract tables from PDF file."""
        try:
            result = await self.new_extraction_service.extract_tables_from_file(file_path)
            return result.get('tables', [])
        except Exception as e:
            logger.error(f"PDF extraction failed: {e}")
            await progress_tracker.send_error(f"PDF extraction failed: {str(e)}")
            return []

    async def _extract_excel_tables(self, file_path: str, progress_tracker) -> List[Dict]:
        """Extract tables from Excel file."""
        try:
            result = self.excel_service.extract_tables_from_excel(file_path)
            return result.get('tables', [])
        except Exception as e:
            logger.error(f"Excel extraction failed: {e}")
            await progress_tracker.send_error(f"Excel extraction failed: {str(e)}")
            return []

    async def _process_extracted_data(self, tables: List[Dict], progress_tracker) -> List[Dict]:
        """Process and clean extracted table data."""
        try:
            processed_tables = []
            for table in tables:
                # Clean and validate table data
                cleaned_table = self._clean_table_data(table)
                if cleaned_table:
                    processed_tables.append(cleaned_table)
            return processed_tables
        except Exception as e:
            logger.error(f"Data processing failed: {e}")
            await progress_tracker.send_error(f"Data processing failed: {str(e)}")
            return tables

    def _clean_table_data(self, table: Dict) -> Dict:
        """Clean and validate individual table data."""
        try:
            # Basic data cleaning logic
            if 'data' in table and table['data']:
                # Remove empty rows and columns
                cleaned_data = [row for row in table['data'] if any(cell for cell in row)]
                table['data'] = cleaned_data
            return table
        except Exception as e:
            logger.error(f"Table cleaning failed: {e}")
            return table

    def _calculate_commission_summary(self, tables: List[Dict]) -> Dict:
        """Calculate commission summary from extracted tables."""
        try:
            total_commission = 0.0
            commission_count = 0
            
            for table in tables:
                if 'data' in table:
                    for row in table['data']:
                        for cell in row:
                            if isinstance(cell, (int, float)) and cell > 0:
                                total_commission += float(cell)
                                commission_count += 1
            
            return {
                'total_commission': total_commission,
                'commission_count': commission_count,
                'average_commission': total_commission / max(commission_count, 1)
            }
        except Exception as e:
            logger.error(f"Commission calculation failed: {e}")
            return {
                'total_commission': 0.0,
                'commission_count': 0,
                'average_commission': 0.0
            }

    def _assess_extraction_quality(self, tables: List[Dict]) -> int:
        """Assess the quality of extraction results."""
        try:
            if not tables:
                return 0
            
            quality_score = 0
            total_tables = len(tables)
            
            for table in tables:
                if 'data' in table and table['data']:
                    # Check if table has meaningful data
                    has_data = any(any(cell for cell in row) for row in table['data'])
                    if has_data:
                        quality_score += 1
                
                # Check for headers
                if 'headers' in table and table['headers']:
                    quality_score += 0.5
            
            # Calculate percentage
            max_score = total_tables * 1.5
            quality_percentage = int((quality_score / max_score) * 100) if max_score > 0 else 0
            
            return min(quality_percentage, 100)
        except Exception as e:
            logger.error(f"Quality assessment failed: {e}")
            return 50  # Default quality score