import os
import json
import base64
import logging
import re
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
from PIL import Image
import io
import fitz  # PyMuPDF
from openai import OpenAI

logger = logging.getLogger(__name__)

class GPT4oVisionService:
    """
    Service for using GPT-4o Vision to improve table extraction results.
    Provides high-quality table structure analysis using visual input.
    """
    
    def __init__(self):
        self.client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize OpenAI client with API key from environment."""
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.warning("OPENAI_API_KEY not found in environment variables")
            return
        
        try:
            self.client = OpenAI(api_key=api_key)
            logger.info("GPT-4o Vision service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI client: {e}")
    
    def is_available(self) -> bool:
        """Check if the service is available (API key configured)."""
        return self.client is not None
    
    def enhance_page_image(self, pdf_path: str, page_num: int, dpi: int = 600) -> Optional[str]:
        """
        Extract and enhance a single page from PDF for vision analysis.
        
        Args:
            pdf_path: Path to the PDF file
            page_num: Page number (0-indexed)
            dpi: Resolution for image extraction
            
        Returns:
            Base64 encoded enhanced image or None if failed
        """
        try:
            doc = fitz.open(pdf_path)
            if page_num >= len(doc):
                logger.error(f"Page {page_num} does not exist in PDF")
                return None
            
            page = doc.load_page(page_num)
            
            # Create high-resolution matrix for better quality
            matrix = fitz.Matrix(dpi/72, dpi/72)  # 72 is the default DPI
            
            # Get pixmap with high resolution
            pix = page.get_pixmap(matrix=matrix)
            
            # Convert to PIL Image for enhancement
            img_data = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_data))
            
            # Basic image enhancement
            img = self._enhance_image(img)
            
            # Convert to base64
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=True)
            img_str = base64.b64encode(buffer.getvalue()).decode()
            
            doc.close()
            return img_str
            
        except Exception as e:
            logger.error(f"Error enhancing page {page_num}: {e}")
            return None
    
    def _enhance_image(self, img: Image.Image) -> Image.Image:
        """
        Apply basic image enhancement for better OCR results.
        
        Args:
            img: PIL Image object
            
        Returns:
            Enhanced PIL Image
        """
        try:
            # Convert to RGB if necessary
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Basic contrast enhancement
            from PIL import ImageEnhance
            
            # Enhance contrast slightly
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(1.2)
            
            # Enhance sharpness
            enhancer = ImageEnhance.Sharpness(img)
            img = enhancer.enhance(1.1)
            
            return img
            
        except Exception as e:
            logger.warning(f"Image enhancement failed: {e}")
            return img
    
    def extract_table_regions(self, pdf_path: str, page_num: int) -> List[Tuple[float, float, float, float]]:
        """
        Extract potential table regions from a page.
        This is a simplified approach - in production you might want more sophisticated table detection.
        
        Args:
            pdf_path: Path to the PDF file
            page_num: Page number (0-indexed)
            
        Returns:
            List of bounding boxes (x0, y0, x1, y1) for potential table regions
        """
        try:
            doc = fitz.open(pdf_path)
            page = doc.load_page(page_num)
            
            # Get page dimensions
            rect = page.rect
            width, height = rect.width, rect.height
            
            # For now, return the full page as a potential table region
            # In a more sophisticated implementation, you'd use table detection algorithms
            table_regions = [(0, 0, width, height)]
            
            doc.close()
            return table_regions
            
        except Exception as e:
            logger.error(f"Error extracting table regions from page {page_num}: {e}")
            return []
    
    def analyze_table_with_vision(self, 
                                 enhanced_images: List[str], 
                                 current_extraction: List[Dict[str, Any]],
                                 max_pages: int = 5) -> Dict[str, Any]:
        """
        Use GPT-4o Vision to analyze table structure and improve extraction.
        
        Args:
            enhanced_images: List of base64 encoded enhanced page images
            current_extraction: Current table extraction results
            max_pages: Maximum number of pages to analyze
            
        Returns:
            Dictionary with improved table structure and analysis
        """
        if not self.is_available():
            return {"error": "GPT-4o Vision service not available"}
        
        try:
            # Limit to max_pages
            images_to_analyze = enhanced_images[:max_pages]
            
            # Prepare the prompt for GPT-4o
            system_prompt = self._create_system_prompt()
            user_prompt_parts = self._create_user_prompt(current_extraction)
            
            # Prepare messages for the API call
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt_parts}
            ]
            
            # Add images to the user message content
            for i, image_base64 in enumerate(images_to_analyze):
                messages[1]["content"].append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{image_base64}"
                    }
                })
            
            # Call GPT-4o Vision API
            logger.info(f"Calling GPT-4o Vision API for {len(images_to_analyze)} pages")
            logger.info(f"Message structure: {len(messages)} messages")
            logger.info(f"User message content parts: {len(messages[1]['content'])} parts")
            
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                max_tokens=4000,
                temperature=0.1  # Low temperature for consistent, precise analysis
            )
            
            logger.info(f"Response structure: {type(response)}")
            logger.info(f"Response choices: {len(response.choices) if response.choices else 0}")
            
            # Parse the response
            if not response.choices or len(response.choices) == 0:
                logger.error("No choices in response")
                return {
                    "success": False,
                    "error": "No response choices from GPT-4o"
                }
            
            content = response.choices[0].message.content
            logger.info("GPT-4o Vision API call completed successfully")
            logger.info(f"Message structure: {type(response.choices[0].message)}")
            logger.info(f"Content type: {type(content)}")
            logger.info(f"Raw response content length: {len(content) if content else 0}")
            logger.info(f"Raw response content preview: {content[:500] if content else 'None'}")
            
            # Try to parse JSON from the response
            try:
                # Clean the response content - remove markdown code blocks if present
                cleaned_content = content.strip()
                if cleaned_content.startswith('```json'):
                    cleaned_content = cleaned_content[7:]  # Remove ```json
                if cleaned_content.startswith('```'):
                    cleaned_content = cleaned_content[3:]  # Remove ```
                if cleaned_content.endswith('```'):
                    cleaned_content = cleaned_content[:-3]  # Remove ```
                cleaned_content = cleaned_content.strip()
                
                logger.info(f"Cleaned content preview: {cleaned_content[:200]}...")
                
                result = json.loads(cleaned_content)
                logger.info(f"Full GPT-4o analysis result: {json.dumps(result, indent=2)}")
                return {
                    "success": True,
                    "analysis": result,
                    "raw_response": content,
                    "timestamp": datetime.now().isoformat()
                }
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON response: {e}")
                logger.error(f"Response content: {content}")
                return {
                    "success": False,
                    "error": "Failed to parse GPT-4o response",
                    "raw_response": content
                }
                
        except Exception as e:
            logger.error(f"Error in GPT-4o Vision analysis: {e}")
            return {
                "success": False,
                "error": f"GPT-4o Vision analysis failed: {str(e)}"
            }
    
    def _create_system_prompt(self) -> str:
        """Create the system prompt for GPT-4o Vision analysis."""
        return """You are a vision document analyst specializing in table structure analysis. Your task is to analyze PDF page images and extract precise table information.

CRITICAL REQUIREMENTS:
1. Transcribe table headers EXACTLY as seen - do not normalize, interpret, or guess
2. For multi-line, multi-row, or complex headers, output the complete header block with all text and alignment
3. IMPORTANT: When headers are separated by pipes (|), split them into individual column headers
4. For multi-line headers, combine corresponding columns intelligently (e.g., "ACCOUNT | POLICY NAME" + "NUMBER | EXPLANATION" = "ACCOUNT NUMBER", "POLICY NAME OR EXPLANATION")
5. CRITICAL DATA ASSIGNMENT: When you see combined data in a single cell (like "GRT LOGISTICS LL ONAPG O7 O1 2O25 VISION 3.61"), intelligently parse and assign values to the correct columns based on:
   - Header names (e.g., if there's a "DUE DATE" column, assign date-like values there)
   - Data patterns (dates, company names, product codes, amounts, percentages)
   - Financial statement context (account numbers, policy names, premium amounts, rates)
   - NEVER invent or guess data - only parse what's actually visible
6. List 1-2 example cell values per column exactly as visible (do not invent)
7. Infer column data types from visible values
8. Note any merged cells, split columns, or structural ambiguity
9. Never create headers or data that are not exactly visible in the images

OUTPUT FORMAT:
Return a structured JSON with this exact format:
{
    "pages": [
        {
            "page_number": 1,
            "headers": ["individual column header 1", "individual column header 2", ...],
            "header_alignment": "multi-line" or "single row" or "blank",
            "columns": [
                {
                    "header_text": "exact header as seen",
                    "sample_values": ["exact value 1", "exact value 2"],
                    "data_type": "number" or "date" or "text" or "currency"
                }
            ],
            "structure_notes": "Describe any merged cells, ambiguity, or structural issues",
            "header_coordinates": [[x0, y0, x1, y1], ...] (optional)
        }
    ],
    "overall_notes": "Describe header repetition, column changes between pages, or structural patterns"
}

Remember: Precision over interpretation. Show exactly what you see."""
    
    def _create_user_prompt(self, current_extraction: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Create the user prompt with current extraction context."""
        context = f"""
Current extraction has {len(current_extraction)} tables with the following structure:
"""
        
        for i, table in enumerate(current_extraction):
            headers = table.get('header', [])
            context += f"\nTable {i+1}: Headers: {headers[:5]}{'...' if len(headers) > 5 else ''}"
        
        context += """

Please analyze the provided page images and provide the structured JSON response as specified in the system prompt. Focus on:
1. Exact header transcription
2. Intelligent data parsing and assignment to correct columns
3. Sample data values for each column
4. Column data types (text, number, date, currency, percentage)
5. Structural issues or ambiguity
6. Header repetition patterns across pages

IMPORTANT: When you see combined data like "1130414-10001 GRT LOGISTICS LL ONAPG O7 O1 2O25 VISION 3.61", parse it intelligently:
- "1130414-10001" → Account Number
- "GRT LOGISTICS LL" → Policy Name/Company
- "ONAPG" → Product Name
- "O7 O1 2O25" → Due Date (if date column exists)
- "VISION" → Product Type
- "3.61" → Amount/Rate (based on column type)

CRITICAL: For each column in the headers, provide sample values that show how the combined data should be parsed and assigned to the correct columns.

Be precise and only report what you can clearly see in the images."""
        
        return [{"type": "text", "text": context}]
    
    def process_improvement_result(self, 
                                 vision_analysis: Dict[str, Any], 
                                 current_tables: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Process the GPT-4o Vision analysis to improve current table extraction.
        
        Args:
            vision_analysis: Result from GPT-4o Vision analysis
            current_tables: Current table extraction results
            
        Returns:
            Improved table structure and metadata
        """
        if not vision_analysis.get("success"):
            return {
                "success": False,
                "error": vision_analysis.get("error", "Vision analysis failed")
            }
        
        try:
            analysis = vision_analysis.get("analysis", {})
            pages = analysis.get("pages", [])
            
            # Process each page's analysis
            improved_tables = []
            diagnostic_info = {
                "vision_analysis": analysis,
                "improvements": [],
                "warnings": []
            }
            
            for page in pages:
                page_num = page.get("page_number", 1)
                headers = page.get("headers", [])
                columns = page.get("columns", [])
                structure_notes = page.get("structure_notes", "")
                
                # Process headers - if they're still pipe-separated, split them
                processed_headers = []
                for header in headers:
                    if "|" in header:
                        # Split by pipe and clean up
                        split_headers = [h.strip() for h in header.split("|") if h.strip()]
                        processed_headers.extend(split_headers)
                    else:
                        processed_headers.append(header)
                
                # Remove duplicates and empty headers
                processed_headers = [h for h in processed_headers if h and h not in ['|', '']]
                
                # Create improved table structure
                improved_table = {
                    "header": processed_headers,
                    "rows": [],  # Will be populated from current extraction
                    "name": f"Page {page_num} - Vision Enhanced",
                    "metadata": {
                        "enhancement_method": "gpt4o_vision",
                        "page_number": page_num,
                        "header_alignment": page.get("header_alignment", "unknown"),
                        "structure_notes": structure_notes,
                        "column_analysis": columns,
                        "original_headers": headers,
                        "processed_headers": processed_headers
                    }
                }
                
                # Try to align current data with vision-detected headers
                if current_tables and len(current_tables) > 0:
                    # Use the first table as reference for now
                    current_table = current_tables[0]
                    original_rows = current_table.get("rows", [])
                    
                    # Parse and restructure rows based on GPT-4o analysis
                    improved_rows = []
                    for row in original_rows:
                        if not row or len(row) == 0:
                            continue
                            
                        # If we have a single cell with combined data, try to parse it
                        if len(row) == 1 and isinstance(row[0], str):
                            combined_data = row[0]
                            parsed_row = self._parse_combined_data(combined_data, processed_headers)
                            if parsed_row:
                                improved_rows.append(parsed_row)
                            else:
                                # Fallback: keep original row
                                improved_rows.append(row)
                        else:
                            # Multiple cells - keep as is for now
                            improved_rows.append(row)
                    
                    improved_table["rows"] = improved_rows
                
                improved_tables.append(improved_table)
                
                # Add diagnostic information
                diagnostic_info["improvements"].append({
                    "page": page_num,
                    "original_headers": headers,
                    "processed_headers": processed_headers,
                    "column_count": len(processed_headers),
                    "structure_notes": structure_notes
                })
                
                if structure_notes:
                    diagnostic_info["warnings"].append({
                        "page": page_num,
                        "issue": structure_notes
                    })
            
            return {
                "success": True,
                "improved_tables": improved_tables,
                "diagnostic_info": diagnostic_info,
                "overall_notes": analysis.get("overall_notes", ""),
                "enhancement_timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error processing improvement result: {e}")
            return {
                "success": False,
                "error": f"Failed to process improvement result: {str(e)}"
            }
    
    def _parse_combined_data(self, combined_data: str, headers: List[str]) -> Optional[List[str]]:
        """
        Intelligently parse combined data and assign to correct columns based on headers.
        
        Args:
            combined_data: String like "GRT LOGISTICS LL ONAPG O7 O1 2O25 VISION 3.61"
            headers: List of column headers like ["ACCOUNT NUMBER", "POLICY NAME OR EXPLANATION", ...]
            
        Returns:
            Parsed row with values assigned to correct columns, or None if parsing fails
        """
        try:
            # Initialize result array with empty strings
            result = [""] * len(headers)
            
            # Split the combined data by spaces
            parts = combined_data.split()
            
            # Define patterns for different data types
            date_pattern = r'\b\d{1,2}\s+\d{1,2}\s+\d{4}\b'  # MM DD YYYY
            amount_pattern = r'\b\d+\.\d+\b'  # Decimal numbers
            product_pattern = r'\b[A-Z]{2,}\b'  # Uppercase product codes
            company_pattern = r'\b[A-Z][A-Z\s]+\b'  # Company names
            account_pattern = r'\b\d{7}-\d{5}\b'  # Account number pattern like 1130414-10001
            
            # Find header indices for different types
            date_header_indices = [i for i, h in enumerate(headers) if 'date' in h.lower()]
            amount_header_indices = [i for i, h in enumerate(headers) if any(word in h.lower() for word in ['amount', 'rate', 'premium', 'compensation'])]
            product_header_indices = [i for i, h in enumerate(headers) if 'product' in h.lower()]
            company_header_indices = [i for i, h in enumerate(headers) if any(word in h.lower() for word in ['policy', 'name', 'explanation'])]
            account_header_indices = [i for i, h in enumerate(headers) if 'account' in h.lower()]
            
            # For now, let's use a simpler approach - let GPT-4o handle the parsing
            # This is a fallback that just assigns parts to available columns
            current_part = 0
            for i, header in enumerate(headers):
                if current_part < len(parts):
                    result[i] = parts[current_part]
                    current_part += 1
            
            return result
            
        except Exception as e:
            logger.error(f"Error parsing combined data '{combined_data}': {e}")
            return None 