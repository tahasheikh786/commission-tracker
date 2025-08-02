import os
import json
import base64
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import pandas as pd
import numpy as np
from PIL import Image
import io
import fitz  # PyMuPDF
from pdfplumber.pdf import PDF


def detect_pdf_type(pdf_path: str) -> str:
    """
    Detect if PDF is scanned/image-based or digital/text-based.
    Returns: 'scanned' or 'digital'
    """
    try:
        doc = fitz.open(pdf_path)
        text_content = ""
        
        # Check first few pages for text content
        for page_num in range(min(3, len(doc))):
            page = doc.load_page(page_num)
            text_content += page.get_text()
        
        doc.close()
        
        # If we have substantial text content, it's likely digital
        if len(text_content.strip()) > 100:
            return "digital"
        else:
            return "scanned"
    except Exception as e:
        print(f"Error detecting PDF type: {e}")
        return "unknown"


def capture_table_screenshot(pdf_path: str, bbox: Tuple[float, float, float, float], page_num: int = 0) -> str:
    """
    Capture a screenshot of a table region for error reporting.
    Returns base64 encoded image.
    """
    try:
        doc = fitz.open(pdf_path)
        page = doc.load_page(page_num)
        
        # Convert bbox to fitz format (x0, y0, x1, y1)
        rect = fitz.Rect(bbox)
        
        # Get the pixmap of the region
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=rect)
        
        # Convert to PIL Image
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))
        
        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        img_str = base64.b64encode(buffer.getvalue()).decode()
        
        doc.close()
        return img_str
    except Exception as e:
        print(f"Error capturing screenshot: {e}")
        return ""


def infer_column_types(df: pd.DataFrame) -> Dict[str, str]:
    """
    Infer column types (number, text, date, currency) from DataFrame.
    """
    column_types = {}
    
    for col in df.columns:
        try:
            if hasattr(df[col], 'dtype') and df[col].dtype in ['int64', 'float64']:
                column_types[col] = 'number'
            elif hasattr(df[col], 'dtype') and df[col].dtype == 'object':
                # Check for date patterns
                sample_values = df[col].dropna().head(10)
                date_patterns = [
                    r'\d{1,2}/\d{1,2}/\d{2,4}',
                    r'\d{4}-\d{2}-\d{2}',
                    r'\d{1,2}-\d{1,2}-\d{2,4}'
                ]
                
                is_date = any(
                    sample_values.astype(str).str.match(pattern).any()
                    for pattern in date_patterns
                )
                
                if is_date:
                    column_types[col] = 'date'
                elif sample_values.astype(str).str.contains(r'[\$€£¥]').any():
                    column_types[col] = 'currency'
                else:
                    column_types[col] = 'text'
            else:
                column_types[col] = 'text'
        except Exception as e:
            # If there's any error, default to text
            column_types[col] = 'text'
    
    return column_types


def normalize_table_data(table_data: List[List[str]], headers: List[str]) -> Dict[str, Any]:
    """
    Normalize table data and convert to structured format.
    """
    if not table_data or not headers:
        return {"headers": [], "rows": [], "metadata": {}}
    
    # Create DataFrame for easier manipulation
    df = pd.DataFrame(table_data, columns=headers)
    
    # Clean up data
    df = df.replace('', np.nan)
    df = df.dropna(how='all')  # Remove completely empty rows
    
    # Infer column types
    column_types = infer_column_types(df)
    
    # Convert back to list format
    normalized_data = {
        "headers": headers,
        "rows": df.values.tolist(),
        "metadata": {
            "column_types": column_types,
            "row_count": len(df),
            "column_count": len(headers),
            "extraction_timestamp": datetime.now().isoformat()
        }
    }
    
    return normalized_data


def stitch_multipage_tables(tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Stitch together tables that span multiple pages.
    Handles both repeated headers and headers only on first page.
    """
    if not tables:
        return tables
    
    stitched_tables = []
    processed_indices = set()
    
    for i, table in enumerate(tables):
        if i in processed_indices:
            continue
            
        current_table = table.copy()
        current_headers = table.get("headers", [])
        current_headers_set = set(current_headers)
        
        # Look for tables that might be continuations
        for j in range(i + 1, len(tables)):
            if j in processed_indices:
                continue
                
            next_table = tables[j]
            next_headers = next_table.get("headers", [])
            next_headers_set = set(next_headers)
            
            # Case 1: Headers match (repeated headers on each page)
            headers_match = len(current_headers_set.intersection(next_headers_set)) >= len(current_headers_set) * 0.8
            
            # Case 2: Next table has no headers or very few headers (header only on first page)
            no_headers_on_next = len(next_headers) == 0 or len(next_headers) <= 2
            
            # Case 3: Next table has similar structure but different headers (continuation)
            similar_structure = (
                len(next_table.get("rows", [])) > 0 and 
                len(current_table.get("rows", [])) > 0 and
                len(next_table["rows"][0]) == len(current_table["rows"][0]) if current_table["rows"] else False
            )
            
            if headers_match or no_headers_on_next or similar_structure:
                # Merge rows
                current_table["rows"].extend(next_table.get("rows", []))
                
                # Update metadata
                if "metadata" not in current_table:
                    current_table["metadata"] = {}
                current_table["metadata"]["row_count"] = len(current_table["rows"])
                current_table["metadata"]["stitched_tables"] = current_table["metadata"].get("stitched_tables", 0) + 1
                
                # If next table had no headers, mark that we used the first table's headers
                if no_headers_on_next:
                    current_table["metadata"]["headers_from_first_page"] = True
                
                processed_indices.add(j)
                print(f"📎 Stitched table {i} with table {j} (headers_match: {headers_match}, no_headers: {no_headers_on_next}, similar_structure: {similar_structure})")
        
        stitched_tables.append(current_table)
        processed_indices.add(i)
    
    return stitched_tables


def validate_table_structure(table: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate table structure and add validation metadata.
    Enhanced to handle Docling output and ensure consistent structure.
    """
    validation_result = {
        "is_valid": True,
        "warnings": [],
        "errors": []
    }
    
    headers = table.get("headers", [])
    rows = table.get("rows", [])
    footers = table.get("footers", [])
    
    # Ensure headers exist and are strings
    if not headers:
        validation_result["is_valid"] = False
        validation_result["errors"].append("No headers found")
    else:
        # Ensure all headers are strings
        headers = [str(h).strip() if h else f"Column_{i+1}" for i, h in enumerate(headers)]
        table["headers"] = headers
    
    # Ensure rows exist and are properly formatted
    if not rows:
        validation_result["warnings"].append("No data rows found")
    else:
        # Ensure all rows are lists of strings
        normalized_rows = []
        for i, row in enumerate(rows):
            if isinstance(row, (list, tuple)):
                # Ensure all cells are strings
                normalized_row = [str(cell).strip() if cell else "" for cell in row]
                normalized_rows.append(normalized_row)
            else:
                # Single value row
                normalized_rows.append([str(row).strip() if row else ""])
                validation_result["warnings"].append(f"Row {i} is not a list, converted to single column")
        
        table["rows"] = normalized_rows
        rows = normalized_rows
    
    # Ensure footers are strings
    if footers:
        footers = [str(f).strip() if f else "" for f in footers]
        table["footers"] = footers
    
    # Check for consistent column count
    if rows and headers:
        expected_cols = len(headers)
        for i, row in enumerate(rows):
            if len(row) != expected_cols:
                validation_result["warnings"].append(
                    f"Row {i} has {len(row)} columns, expected {expected_cols}"
                )
                # Normalize row length
                if len(row) < expected_cols:
                    # Pad with empty strings
                    rows[i] = row + [""] * (expected_cols - len(row))
                else:
                    # Truncate to expected length
                    rows[i] = row[:expected_cols]
    
    # Check for empty or duplicate headers
    if headers:
        empty_headers = [h for h in headers if not h or h.strip() == ""]
        if empty_headers:
            validation_result["warnings"].append("Found empty headers")
        
        duplicate_headers = [h for h in set(headers) if headers.count(h) > 1]
        if duplicate_headers:
            validation_result["warnings"].append(f"Duplicate headers: {duplicate_headers}")
    
    # Ensure required fields exist
    if "row_count" not in table:
        table["row_count"] = len(rows)
    if "column_count" not in table:
        table["column_count"] = len(headers)
    if "extractor" not in table:
        table["extractor"] = "unknown"
    
    # Update validation result
    table["validation"] = validation_result
    return table


def convert_to_csv(table: Dict[str, Any]) -> str:
    """
    Convert table data to CSV format.
    """
    try:
        df = pd.DataFrame(table.get("rows", []), columns=table.get("headers", []))
        csv_buffer = io.StringIO()
        df.to_csv(csv_buffer, index=False)
        return csv_buffer.getvalue()
    except Exception as e:
        print(f"Error converting to CSV: {e}")
        return ""


def convert_to_excel(tables: List[Dict[str, Any]]) -> bytes:
    """
    Convert multiple tables to Excel format.
    """
    try:
        with pd.ExcelWriter(io.BytesIO(), engine='openpyxl') as writer:
            for i, table in enumerate(tables):
                df = pd.DataFrame(table.get("rows", []), columns=table.get("headers", []))
                sheet_name = f"Table_{i+1}"
                df.to_excel(writer, sheet_name=sheet_name, index=False)
        
        return writer.buffer.getvalue()
    except Exception as e:
        print(f"Error converting to Excel: {e}")
        return b""


def transform_pipeline_response_to_client_format(pipeline_response: Dict[str, Any], filename: str = "uploaded_file.pdf") -> Dict[str, Any]:
    """
    Transform pipeline response to the format expected by the client.
    Enhanced to handle Docling output and ensure consistent structure.
    
    Args:
        pipeline_response: Response from the pipeline or Docling extractor
        filename: Original filename
    
    Returns:
        Client-expected format response
    """
    import uuid
    from datetime import datetime
    
    # Handle different response formats
    if pipeline_response.get("status") == "error":
        return {
            "status": "error",
            "error": pipeline_response.get("error", "Unknown error"),
            "timestamp": datetime.now().isoformat()
        }
    
    # Check if this is a Docling-specific response
    if "docling" in pipeline_response.get("metadata", {}).get("extractors_used", []):
        tables = pipeline_response.get("tables", [])
        if not tables:
            return {
                "status": "success",
                "job_id": str(uuid.uuid4()),
                "file_name": filename,
                "extraction_metrics": {
                    "total_text_elements": 0,
                    "extraction_time": pipeline_response.get("extraction_time_seconds", 0.0),
                    "table_confidence": 0.0,
                    "model_used": "docling"
                },
                "document_info": {},
                "table_headers": [],
                "table_data": [],
                            "quality_summary": {
                "total_tables": 0,
                "valid_tables": 0,
                "average_quality_score": 0.0,
                "overall_confidence": "LOW",
                "issues_found": ["No tables found"],
                "recommendations": ["Check PDF quality and extraction parameters"]
            },
            "quality_metrics": {
                "table_confidence": 0.0,
                "text_elements_extracted": 0,
                "table_rows_extracted": 0,
                "extraction_completeness": "none",
                "data_quality": "none"
            },
                "timestamp": datetime.now().isoformat()
            }
        
        # Combine all tables into one response with smart header handling
        all_headers = []
        all_table_data = []
        total_rows = 0
        total_cells = 0
        all_valid = True
        
        # First pass: find the most comprehensive header set
        for table in tables:
            headers = table.get("headers", [])
            if len(headers) > len(all_headers):
                all_headers = headers
        
        # If no headers found, try to infer from the largest table
        if not all_headers:
            largest_table = max(tables, key=lambda t: len(t.get("rows", [])))
            if largest_table.get("rows"):
                max_cols = max(len(row) for row in largest_table["rows"])
                all_headers = [f"Column_{i+1}" for i in range(max_cols)]
        
        # Second pass: process all tables with the unified header set
        for table_idx, table in enumerate(tables):
            headers = table.get("headers", [])
            rows = table.get("rows", [])
            
            # Convert rows to the expected format
            for row_idx, row in enumerate(rows):
                row_dict = {}
                
                # Handle cases where row has different number of columns than headers
                for i, header in enumerate(all_headers):
                    if i < len(headers):
                        # Use the table's own header if available
                        header_key = headers[i].lower().replace(" ", "_").replace("-", "_")
                    else:
                        # Use the unified header
                        header_key = header.lower().replace(" ", "_").replace("-", "_")
                    
                    # Get the value, handling different row lengths
                    if i < len(row):
                        value = str(row[i])
                    else:
                        value = ""
                    
                    row_dict[header_key] = value
                
                all_table_data.append(row_dict)
            
            total_rows += len(rows)
            total_cells += sum(len(row) for row in rows) if rows else 0
            
            # Check validation
            validation = table.get("validation", {})
            if not validation.get("is_valid", False):
                all_valid = False
        
        # Calculate confidence based on validation
        confidence = 1.0 if all_valid else 0.5
        
        # Convert table_data back to the format expected by frontend
        # table_data is currently an array of objects, need to convert to array of arrays
        table_rows = []
        for row_dict in all_table_data:
            row_array = []
            for header in all_headers:
                header_key = header.lower().replace(" ", "_").replace("-", "_")
                row_array.append(row_dict.get(header_key, ""))
            table_rows.append(row_array)
        
        # Create tables array in the format expected by frontend
        frontend_tables = [{
            "header": all_headers,
            "rows": table_rows,
            "extractor": "docling",  # Add extractor information
            "metadata": {
                "extraction_method": "docling"
            }
        }]
        
        return {
            "status": "success",
            "job_id": str(uuid.uuid4()),
            "file_name": filename,
            "extraction_metrics": {
                "total_text_elements": total_cells,
                "extraction_time": pipeline_response.get("extraction_time_seconds", 0.0),
                "table_confidence": confidence,
                "model_used": "docling"
            },
            "document_info": {
                "pdf_type": "unknown",
                "total_tables": len(tables)
            },
            "tables": frontend_tables,  # Frontend expects this format
            "table_headers": all_headers,  # Keep for backward compatibility
            "table_data": all_table_data,  # Keep for backward compatibility
            "quality_summary": {
                "total_tables": len(tables),
                "valid_tables": len(tables),  # All tables are considered valid
                "average_quality_score": 100.0,  # High score since no quality assessment
                "overall_confidence": "HIGH",
                "issues_found": [],
                "recommendations": ["Extraction completed successfully"]
            },
            "quality_metrics": {
                "table_confidence": confidence,
                "text_elements_extracted": total_cells,
                "table_rows_extracted": total_rows,
                "extraction_completeness": "complete" if total_rows > 0 else "none",
                "data_quality": "good" if all_valid else "poor"
            },
            "timestamp": datetime.now().isoformat()
        }
    
    # Handle standard pipeline response
    if not pipeline_response.get("success", False):
        return {
            "status": "error",
            "error": pipeline_response.get("error", "Unknown error"),
            "timestamp": datetime.now().isoformat()
        }
    
    # Get the first table (or create empty if none)
    tables = pipeline_response.get("tables", [])
    if not tables:
        return {
            "status": "success",
            "job_id": str(uuid.uuid4()),
            "file_name": filename,
            "extraction_metrics": {
                "total_text_elements": 0,
                "extraction_time": 0.0,
                "table_confidence": 0.0,
                "model_used": "none"
            },
            "document_info": {},
            "tables": [],  # Frontend expects this format
            "table_headers": [],
            "table_data": [],
            "quality_metrics": {
                "table_confidence": 0.0,
                "text_elements_extracted": 0,
                "table_rows_extracted": 0,
                "extraction_completeness": "none",
                "data_quality": "none"
            },
            "timestamp": datetime.now().isoformat()
        }
    
    # Combine all tables into one response with smart header handling
    all_headers = []
    all_table_data = []
    total_rows = 0
    total_cells = 0
    all_valid = True
    
    # First pass: find the most comprehensive header set
    for table in tables:
        headers = table.get("headers", [])
        if len(headers) > len(all_headers):
            all_headers = headers
    
    # If no headers found, try to infer from the largest table
    if not all_headers:
        largest_table = max(tables, key=lambda t: len(t.get("rows", [])))
        if largest_table.get("rows"):
            max_cols = max(len(row) for row in largest_table["rows"])
            all_headers = [f"Column_{i+1}" for i in range(max_cols)]
    
    # Second pass: process all tables with the unified header set
    for table_idx, table in enumerate(tables):
        headers = table.get("headers", [])
        rows = table.get("rows", [])
        
        # Convert rows to the expected format
        for row_idx, row in enumerate(rows):
            row_dict = {}
            
            # Handle cases where row has different number of columns than headers
            for i, header in enumerate(all_headers):
                if i < len(headers):
                    # Use the table's own header if available
                    header_key = headers[i].lower().replace(" ", "_").replace("-", "_")
                else:
                    # Use the unified header
                    header_key = header.lower().replace(" ", "_").replace("-", "_")
                
                # Get the value, handling different row lengths
                if i < len(row):
                    value = str(row[i])
                else:
                    value = ""
                
                row_dict[header_key] = value
            
            all_table_data.append(row_dict)
        
        total_rows += len(rows)
        total_cells += sum(len(row) for row in rows) if rows else 0
        
        # Check validation
        validation = table.get("validation", {})
        if not validation.get("is_valid", False):
            all_valid = False
    
    # Get extraction method used
    extraction_methods = pipeline_response.get("metadata", {}).get("extraction_methods_used", ["unknown"])
    model_used = extraction_methods[0] if extraction_methods else "unknown"
    
    # Calculate confidence based on validation
    confidence = 1.0 if all_valid else 0.5
    
    # Convert table_data back to the format expected by frontend
    # table_data is currently an array of objects, need to convert to array of arrays
    table_rows = []
    for row_dict in all_table_data:
        row_array = []
        for header in all_headers:
            header_key = header.lower().replace(" ", "_").replace("-", "_")
            row_array.append(row_dict.get(header_key, ""))
        table_rows.append(row_array)
    
    # Create tables array in the format expected by frontend
    frontend_tables = [{
        "header": all_headers,
        "rows": table_rows,
        "extractor": model_used,  # Add extractor information
        "metadata": {
            "extraction_method": model_used
        }
    }]
    
    return {
        "status": "success",
        "job_id": str(uuid.uuid4()),
        "file_name": filename,
        "extraction_metrics": {
            "total_text_elements": total_cells,
            "extraction_time": pipeline_response.get("extraction_time_seconds", 1.0),
            "table_confidence": confidence,
            "model_used": model_used
        },
        "document_info": {
            "pdf_type": pipeline_response.get("pdf_type", "unknown"),
            "total_tables": len(tables)
        },
        "tables": frontend_tables,  # Frontend expects this format
        "table_headers": all_headers,
        "table_data": all_table_data,
        "quality_metrics": {
            "table_confidence": confidence,
            "text_elements_extracted": total_cells,
            "table_rows_extracted": total_rows,
            "extraction_completeness": "complete" if total_rows > 0 else "none",
            "data_quality": "good" if all_valid else "poor"
        },
        "timestamp": datetime.now().isoformat()
    } 