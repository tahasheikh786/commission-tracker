"""
Date Extraction Service - Extracts statement dates from commission statements
This service provides robust date extraction from various commission statement formats
"""

import re
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
import asyncio
from pathlib import Path
import tempfile
import os

# Import OCR and document processing capabilities
from app.new_extraction_services.models.advanced_ocr_engine import AdvancedOCREngine
from app.new_extraction_services.utils.config import get_config
from app.new_extraction_services.utils.logging_utils import setup_logging, get_logger
from app.new_extraction_services.core.document_processor import DocumentProcessor

# For PDF processing
import pdfplumber
from pdf2image import convert_from_path
import numpy as np
from PIL import Image


@dataclass
class ExtractedDate:
    """Container for extracted date information."""
    date_value: str
    label: str
    confidence: float
    bbox: List[float]  # [x1, y1, x2, y2]
    page_number: int
    context: str  # Surrounding text for context
    date_type: str  # "statement_date", "payment_date", "billing_date", etc.


class DateExtractionService:
    """
    Service for extracting statement dates from commission statement documents.
    Handles various date formats and labels used by different carriers.
    """
    
    def __init__(self, config_path: Optional[str] = None):
        """Initialize the date extraction service."""
        self.config = get_config(config_path)
        setup_logging(self.config)
        self.logger = get_logger(__name__, self.config)
        
        # Initialize OCR engine for text extraction
        self.ocr_engine = AdvancedOCREngine(self.config)
        
        # Initialize document processor
        self.document_processor = DocumentProcessor(self.config)
        
        # Common date labels found in commission statements
        self.date_labels = {
            "statement_date": [
                "statement date", "statement", "date", "as of", "for period ending",
                "period ending", "ending", "statement period", "report date"
            ],
            "payment_date": [
                "payment date", "payment", "paid date", "settlement date", "eft settlement date",
                "payment week", "payment period", "transfer date"
            ],
            "billing_date": [
                "billing date", "billing period", "billing", "invoice date",
                "premium due date", "due date"
            ],
            "effective_date": [
                "effective date", "effective", "coverage date", "policy date",
                "start date", "beginning date"
            ],
            "report_date": [
                "report date", "report", "generated", "created", "issued",
                "document date", "print date"
            ]
        }
        
        # Date patterns for validation
        self.date_patterns = [
            # MM/DD/YYYY or MM-DD-YYYY
            r'\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](19|20)\d{2}\b',
            # MM/DD/YY or MM-DD-YY
            r'\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-]\d{2}\b',
            # YYYY-MM-DD
            r'\b(19|20)\d{2}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b',
            # Month DD, YYYY
            r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(19|20)\d{2}\b',
            # Abbreviated month DD, YYYY
            r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+(19|20)\d{2}\b',
            # DD/MM/YYYY (European format)
            r'\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-](19|20)\d{2}\b',
        ]
        
        self.logger.logger.info("Date Extraction Service initialized successfully")
    
    async def extract_dates_from_file(
        self, 
        file_path: str,
        max_pages: int = 1  # Only process first page by default
    ) -> Dict[str, Any]:
        """
        Extract dates from the first page of a document.
        
        Args:
            file_path: Path to the document file
            max_pages: Maximum number of pages to process (default: 1 for first page only)
            
        Returns:
            Dictionary containing extracted dates and metadata
        """
        try:
            self.logger.logger.info(f"Starting date extraction for file: {file_path}")
            
            # Validate file exists
            if not os.path.exists(file_path):
                return {
                    "success": False,
                    "error": "File does not exist",
                    "dates": []
                }
            
            # Get file extension
            file_ext = Path(file_path).suffix.lower()
            
            if file_ext == '.pdf':
                return await self._extract_dates_from_pdf(file_path, max_pages)
            elif file_ext in ['.png', '.jpg', '.jpeg', '.tiff', '.tif']:
                return await self._extract_dates_from_image(file_path)
            else:
                return {
                    "success": False,
                    "error": f"Unsupported file format: {file_ext}",
                    "dates": []
                }
                
        except Exception as e:
            self.logger.logger.error(f"Date extraction failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "dates": []
            }
    
    async def extract_dates_from_bytes(
        self,
        file_bytes: bytes,
        file_name: str,
        file_type: str = "pdf",
        max_pages: int = 1
    ) -> Dict[str, Any]:
        """
        Extract dates from file bytes using the date extraction pipeline.
        
        Args:
            file_bytes: File content as bytes
            file_name: Name of the file
            file_type: Type of file (pdf, image, etc.)
            max_pages: Maximum number of pages to process (default: 1 for first page only)
            
        Returns:
            Dictionary containing extracted dates and metadata
        """
        try:
            # Create temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_type}") as temp_file:
                temp_file.write(file_bytes)
                temp_file_path = temp_file.name
            
            try:
                # Extract dates from the temporary file
                result = await self.extract_dates_from_file(
                    temp_file_path,
                    max_pages
                )
                
                return result
                
            finally:
                # Clean up temporary file
                if os.path.exists(temp_file_path):
                    os.unlink(temp_file_path)
                    
        except Exception as e:
            self.logger.logger.error(f"Date extraction from bytes failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "dates": []
            }
    
    async def _extract_dates_from_pdf(self, file_path: str, max_pages: int) -> Dict[str, Any]:
        """Extract dates from PDF document."""
        try:
            dates = []
            
            # Method 1: Use pdfplumber for text extraction
            with pdfplumber.open(file_path) as pdf:
                for page_num in range(min(len(pdf.pages), max_pages)):
                    page = pdf.pages[page_num]
                    
                    # Extract text from page
                    text = page.extract_text() or ""
                    
                    # Extract dates from text
                    text_dates = self._extract_dates_from_text(text, page_num + 1)
                    dates.extend(text_dates)
                    
                    # Extract dates from words with bounding boxes
                    words = page.extract_words()
                    bbox_dates = self._extract_dates_from_words(words, page_num + 1)
                    dates.extend(bbox_dates)
            
            # Method 2: Use OCR for scanned PDFs (if text extraction didn't find enough dates)
            if len(dates) < 3:  # If we found less than 3 dates, try OCR
                ocr_dates = await self._extract_dates_with_ocr(file_path, max_pages)
                dates.extend(ocr_dates)
            
            # Remove duplicates and sort by confidence
            unique_dates = self._deduplicate_dates(dates)
            
            return {
                "success": True,
                "dates": [self._date_to_dict(date) for date in unique_dates],
                "total_dates_found": len(unique_dates),
                "extraction_methods": ["text_extraction", "ocr"] if len(dates) < 3 else ["text_extraction"]
            }
            
        except Exception as e:
            self.logger.logger.error(f"PDF date extraction failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "dates": []
            }
    
    async def _extract_dates_from_image(self, file_path: str) -> Dict[str, Any]:
        """Extract dates from image file."""
        try:
            # Convert image to numpy array
            image = Image.open(file_path)
            image_array = np.array(image)
            
            # Use OCR to extract text
            dates = await self._extract_dates_with_ocr_from_image(image_array, 1)
            
            # Remove duplicates and sort by confidence
            unique_dates = self._deduplicate_dates(dates)
            
            return {
                "success": True,
                "dates": [self._date_to_dict(date) for date in unique_dates],
                "total_dates_found": len(unique_dates),
                "extraction_methods": ["ocr"]
            }
            
        except Exception as e:
            self.logger.logger.error(f"Image date extraction failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "dates": []
            }
    
    async def _extract_dates_with_ocr(self, file_path: str, max_pages: int) -> List[ExtractedDate]:
        """Extract dates using OCR from PDF pages."""
        try:
            dates = []
            
            # Convert PDF pages to images
            images = convert_from_path(file_path, first_page=1, last_page=max_pages)
            
            for page_num, image in enumerate(images):
                image_array = np.array(image)
                
                # Extract dates from the image
                page_dates = await self._extract_dates_with_ocr_from_image(image_array, page_num + 1)
                dates.extend(page_dates)
            
            return dates
            
        except Exception as e:
            self.logger.logger.error(f"OCR date extraction failed: {e}")
            return []
    
    async def _extract_dates_with_ocr_from_image(self, image: np.ndarray, page_number: int) -> List[ExtractedDate]:
        """Extract dates from image using OCR."""
        try:
            dates = []
            
            # Divide image into regions for better OCR
            height, width = image.shape[:2]
            
            # Create regions: top, left, right, center
            regions = [
                (0, 0, width, height // 3),  # Top third
                (0, 0, width // 3, height),  # Left third
                (2 * width // 3, 0, width, height),  # Right third
                (width // 4, height // 4, 3 * width // 4, 3 * height // 4),  # Center
            ]
            
            for region_bbox in regions:
                try:
                    # Extract text from region
                    ocr_result = await self.ocr_engine.extract_text_ensemble(image, region_bbox)
                    
                    if ocr_result.text and ocr_result.confidence > 0.3:
                        # Extract dates from OCR text
                        region_dates = self._extract_dates_from_text(
                            ocr_result.text, 
                            page_number, 
                            region_bbox
                        )
                        dates.extend(region_dates)
                        
                except Exception as e:
                    self.logger.logger.warning(f"OCR extraction failed for region: {e}")
                    continue
            
            return dates
            
        except Exception as e:
            self.logger.logger.error(f"OCR image date extraction failed: {e}")
            return []
    
    def _extract_dates_from_text(self, text: str, page_number: int, bbox: Optional[List[float]] = None) -> List[ExtractedDate]:
        """Extract dates from text with their labels."""
        dates = []
        
        # Split text into lines
        lines = text.split('\n')
        
        for line_num, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue
            
            # Find all date patterns in the line
            for pattern in self.date_patterns:
                matches = re.finditer(pattern, line, re.IGNORECASE)
                
                for match in matches:
                    date_value = match.group()
                    
                    # Validate the date
                    if not self._is_valid_date(date_value):
                        continue
                    
                    # Find the label for this date
                    label, confidence = self._find_date_label(line, date_value)
                    
                    # Create bounding box if not provided
                    if bbox is None:
                        # Estimate bbox based on line position
                        estimated_bbox = [0, line_num * 20, 800, (line_num + 1) * 20]
                    else:
                        estimated_bbox = bbox
                    
                    # Create extracted date object
                    extracted_date = ExtractedDate(
                        date_value=date_value,
                        label=label,
                        confidence=confidence,
                        bbox=estimated_bbox,
                        page_number=page_number,
                        context=line,
                        date_type=self._classify_date_type(label)
                    )
                    
                    dates.append(extracted_date)
        
        return dates
    
    def _extract_dates_from_words(self, words: List[Dict], page_number: int) -> List[ExtractedDate]:
        """Extract dates from words with bounding boxes."""
        dates = []
        
        # Group words into lines based on y-coordinate
        lines = self._group_words_into_lines(words)
        
        for line in lines:
            line_text = ' '.join([word['text'] for word in line])
            
            # Find dates in the line
            for pattern in self.date_patterns:
                matches = re.finditer(pattern, line_text, re.IGNORECASE)
                
                for match in matches:
                    date_value = match.group()
                    
                    # Validate the date
                    if not self._is_valid_date(date_value):
                        continue
                    
                    # Find the word containing this date
                    date_word = None
                    for word in line:
                        if date_value in word['text']:
                            date_word = word
                            break
                    
                    if date_word:
                        # Find the label for this date
                        label, confidence = self._find_date_label(line_text, date_value)
                        
                        # Create bounding box from word coordinates
                        bbox = [
                            date_word.get('x0', 0),
                            date_word.get('top', 0),
                            date_word.get('x1', 0),
                            date_word.get('bottom', 0)
                        ]
                        
                        # Create extracted date object
                        extracted_date = ExtractedDate(
                            date_value=date_value,
                            label=label,
                            confidence=confidence,
                            bbox=bbox,
                            page_number=page_number,
                            context=line_text,
                            date_type=self._classify_date_type(label)
                        )
                        
                        dates.append(extracted_date)
        
        return dates
    
    def _group_words_into_lines(self, words: List[Dict]) -> List[List[Dict]]:
        """Group words into lines based on y-coordinate proximity."""
        if not words:
            return []
        
        # Sort words by y-coordinate
        sorted_words = sorted(words, key=lambda w: w['top'])
        
        lines = []
        current_line = []
        last_y = None
        
        for word in sorted_words:
            if last_y is None or abs(word['top'] - last_y) < 10:  # 10px tolerance
                current_line.append(word)
            else:
                if current_line:
                    lines.append(current_line)
                current_line = [word]
            
            last_y = word['top']
        
        if current_line:
            lines.append(current_line)
        
        return lines
    
    def _find_date_label(self, text: str, date_value: str) -> Tuple[str, float]:
        """Find the label for a date in the surrounding text."""
        # Remove the date from text to analyze context
        context = text.replace(date_value, '').strip()
        
        best_label = "Unknown"
        best_confidence = 0.0
        
        # Check for exact label matches
        for date_type, labels in self.date_labels.items():
            for label in labels:
                if label.lower() in context.lower():
                    # Calculate confidence based on proximity and exactness
                    confidence = self._calculate_label_confidence(context, label, date_value)
                    if confidence > best_confidence:
                        best_confidence = confidence
                        best_label = label
        
        # If no exact match, try to infer from context
        if best_confidence < 0.3:
            inferred_label = self._infer_label_from_context(context)
            if inferred_label:
                best_label = inferred_label
                best_confidence = 0.2
        
        return best_label, best_confidence
    
    def _calculate_label_confidence(self, context: str, label: str, date_value: str) -> float:
        """Calculate confidence score for a label match."""
        context_lower = context.lower()
        label_lower = label.lower()
        
        # Exact match gets highest confidence
        if label_lower in context_lower:
            # Check proximity to date (closer = higher confidence)
            label_pos = context_lower.find(label_lower)
            date_pos = context_lower.find(date_value.lower())
            
            if date_pos != -1:
                distance = abs(label_pos - date_pos)
                # Closer proximity = higher confidence
                proximity_score = max(0, 1 - (distance / 100))
                return 0.8 + (0.2 * proximity_score)
            else:
                return 0.8
        
        # Partial match gets lower confidence
        elif any(word in context_lower for word in label_lower.split()):
            return 0.4
        
        return 0.0
    
    def _infer_label_from_context(self, context: str) -> Optional[str]:
        """Infer label from context when no exact match is found."""
        context_lower = context.lower()
        
        # Common patterns in commission statements
        if any(word in context_lower for word in ['statement', 'report', 'document']):
            return "Statement Date"
        elif any(word in context_lower for word in ['payment', 'paid', 'settlement']):
            return "Payment Date"
        elif any(word in context_lower for word in ['billing', 'invoice', 'premium']):
            return "Billing Date"
        elif any(word in context_lower for word in ['effective', 'coverage', 'policy']):
            return "Effective Date"
        
        return None
    
    def _classify_date_type(self, label: str) -> str:
        """Classify the type of date based on its label."""
        label_lower = label.lower()
        
        for date_type, labels in self.date_labels.items():
            if any(l.lower() in label_lower for l in labels):
                return date_type
        
        return "unknown"
    
    def _is_valid_date(self, date_str: str) -> bool:
        """Validate if a date string represents a valid date."""
        try:
            # Try to parse the date
            if re.match(r'\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](19|20)\d{2}\b', date_str):
                # MM/DD/YYYY or MM-DD-YYYY
                if '/' in date_str:
                    month, day, year = date_str.split('/')
                else:
                    month, day, year = date_str.split('-')
                datetime(int(year), int(month), int(day))
                return True
            elif re.match(r'\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-]\d{2}\b', date_str):
                # MM/DD/YY or MM-DD-YY
                if '/' in date_str:
                    month, day, year = date_str.split('/')
                else:
                    month, day, year = date_str.split('-')
                year = int(year)
                if year < 50:  # Assume 20xx
                    year += 2000
                else:  # Assume 19xx
                    year += 1900
                datetime(year, int(month), int(day))
                return True
            elif re.match(r'\b(19|20)\d{2}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b', date_str):
                # YYYY-MM-DD
                year, month, day = date_str.split('-')
                datetime(int(year), int(month), int(day))
                return True
            elif re.match(r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(19|20)\d{2}\b', date_str, re.IGNORECASE):
                # Month DD, YYYY
                parts = date_str.replace(',', '').split()
                month_name, day, year = parts[0], parts[1], parts[2]
                month_num = datetime.strptime(month_name, '%B').month
                datetime(int(year), month_num, int(day))
                return True
            elif re.match(r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+(19|20)\d{2}\b', date_str, re.IGNORECASE):
                # Abbreviated month DD, YYYY
                parts = date_str.replace(',', '').split()
                month_name, day, year = parts[0], parts[1], parts[2]
                month_num = datetime.strptime(month_name, '%b').month
                datetime(int(year), month_num, int(day))
                return True
            elif re.match(r'\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-](19|20)\d{2}\b', date_str):
                # DD/MM/YYYY (European format)
                if '/' in date_str:
                    day, month, year = date_str.split('/')
                else:
                    day, month, year = date_str.split('-')
                datetime(int(year), int(month), int(day))
                return True
            
            return False
            
        except (ValueError, TypeError):
            return False
    
    def _deduplicate_dates(self, dates: List[ExtractedDate]) -> List[ExtractedDate]:
        """Remove duplicate dates and sort by confidence."""
        # Group by date value and label
        date_groups = {}
        
        for date in dates:
            key = (date.date_value, date.label)
            if key not in date_groups:
                date_groups[key] = []
            date_groups[key].append(date)
        
        # Keep the highest confidence date from each group
        unique_dates = []
        for group in date_groups.values():
            best_date = max(group, key=lambda d: d.confidence)
            unique_dates.append(best_date)
        
        # Sort by confidence (highest first)
        unique_dates.sort(key=lambda d: d.confidence, reverse=True)
        
        return unique_dates
    
    def _date_to_dict(self, date: ExtractedDate) -> Dict[str, Any]:
        """Convert ExtractedDate to dictionary format."""
        return {
            "date_value": date.date_value,
            "label": date.label,
            "confidence": date.confidence,
            "bbox": date.bbox,
            "page_number": date.page_number,
            "context": date.context,
            "date_type": date.date_type
        }
    
    async def get_extraction_status(self) -> Dict[str, Any]:
        """
        Get the status of the date extraction service.
        
        Returns:
            Dictionary containing service status information
        """
        return {
            "service": "date_extraction_service",
            "status": "active",
            "version": "1.0.0",
            "models_loaded": {
                "ocr_engine": self.ocr_engine is not None,
                "document_processor": self.document_processor is not None
            },
            "config": {
                "date_patterns_count": len(self.date_patterns),
                "date_labels_count": sum(len(labels) for labels in self.date_labels.values()),
                "supported_formats": ["pdf", "png", "jpg", "jpeg", "tiff", "tif"]
            }
        }


# Create a global instance for easy access
_date_extraction_service = None

def get_date_extraction_service(config_path: Optional[str] = None) -> DateExtractionService:
    """
    Get or create a global instance of the date extraction service.
    
    Args:
        config_path: Optional path to configuration file
        
    Returns:
        DateExtractionService instance
    """
    global _date_extraction_service
    
    if _date_extraction_service is None:
        _date_extraction_service = DateExtractionService(config_path)
    
    return _date_extraction_service
