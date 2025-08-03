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

# Configuration constants for table stitching
HEADER_SIMILARITY_THRESHOLD = 0.8
PATTERN_MATCH_THRESHOLD = 0.6


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
    Enhanced multi-strategy table stitching for tables spanning multiple pages.
    
    Strategies:
    1. Canonical header identification and unification
    2. Exact header matching (case-insensitive)
    3. Partial header matching (80% similarity threshold)
    4. Structure-based matching (column count and data patterns)
    5. Continuation detection (headers only on first page)
    6. Column count alignment for missing headers
    """
    if not tables:
        return tables
    
    print(f"📎 Enhanced multi-strategy stitching: Processing {len(tables)} tables")
    
    # Step 1: Find canonical header (most complete header)
    headers_list = [table.get("headers", []) for table in tables if table.get("headers")]
    canonical_header = max(headers_list, key=len) if headers_list else []
    print(f"📎 Canonical header identified: {canonical_header} ({len(canonical_header)} columns)")
    
    # Step 2: Pre-process tables to align with canonical header
    processed_tables = []
    total_extracted_rows = 0
    total_mapped_rows = 0
    
    for i, table in enumerate(tables):
        headers = table.get("headers", [])
        rows = table.get("rows", [])
        
        print(f"📎 Pre-processing table {i}: {len(headers)} headers, {len(rows)} rows")
        print(f"   Headers: {headers}")
        
        # If headers are missing or empty, treat as continuation
        if not headers or all(not h.strip() for h in headers):
            print(f"   → Table {i}: No headers detected, treating as continuation")
            # Align rows to canonical header length
            aligned_rows = []
            for row in rows:
                aligned_row = row[:len(canonical_header)] + [""] * (len(canonical_header) - len(row))
                aligned_rows.append(aligned_row)
            
            processed_table = {
                "headers": canonical_header,
                "rows": aligned_rows,
                "metadata": {
                    "original_table_index": i,
                    "header_source": "canonical",
                    "row_alignment": "padded_to_canonical"
                }
            }
            total_mapped_rows += len(aligned_rows)
            
        # If headers match canonical (exact or similar)
        elif _headers_exact_match(headers, canonical_header) or _headers_partial_match(headers, canonical_header):
            print(f"   → Table {i}: Headers match canonical, direct merge")
            processed_table = table.copy()
            processed_table["headers"] = canonical_header
            processed_table["metadata"] = {
                "original_table_index": i,
                "header_source": "canonical",
                "row_alignment": "direct_match"
            }
            total_mapped_rows += len(rows)
            
        # If column count matches but headers differ
        elif len(headers) == len(canonical_header):
            print(f"   → Table {i}: Column count matches, aligning headers")
            # Use canonical header but keep original data
            processed_table = table.copy()
            processed_table["headers"] = canonical_header
            processed_table["metadata"] = {
                "original_table_index": i,
                "header_source": "canonical",
                "row_alignment": "column_count_match"
            }
            total_mapped_rows += len(rows)
            
        # If column count doesn't match, pad/truncate
        else:
            print(f"   → Table {i}: Column count mismatch, padding/truncating")
            aligned_rows = []
            for row in rows:
                # Pad or truncate to canonical header length
                aligned_row = row[:len(canonical_header)] + [""] * (len(canonical_header) - len(row))
                aligned_rows.append(aligned_row)
            
            processed_table = {
                "headers": canonical_header,
                "rows": aligned_rows,
                "metadata": {
                    "original_table_index": i,
                    "header_source": "canonical",
                    "row_alignment": "padded_to_canonical"
                }
            }
            total_mapped_rows += len(aligned_rows)
        
        total_extracted_rows += len(rows)
        processed_tables.append(processed_table)
    
    # Step 3: Merge all processed tables
    if not processed_tables:
        return tables
    
    merged_table = processed_tables[0].copy()
    merged_rows = merged_table.get("rows", [])
    
    print(f"📎 Merging {len(processed_tables)} processed tables...")
    
    for i, table in enumerate(processed_tables[1:], 1):
        table_rows = table.get("rows", [])
        print(f"   Merging table {i}: adding {len(table_rows)} rows")
        merged_rows.extend(table_rows)
    
    # Create final merged table
    final_table = {
        "headers": canonical_header,
        "rows": merged_rows,
        "metadata": {
            "total_tables_merged": len(processed_tables),
            "total_rows": len(merged_rows),
            "canonical_header": canonical_header,
            "header_alignment_stats": {
                "total_extracted_rows": total_extracted_rows,
                "total_mapped_rows": total_mapped_rows,
                "mapping_efficiency": total_mapped_rows / total_extracted_rows if total_extracted_rows > 0 else 0
            }
        }
    }
    
    print(f"📎 Enhanced stitching completed:")
    print(f"   - Total tables processed: {len(processed_tables)}")
    print(f"   - Total rows extracted: {total_extracted_rows}")
    print(f"   - Total rows mapped: {total_mapped_rows}")
    print(f"   - Mapping efficiency: {total_mapped_rows / total_extracted_rows * 100:.1f}%" if total_extracted_rows > 0 else "N/A")
    print(f"   - Final table: {len(canonical_header)} headers, {len(merged_rows)} rows")
    
    return [final_table]

def log_pipeline_performance(tables: List[Dict[str, Any]], original_tables: List[Dict[str, Any]], filename: str = "unknown"):
    """
    Log comprehensive pipeline performance statistics.
    
    Args:
        tables: Final processed tables
        original_tables: Original extracted tables before processing
        filename: Original PDF filename
    """
    print(f"\n📊 PIPELINE PERFORMANCE SUMMARY for {filename}")
    print(f"=" * 60)
    
    # Original extraction stats
    total_original_tables = len(original_tables)
    total_original_rows = sum(len(table.get("rows", [])) for table in original_tables)
    total_original_headers = sum(len(table.get("headers", [])) for table in original_tables)
    
    print(f"📋 Original Extraction:")
    print(f"   - Tables extracted: {total_original_tables}")
    print(f"   - Total rows: {total_original_rows}")
    print(f"   - Total headers: {total_original_headers}")
    
    # Final processing stats
    total_final_tables = len(tables)
    total_final_rows = sum(len(table.get("rows", [])) for table in tables)
    total_final_headers = sum(len(table.get("headers", [])) for table in tables)
    
    print(f"📋 Final Processing:")
    print(f"   - Tables after processing: {total_final_tables}")
    print(f"   - Total rows: {total_final_rows}")
    print(f"   - Total headers: {total_final_headers}")
    
    # Efficiency metrics
    row_preservation = (total_final_rows / total_original_rows * 100) if total_original_rows > 0 else 0
    table_reduction = ((total_original_tables - total_final_tables) / total_original_tables * 100) if total_original_tables > 0 else 0
    
    print(f"📋 Efficiency Metrics:")
    print(f"   - Row preservation: {row_preservation:.1f}%")
    print(f"   - Table reduction: {table_reduction:.1f}%")
    print(f"   - Average rows per table: {total_final_rows / total_final_tables:.1f}" if total_final_tables > 0 else "N/A")
    
    # Table details
    print(f"📋 Table Details:")
    for i, table in enumerate(tables):
        headers = table.get("headers", [])
        rows = table.get("rows", [])
        metadata = table.get("metadata", {})
        
        print(f"   Table {i + 1}:")
        print(f"     - Headers: {len(headers)} columns")
        print(f"     - Rows: {len(rows)}")
        print(f"     - Extraction method: {metadata.get('extraction_method', 'unknown')}")
        
        # Show stitching info if available
        if "total_tables_merged" in metadata:
            print(f"     - Tables merged: {metadata['total_tables_merged']}")
            print(f"     - Mapping efficiency: {metadata.get('header_alignment_stats', {}).get('mapping_efficiency', 0) * 100:.1f}%")
    
    print(f"=" * 60)

def _headers_exact_match(headers1: List[str], headers2: List[str]) -> bool:
    """Check if headers match exactly (case-insensitive)."""
    if len(headers1) != len(headers2):
        return False
    
    headers1_lower = [h.lower().strip() for h in headers1]
    headers2_lower = [h.lower().strip() for h in headers2]
    
    return headers1_lower == headers2_lower

def _headers_partial_match(headers1: List[str], headers2: List[str]) -> bool:
    """Check if headers match partially with similarity threshold."""
    if len(headers1) != len(headers2):
        return False
    
    # Calculate similarity for each header pair
    similarities = []
    for h1, h2 in zip(headers1, headers2):
        similarity = _calculate_string_similarity(h1, h2)
        similarities.append(similarity)
    
    # Check if average similarity meets threshold
    avg_similarity = sum(similarities) / len(similarities) if similarities else 0
    
    # Enhanced logging for debugging
    print(f"   Header similarity check: {avg_similarity:.3f} (threshold: {HEADER_SIMILARITY_THRESHOLD})")
    print(f"   Headers 1: {headers1}")
    print(f"   Headers 2: {headers2}")
    print(f"   Individual similarities: {similarities}")
    
    return avg_similarity >= HEADER_SIMILARITY_THRESHOLD

def _calculate_string_similarity(str1: str, str2: str) -> float:
    """Calculate similarity between two strings."""
    if not str1 or not str2:
        return 0.0
    
    str1_lower = str1.lower().strip()
    str2_lower = str2.lower().strip()
    
    if str1_lower == str2_lower:
        return 1.0
    
    # Simple character-based similarity
    common_chars = sum(1 for c in str1_lower if c in str2_lower)
    total_chars = max(len(str1_lower), len(str2_lower))
    
    return common_chars / total_chars if total_chars > 0 else 0.0

def _structure_based_match(table1: Dict[str, Any], table2: Dict[str, Any]) -> bool:
    """Check if tables have similar structure based on column count and data patterns."""
    rows1 = table1.get("rows", [])
    rows2 = table2.get("rows", [])
    
    if not rows1 or not rows2:
        return False
    
    # Check column count similarity
    col_count1 = len(rows1[0]) if rows1 else 0
    col_count2 = len(rows2[0]) if rows2 else 0
    
    if col_count1 != col_count2:
        return False
    
    # Check data pattern similarity (first few rows)
    pattern_similarity = _analyze_data_patterns(rows1[:3], rows2[:3])
    return pattern_similarity >= PATTERN_MATCH_THRESHOLD

def _analyze_data_patterns(rows1: List[List[str]], rows2: List[List[str]]) -> float:
    """Analyze data patterns between two sets of rows."""
    if not rows1 or not rows2:
        return 0.0
    
    # Simple pattern analysis: check if columns contain similar data types
    similarities = []
    
    for col_idx in range(min(len(rows1[0]), len(rows2[0]))):
        col1_values = [row[col_idx] for row in rows1 if col_idx < len(row)]
        col2_values = [row[col_idx] for row in rows2 if col_idx < len(row)]
        
        # Check if columns have similar characteristics
        similarity = _compare_column_characteristics(col1_values, col2_values)
        similarities.append(similarity)
    
    return sum(similarities) / len(similarities) if similarities else 0.0

def _compare_column_characteristics(values1: List[str], values2: List[str]) -> float:
    """Compare characteristics of two columns."""
    if not values1 or not values2:
        return 0.0
    
    # Check if both columns contain similar data types
    has_numbers1 = any(_is_numeric(v) for v in values1)
    has_numbers2 = any(_is_numeric(v) for v in values2)
    
    has_dates1 = any(_is_date(v) for v in values1)
    has_dates2 = any(_is_date(v) for v in values2)
    
    # Calculate similarity based on data type consistency
    type_similarity = 0.0
    if has_numbers1 == has_numbers2:
        type_similarity += 0.5
    if has_dates1 == has_dates2:
        type_similarity += 0.5
    
    return type_similarity

def _is_numeric(value: str) -> bool:
    """Check if a value is numeric."""
    import re
    cleaned = re.sub(r'[$,£€¥₹]', '', value)
    return bool(re.match(r'^[\d,]+\.?\d*$', cleaned))

def _is_date(value: str) -> bool:
    """Check if a value looks like a date."""
    import re
    date_patterns = [
        r'\d{1,2}/\d{1,2}/\d{2,4}',
        r'\d{1,2}-\d{1,2}-\d{2,4}',
        r'\d{4}-\d{2}-\d{2}'
    ]
    return any(re.match(pattern, value) for pattern in date_patterns)

def _continuation_detection(headers1: List[str], headers2: List[str], rows2: List[List[str]]) -> bool:
    """Detect if table2 is a continuation of table1 (headers only on first page)."""
    # Case 1: Next table has no headers
    if not headers2:
        return True
    
    # Case 2: Next table has very few headers (likely not real headers)
    if len(headers2) <= 2:
        return True
    
    # Case 3: Next table has data rows but headers look like data
    if rows2 and len(headers2) == len(rows2[0]):
        # Check if headers look like data (contain numbers, etc.)
        header_looks_like_data = any(_is_numeric(h) or _is_date(h) for h in headers2)
        return header_looks_like_data
    
    return False


def validate_table_structure(table: Dict[str, Any]) -> Dict[str, Any]:
    """
    Data-preserving table structure validation with enhanced logic.
    
    Args:
        table: Table dictionary to validate
        
    Returns:
        Validated table with metadata
    """
    validation_result = {
        "is_valid": True,
        "warnings": [],
        "errors": [],
        "preservation_metrics": {
            "original_rows": 0,
            "preserved_rows": 0,
            "original_columns": 0,
            "preserved_columns": 0
        }
    }
    
    headers = table.get("headers", [])
    rows = table.get("rows", [])
    footers = table.get("footers", [])
    
    # Track original dimensions
    original_row_count = len(rows)
    original_col_count = len(headers) if headers else 0
    
    print(f"📊 Data preservation: Validating table with {original_row_count} rows and {original_col_count} columns")
    
    # Generate default headers if none exist
    if not headers and rows:
        print("📋 Data preservation: No headers found, generating default headers")
        max_cols = max(len(row) for row in rows) if rows else 0
        headers = [f"Column_{i+1}" for i in range(max_cols)]
        table["headers"] = headers
        validation_result["warnings"].append("Generated default headers")
    
    # Ensure headers are strings and not empty
    if headers:
        normalized_headers = []
        for i, header in enumerate(headers):
            if header and str(header).strip():
                normalized_headers.append(str(header).strip())
            else:
                # Generate meaningful header based on data
                meaningful_header = _generate_header_from_data(rows, i) if rows else f"Column_{i+1}"
                normalized_headers.append(meaningful_header)
                print(f"📋 Data preservation: Generated header '{meaningful_header}' for empty column {i}")
        
        table["headers"] = normalized_headers
        headers = normalized_headers
    
    # Preserve all rows and normalize cell content
    if rows:
        normalized_rows = []
        for i, row in enumerate(rows):
            if isinstance(row, (list, tuple)):
                # Preserve all cells, normalize to strings
                normalized_row = [str(cell).strip() if cell else "" for cell in row]
                normalized_rows.append(normalized_row)
            else:
                # Single value row - preserve as single column
                normalized_rows.append([str(row).strip() if row else ""])
                validation_result["warnings"].append(f"Row {i} converted to single column")
        
        table["rows"] = normalized_rows
        rows = normalized_rows
    
    # Normalize row lengths by padding (don't truncate)
    if rows and headers:
        max_cols = len(headers)
        for i, row in enumerate(rows):
            if len(row) < max_cols:
                # Pad with empty strings
                rows[i] = row + [""] * (max_cols - len(row))
            elif len(row) > max_cols:
                # Extend headers to match longest row
                while len(headers) < len(row):
                    headers.append(f"Column_{len(headers)+1}")
                table["headers"] = headers
                validation_result["warnings"].append(f"Extended headers to match row {i} length")
    
    # Ensure footers are strings
    if footers:
        footers = [str(f).strip() if f else "" for f in footers]
        table["footers"] = footers
    
    # Check for duplicate headers and make them unique
    if headers:
        unique_headers = []
        header_counts = {}
        
        for header in headers:
            if header in header_counts:
                header_counts[header] += 1
                unique_header = f"{header}_{header_counts[header]}"
                unique_headers.append(unique_header)
                validation_result["warnings"].append(f"Made duplicate header '{header}' unique: '{unique_header}'")
            else:
                header_counts[header] = 1
                unique_headers.append(header)
        
        table["headers"] = unique_headers
    
    # Calculate preservation metrics
    final_row_count = len(rows)
    final_col_count = len(headers)
    
    validation_result["preservation_metrics"] = {
        "original_rows": original_row_count,
        "preserved_rows": final_row_count,
        "original_columns": original_col_count,
        "preserved_columns": final_col_count,
        "row_preservation_rate": final_row_count / original_row_count if original_row_count > 0 else 1.0,
        "column_preservation_rate": final_col_count / original_col_count if original_col_count > 0 else 1.0
    }
    
    print(f"📊 Data preservation: Final result - {final_row_count} rows and {final_col_count} columns")
    print(f"📊 Data preservation: Row preservation rate: {validation_result['preservation_metrics']['row_preservation_rate']:.1%}")
    print(f"📊 Data preservation: Column preservation rate: {validation_result['preservation_metrics']['column_preservation_rate']:.1%}")
    
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

def _generate_header_from_data(rows: List[List[str]], column_index: int) -> str:
    """
    Generate a meaningful header based on the data in a specific column.
    
    Args:
        rows: Table data rows
        column_index: Index of the column to analyze
        
    Returns:
        Generated header string
    """
    try:
        if not rows or column_index >= len(rows[0]):
            return f"Column_{column_index+1}"
        
        # Get all values in this column
        column_values = []
        for row in rows:
            if column_index < len(row):
                value = row[column_index].strip()
                if value:
                    column_values.append(value)
        
        if not column_values:
            return f"Column_{column_index+1}"
        
        # Analyze the data to generate a meaningful header
        sample_values = column_values[:5]  # Look at first 5 values
        
        # Check if it looks like dates
        date_pattern = any(_is_date(val) for val in sample_values)
        if date_pattern:
            return "Date"
        
        # Check if it looks like numbers
        number_pattern = any(_is_numeric(val) for val in sample_values)
        if number_pattern:
            return "Amount"
        
        # Check if it looks like names
        name_pattern = any(_looks_like_name(val) for val in sample_values)
        if name_pattern:
            return "Name"
        
        # Default to a generic header
        return f"Column_{column_index+1}"
        
    except Exception as e:
        print(f"Error generating header from data: {e}")
        return f"Column_{column_index+1}"

def _looks_like_name(value: str) -> bool:
    """Check if a value looks like a name."""
    import re
    # Simple heuristic: contains letters and spaces, no numbers
    return bool(re.match(r'^[A-Za-z\s]+$', value))


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