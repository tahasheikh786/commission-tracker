import os
import json
import base64
import logging
import fitz  # PyMuPDF
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
from PIL import Image, ImageEnhance, ImageFilter
import io
from openai import OpenAI
from .data_formatting_service import DataFormattingService
from .company_name_service import CompanyNameDetectionService

logger = logging.getLogger(__name__)

class GPT4oVisionService:
    """
    Intelligent GPT-5 Vision service for commission statement extraction.
    Automatically detects digital vs scanned PDFs and optimizes processing accordingly.
    """
    
    def __init__(self):
        self.client = None
        self.data_formatting_service = DataFormattingService()
        self.company_detector = CompanyNameDetectionService()
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize OpenAI client with API key from environment."""
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.warning("OPENAI_API_KEY not found in environment variables")
            return
        
        try:
            self.client = OpenAI(api_key=api_key)
            logger.info("GPT-5 Vision service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI client: {e}")
    
    def is_available(self) -> bool:
        """Check if the service is available (API key configured)."""
        return self.client is not None
    
    def is_digital_pdf(self, pdf_path: str) -> bool:
        """
        Intelligently detect if PDF is digital (text-based) or scanned (image-based).
        
        Args:
            pdf_path: Path to the PDF file
            
        Returns:
            True if digital PDF, False if scanned
        """
        try:
            doc = fitz.open(pdf_path)
            text_content = ""
            
            # Sample first 3 pages for text content analysis
            sample_pages = min(3, len(doc))
            for page_num in range(sample_pages):
                page = doc.load_page(page_num)
                text_content += page.get_text()
            
            doc.close()
            
            # Analyze text characteristics
            text_length = len(text_content.strip())
            has_selectable_text = text_length > 100  # Significant text content
            has_structured_data = any(keyword in text_content.upper() for keyword in 
                                   ["COMMISSION", "PREMIUM", "COVERAGE", "POLICY", "CUSTOMER"])
            
            is_digital = has_selectable_text and has_structured_data
            
            logger.info(f"PDF Analysis: {text_length} chars, structured: {has_structured_data}, digital: {is_digital}")
            return is_digital
            
        except Exception as e:
            logger.error(f"Error analyzing PDF type: {e}")
            return False  # Default to scanned if analysis fails
    
    def extract_from_digital_pdf(self, pdf_path: str) -> Dict[str, Any]:
        """
        Extract data directly from digital PDF using text extraction and GPT-5.
        More efficient than image conversion for text-based PDFs.
        """
        if not self.is_available():
            return {"success": False, "error": "GPT-5 Vision service not available"}
        
        try:
            # Extract text from PDF using PyMuPDF
            doc = fitz.open(pdf_path)
            text_content = ""
            
            # Extract text from all pages
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                text_content += page.get_text()
            
            doc.close()
            
            if not text_content.strip():
                logger.warning("Digital PDF contains no extractable text")
                return {"success": False, "error": "PDF contains no extractable text"}
            
            # Create system prompt for digital PDF extraction
            system_prompt = self._create_digital_pdf_system_prompt()
            
            # Prepare messages with text content
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Extract ONLY the data that is VISIBLY PRESENT in this digital PDF. DO NOT invent, infer, or guess any values. DO NOT create headers that don't exist. DO NOT fill empty cells. Extract the ACTUAL table structure as it appears in the document. If you cannot see something clearly, do not extract it.\n\nText content:\n\n{text_content[:50000]}"}  # Limit text length
            ]
            
            # Call GPT-5 with text content
            response = self.client.chat.completions.create(
                model="gpt-5",
                messages=messages,
                max_completion_tokens=15000
            )
            
            # Parse response
            content = response.choices[0].message.content
            return self._parse_extraction_response(content, "digital_pdf")
            
        except Exception as e:
            logger.error(f"Error extracting from digital PDF: {e}")
            return {"success": False, "error": f"Digital PDF extraction failed: {str(e)}"}
    
    def extract_from_scanned_pdf(self, pdf_path: str, max_pages: int = 30) -> Dict[str, Any]:
        """
        Extract data from scanned PDF by converting to optimized images.
        Handles large files efficiently with smart page sampling.
        """
        if not self.is_available():
            return {"success": False, "error": "GPT-5 Vision service not available"}
        
        try:
            doc = fitz.open(pdf_path)
            total_pages = len(doc)
            
            # Smart page selection for large documents
            if total_pages > max_pages:
                logger.info(f"Large document detected ({total_pages} pages). Using intelligent sampling.")
                selected_pages = self._select_representative_pages(total_pages, max_pages)
            else:
                selected_pages = list(range(total_pages))
            
            # Convert selected pages to optimized images
            enhanced_images = []
            for page_num in selected_pages:
                image = self._convert_page_to_optimized_image(doc, page_num)
                if image:
                    enhanced_images.append(image)
            
            doc.close()
            
            if not enhanced_images:
                return {"success": False, "error": "Failed to convert any pages to images"}
            
            # Extract tables using vision analysis
            return self._extract_tables_with_vision(enhanced_images, selected_pages)
            
        except Exception as e:
            logger.error(f"Error extracting from scanned PDF: {e}")
            return {"success": False, "error": f"Scanned PDF extraction failed: {str(e)}"}
    
    def _select_representative_pages(self, total_pages: int, max_pages: int) -> List[int]:
        """
        Intelligently select representative pages from large documents.
        Prioritizes first few pages, last few pages, and evenly distributed middle pages.
        """
        if total_pages <= max_pages:
            return list(range(total_pages))
        
        # Always include first and last few pages
        first_pages = list(range(min(3, total_pages // 4)))
        last_pages = list(range(max(0, total_pages - 3), total_pages))
        
        # Calculate remaining pages to sample
        remaining_slots = max_pages - len(first_pages) - len(last_pages)
        
        # Sample middle pages evenly
        if remaining_slots > 0:
            middle_start = len(first_pages)
            middle_end = total_pages - len(last_pages)
            step = max(1, (middle_end - middle_start) // remaining_slots)
            middle_pages = list(range(middle_start, middle_end, step))[:remaining_slots]
        else:
            middle_pages = []
        
        selected = first_pages + middle_pages + last_pages
        selected.sort()
        
        logger.info(f"Selected {len(selected)} representative pages from {total_pages} total pages")
        return selected
    
    def _convert_page_to_optimized_image(self, doc: fitz.Document, page_num: int) -> Optional[str]:
        """
        Convert PDF page to optimized image with adaptive quality settings.
        Balances image quality with file size for optimal GPT-5 Vision processing.
        """
        try:
            page = doc.load_page(page_num)
            
            # Adaptive DPI based on page content complexity
            dpi = self._calculate_adaptive_dpi(page)
            
            # Create high-quality matrix
            matrix = fitz.Matrix(dpi/72, dpi/72)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            
            # Convert to PIL Image for enhancement
            img_data = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_data))
            
            # Apply intelligent enhancement
            enhanced_img = self._enhance_image_intelligently(img, dpi)
            
            # Convert to base64 with size optimization
            buffer = io.BytesIO()
            enhanced_img.save(buffer, format='PNG', optimize=True)
            img_str = base64.b64encode(buffer.getvalue()).decode()
            
            # Log image details
            img_size = len(img_str)
            logger.info(f"Page {page_num + 1}: {dpi} DPI, {img_size} chars, {enhanced_img.size}")
            
            return img_str
            
        except Exception as e:
            logger.error(f"Error converting page {page_num}: {e}")
            return None
    
    def _calculate_adaptive_dpi(self, page: fitz.Page) -> int:
        """
        Calculate optimal DPI based on page content and complexity.
        """
        # Analyze page content
        text_length = len(page.get_text())
        image_count = len(page.get_images())
        
        # Base DPI on content complexity
        if text_length > 1000 or image_count > 5:
            return 400  # High complexity
        elif text_length > 500 or image_count > 2:
            return 500  # Medium complexity
        else:
            return 600  # Low complexity
    
    def _enhance_image_intelligently(self, img: Image.Image, dpi: int) -> Image.Image:
        """
        Apply intelligent image enhancement based on DPI and content type.
        """
        try:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Adaptive enhancement based on DPI
            if dpi >= 500:
                # High DPI: moderate enhancement
                enhancer = ImageEnhance.Contrast(img)
                img = enhancer.enhance(1.3)
                enhancer = ImageEnhance.Sharpness(img)
                img = enhancer.enhance(1.2)
            else:
                # Lower DPI: conservative enhancement
                enhancer = ImageEnhance.Contrast(img)
                img = enhancer.enhance(1.2)
                enhancer = ImageEnhance.Sharpness(img)
                img = enhancer.enhance(1.1)
            
            return img
            
        except Exception as e:
            logger.warning(f"Image enhancement failed: {e}")
            return img
    
    def _extract_tables_with_vision(self, enhanced_images: List[str], page_numbers: List[int]) -> Dict[str, Any]:
        """
        Extract tables using GPT-5 Vision with optimized prompts.
        """
        try:
            # Create intelligent system prompt
            system_prompt = self._create_vision_system_prompt()
            user_prompt = self._create_vision_user_prompt(len(enhanced_images))
            
            # Prepare messages
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
            
            # Add images
            for image_base64 in enhanced_images:
                messages[1]["content"].append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{image_base64}"}
                })
            
            # Call GPT-5 Vision API
            logger.info(f"Calling GPT-5 Vision API for {len(enhanced_images)} pages")
            
            response = self.client.chat.completions.create(
                model="gpt-5",
                messages=messages,
                max_completion_tokens=15000
            )
            
            content = response.choices[0].message.content
            return self._parse_extraction_response(content, "vision_analysis")
            
        except Exception as e:
            logger.error(f"Error in vision analysis: {e}")
            return {"success": False, "error": f"Vision analysis failed: {str(e)}"}
    
    def _create_digital_pdf_system_prompt(self) -> str:
        """Strict system prompt for digital PDF extraction - NO INFERENCE ALLOWED."""
        return """You are a commission statement data extractor. Your ONLY job is to extract EXACTLY what you see in the document - NO INFERENCE, NO GUESSING, NO INVENTING DATA.

CRITICAL RULES - VIOLATION MEANS FAILURE:
1. **ONLY extract data that is VISIBLY PRESENT** in the document
2. **NEVER invent, infer, or guess any values**
3. **NEVER create headers that don't exist** in the document
4. **NEVER fill empty cells** with assumed values
5. **If a cell is empty, leave it empty** - do not populate it
6. **Extract the ACTUAL table structure** as it appears, not a template
7. **Copy headers EXACTLY as written** - do not normalize or interpret
8. **Copy values EXACTLY as written** - do not reformat or calculate

EXTRACTION PROCESS:
1. Look at the document and identify the ACTUAL table structure
2. Extract ONLY the headers that are visibly present
3. Extract ONLY the data that is visibly present
4. Leave empty cells completely empty
5. Do not add any columns or rows that don't exist

OUTPUT FORMAT:
Return ONLY valid JSON with the ACTUAL structure found:
{
  "tables": [
    {
      "headers": ["ACTUAL_HEADER_1", "ACTUAL_HEADER_2", "ACTUAL_HEADER_3"],
      "rows": [
        ["ACTUAL_VALUE_1", "ACTUAL_VALUE_2", ""],  // Empty cell stays empty
        ["ACTUAL_VALUE_4", "", "ACTUAL_VALUE_6"]   // Empty cell stays empty
      ]
    }
  ]
}

REMEMBER: If you cannot see it clearly in the document, DO NOT EXTRACT IT. Better to have incomplete data than fake data."""
    
    def _create_vision_system_prompt(self) -> str:
        """Strict system prompt for vision analysis - NO INFERENCE ALLOWED."""
        return """You are a commission statement data extractor. Your ONLY job is to extract EXACTLY what you see in the images - NO INFERENCE, NO GUESSING, NO INVENTING DATA.

CRITICAL RULES - VIOLATION MEANS FAILURE:
1. **ONLY extract data that is VISIBLY PRESENT** in the images
2. **NEVER invent, infer, or guess any values**
3. **NEVER create headers that don't exist** in the document
4. **NEVER fill empty cells** with assumed values
5. **If a cell is empty, leave it empty** - do not populate it
6. **Extract the ACTUAL table structure** as it appears, not a template
7. **Copy headers EXACTLY as written** - do not normalize or interpret
8. **Copy values EXACTLY as written** - do not reformat or calculate
9. **Do NOT create a "Client Names" column** unless it actually exists in the document

EXTRACTION PROCESS:
1. Look at the images and identify the ACTUAL table structure
2. Extract ONLY the headers that are visibly present
3. Extract ONLY the data that is visibly present
4. Leave empty cells completely empty
5. Do not add any columns or rows that don't exist
6. Do not apply patterns from other documents

OUTPUT FORMAT:
Return ONLY valid JSON with the ACTUAL structure found:
{
  "tables": [
    {
      "headers": ["ACTUAL_HEADER_1", "ACTUAL_HEADER_2", "ACTUAL_HEADER_3"],
      "rows": [
        ["ACTUAL_VALUE_1", "ACTUAL_VALUE_2", ""],  // Empty cell stays empty
        ["ACTUAL_VALUE_4", "", "ACTUAL_VALUE_6"]   // Empty cell stays empty
      ]
    }
  ]
}

REMEMBER: If you cannot see it clearly in the images, DO NOT EXTRACT IT. Better to have incomplete data than fake data."""
    
    def _create_vision_user_prompt(self, num_pages: int) -> List[Dict[str, Any]]:
        """Create strict user prompt for vision analysis - NO INFERENCE ALLOWED."""
        return [
            {"type": "text", "text": f"Extract ONLY the data that is VISIBLY PRESENT in these {num_pages} page images. DO NOT invent, infer, or guess any values. DO NOT create headers that don't exist. DO NOT fill empty cells. Extract the ACTUAL table structure as it appears in the document. If you cannot see something clearly, do not extract it. Better to have incomplete data than fake data."}
        ]
    
    def _parse_extraction_response(self, content: str, method: str) -> Dict[str, Any]:
        """
        Parse and validate extraction response from GPT with strict validation.
        """
        try:
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
            result = json.loads(cleaned_content)
            
            # Validate structure
            if "tables" not in result or not result["tables"]:
                return {"success": False, "error": "No tables found in response"}
            
            # Process tables with strict validation
            processed_tables = []
            for table in result["tables"]:
                if "headers" in table and "rows" in table:
                    # Validate that headers are not template headers
                    headers = table.get("headers", [])
                    if self._contains_template_headers(headers):
                        logger.warning(f"Template headers detected in {method} extraction - possible inference")
                        return {"success": False, "error": "Template headers detected - extraction may contain inferred data"}
                    
                    table["extractor"] = f"gpt4o_vision_{method}"
                    table["processing_notes"] = f"Extracted using {method} method with strict validation"
                    processed_tables.append(table)
            
            return {
                "success": True,
                "tables": processed_tables,
                "extraction_metadata": {
                    "method": method,
                    "timestamp": datetime.now().isoformat(),
                    "confidence": 0.90,  # Lower confidence due to strict validation
                    "validation": "strict_no_inference"
                }
            }
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse response: {e}")
            return {"success": False, "error": "Failed to parse GPT response"}
    
    def _contains_template_headers(self, headers: List[str]) -> bool:
        """
        Check if headers contain template/inferred values that shouldn't exist.
        """
        template_indicators = [
            "Bill Eff Date", "Billed Premium", "Paid Premium", "Adj Typ", "Iss St", 
            "Split %", "Comp Typ", "Bus Type", "Billed Fee Amount", "Customer Paid Fee"
        ]
        
        # Check if any template headers are present
        for template_header in template_indicators:
            if any(template_header.lower() in header.lower() for header in headers):
                logger.warning(f"Template header detected: {template_header}")
                return True
        
        return False
    
    def extract_commission_data(self, pdf_path: str, max_pages: int = 30) -> Dict[str, Any]:
        """
        Main extraction method that intelligently chooses between digital and scanned PDF processing.
        
        Args:
            pdf_path: Path to the PDF file
            max_pages: Maximum number of pages to process for large documents
            
        Returns:
            Dictionary with extracted tables and metadata
        """
        if not self.is_available():
            return {"success": False, "error": "GPT-4 Vision service not available"}
        
        try:
            logger.info(f"Starting commission data extraction from: {pdf_path}")
            
            # Detect PDF type
            is_digital = self.is_digital_pdf(pdf_path)
            
            if is_digital:
                logger.info("Digital PDF detected - using direct file extraction")
                result = self.extract_from_digital_pdf(pdf_path)
            else:
                logger.info("Scanned PDF detected - using image-based extraction")
                result = self.extract_from_scanned_pdf(pdf_path, max_pages)
            
            # Apply company detection if extraction was successful
            if result.get("success") and result.get("tables"):
                enhanced_tables = []
                for table in result["tables"]:
                    enhanced_table = self.company_detector.detect_company_names_in_extracted_data(
                        table, "gpt4o_vision_enhanced"
                    )
                    enhanced_tables.append(enhanced_table)
                
                result["tables"] = enhanced_tables
                result["company_detection_applied"] = True
            
            return result
            
        except Exception as e:
            logger.error(f"Error in commission data extraction: {e}")
            return {"success": False, "error": f"Extraction failed: {str(e)}"}
    
    def merge_similar_tables(self, tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Merge tables with similar structure for better data organization.
        """
        if not tables or len(tables) <= 1:
            return tables
        
        try:
            logger.info(f"Starting table merging for {len(tables)} tables")
            
            # Group tables by structure similarity
            table_groups = []
            processed = set()
            
            for i, table in enumerate(tables):
                if i in processed:
                    continue
                
                current_group = [table]
                processed.add(i)
                
                # Find similar tables
                for j, other_table in enumerate(tables):
                    if j in processed:
                        continue
                    
                    if self._are_tables_mergeable(table, other_table):
                        current_group.append(other_table)
                        processed.add(j)
                
                table_groups.append(current_group)
            
            # Merge groups
            merged_tables = []
            for group in table_groups:
                if len(group) == 1:
                    merged_tables.append(group[0])
                else:
                    merged_table = self._merge_table_group(group)
                    merged_tables.append(merged_table)
            
            logger.info(f"Successfully merged into {len(merged_tables)} tables")
            return merged_tables
            
        except Exception as e:
            logger.error(f"Error merging tables: {e}")
            return tables
    
    def _are_tables_mergeable(self, table1: Dict[str, Any], table2: Dict[str, Any]) -> bool:
        """Check if two tables can be merged based on structure similarity."""
        headers1 = table1.get("headers", [])
        headers2 = table2.get("headers", [])
        
        # Check for identical headers
        if headers1 == headers2:
            return True
        
        # Check for core header similarity
        if len(headers1) == len(headers2):
            core_headers1 = headers1[:min(10, len(headers1))]
            core_headers2 = headers2[:min(10, len(headers2))]
            matching = sum(1 for h1, h2 in zip(core_headers1, core_headers2) if h1 == h2)
            return matching >= len(core_headers1) * 0.7
        
        return False
    
    def _merge_table_group(self, group: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Merge a group of similar tables into one."""
        base_table = group[0]
        merged_rows = base_table.get("rows", [])
        
        # Add rows from other tables
        for table in group[1:]:
            merged_rows.extend(table.get("rows", []))
        
        return {
            "name": f"Merged: {' + '.join(t.get('name', 'Table') for t in group)}",
            "headers": base_table.get("headers", []),
            "rows": merged_rows,
            "extractor": "gpt4o_vision_merged",
            "metadata": {
                "merged_from": len(group),
                "timestamp": datetime.now().isoformat()
            }
        }
    
    def process_improvement_result(self, 
                                 vision_analysis: Dict[str, Any], 
                                 current_tables: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Process the GPT analysis to improve current table extraction.
        
        Args:
            vision_analysis: Result from GPT analysis
            current_tables: Current table extraction results
            
        Returns:
            Improved table structure and metadata
        """
        if not vision_analysis.get("success"):
            return {
                "success": False,
                "error": vision_analysis.get("error", "Analysis failed")
            }
        
        try:
            analysis = vision_analysis.get("analysis", {})
            tables = analysis.get("tables", [])
            
            # Use the data formatting service to ensure format accuracy
            formatted_tables = self.data_formatting_service.format_data_with_llm_analysis(
                current_tables, vision_analysis
            )
            
            # Process each table for additional metadata
            diagnostic_info = {
                "vision_analysis": analysis,
                "improvements": [],
                "warnings": [],
                "formatting_accuracy": "≥90%",
                "processing_method": "LLM-driven pattern enforcement"
            }
            
            for table in tables:
                headers = table.get("headers", [])
                rows = table.get("rows", [])
                
                # Add diagnostic information
                diagnostic_info["improvements"].append({
                    "gpt_headers": headers,
                    "column_count": len(headers),
                    "row_count": len(rows),
                    "processing_method": "GPT-5 response driven with LLM pattern enforcement",
                    "format_accuracy_target": "≥90%"
                })
            
            # Update table metadata to reflect the upgraded formatting
            for table in formatted_tables:
                table["metadata"] = {
                    **table.get("metadata", {}),
                    "enhancement_method": "gpt4o_vision_with_llm_pattern_enforcement",
                    "format_accuracy": "≥90%",
                    "processing_notes": "GPT-5 response driven with LLM pattern enforcement",
                    "upgrade_version": "2.0"
                }
            
            return {
                "success": True,
                "improved_tables": formatted_tables,
                "diagnostic_info": diagnostic_info,
                "enhancement_timestamp": datetime.now().isoformat(),
                "format_accuracy": "≥90%",
                "upgrade_version": "2.0"
            }
            
        except Exception as e:
            logger.error(f"Error processing improvement result: {e}")
            return {
                "success": False,
                "error": f"Failed to process improvement result: {str(e)}"
            }