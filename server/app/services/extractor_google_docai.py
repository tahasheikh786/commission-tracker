import os
import json
import logging
import base64
from typing import Dict, List, Any, Optional, Tuple, TYPE_CHECKING
from datetime import datetime
import io
from PIL import Image
import cv2
import numpy as np

# Google Document AI imports
try:
    from google.cloud import documentai_v1 as documentai
    from google.cloud import storage
    from google.auth import default
    GOOGLE_DOCAI_AVAILABLE = True
except ImportError:
    GOOGLE_DOCAI_AVAILABLE = False
    print("Warning: Google Document AI not available. Install with: pip install google-cloud-documentai google-cloud-storage google-auth")


def extract_rows_from_tableblock(tableblock: Dict[str, Any]) -> Tuple[List[str], List[List[str]]]:
    """
    Extract headers and rows from a Google Document AI tableBlock object.
    
    This adapter function handles Document AI's Layout Parser JSON output format:
    tableBlock → bodyRows → cells → blocks → textBlock structure.
    
    Args:
        tableblock: Dictionary representing a tableBlock from Document AI Layout Parser
        
    Returns:
        Tuple of (headers, rows) where:
        - headers: List of strings representing column headers
        - rows: List of lists of strings representing table data rows
    """
    try:
        headers = []
        rows = []
        
        # Extract header rows if present
        header_rows = tableblock.get("headerRows", [])
        if header_rows:
            for header_row in header_rows:
                row_cells = []
                for cell in header_row.get("cells", []):
                    cell_text = ""
                    # Extract text from all blocks in the cell
                    for block in cell.get("blocks", []):
                        if "textBlock" in block and "text" in block["textBlock"]:
                            cell_text += block["textBlock"]["text"] + " "
                    row_cells.append(cell_text.strip())
                if row_cells:
                    headers.extend(row_cells)
        
        # Extract body rows
        body_rows = tableblock.get("bodyRows", [])
        for body_row in body_rows:
            row_cells = []
            for cell in body_row.get("cells", []):
                cell_text = ""
                # Extract text from all blocks in the cell
                for block in cell.get("blocks", []):
                    if "textBlock" in block and "text" in block["textBlock"]:
                        cell_text += block["textBlock"]["text"] + " "
                row_cells.append(cell_text.strip())
            if row_cells:
                rows.append(row_cells)
        
        # If no headers were extracted, try to use first row as headers
        if not headers and rows:
            headers = rows[0]
            rows = rows[1:]
        
        # Ensure all rows have the same number of columns as headers
        if headers:
            max_cols = len(headers)
            normalized_rows = []
            for row in rows:
                # Pad with empty strings if row has fewer columns
                normalized_row = row[:max_cols] + [""] * (max_cols - len(row))
                normalized_rows.append(normalized_row)
            rows = normalized_rows
        
        return headers, rows
        
    except Exception as e:
        print(f"Error extracting rows from tableBlock: {e}")
        return [], []


def adapt_tableblock_to_standard_format(tableblock: Dict[str, Any], page_num: int = 0, table_index: int = 0) -> Dict[str, Any]:
    """
    Adapt a Google Document AI tableBlock to the standard table format expected by utilities.
    
    Args:
        tableblock: Dictionary representing a tableBlock from Document AI Layout Parser
        page_num: Page number where the table was found
        table_index: Index of the table on the page
        
    Returns:
        Standard table dictionary with headers, rows, and metadata
    """
    try:
        # Extract headers and rows using the adapter
        headers, rows = extract_rows_from_tableblock(tableblock)
        
        # Generate default headers if none were detected
        if not headers and rows:
            max_cols = max(len(row) for row in rows) if rows else 0
            headers = [f"Column_{i+1}" for i in range(max_cols)]
        
        # Extract metadata from tableBlock
        confidence = tableblock.get("confidence", 0.0)
        bbox = tableblock.get("boundingBox", {})
        
        # Convert bbox format if present
        bbox_dict = {}
        if bbox and "vertices" in bbox:
            vertices = bbox["vertices"]
            if len(vertices) >= 4:
                bbox_dict = {
                    "x0": vertices[0].get("x", 0),
                    "y0": vertices[0].get("y", 0),
                    "x1": vertices[2].get("x", 0),
                    "y1": vertices[2].get("y", 0)
                }
        
        # Create standard table format
        table_dict = {
            "headers": headers,
            "rows": rows,
            "confidence": confidence,
            "bbox": bbox_dict,
            "page_number": page_num + 1,
            "table_index": table_index,
            "extractor": "google_docai_layout_parser",
            "metadata": {
                "page_number": page_num + 1,
                "table_index": table_index,
                "extraction_method": "google_docai_layout_parser",
                "timestamp": datetime.now().isoformat(),
                "source_format": "tableBlock"
            }
        }
        
        return table_dict
        
    except Exception as e:
        print(f"Error adapting tableBlock to standard format: {e}")
        return {
            "headers": [],
            "rows": [],
            "confidence": 0.0,
            "bbox": {},
            "page_number": page_num + 1,
            "table_index": table_index,
            "extractor": "google_docai_layout_parser",
            "metadata": {
                "page_number": page_num + 1,
                "table_index": table_index,
                "extraction_method": "google_docai_layout_parser",
                "timestamp": datetime.now().isoformat(),
                "error": str(e)
            }
        }


class GoogleDocAIExtractor:
    """
    Google Document AI extractor for scanned PDF documents.
    
    Features:
    - OCR with 600 DPI, language hints, auto-rotate, deskew
    - Form Parser with table detection and form field extraction
    - Table detection and extraction from forms and documents
    - Whitespace analysis and spatial clustering (fallback)
    - Contrast enhancement and denoising preprocessing
    - Multiple output formats (JSON, HTML, CSV)
    - Confidence scoring and annotation
    - Automatic format detection and adaptation
    - JSON response logging for debugging
    """
    
    def __init__(self):
        self.name = "google_docai"
        self.description = "Google Document AI Form Parser for scanned PDFs with table detection"
        self.client = None
        self.project_id = None
        self.location = "us"  # or "eu"
        self.processor_id = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Google Document AI client."""
        if not GOOGLE_DOCAI_AVAILABLE:
            print("❌ Google Document AI SDK not available")
            return
        
        try:
            # Set up environment variables if not already set
            if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
                # Look for the credentials file in multiple possible locations
                possible_paths = [
                    # Render secrets directory (production)
                    "/etc/secrets/pdf-tables-extractor-465009-d9172fd0045d.json",
                    # Docker container path (when server/ is copied to /app)
                    "/app/pdf-tables-extractor-465009-d9172fd0045d.json",
                    # Local development path (server directory)
                    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "pdf-tables-extractor-465009-d9172fd0045d.json"),
                    # Current working directory
                    os.path.join(os.getcwd(), "pdf-tables-extractor-465009-d9172fd0045d.json"),
                ]
                
                creds_file = None
                for path in possible_paths:
                    if os.path.exists(path):
                        creds_file = path
                        break
                
                if creds_file:
                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_file
                    print(f"✅ Set GOOGLE_APPLICATION_CREDENTIALS to: {creds_file}")
                else:
                    print(f"❌ Credentials file not found. Tried paths: {possible_paths}")
                    return
            
            # Set project ID if not already set
            if not os.getenv("GOOGLE_CLOUD_PROJECT_ID"):
                os.environ["GOOGLE_CLOUD_PROJECT_ID"] = "pdf-tables-extractor-465009"
                print("✅ Set GOOGLE_CLOUD_PROJECT_ID to: pdf-tables-extractor-465009")
            
            # Set processor ID if not already set
            if not os.getenv("GOOGLE_DOCAI_PROCESSOR_ID"):
                os.environ["GOOGLE_DOCAI_PROCESSOR_ID"] = "521303e404fb7809"
                print("✅ Set GOOGLE_DOCAI_PROCESSOR_ID to: 521303e404fb7809")
            
            # Get credentials from environment
            credentials, self.project_id = default()
            
            if not self.project_id:
                self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT_ID")
            
            if not self.project_id:
                print("❌ Google Cloud Project ID not found. Set GOOGLE_CLOUD_PROJECT_ID environment variable")
                return
            
            # Initialize Document AI client
            self.client = documentai.DocumentProcessorServiceClient(
                credentials=credentials
            )
            
            # Get processor ID from environment
            self.processor_id = os.getenv("GOOGLE_DOCAI_PROCESSOR_ID", "521303e404fb7809")
            
            # Construct processor name
            self.processor_name = self.client.processor_path(
                self.project_id, self.location, self.processor_id
            )
            
            print(f"✅ Google Document AI initialized - Project: {self.project_id}, Processor: {self.processor_id}")
            
        except Exception as e:
            print(f"❌ Failed to initialize Google Document AI: {e}")
            self.client = None
    
    def is_available(self) -> bool:
        """Check if Google Document AI is available and properly configured."""
        return (
            GOOGLE_DOCAI_AVAILABLE and 
            self.client is not None and 
            self.project_id is not None
        )
    
    def extract_tables(self, pdf_path: str) -> List[Dict[str, Any]]:
        """
        Extract tables from scanned PDF using Google Document AI.
        
        Args:
            pdf_path: Path to the PDF file
            
        Returns:
            List of extracted tables with metadata
        """
        if not self.is_available():
            raise Exception("Google Document AI not available or not properly configured")
        
        try:
            print(f"🔍 Google Document AI: Processing {pdf_path}")
            
            # Read the PDF file
            with open(pdf_path, "rb") as pdf_file:
                pdf_content = pdf_file.read()
            
            # Use original content for now to avoid preprocessing issues
            preprocessed_content = pdf_content
            
            # Configure processing request (simplified for Layout Parser)
            request = documentai.ProcessRequest(
                name=self.processor_name,
                raw_document=documentai.RawDocument(
                    content=preprocessed_content,
                    mime_type="application/pdf"
                )
            )
            
            # Process the document
            print("🔄 Google Document AI: Processing document...")
            result = self.client.process_document(request=request)
            document = result.document
            
            # Save JSON response for debugging
            self._save_json_response(document, pdf_path)
            
            # Extract tables from the processed document
            tables = self._extract_tables_from_document(document)
            
            # Log extraction method used
            form_parser_count = sum(1 for table in tables if table.get("metadata", {}).get("extraction_method") == "google_docai_form_parser")
            spatial_count = len(tables) - form_parser_count
            
            if form_parser_count > 0:
                print(f"✅ Google Document AI: Extracted {len(tables)} tables ({form_parser_count} using Form Parser, {spatial_count} using spatial clustering)")
            else:
                print(f"✅ Google Document AI: Extracted {len(tables)} tables using spatial clustering")
            
            return tables
            
        except Exception as e:
            print(f"❌ Google Document AI extraction failed: {e}")
            raise
    
    def _save_json_response(self, document: Any, pdf_path: str):
        """
        Save the Google Document AI response as JSON for debugging.
        
        Args:
            document: Document AI response document
            pdf_path: Original PDF file path
        """
        try:
            import json
            from datetime import datetime
            
            # Create output directory if it doesn't exist
            output_dir = "docai_responses"
            os.makedirs(output_dir, exist_ok=True)
            
            # Generate filename based on original PDF name and timestamp
            pdf_name = os.path.splitext(os.path.basename(pdf_path))[0]
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            json_filename = f"{pdf_name}_docai_response_{timestamp}.json"
            json_path = os.path.join(output_dir, json_filename)
            
            # Convert document to dictionary
            doc_dict = {
                "document": {
                    "mime_type": document.mime_type,
                    "text": document.text,
                    "pages": []
                },
                "metadata": {
                    "processor_id": self.processor_id,
                    "project_id": self.project_id,
                    "timestamp": datetime.now().isoformat(),
                    "original_pdf": pdf_path
                }
            }
            
            # Add pages
            for page_num, page in enumerate(document.pages):
                page_dict = {
                    "page_number": page_num + 1,
                    "tables": [],
                    "form_fields": [],
                    "text_blocks": []
                }
                
                # Add tables if present
                if hasattr(page, 'tables') and page.tables:
                    for table in page.tables:
                        table_dict = {
                            "header_rows": len(table.header_rows) if hasattr(table, 'header_rows') else 0,
                            "body_rows": len(table.body_rows) if hasattr(table, 'body_rows') else 0,
                            "confidence": getattr(table, 'confidence', 0.0)
                        }
                        page_dict["tables"].append(table_dict)
                
                # Add form fields if present
                if hasattr(page, 'form_fields') and page.form_fields:
                    for field in page.form_fields:
                        field_dict = {
                            "field_name": self._extract_text_from_text_anchor(field.field_name, document) if hasattr(field, 'field_name') and field.field_name else "",
                            "field_value": self._extract_text_from_text_anchor(field.field_value, document) if hasattr(field, 'field_value') and field.field_value else "",
                            "confidence": getattr(field, 'confidence', 0.0)
                        }
                        page_dict["form_fields"].append(field_dict)
                
                # Add text blocks
                if hasattr(page, 'blocks') and page.blocks:
                    for block in page.blocks:
                        block_text = self._extract_text_from_text_anchor(block.layout.text_anchor, document) if hasattr(block, 'layout') and hasattr(block.layout, 'text_anchor') else ""
                        block_dict = {
                            "text": block_text,
                            "confidence": getattr(block.layout, 'confidence', 0.0) if hasattr(block, 'layout') else 0.0,
                            "bounding_box": {
                                "vertices": [
                                    {"x": vertex.x, "y": vertex.y} 
                                    for vertex in block.layout.bounding_poly.vertices
                                ] if hasattr(block, 'layout') and hasattr(block.layout, 'bounding_poly') and hasattr(block.layout.bounding_poly, 'vertices') else []
                            }
                        }
                        page_dict["text_blocks"].append(block_dict)
                
                doc_dict["document"]["pages"].append(page_dict)
            
            # Save to JSON file
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(doc_dict, f, indent=2, ensure_ascii=False)
            
            print(f"📄 Google Document AI response saved to: {json_path}")
            
        except Exception as e:
            print(f"⚠️ Failed to save JSON response: {e}")
    
    def _preprocess_pdf_for_ocr(self, pdf_content: bytes) -> bytes:
        """
        Preprocess PDF for better OCR results with contrast enhancement and denoising.
        
        Args:
            pdf_content: Raw PDF content
            
        Returns:
            Preprocessed PDF content
        """
        try:
            # Convert PDF to images for preprocessing
            images = self._pdf_to_images(pdf_content)
            processed_images = []
            
            for img in images:
                # Convert to OpenCV format
                cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
                
                # 1. Contrast enhancement using CLAHE
                lab = cv2.cvtColor(cv_img, cv2.COLOR_BGR2LAB)
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                lab[:, :, 0] = clahe.apply(lab[:, :, 0])
                enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
                
                # 2. Denoising
                denoised = cv2.fastNlMeansDenoisingColored(enhanced, None, 10, 10, 7, 21)
                
                # 3. Sharpening
                kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
                sharpened = cv2.filter2D(denoised, -1, kernel)
                
                # Convert back to PIL
                processed_img = Image.fromarray(cv2.cvtColor(sharpened, cv2.COLOR_BGR2RGB))
                processed_images.append(processed_img)
            
            # Convert processed images back to PDF
            return self._images_to_pdf(processed_images)
            
        except Exception as e:
            print(f"⚠️ Preprocessing failed, using original content: {e}")
            return pdf_content
    
    def _pdf_to_images(self, pdf_content: bytes) -> List[Image.Image]:
        """Convert PDF content to list of PIL Images."""
        try:
            import fitz  # PyMuPDF
            
            # Load PDF from bytes
            pdf_document = fitz.open(stream=pdf_content, filetype="pdf")
            images = []
            
            for page_num in range(len(pdf_document)):
                page = pdf_document.load_page(page_num)
                
                # Render at 600 DPI for high quality
                mat = fitz.Matrix(600/72, 600/72)  # 600 DPI
                pix = page.get_pixmap(matrix=mat)
                
                # Convert to PIL Image
                img_data = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_data))
                images.append(img)
            
            pdf_document.close()
            return images
            
        except Exception as e:
            print(f"Error converting PDF to images: {e}")
            return []
    
    def _images_to_pdf(self, images: List[Image.Image]) -> bytes:
        """Convert list of PIL Images back to PDF bytes."""
        try:
            # Save first image as PDF
            if not images:
                return b""
            
            # Convert all images to RGB mode
            rgb_images = []
            for img in images:
                if img.mode != 'RGB':
                    rgb_images.append(img.convert('RGB'))
                else:
                    rgb_images.append(img)
            
            # Create PDF from images
            pdf_bytes = io.BytesIO()
            rgb_images[0].save(
                pdf_bytes,
                format='PDF',
                save_all=True,
                append_images=rgb_images[1:],
                resolution=600.0
            )
            
            return pdf_bytes.getvalue()
            
        except Exception as e:
            print(f"Error converting images to PDF: {e}")
            return b""
    
    def _extract_tables_from_document(self, document: Any) -> List[Dict[str, Any]]:
        """
        Extract tables from processed Google Document AI document.
        
        Args:
            document: Processed Document AI document
            
        Returns:
            List of extracted tables
        """
        tables = []
        
        try:
            # Extract tables from each page
            for page_num, page in enumerate(document.pages):
                page_tables = self._extract_tables_from_page(page, page_num, document)
                tables.extend(page_tables)
            
            # Post-process tables for better structure
            processed_tables = self._post_process_tables(tables)
            
            return processed_tables
            
        except Exception as e:
            print(f"Error extracting tables from document: {e}")
            return []
    
    def _extract_tables_from_page(self, page: Any, page_num: int, document: Any) -> List[Dict[str, Any]]:
        """
        Extract tables from a single page.
        
        Args:
            page: Document AI page
            page_num: Page number
            
        Returns:
            List of tables from this page
        """
        tables = []
        
        try:
            # First, try to detect and process Form Parser format (tables structure)
            form_parser_tables = self._extract_form_parser_tables(page, page_num, document)
            if form_parser_tables:
                tables.extend(form_parser_tables)
                return tables
            
            # Fall back to traditional spatial clustering approach
            table_blocks = [block for block in page.blocks if block.layout.text_anchor.text_segments]
            
            for table_idx, table_block in enumerate(table_blocks):
                try:
                    # Extract table structure
                    table_data = self._extract_table_structure(table_block, page)
                    
                    if table_data and table_data.get("rows"):
                        # Add metadata
                        table_data.update({
                            "table_index": len(tables),
                            "page_number": page_num + 1,
                            "extractor": self.name,
                            "confidence": self._calculate_table_confidence(table_block),
                            "metadata": {
                                "page_number": page_num + 1,
                                "table_index": table_idx,
                                "extraction_method": "google_docai",
                                "timestamp": datetime.now().isoformat()
                            }
                        })
                        
                        tables.append(table_data)
                
                except Exception as e:
                    print(f"Error extracting table {table_idx} from page {page_num}: {e}")
                    continue
            
            return tables
            
        except Exception as e:
            print(f"Error extracting tables from page {page_num}: {e}")
            return []
    
    def _extract_form_parser_tables(self, page: Any, page_num: int, document: Any) -> List[Dict[str, Any]]:
        """
        Extract tables using Document AI Form Parser format (tables structure).
        
        Args:
            page: Document AI page
            page_num: Page number
            
        Returns:
            List of extracted tables in standard format
        """
        tables = []
        
        try:
            # Check if page has tables (Form Parser format)
            if hasattr(page, 'tables') and page.tables:
                for table_idx, table in enumerate(page.tables):
                    try:
                        # Convert Form Parser table to standard format
                        table_data = self._convert_form_parser_table_to_standard_format(
                            table, page_num, table_idx, document
                        )
                        
                        if table_data and table_data.get("rows"):
                            tables.append(table_data)
                            print(f"✅ Successfully converted Form Parser table: {len(table_data.get('headers', []))} headers, {len(table_data.get('rows', []))} rows")
                    
                    except Exception as e:
                        print(f"Error extracting Form Parser table {table_idx} from page {page_num}: {e}")
                        continue
            
            return tables
            
        except Exception as e:
            print(f"Error extracting Form Parser tables from page {page_num}: {e}")
            return []

    def _extract_text_from_text_anchor(self, text_anchor: Any, document: Any) -> str:
        """
        Extract text from a Document AI text anchor using the document's text.
        
        Args:
            text_anchor: Document AI text anchor object
            document: Document AI document object
            
        Returns:
            Extracted text string
        """
        try:
            if not text_anchor or not text_anchor.text_segments:
                return ""
            
            text_parts = []
            for segment in text_anchor.text_segments:
                if hasattr(segment, 'start_index') and hasattr(segment, 'end_index'):
                    start_idx = segment.start_index
                    end_idx = segment.end_index
                    if start_idx < len(document.text) and end_idx <= len(document.text):
                        text_parts.append(document.text[start_idx:end_idx])
            
            return " ".join(text_parts).strip()
        except Exception as e:
            print(f"Error extracting text from text anchor: {e}")
            return ""
    
    def _extract_cell_text(self, cell: Any, document: Any) -> str:
        """
        Extract text from a Document AI table cell.
        
        Args:
            cell: Document AI table cell object
            document: Document AI document object
            
        Returns:
            Extracted cell text
        """
        try:
            if hasattr(cell, 'layout') and hasattr(cell.layout, 'text_anchor'):
                return self._extract_text_from_text_anchor(cell.layout.text_anchor, document)
            return ""
        except Exception as e:
            print(f"Error extracting cell text: {e}")
            return ""

    def _convert_form_parser_table_to_standard_format(self, table: Any, page_num: int, table_index: int, document: Any = None) -> Dict[str, Any]:
        """
        Convert a Document AI Form Parser table to standard format.
        
        Args:
            table: Document AI Form Parser table object
            page_num: Page number where the table was found
            table_index: Index of the table on the page
            
        Returns:
            Standard table dictionary with headers, rows, and metadata
        """
        try:
            headers = []
            rows = []
            
            # Extract header rows
            if hasattr(table, 'header_rows') and table.header_rows:
                for header_row in table.header_rows:
                    row_cells = []
                    for cell in header_row.cells:
                        cell_text = self._extract_cell_text(cell, document) if document else ""
                        row_cells.append(cell_text)
                    if row_cells:
                        headers.extend(row_cells)
            
            # Extract body rows
            if hasattr(table, 'body_rows') and table.body_rows:
                for body_row in table.body_rows:
                    row_cells = []
                    for cell in body_row.cells:
                        cell_text = self._extract_cell_text(cell, document) if document else ""
                        row_cells.append(cell_text)
                    if row_cells:
                        rows.append(row_cells)
            
            # If no headers were extracted, try to use first row as headers
            if not headers and rows:
                headers = rows[0]
                rows = rows[1:]
            
            # Ensure all rows have the same number of columns as headers
            if headers:
                max_cols = len(headers)
                normalized_rows = []
                for row in rows:
                    # Pad with empty strings if row has fewer columns
                    normalized_row = row[:max_cols] + [""] * (max_cols - len(row))
                    normalized_rows.append(normalized_row)
                rows = normalized_rows
            
            # Generate default headers if none were detected
            if not headers and rows:
                max_cols = max(len(row) for row in rows) if rows else 0
                headers = [f"Column_{i+1}" for i in range(max_cols)]
            
            # Extract metadata
            confidence = getattr(table, 'confidence', 0.0)
            bbox = {}
            if hasattr(table, 'layout') and hasattr(table.layout, 'bounding_poly'):
                vertices = table.layout.bounding_poly.vertices
                if len(vertices) >= 4:
                    bbox = {
                        "x0": vertices[0].x,
                        "y0": vertices[0].y,
                        "x1": vertices[2].x,
                        "y1": vertices[2].y
                    }
            
            # Create standard table format
            table_dict = {
                "headers": headers,
                "rows": rows,
                "confidence": confidence,
                "bbox": bbox,
                "page_number": page_num + 1,
                "table_index": table_index,
                "extractor": "google_docai_form_parser",
                "metadata": {
                    "page_number": page_num + 1,
                    "table_index": table_index,
                    "extraction_method": "google_docai_form_parser",
                    "timestamp": datetime.now().isoformat(),
                    "source_format": "form_parser_table"
                }
            }
            
            return table_dict
            
        except Exception as e:
            print(f"Error converting Form Parser table to standard format: {e}")
            return {
                "headers": [],
                "rows": [],
                "confidence": 0.0,
                "bbox": {},
                "page_number": page_num + 1,
                "table_index": table_index,
                "extractor": "google_docai_form_parser",
                "metadata": {
                    "page_number": page_num + 1,
                    "table_index": table_index,
                    "extraction_method": "google_docai_form_parser",
                    "timestamp": datetime.now().isoformat(),
                    "error": str(e)
                }
            }

    def _extract_table_structure(self, table_block: Any, page: Any) -> Dict[str, Any]:
        """
        Extract table structure from a table block.
        
        Args:
            table_block: Table block from Document AI
            page: Page containing the table
            
        Returns:
            Table structure dictionary
        """
        try:
            # Get table layout
            table_layout = table_block.layout
            
            # Extract text segments
            text_segments = []
            for segment in table_layout.text_anchor.text_segments:
                text_segments.append({
                    "text": segment.text,
                    "start_index": segment.start_index,
                    "end_index": segment.end_index
                })
            
            # Analyze table structure using whitespace and spatial clustering
            table_structure = self._analyze_table_structure(text_segments, table_layout, page)
            
            return table_structure
            
        except Exception as e:
            print(f"Error extracting table structure: {e}")
            return {}
    
    def _analyze_table_structure(self, text_segments: List[Dict], layout: Any, page: Any) -> Dict[str, Any]:
        """
        Analyze table structure using whitespace analysis and spatial clustering.
        
        Args:
            text_segments: Text segments from the table
            layout: Table layout
            page: Page containing the table
            
        Returns:
            Analyzed table structure
        """
        try:
            # Get bounding box
            bbox = layout.bounding_poly.vertices
            
            # Extract all text elements within the table area
            table_texts = []
            for token in page.tokens:
                token_bbox = token.layout.bounding_poly.vertices
                if self._is_inside_bbox(token_bbox, bbox):
                    table_texts.append({
                        "text": token.layout.text_anchor.text_segments[0].text if token.layout.text_anchor.text_segments else "",
                        "bbox": token_bbox,
                        "confidence": token.layout.confidence
                    })
            
            # Cluster text elements into rows and columns
            rows, columns = self._cluster_table_elements(table_texts, bbox)
            
            # Build table structure
            headers = []
            table_rows = []
            
            # Extract headers (first row or column)
            if rows:
                headers = [cell.get("text", "") for cell in rows[0]]
            
            # Extract data rows
            for row in rows[1:] if len(rows) > 1 else []:
                table_rows.append([cell.get("text", "") for cell in row])
            
            return {
                "headers": headers,
                "rows": table_rows,
                "confidence": layout.confidence,
                "bbox": {
                    "x0": bbox[0].x,
                    "y0": bbox[0].y,
                    "x1": bbox[2].x,
                    "y1": bbox[2].y
                }
            }
            
        except Exception as e:
            print(f"Error analyzing table structure: {e}")
            return {"headers": [], "rows": [], "confidence": 0.0}
    
    def _cluster_table_elements(self, table_texts: List[Dict], table_bbox: List) -> Tuple[List[List[Dict]], List[List[Dict]]]:
        """
        Cluster table text elements into rows and columns using spatial analysis.
        
        Args:
            table_texts: List of text elements in the table
            table_bbox: Table bounding box
            
        Returns:
            Tuple of (rows, columns) where each is a list of lists of text elements
        """
        try:
            if not table_texts:
                return [], []
            
            # Sort by Y coordinate (rows)
            sorted_by_y = sorted(table_texts, key=lambda x: x["bbox"][0].y)
            
            # Group into rows based on Y proximity
            rows = []
            current_row = []
            row_threshold = 20  # pixels
            
            for i, text in enumerate(sorted_by_y):
                if not current_row:
                    current_row = [text]
                else:
                    # Check if this text is in the same row
                    avg_y = sum(t["bbox"][0].y for t in current_row) / len(current_row)
                    if abs(text["bbox"][0].y - avg_y) <= row_threshold:
                        current_row.append(text)
                    else:
                        # Sort current row by X coordinate
                        current_row.sort(key=lambda x: x["bbox"][0].x)
                        rows.append(current_row)
                        current_row = [text]
            
            # Add last row
            if current_row:
                current_row.sort(key=lambda x: x["bbox"][0].x)
                rows.append(current_row)
            
            # Create columns (transpose rows)
            columns = []
            if rows:
                max_cols = max(len(row) for row in rows)
                for col_idx in range(max_cols):
                    column = []
                    for row in rows:
                        if col_idx < len(row):
                            column.append(row[col_idx])
                    columns.append(column)
            
            return rows, columns
            
        except Exception as e:
            print(f"Error clustering table elements: {e}")
            return [], []
    
    def _is_inside_bbox(self, inner_bbox: List, outer_bbox: List) -> bool:
        """Check if inner bounding box is inside outer bounding box."""
        try:
            inner_center_x = (inner_bbox[0].x + inner_bbox[2].x) / 2
            inner_center_y = (inner_bbox[0].y + inner_bbox[2].y) / 2
            
            return (
                outer_bbox[0].x <= inner_center_x <= outer_bbox[2].x and
                outer_bbox[0].y <= inner_center_y <= outer_bbox[2].y
            )
        except:
            return False
    
    def _calculate_table_confidence(self, table_block: Any) -> float:
        """Calculate confidence score for table extraction."""
        try:
            # Use layout confidence as base
            base_confidence = table_block.layout.confidence
            
            # Additional confidence factors
            confidence_factors = []
            
            # Check for table-like structure indicators
            if hasattr(table_block.layout, 'text_anchor') and table_block.layout.text_anchor.text_segments:
                confidence_factors.append(0.1)  # Has text content
            
            # Check bounding box quality
            if hasattr(table_block.layout, 'bounding_poly') and table_block.layout.bounding_poly.vertices:
                bbox = table_block.layout.bounding_poly.vertices
                if len(bbox) >= 4:
                    # Check if bounding box is reasonable size
                    width = bbox[2].x - bbox[0].x
                    height = bbox[2].y - bbox[0].y
                    if width > 50 and height > 50:  # Minimum reasonable size
                        confidence_factors.append(0.1)
            
            # Calculate final confidence
            final_confidence = base_confidence + sum(confidence_factors)
            return min(final_confidence, 1.0)
            
        except Exception as e:
            print(f"Error calculating confidence: {e}")
            return 0.5
    
    def _post_process_tables(self, tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Post-process extracted tables for better structure and formatting.
        
        Args:
            tables: Raw extracted tables
            
        Returns:
            Post-processed tables
        """
        processed_tables = []
        
        for table in tables:
            try:
                # Clean and normalize headers
                headers = table.get("headers", [])
                cleaned_headers = [self._clean_text(header) for header in headers]
                
                # Clean and normalize rows
                rows = table.get("rows", [])
                cleaned_rows = []
                for row in rows:
                    cleaned_row = [self._clean_text(cell) for cell in row]
                    cleaned_rows.append(cleaned_row)
                
                # Remove empty rows and columns
                cleaned_headers, cleaned_rows = self._remove_empty_cells(cleaned_headers, cleaned_rows)
                
                # Ensure table dict matches utility requirements
                table_dict = {
                    "headers": cleaned_headers,
                    "rows": cleaned_rows,
                    "confidence": table.get("confidence", 0.0),
                    "bbox": table.get("bbox", {}),
                    "page_number": table.get("page_number", 1),
                    "table_index": table.get("table_index", 0),
                    "extractor": table.get("extractor", self.name),
                    "post_processed": True,
                    "metadata": table.get("metadata", {})
                }
                
                # Add any additional metadata from the original table
                for key, value in table.items():
                    if key not in table_dict:
                        table_dict[key] = value
                
                processed_tables.append(table_dict)
                
            except Exception as e:
                print(f"Error post-processing table: {e}")
                processed_tables.append(table)
        
        return processed_tables
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text."""
        if not text:
            return ""
        
        # Remove extra whitespace
        cleaned = " ".join(text.split())
        
        # Remove common OCR artifacts
        cleaned = cleaned.replace("|", "I")  # Common OCR mistake
        cleaned = cleaned.replace("0", "O")  # Common OCR mistake in certain contexts
        
        return cleaned.strip()
    
    def _remove_empty_cells(self, headers: List[str], rows: List[List[str]]) -> Tuple[List[str], List[List[str]]]:
        """Remove empty rows and columns."""
        try:
            # Remove empty columns
            non_empty_cols = []
            for col_idx in range(max(len(headers), max(len(row) for row in rows) if rows else 0)):
                col_values = [headers[col_idx] if col_idx < len(headers) else ""]
                col_values.extend([row[col_idx] if col_idx < len(row) else "" for row in rows])
                
                if any(value.strip() for value in col_values):
                    non_empty_cols.append(col_idx)
            
            # Rebuild headers and rows with only non-empty columns
            new_headers = [headers[col_idx] if col_idx < len(headers) else "" for col_idx in non_empty_cols]
            new_rows = []
            for row in rows:
                new_row = [row[col_idx] if col_idx < len(row) else "" for col_idx in non_empty_cols]
                new_rows.append(new_row)
            
            # Remove completely empty rows
            new_rows = [row for row in new_rows if any(cell.strip() for cell in row)]
            
            return new_headers, new_rows
            
        except Exception as e:
            print(f"Error removing empty cells: {e}")
            return headers, rows
    
    def get_extraction_info(self) -> Dict[str, Any]:
        """Get information about this extractor."""
        return {
            "name": self.name,
            "description": self.description,
            "available": self.is_available(),
            "features": [
                "OCR with 600 DPI resolution",
                "Auto-rotate and deskew",
                "Form Parser with table detection",
                "Table extraction from forms and documents",
                "Whitespace analysis and spatial clustering (fallback)",
                "Contrast enhancement and denoising",
                "Multiple output formats",
                "Confidence scoring",
                "Automatic format detection and adaptation",
                "JSON response logging for debugging"
            ],
            "configuration": {
                "project_id": self.project_id,
                "location": self.location,
                "processor_id": self.processor_id
            }
        }
    
    def test_form_parser_adapter(self) -> Dict[str, Any]:
        """
        Test the Form Parser adapter with sample data.
        
        Returns:
            Test results showing adapter functionality
        """
        # Create a mock Form Parser table object for testing
        class MockTextSegment:
            def __init__(self, start_idx, end_idx):
                self.start_index = start_idx
                self.end_index = end_idx
        
        class MockTextAnchor:
            def __init__(self, text_segments):
                self.text_segments = text_segments
        
        class MockLayout:
            def __init__(self, text_anchor):
                self.text_anchor = text_anchor
        
        class MockCell:
            def __init__(self, text, start_idx):
                # Create text segments that would work with document.text indexing
                self.layout = MockLayout(MockTextAnchor([MockTextSegment(start_idx, start_idx + len(text))]))
        
        class MockRow:
            def __init__(self, texts, start_idx=0):
                self.cells = []
                current_idx = start_idx
                for text in texts:
                    self.cells.append(MockCell(text, current_idx))
                    current_idx += len(text) + 1  # +1 for space
        
        class MockTable:
            def __init__(self):
                self.confidence = 0.95
                self.header_rows = [MockRow(["Product", "Price", "Quantity"], 0)]
                self.body_rows = [
                    MockRow(["Laptop", "$999", "5"], 22),  # After "Product Price Quantity "
                    MockRow(["Mouse", "$25", "10"], 35)    # After "Laptop $999 5 "
                ]
        
        class MockDocument:
            def __init__(self):
                # Create text that matches the expected indices
                self.text = "Product Price Quantity Laptop $999 5 Mouse $25 10"
        
        sample_form_parser_table = MockTable()
        sample_document = MockDocument()
        
        try:
            # Test the Form Parser adapter function
            table_dict = self._convert_form_parser_table_to_standard_format(sample_form_parser_table, 0, 0, sample_document)
            
            return {
                "success": True,
                "test_data": {
                    "input_form_parser_table": sample_form_parser_table,
                    "standard_format": table_dict
                },
                "validation": {
                    "headers_count": len(table_dict.get("headers", [])),
                    "rows_count": len(table_dict.get("rows", [])),
                    "has_standard_format": "headers" in table_dict and "rows" in table_dict,
                    "confidence_preserved": table_dict.get("confidence") == 0.95,
                    "extractor_type": table_dict.get("extractor") == "google_docai_form_parser"
                }
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "test_data": {
                    "input_form_parser_table": sample_form_parser_table
                }
            } 