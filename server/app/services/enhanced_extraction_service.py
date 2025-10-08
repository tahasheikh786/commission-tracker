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
from app.services.mistral import MistralDocumentAIService
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
        self.mistral_service = MistralDocumentAIService()
        self.excel_service = ExcelExtractionService()
        
        logger.info("Enhanced Extraction Service initialized with progress tracking")
    
    async def extract_tables_with_progress(
        self,
        file_path: str,
        company_id: str,
        upload_id: str,
        file_type: str = "pdf",
        extraction_method: str = "smart",
        upload_id_uuid: str = None
    ) -> Dict[str, Any]:
        """
        Extract tables with real-time progress tracking.
        
        Args:
            file_path: Path to the file to process
            company_id: Company ID for the upload
            upload_id: Upload ID for progress tracking (temporary ID for WebSocket)
            file_type: Type of file (pdf, excel, etc.)
            upload_id_uuid: Actual UUID from database (optional, for WebSocket completion)
            extraction_method: Method to use (smart, gpt4o, docai, mistral, excel)
            
        Returns:
            Dictionary with extraction results
        """
        progress_tracker = create_progress_tracker(upload_id)
        
        try:
            # Determine extraction method based on file type and method preference
            if file_type.lower() in ['xlsx', 'xls', 'xlsm', 'xlsb']:
                return await self._extract_excel_with_progress(
                    file_path, company_id, progress_tracker, upload_id_uuid
                )
            elif extraction_method == "gpt4o":
                return await self._extract_with_gpt4o_progress(
                    file_path, company_id, progress_tracker, upload_id_uuid
                )
            elif extraction_method == "docai":
                return await self._extract_with_docai_progress(
                    file_path, company_id, progress_tracker, upload_id_uuid
                )
            elif extraction_method == "mistral":
                return await self._extract_with_mistral_progress(
                    file_path, company_id, progress_tracker, upload_id_uuid
                )
            else:  # smart or default
                return await self._extract_with_smart_progress(
                    file_path, company_id, progress_tracker, upload_id_uuid
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
        progress_tracker,
        upload_id_uuid: str = None
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
        
        # Send completion including UUID
        await progress_tracker.send_completion({
            'upload_id': upload_id_uuid,  # Include the UUID from database
            'extraction_id': upload_id_uuid,  # Also include as extraction_id
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
        progress_tracker,
        upload_id_uuid: str = None
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
        
        # NEW: Extract carrier name and statement date using GPT from first page
        carrier_info = None
        date_info = None
        gpt_extraction_success = False
        
        if file_type == 'pdf':
            try:
                # Stage: GPT Metadata Extraction
                await progress_tracker.connection_manager.send_stage_update(
                    progress_tracker.upload_id,
                    'metadata_extraction',
                    15,
                    "Extracting carrier name and statement date with GPT-4..."
                )
                
                logger.info(f"Starting GPT metadata extraction for upload {progress_tracker.upload_id}")
                
                # Extract metadata using GPT from first page
                gpt_metadata = await self._extract_metadata_with_gpt(file_path)
                
                if gpt_metadata.get('success'):
                    carrier_info = {
                        'carrier_name': gpt_metadata.get('carrier_name'),
                        'carrier_confidence': gpt_metadata.get('carrier_confidence', 0.9)
                    }
                    date_info = {
                        'document_date': gpt_metadata.get('statement_date'),
                        'date_confidence': gpt_metadata.get('date_confidence', 0.9)
                    }
                    gpt_extraction_success = True
                    
                    logger.info(f"GPT extracted: carrier={carrier_info.get('carrier_name')}, date={date_info.get('document_date')}")
                    
                    # Send carrier detected message with actual GPT results
                    await progress_tracker.connection_manager.send_commission_specific_message(
                        progress_tracker.upload_id,
                        'carrier_detected',
                        {
                            'carrier_name': carrier_info.get('carrier_name', 'Unknown'), 
                            'current_stage': 'metadata_extraction', 
                            'progress': 25
                        }
                    )
                else:
                    logger.warning(f"GPT metadata extraction returned no success: {gpt_metadata.get('error')}")
                    
            except Exception as e:
                logger.warning(f"GPT metadata extraction failed: {e}")
                # Continue with extraction even if GPT fails
        
        # If GPT didn't extract carrier, show placeholder
        if not gpt_extraction_success:
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

        # Final completion including UUID
        result = {
            'success': True,
            'upload_id': upload_id_uuid,  # Include the UUID from database
            'extraction_id': upload_id_uuid,  # Also include as extraction_id
            'tables': processed_data,
            'commission_summary': commission_summary,
            'quality_score': quality_score,
            'processing_time': time.time() - start_time,
            'metadata': {
                'file_type': file_type,
                'extraction_method': 'smart',
                'tables_extracted': len(processed_data)
            },
            'document_metadata': {
                'carrier_name': carrier_info.get('carrier_name') if carrier_info else None,
                'carrier_confidence': carrier_info.get('carrier_confidence') if carrier_info else 0.0,
                'document_date': date_info.get('document_date') if date_info else None,
                'date_confidence': date_info.get('date_confidence') if date_info else 0.0
            }
        }

        await progress_tracker.send_completion(result)
        return result

    async def _extract_with_gpt4o_progress(
        self,
        file_path: str,
        company_id: str,
        progress_tracker,
        upload_id_uuid: str = None
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
        
        # Send completion including UUID
        await progress_tracker.send_completion({
            'upload_id': upload_id_uuid,  # Include the UUID from database
            'extraction_id': upload_id_uuid,  # Also include as extraction_id
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
        progress_tracker,
        upload_id_uuid: str = None
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
        
        # Send completion including UUID
        await progress_tracker.send_completion({
            'upload_id': upload_id_uuid,  # Include the UUID from database
            'extraction_id': upload_id_uuid,  # Also include as extraction_id
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
        progress_tracker,
        upload_id_uuid: str = None
    ) -> Dict[str, Any]:
        """Extract with Mistral and progress tracking."""
        await progress_tracker.start_stage("document_processing", "Preparing for Mistral Document AI")
        
        # Stage 1: Document processing
        await progress_tracker.update_progress("document_processing", 50, "Initializing Mistral AI")
        await asyncio.sleep(0.1)
        
        await progress_tracker.complete_stage("document_processing", "Mistral AI initialized")
        
        # NEW: Extract carrier name and statement date using GPT from first page
        carrier_info = None
        date_info = None
        gpt_extraction_success = False
        
        try:
            # Stage: GPT Metadata Extraction
            await progress_tracker.connection_manager.send_stage_update(
                progress_tracker.upload_id,
                'metadata_extraction',
                15,
                "Extracting carrier name and statement date with GPT-4..."
            )
            
            logger.info(f"Starting GPT metadata extraction for upload {progress_tracker.upload_id}")
            
            # Extract metadata using GPT from first page
            gpt_metadata = await self._extract_metadata_with_gpt(file_path)
            
            if gpt_metadata.get('success'):
                carrier_info = {
                    'carrier_name': gpt_metadata.get('carrier_name'),
                    'carrier_confidence': gpt_metadata.get('carrier_confidence', 0.9)
                }
                date_info = {
                    'document_date': gpt_metadata.get('statement_date'),
                    'date_confidence': gpt_metadata.get('date_confidence', 0.9)
                }
                gpt_extraction_success = True
                
                logger.info(f"GPT extracted: carrier={carrier_info.get('carrier_name')}, date={date_info.get('document_date')}")
                
                # Send carrier detected message with actual GPT results
                await progress_tracker.connection_manager.send_commission_specific_message(
                    progress_tracker.upload_id,
                    'carrier_detected',
                    {
                        'carrier_name': carrier_info.get('carrier_name', 'Unknown'), 
                        'current_stage': 'metadata_extraction', 
                        'progress': 25
                    }
                )
            else:
                logger.warning(f"GPT metadata extraction returned no success: {gpt_metadata.get('error')}")
                
        except Exception as e:
            logger.warning(f"GPT metadata extraction failed: {e}")
            # Continue with extraction even if GPT fails
        
        # Stage 2: Mistral processing
        await progress_tracker.start_stage("table_detection", "Processing with Mistral Document AI")
        await progress_tracker.update_progress("table_detection", 25, "Analyzing document with QnA")
        
        # Perform actual extraction using intelligent method
        try:
            result = await self.mistral_service.extract_commission_data_intelligently(file_path)
        except Exception as e:
            logger.warning(f"Intelligent extraction failed, falling back to legacy method: {e}")
            result = self.mistral_service.extract_commission_data(file_path)
        
        await progress_tracker.update_progress("table_detection", 60, "Extracting tables using Mistral QnA")
        await asyncio.sleep(0.3)
        
        # Apply table merging for identical headers
        if result.get('success') and result.get('tables'):
            from app.services.extraction_utils import stitch_multipage_tables
            original_tables = result.get('tables', [])
            merged_tables = stitch_multipage_tables(original_tables)
            result['tables'] = merged_tables
            logger.info(f"Mistral: Merged {len(original_tables)} tables into {len(merged_tables)} tables")
        
        await progress_tracker.update_progress("table_detection", 90, "Processing extracted data")
        await asyncio.sleep(0.1)
        
        await progress_tracker.complete_stage("table_detection", "Mistral processing completed")
        
        # Stage 3: Validation
        await progress_tracker.start_stage("validation", "Validating Mistral results")
        await progress_tracker.update_progress("validation", 100, "Validation completed")
        
        # Merge GPT metadata with Mistral result
        document_metadata = result.get('document_metadata', {})
        
        # If GPT extraction was successful, override with GPT values
        if gpt_extraction_success and carrier_info:
            document_metadata['carrier_name'] = carrier_info.get('carrier_name')
            document_metadata['carrier_confidence'] = carrier_info.get('carrier_confidence', 0.9)
            document_metadata['carrier_source'] = 'gpt4o_vision'
        
        if gpt_extraction_success and date_info:
            document_metadata['statement_date'] = date_info.get('document_date')
            document_metadata['date_confidence'] = date_info.get('date_confidence', 0.9)
            document_metadata['date_source'] = 'gpt4o_vision'
        
        # Update result with merged metadata
        result['document_metadata'] = document_metadata
        result['extracted_carrier'] = document_metadata.get('carrier_name')
        result['extracted_date'] = document_metadata.get('statement_date')
        
        # Send completion with all fields from result including UUID
        await progress_tracker.send_completion({
            'upload_id': upload_id_uuid,  # Include the UUID from database
            'extraction_id': upload_id_uuid,  # Also include as extraction_id for backward compatibility
            'tables': result.get('tables', []),
            'extraction_method': 'mistral',
            'file_type': 'pdf',
            'quality_summary': result.get('quality_summary', {}),
            'metadata': result.get('metadata', {}),
            'extraction_config': result.get('extraction_config', {}),
            'document_metadata': document_metadata,
            'extracted_carrier': document_metadata.get('carrier_name'),
            'extracted_date': document_metadata.get('statement_date'),
            'gcs_url': result.get('gcs_url'),
            'gcs_key': result.get('gcs_key'),
            'extraction_intelligence': result.get('extraction_intelligence', {}),
            'extraction_quality': result.get('extraction_quality', {})
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

    async def _extract_metadata_with_gpt(self, file_path: str) -> Dict[str, Any]:
        """
        Extract carrier name and statement date from the first page of PDF using GPT-4.
        
        Args:
            file_path: Path to the PDF file
            
        Returns:
            Dictionary with carrier_name, statement_date, and confidence scores
        """
        try:
            import fitz  # PyMuPDF
            import base64
            from io import BytesIO
            from PIL import Image
            
            logger.info(f"Extracting metadata with GPT from first page of {file_path}")
            
            # Open PDF and get first page
            doc = fitz.open(file_path)
            if len(doc) == 0:
                logger.error("PDF has no pages")
                return {'success': False, 'error': 'PDF has no pages'}
            
            first_page = doc.load_page(0)
            
            # Convert first page to high-quality image
            matrix = fitz.Matrix(300/72, 300/72)  # 300 DPI for good quality
            pix = first_page.get_pixmap(matrix=matrix, alpha=False)
            
            # Convert to PIL Image
            img_data = pix.tobytes("png")
            img = Image.open(BytesIO(img_data))
            
            # Convert to base64
            buffer = BytesIO()
            img.save(buffer, format='PNG', optimize=True)
            img_base64 = base64.b64encode(buffer.getvalue()).decode()
            
            doc.close()
            
            logger.info(f"Converted first page to image ({len(img_base64)} chars)")
            
            # Check if GPT service is available
            if not self.gpt4o_service.is_available():
                logger.warning("GPT-4 service not available")
                return {'success': False, 'error': 'GPT-4 service not available'}
            
            # Create specialized prompt for metadata extraction
            system_prompt = """You are an expert at extracting metadata from commission statement documents.

Your task is to analyze the first page of a commission statement and extract:
1. CARRIER NAME - The insurance company that issued this statement (e.g., "Aetna", "Blue Cross Blue Shield", "Cigna", "UnitedHealthcare", "Allied Benefit Systems", etc.)
   - Look in headers, logos, letterhead, and document branding
   - Look at page footers where companies often place their logos
   - DO NOT extract from table data columns - look at document structure elements only
   
2. STATEMENT DATE - The date of this commission statement (e.g., "12/31/2024", "October 31, 2024")
   - Look for "Statement Date:", "Commission Summary For:", "Report Date:", etc.
   - Look in document headers and titles
   - DO NOT extract random dates from table data

Return your response in the following JSON format ONLY:
{
  "carrier_name": "Exact carrier name as it appears",
  "carrier_confidence": 0.95,
  "statement_date": "Date in original format",
  "date_confidence": 0.90,
  "evidence": "Brief explanation of where you found this information"
}

If you cannot find the information with high confidence, use null for the value and a lower confidence score."""

            user_prompt = "Extract the carrier name and statement date from this commission statement first page."
            
            # Call GPT-4 Vision API
            messages = [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{img_base64}"}
                        }
                    ]
                }
            ]
            
            logger.info("Calling GPT-4 Vision API for metadata extraction")
            
            response = self.gpt4o_service.client.chat.completions.create(
                model="gpt-4o",  # Use gpt-4o for vision
                messages=messages,
                max_tokens=500,
                temperature=0.1  # Low temperature for consistent extraction
            )
            
            if not response.choices or len(response.choices) == 0:
                logger.error("GPT-4 returned no response")
                return {'success': False, 'error': 'GPT-4 returned no response'}
            
            content = response.choices[0].message.content
            logger.info(f"GPT-4 response: {content}")
            
            # Parse JSON response
            import json
            import re
            
            # Clean response content
            cleaned_content = content.strip()
            if cleaned_content.startswith('```json'):
                cleaned_content = cleaned_content[7:]
            if cleaned_content.startswith('```'):
                cleaned_content = cleaned_content[3:]
            if cleaned_content.endswith('```'):
                cleaned_content = cleaned_content[:-3]
            cleaned_content = cleaned_content.strip()
            
            # Parse JSON
            try:
                metadata = json.loads(cleaned_content)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse GPT response as JSON: {e}")
                # Try to extract using regex as fallback
                carrier_match = re.search(r'"carrier_name":\s*"([^"]+)"', cleaned_content)
                date_match = re.search(r'"statement_date":\s*"([^"]+)"', cleaned_content)
                
                metadata = {
                    'carrier_name': carrier_match.group(1) if carrier_match else None,
                    'statement_date': date_match.group(1) if date_match else None,
                    'carrier_confidence': 0.7,
                    'date_confidence': 0.7,
                    'evidence': 'Extracted with regex fallback'
                }
            
            # Return results
            result = {
                'success': True,
                'carrier_name': metadata.get('carrier_name'),
                'carrier_confidence': metadata.get('carrier_confidence', 0.8),
                'statement_date': metadata.get('statement_date'),
                'date_confidence': metadata.get('date_confidence', 0.8),
                'evidence': metadata.get('evidence', ''),
                'extraction_method': 'gpt4o_vision_first_page'
            }
            
            logger.info(f"GPT metadata extraction successful: {result}")
            return result
            
        except Exception as e:
            logger.error(f"Error extracting metadata with GPT: {e}", exc_info=True)
            return {
                'success': False,
                'error': f'Metadata extraction failed: {str(e)}'
            }