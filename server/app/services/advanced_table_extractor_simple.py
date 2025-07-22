import boto3
import os
import tempfile
import re
import numpy as np
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass
from pdf2image import convert_from_path
from difflib import SequenceMatcher
import cv2
from PIL import Image, ImageEnhance, ImageFilter
import pytesseract
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from collections import Counter

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class TableHeader:
    """Represents a table header with confidence and metadata"""
    columns: List[str]
    confidence: float
    page_number: int
    row_index: int
    is_primary: bool = False
    fuzzy_hash: str = ""

@dataclass
class ExtractedTable:
    """Represents an extracted table with metadata"""
    header: TableHeader
    rows: List[List[str]]
    page_number: int
    confidence: float
    table_id: str
    quality_score: float

class SimpleTextSimilarity:
    """
    Simple text similarity using built-in Python libraries
    Replaces scikit-learn TF-IDF functionality
    """
    
    def __init__(self):
        # Common stop words for commission statements
        self.stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
        }
    
    def tokenize(self, text: str) -> List[str]:
        """Simple tokenization"""
        return [word.lower() for word in re.findall(r'\b\w+\b', text) 
                if word.lower() not in self.stop_words]
    
    def calculate_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate similarity between two texts using multiple methods
        """
        # Method 1: Sequence matcher
        sequence_sim = SequenceMatcher(None, text1.lower(), text2.lower()).ratio()
        
        # Method 2: Token overlap
        tokens1 = set(self.tokenize(text1))
        tokens2 = set(self.tokenize(text2))
        
        if not tokens1 or not tokens2:
            return sequence_sim
        
        intersection = tokens1.intersection(tokens2)
        union = tokens1.union(tokens2)
        jaccard_sim = len(intersection) / len(union) if union else 0
        
        # Method 3: Word frequency similarity
        freq1 = Counter(tokens1)
        freq2 = Counter(tokens2)
        
        # Calculate cosine similarity manually
        dot_product = sum(freq1[word] * freq2[word] for word in intersection)
        norm1 = sum(freq1[word] ** 2 for word in tokens1) ** 0.5
        norm2 = sum(freq2[word] ** 2 for word in tokens2) ** 0.5
        
        cosine_sim = dot_product / (norm1 * norm2) if norm1 * norm2 > 0 else 0
        
        # Combine similarities (weighted average)
        combined_sim = (sequence_sim * 0.4 + jaccard_sim * 0.3 + cosine_sim * 0.3)
        
        return combined_sim

class AdvancedTableExtractor:
    """
    Advanced table extraction system with simplified dependencies
    Uses built-in Python libraries instead of scikit-learn
    """
    
    def __init__(self, aws_region="us-east-1"):
        self.textract = boto3.client('textract', region_name=aws_region)
        self.similarity_calculator = SimpleTextSimilarity()
        
        # Commission statement specific patterns
        self.commission_patterns = [
            r'commission', r'premium', r'policy', r'carrier', r'broker',
            r'agent', r'client', r'effective', r'expiration', r'coverage',
            r'plan', r'medical', r'dental', r'vision', r'life', r'disability',
            r'amount', r'rate', r'percentage', r'fee', r'charge',
            r'group\s+no', r'group\s+name', r'billing\s+period', r'invoice\s+total',
            r'stoploss\s+total', r'agent\s+rate', r'calculation\s+method',
            r'census\s+ct', r'paid\s+amount', r'writing\s+agent'
        ]
        
        # Header similarity threshold
        self.header_similarity_threshold = 0.85
        self.column_similarity_threshold = 0.75
        
    def preprocess_image(self, image: Image.Image) -> Image.Image:
        """
        Advanced image preprocessing for better OCR accuracy
        """
        # Convert to grayscale
        if image.mode != 'L':
            image = image.convert('L')
        
        # Enhance contrast
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(2.0)
        
        # Enhance sharpness
        enhancer = ImageEnhance.Sharpness(image)
        image = enhancer.enhance(1.5)
        
        # Apply noise reduction
        image = image.filter(ImageFilter.MedianFilter(size=3))
        
        # Convert to numpy array for OpenCV operations
        img_array = np.array(image)
        
        # Apply adaptive thresholding
        img_array = cv2.adaptiveThreshold(
            img_array, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 11, 2
        )
        
        # Morphological operations to clean up
        kernel = np.ones((1, 1), np.uint8)
        img_array = cv2.morphologyEx(img_array, cv2.MORPH_CLOSE, kernel)
        
        return Image.fromarray(img_array)
    
    def extract_with_multiple_engines(self, image_bytes: bytes) -> List[Dict]:
        """
        Extract tables using multiple OCR engines for better accuracy
        """
        results = []
        
        # 1. AWS Textract
        try:
            textract_response = self.textract.analyze_document(
                Document={'Bytes': image_bytes},
                FeatureTypes=['TABLES', 'FORMS']
            )
            results.append(('textract', textract_response))
        except Exception as e:
            logger.warning(f"Textract failed: {e}")
        
        # 2. Tesseract OCR (fallback)
        try:
            # Create temporary file for image
            with tempfile.NamedTemporaryFile(suffix='.png', delete=True) as tmpf:
                tmpf.write(image_bytes)
                tmpf.flush()
                
                image = Image.open(tmpf.name)
                
                # Preprocess image
                processed_image = self.preprocess_image(image)
                
                # Extract with Tesseract
                tesseract_text = pytesseract.image_to_string(
                    processed_image, 
                    config='--psm 6 --oem 3'
                )
                
                # Parse tesseract output into table-like structure
                tesseract_tables = self.parse_tesseract_output(tesseract_text)
                results.append(('tesseract', tesseract_tables))
        except Exception as e:
            logger.warning(f"Tesseract failed: {e}")
        
        return results
    
    def parse_tesseract_output(self, text: str) -> List[List[List[str]]]:
        """
        Parse Tesseract OCR output into table structure
        """
        lines = text.strip().split('\n')
        tables = []
        current_table = []
        
        for line in lines:
            if not line.strip():
                if current_table:
                    tables.append(current_table)
                    current_table = []
                continue
            
            # Split by multiple spaces or tabs
            cells = re.split(r'\s{2,}|\t+', line.strip())
            if len(cells) > 1:  # Likely a table row
                current_table.append(cells)
            else:
                if current_table:
                    tables.append(current_table)
                    current_table = []
        
        if current_table:
            tables.append(current_table)
        
        return tables
    
    def detect_header_candidates(self, tables: List[List[List[str]]]) -> List[TableHeader]:
        """
        Use the proven header detection logic from the working TextractTableExtractor
        """
        headers = []
        
        for table_idx, table in enumerate(tables):
            if not table or len(table) < 2:
                continue
            
            # Check first row as potential header
            first_row = [cell.strip() for cell in table[0]]
            if self.is_likely_header(first_row):
                headers.append(TableHeader(
                    columns=first_row,
                    confidence=0.9,  # High confidence for proven logic
                    page_number=table_idx,
                    row_index=0,
                    fuzzy_hash=self.generate_fuzzy_hash(first_row)
                ))
                continue
            
            # Fallback: check second row if first row is not a header
            if len(table) > 1:
                second_row = [cell.strip() for cell in table[1]]
                if self.is_likely_header(second_row):
                    headers.append(TableHeader(
                        columns=second_row,
                        confidence=0.8,  # Slightly lower confidence for second row
                        page_number=table_idx,
                        row_index=1,
                        fuzzy_hash=self.generate_fuzzy_hash(second_row)
                    ))
        
        # Remove similar headers (keep the best one)
        unique_headers = []
        for header in headers:
            is_duplicate = False
            for existing in unique_headers:
                if self._are_headers_similar_simple(header.columns, existing.columns):
                    is_duplicate = True
                    # Keep the one with higher confidence
                    if header.confidence > existing.confidence:
                        unique_headers.remove(existing)
                        unique_headers.append(header)
                    break
            
            if not is_duplicate:
                unique_headers.append(header)
        
        return unique_headers
    
    def _are_headers_similar_simple(self, h1, h2):
        """Are these headers 'the same'? Allow small OCR variations."""
        if not h1 or not h2 or len(h1) != len(h2):
            return False
        matches = sum(
            1 for a, b in zip(h1, h2)
            if a.strip().lower() == b.strip().lower()
        )
        return matches >= len(h1) * 0.7  # 70% match
    
    def _calculate_comprehensive_header_score(self, row: List[str], row_index: int) -> float:
        """
        Calculate comprehensive header score considering position and content
        """
        if not row or len(row) < 3:
            return 0.0
        
        # CRITICAL FIX: Check if this row contains actual data values (not headers)
        if self._is_data_row(row):
            return 0.0  # Data rows should never be headers
        
        # Base score from header detection
        base_score = 0.0
        
        # Check if it's likely a header
        if self.is_likely_header(row):
            base_score = 0.8
        else:
            base_score = 0.3  # Lower base score for non-obvious headers
        
        # Position bonus (first row gets highest bonus)
        position_bonus = max(0, 0.3 - (row_index * 0.1))
        
        # Pattern matching bonus
        pattern_score = self._calculate_header_pattern_score(row)
        
        # Structure bonus
        structure_score = self._calculate_structure_score(row)
        
        # Numeric content penalty (headers should not contain numbers)
        numeric_penalty = self._calculate_numeric_ratio(row) * 0.5
        
        # Summary row penalty
        summary_penalty = 0.8 if self._is_summary_row(row) else 0.0
        
        # Calculate final score
        final_score = (
            base_score * 0.4 +
            position_bonus * 0.2 +
            pattern_score * 0.2 +
            structure_score * 0.1 +
            (1 - numeric_penalty) * 0.1
        ) - summary_penalty
        
        return max(0.0, min(1.0, final_score))
    
    def is_likely_header(self, row: List[str]) -> bool:
        """
        Use the proven header detection logic from the working TextractTableExtractor
        """
        if not row or not any(cell.strip() for cell in row):
            return False
        
        # CRITICAL: If any cell contains a digit, it's not a header
        for cell in row:
            if any(char.isdigit() for char in cell):
                return False
        
        # Count non-numeric cells
        non_numeric = sum(1 for cell in row if cell and not self._is_number(cell))
        
        return (
            non_numeric >= len(row) * 0.6 and  # mostly non-numeric
            any(len(cell.strip()) > 5 for cell in row if cell.strip())  # some cells are long
        )
    
    def _is_number(self, val):
        """Return True if string is likely a number or currency."""
        if not val or not val.strip():
            return False
        return bool(re.match(r"^\s*[$-]?\s*[\d,]+(\.\d+)?\s*$", val.replace(",", "")))
    
    def _is_summary_row(self, cells: List[str]) -> bool:
        """
        Detect if a row is a summary/total row that should not be treated as header
        """
        # Common summary patterns - specific to your document format
        summary_patterns = [
            r'total\s+for\s+group',
            r'writing\s+agent\s+name:',
            r'writing\s+agent\s+number:',
            r'writing\s+agent\s+2\s+name:',
            r'writing\s+agent\s+2\s+no:',
            r'group\s+total',
            r'subtotal',
            r'grand\s+total',
            r'amount\s+due',
            r'balance\s+due',
            r'net\s+amount',
            r'commission\s+total',
            r'premium\s+total',
            r'adj\.\s+period',
            r'adjustment\s+period',
            r'agent\s+name:',
            r'agent\s+number:'
        ]
        
        # Check if any cell matches summary patterns
        for cell in cells:
            cell_lower = cell.lower()
            for pattern in summary_patterns:
                if re.search(pattern, cell_lower):
                    return True
        
        # Check for rows with mostly totals/amounts
        amount_cells = sum(1 for cell in cells if self._is_amount_value(cell))
        if amount_cells >= len(cells) * 0.6:
            return True
        
        return False
    
    def _is_data_row(self, row: List[str]) -> bool:
        """
        CRITICAL: Detect if a row contains actual data values (not headers)
        This prevents data rows from being misidentified as headers
        """
        if not row or len(row) < 2:
            return False
        
        # Clean the row
        cleaned_row = [cell.strip() for cell in row if cell and cell.strip()]
        if len(cleaned_row) < 2:
            return False
        
        # Check for data indicators
        data_indicators = 0
        total_cells = len(cleaned_row)
        
        for cell in cleaned_row:
            # Check for currency amounts (most common data type in commission statements)
            if self._is_currency_amount(cell):
                data_indicators += 1
            # Check for percentages
            elif self._is_percentage(cell):
                data_indicators += 1
            # Check for dates
            elif self._is_date(cell):
                data_indicators += 1
            # Check for simple numeric values (not currency, not percentage)
            elif self._is_simple_numeric(cell):
                data_indicators += 1
            # Check for group numbers (specific to commission statements)
            elif self._is_group_number(cell):
                data_indicators += 1
        
        # If more than 50% of cells contain data values, this is likely a data row
        return (data_indicators / total_cells) >= 0.5
    
    def _is_currency_amount(self, value: str) -> bool:
        """
        Check if a value is a currency amount
        """
        # Remove currency symbols and spaces
        cleaned = re.sub(r'[$,\s]', '', value.strip())
        
        # Check for currency patterns (including negative amounts in parentheses)
        currency_patterns = [
            r'^\s*[$-]?\s*[\d,]+(\.\d{2})?\s*$',  # Standard currency
            r'^\s*\([\d,]+(\.\d{2})?\)\s*$',      # Negative in parentheses
            r'^\s*-\s*[\d,]+(\.\d{2})?\s*$'       # Negative with minus
        ]
        
        for pattern in currency_patterns:
            if re.match(pattern, cleaned):
                return True
        
        return False
    
    def _is_percentage(self, value: str) -> bool:
        """
        Check if a value is a percentage
        """
        cleaned = value.strip()
        return bool(re.match(r'^\s*\d+(\.\d+)?%\s*$', cleaned))
    
    def _is_date(self, value: str) -> bool:
        """
        Check if a value is a date
        """
        cleaned = value.strip()
        # Common date patterns in commission statements
        date_patterns = [
            r'^\d{1,2}/\d{1,2}/\d{4}$',  # MM/DD/YYYY
            r'^\d{1,2}-\d{1,2}-\d{4}$',  # MM-DD-YYYY
            r'^\d{4}-\d{1,2}-\d{1,2}$'   # YYYY-MM-DD
        ]
        
        for pattern in date_patterns:
            if re.match(pattern, cleaned):
                return True
        
        return False
    
    def _is_numeric_value(self, value: str) -> bool:
        """
        Check if a value is numeric (including negative numbers)
        """
        if not value or not value.strip():
            return False
        
        cleaned = re.sub(r'[,\s]', '', value.strip())
        
        # Check for various numeric patterns
        numeric_patterns = [
            r'^-?\d+(\.\d+)?$',           # Standard number
            r'^\(\d+(\.\d+)?\)$',         # Negative in parentheses
            r'^\d+$'                      # Integer
        ]
        
        for pattern in numeric_patterns:
            if re.match(pattern, cleaned):
                return True
        
        return False
    
    def _is_simple_numeric(self, value: str) -> bool:
        """
        Check if a value is a simple numeric (not currency, not percentage)
        """
        if not value or not value.strip():
            return False
        
        cleaned = re.sub(r'[,\s]', '', value.strip())
        
        # Simple numeric patterns (no currency symbols, no percentages)
        numeric_patterns = [
            r'^-?\d+(\.\d+)?$',           # Standard number
            r'^\(\d+(\.\d+)?\)$',         # Negative in parentheses
            r'^\d+$'                      # Integer
        ]
        
        for pattern in numeric_patterns:
            if re.match(pattern, cleaned):
                return True
        
        return False
    
    def _is_group_number(self, value: str) -> bool:
        """
        Check if a value looks like a group number (common in commission statements)
        """
        cleaned = value.strip()
        # Group numbers are typically alphanumeric codes
        return bool(re.match(r'^[A-Z]\d{6,}$', cleaned))
    
    def _is_amount_value(self, value: str) -> bool:
        """
        Check if a value looks like an amount/total
        """
        # Remove common prefixes/suffixes
        cleaned = re.sub(r'^[^\d]*', '', value)
        cleaned = re.sub(r'[^\d]*$', '', cleaned)
        
        # Check for currency patterns
        currency_pattern = r'^\s*[$-]?\s*[\d,]+(\.\d{2})?\s*$'
        if re.match(currency_pattern, cleaned):
            return True
        
        # Check for large numbers (likely totals)
        if re.match(r'^\d{4,}$', cleaned):
            return True
        
        return False
    
    def _calculate_header_pattern_score(self, cells: List[str]) -> float:
        """
        Calculate score based on commission statement header patterns
        """
        score = 0.0
        
        # Expected commission statement header patterns - case insensitive
        header_patterns = [
            # Exact patterns from your document (case insensitive)
            r'^group\s+no\.?$',
            r'^group\s+name$',
            r'^billing\s+period$',
            r'^adj\.?\s+period$',
            r'^invoice\s+total$',
            r'^stoploss\s+total$',
            r'^agent\s+rate$',
            r'^calculation\s+method$',
            r'^census\s+ct\.?$',
            r'^paid\s+amount$',
            # More general patterns
            r'group\s+no\.?',
            r'group\s+name',
            r'billing\s+period',
            r'adj\.?\s+period',
            r'invoice\s+total',
            r'stoploss\s+total',
            r'agent\s+rate',
            r'calculation\s+method',
            r'census\s+ct\.?',
            r'paid\s+amount',
            r'policy\s+number',
            r'carrier',
            r'client',
            r'effective\s+date',
            r'expiration\s+date',
            r'premium',
            r'commission',
            r'plan\s+type',
            r'coverage\s+type',
            r'member\s+count',
            r'enrollment\s+date',
            r'termination\s+date',
            r'rate\s+type',
            r'fee\s+type',
            r'deductible',
            r'copay',
            r'coinsurance'
        ]
        
        matches = 0
        exact_matches = 0
        for cell in cells:
            cell_lower = cell.lower().strip()
            cell_matched = False
            for i, pattern in enumerate(header_patterns):
                # Use case insensitive search
                if re.search(pattern, cell_lower, re.IGNORECASE):
                    matches += 1
                    # Give extra weight to exact matches (first 10 patterns)
                    if i < 10 and re.match(pattern, cell_lower, re.IGNORECASE):
                        exact_matches += 1
                    cell_matched = True
                    break
        
        base_score = matches / len(cells)
        exact_bonus = exact_matches / len(cells) * 0.3  # 30% bonus for exact matches
        
        return min(1.0, base_score + exact_bonus)
    
    def _calculate_numeric_ratio(self, cells: List[str]) -> float:
        """
        Calculate ratio of numeric content in cells
        """
        numeric_count = sum(1 for cell in cells if self.is_numeric(cell))
        return numeric_count / len(cells)
    
    def _calculate_structure_score(self, cells: List[str]) -> float:
        """
        Calculate score based on structural consistency
        """
        if len(cells) < 3:
            return 0.5
        
        # Check for consistent column lengths
        lengths = [len(cell) for cell in cells]
        avg_length = np.mean(lengths)
        variance = np.var(lengths)
        
        # Prefer moderate length columns (not too short, not too long)
        length_score = 1.0 - min(1.0, variance / 100)
        
        # Check for reasonable column count (2-15 is typical for commission statements)
        count_score = 1.0 if 2 <= len(cells) <= 15 else 0.5
        
        return (length_score + count_score) / 2
    
    def _calculate_keyword_score(self, cells: List[str]) -> float:
        """
        Calculate score based on commission-related keywords
        """
        commission_keywords = sum(
            1 for cell in cells 
            if any(re.search(pattern, cell.lower()) for pattern in self.commission_patterns)
        )
        return commission_keywords / len(cells)
    
    def calculate_header_confidence(self, header: List[str]) -> float:
        """
        Calculate confidence score for a header
        """
        if not header:
            return 0.0
        
        confidence = 0.0
        
        # Commission keyword presence
        commission_matches = sum(
            1 for cell in header 
            if any(re.search(pattern, cell.lower()) for pattern in self.commission_patterns)
        )
        confidence += (commission_matches / len(header)) * 0.4
        
        # Text quality (no numbers, reasonable length)
        text_quality = sum(
            1 for cell in header 
            if not self.is_numeric(cell) and 2 <= len(cell.strip()) <= 20
        )
        confidence += (text_quality / len(header)) * 0.3
        
        # Consistency (similar length columns)
        lengths = [len(cell.strip()) for cell in header if cell.strip()]
        if lengths:
            length_variance = np.var(lengths)
            confidence += max(0, 0.3 - length_variance / 100)
        
        return min(1.0, confidence)
    
    def generate_fuzzy_hash(self, header: List[str]) -> str:
        """
        Generate a fuzzy hash for header comparison
        """
        # Normalize and sort for consistent hashing
        normalized = [cell.lower().strip() for cell in header if cell.strip()]
        normalized.sort()
        return '|'.join(normalized)
    
    def are_headers_similar(self, h1: TableHeader, h2: TableHeader) -> Tuple[bool, float]:
        """
        Advanced header similarity detection using simplified algorithms
        """
        if not h1.columns or not h2.columns:
            return False, 0.0
        
        # Method 1: Fuzzy hash comparison
        if h1.fuzzy_hash == h2.fuzzy_hash:
            return True, 1.0
        
        # Method 2: Text similarity using our simple calculator
        combined_text1 = ' '.join(h1.columns)
        combined_text2 = ' '.join(h2.columns)
        text_sim = self.similarity_calculator.calculate_similarity(combined_text1, combined_text2)
        
        # Method 3: Sequence matcher for each column
        column_similarities = []
        min_len = min(len(h1.columns), len(h2.columns))
        
        for i in range(min_len):
            sim = SequenceMatcher(None, h1.columns[i].lower(), h2.columns[i].lower()).ratio()
            column_similarities.append(sim)
        
        avg_column_sim = np.mean(column_similarities) if column_similarities else 0.0
        
        # Method 4: Length and structure similarity
        length_sim = 1.0 - abs(len(h1.columns) - len(h2.columns)) / max(len(h1.columns), len(h2.columns))
        
        # Combined similarity score
        combined_sim = (text_sim * 0.4 + avg_column_sim * 0.4 + length_sim * 0.2)
        
        return combined_sim >= self.header_similarity_threshold, combined_sim
    
    def merge_similar_tables(self, tables: List[ExtractedTable]) -> List[ExtractedTable]:
        """
        Use the proven table merging logic from the working TextractTableExtractor
        """
        if not tables:
            return []
        
        # Convert to simple format for merging
        table_dicts = []
        for table in tables:
            table_dicts.append({
                "header": table.header.columns,
                "rows": table.rows,
                "page_number": table.page_number,
                "confidence": table.header.confidence
            })
        
        # Use the proven merging logic
        merged_dicts = self._clean_and_merge_tables_simple(table_dicts)
        
        # Convert back to ExtractedTable format
        merged_tables = []
        for table_dict in merged_dicts:
            header = TableHeader(
                columns=table_dict["header"],
                confidence=0.9,  # High confidence for proven logic
                page_number=table_dict.get("page_number", 0),
                row_index=0,
                fuzzy_hash=self.generate_fuzzy_hash(table_dict["header"])
            )
            
            merged_table = ExtractedTable(
                header=header,
                rows=table_dict["rows"],
                page_number=table_dict.get("page_number", 0),
                confidence=0.9,
                table_id=f"merged_table_{len(merged_tables)}",
                quality_score=0.9
            )
            merged_tables.append(merged_table)
        
        return merged_tables
    
    def _clean_and_merge_tables_simple(self, raw_tables):
        """
        Use the proven table merging logic from the working TextractTableExtractor
        """
        merged = []
        last_header = None
        cur_rows = []
        
        for t in raw_tables:
            if not t or not t.get("rows") or not t["rows"][0]:
                continue
            
            candidate_header = [cell.strip() for cell in t["rows"][0]]
            
            # Fallback: if first row is not a header, but second row is, use second row as header
            if not self.is_likely_header(candidate_header) and len(t["rows"]) > 1 and self.is_likely_header([cell.strip() for cell in t["rows"][1]]):
                candidate_header = [cell.strip() for cell in t["rows"][1]]
                data_start_idx = 2
            else:
                data_start_idx = 1
            
            if self.is_likely_header(candidate_header):
                if last_header is not None and self._are_headers_similar_simple(last_header, candidate_header):
                    cur_rows += t["rows"][data_start_idx:]
                elif last_header is not None and not self._are_headers_similar_simple(last_header, candidate_header):
                    if cur_rows:
                        merged.append({"header": last_header, "rows": cur_rows})
                    last_header = candidate_header
                    cur_rows = t["rows"][data_start_idx:]
                else:
                    last_header = candidate_header
                    cur_rows = t["rows"][data_start_idx:]
            else:
                if last_header is not None:
                    cur_rows += t["rows"]
                else:
                    continue  # can't process this page
        
        # Save the last one
        if last_header and cur_rows:
            merged.append({"header": last_header, "rows": cur_rows})
        
        # Clean and return only tables with at least 1 row
        return [self._clean_table_simple(m) for m in merged if m and m.get("rows")]
    
    def _clean_table_simple(self, table_dict):
        """Pad/trim rows to header length, skip summary rows."""
        header = table_dict["header"]
        rows = []
        for row in table_dict["rows"]:
            if self._is_summary_row_simple(row):
                continue
            # pad or trim
            clean_row = (row + [""] * (len(header) - len(row)))[:len(header)]
            rows.append([cell.strip() for cell in clean_row])
        return {"header": header, "rows": rows}
    
    def _is_summary_row_simple(self, row):
        return any(
            cell and ('total' in cell.lower() or 'grand' in cell.lower())
            for cell in row
        )
    
    def _filter_summary_rows(self, rows: List[List[str]]) -> List[List[str]]:
        """
        Filter out summary/total rows from table data
        CRITICAL FIX: Be more conservative to avoid losing actual data rows
        """
        filtered_rows = []
        
        for row in rows:
            if not row:
                continue
            
            # Clean the row
            cleaned_row = [cell.strip() if cell else "" for cell in row]
            non_empty_cells = [cell for cell in cleaned_row if cell]
            
            # Skip if it's completely empty
            if len(non_empty_cells) == 0:
                continue
            
            # Skip if it's a clear summary row (be more specific)
            if self._is_clear_summary_row(non_empty_cells):
                continue
            
            # Include the row if it has at least one non-empty cell
            # This is more permissive to avoid losing data
            filtered_rows.append(cleaned_row)
        
        return filtered_rows
    
    def _is_clear_summary_row(self, cells: List[str]) -> bool:
        """
        Check if a row is clearly a summary row (more specific than _is_summary_row)
        """
        if not cells:
            return False
        
        # Check for very specific summary patterns
        summary_patterns = [
            r'^total\s+for\s+group\s*:?$',
            r'^writing\s+agent\s+name\s*:?$',
            r'^writing\s+agent\s+number\s*:?$',
            r'^writing\s+agent\s+2\s+name\s*:?$',
            r'^writing\s+agent\s+2\s+no\s*:?$',
            r'^group\s+total\s*:?$',
            r'^subtotal\s*:?$',
            r'^grand\s+total\s*:?$',
            r'^amount\s+due\s*:?$',
            r'^balance\s+due\s*:?$',
            r'^net\s+amount\s*:?$',
            r'^commission\s+total\s*:?$',
            r'^premium\s+total\s*:?$'
        ]
        
        # Check if any cell matches summary patterns exactly
        for cell in cells:
            cell_lower = cell.lower().strip()
            for pattern in summary_patterns:
                if re.match(pattern, cell_lower):
                    return True
        
        # Only consider it a summary row if it's a single cell with a summary pattern
        # or if it's a row with mostly totals and very few data cells
        if len(cells) == 1:
            return self._is_amount_value(cells[0])
        
        return False
    
    def _remove_duplicate_rows(self, rows: List[List[str]]) -> List[List[str]]:
        """
        Remove duplicate rows that might appear across pages
        """
        seen = set()
        unique_rows = []
        
        for row in rows:
            # Create a hash of the row content
            row_hash = '|'.join([cell.strip() for cell in row if cell.strip()])
            
            if row_hash and row_hash not in seen:
                seen.add(row_hash)
                unique_rows.append(row)
        
        return unique_rows
    
    def clean_row(self, row: List[str]) -> List[str]:
        """
        Clean and normalize row data
        """
        return [cell.strip() if cell else "" for cell in row]
    
    def is_numeric(self, value: str) -> bool:
        """
        Check if value is numeric (including currency)
        """
        if not value or not value.strip():
            return False
        # Remove currency symbols and commas
        cleaned = re.sub(r'[$,\s]', '', value.strip())
        return bool(re.match(r'^-?\d+(\.\d+)?%?$', cleaned))
    
    def assess_table_quality(self, table: List[List[str]]) -> float:
        """
        Assess the quality of extracted table data
        """
        if not table or len(table) < 2:
            return 0.0
        
        quality_scores = []
        
        for row in table:
            if not row:
                continue
            
            # Row completeness
            non_empty = sum(1 for cell in row if cell and cell.strip())
            completeness = non_empty / len(row)
            
            # Data consistency
            numeric_cells = sum(1 for cell in row if self.is_numeric(cell))
            text_cells = len(row) - numeric_cells
            consistency = 1.0 - abs(numeric_cells - text_cells) / len(row)
            
            # Cell length consistency
            lengths = [len(cell.strip()) for cell in row if cell.strip()]
            if lengths:
                length_variance = np.var(lengths)
                length_score = max(0, 1.0 - length_variance / 100)
            else:
                length_score = 0.0
            
            row_score = (completeness + consistency + length_score) / 3
            quality_scores.append(row_score)
        
        return np.mean(quality_scores) if quality_scores else 0.0
    
    def extract_tables_from_pdf(self, file_path: str) -> List[Dict]:
        """
        Use the proven working approach from TextractTableExtractor
        """
        logger.info(f"Starting table extraction from {file_path} using proven approach")
        
        try:
            # Use the original working approach directly
            images = convert_from_path(file_path, dpi=300)
            all_tables = []
            
            for page_num, img in enumerate(images):
                logger.info(f"Processing page {page_num + 1}/{len(images)}")
                with tempfile.NamedTemporaryFile(suffix='.png', delete=True) as tmpf:
                    img.save(tmpf.name, format='PNG')
                    with open(tmpf.name, 'rb') as imgf:
                        img_bytes = imgf.read()
                        tables = self.extract_tables_from_textract_bytes(img_bytes)
                        all_tables.extend(tables)
                        logger.info(f"Found {len(tables)} tables on page {page_num + 1}")
            
            logger.info(f"Total raw tables found: {len(all_tables)}")
            
            # Use the original working table cleaner/merger
            cleaned_tables = self._clean_and_merge_tables_simple_original(all_tables)
            logger.info(f"Cleaned and merged tables: {len(cleaned_tables)}")
            
            # Convert to expected format
            result_tables = []
            for table in cleaned_tables:
                table_dict = {
                    "header": table["header"],
                    "rows": table["rows"],
                    "metadata": {
                        "confidence": 0.9,
                        "quality_score": 0.9,
                        "page_number": 0,
                        "table_id": f"table_{len(result_tables)}"
                    }
                }
                result_tables.append(table_dict)
            
            logger.info(f"Extraction complete. Found {len(result_tables)} tables.")
            return result_tables
            
        except Exception as e:
            logger.error(f"Extraction failed: {e}")
            return []
    
    def extract_tables_from_textract_bytes(self, image_bytes):
        """Extract tables from image bytes using Textract"""
        response = self.textract.analyze_document(
            Document={'Bytes': image_bytes},
            FeatureTypes=['TABLES']
        )
        return self.extract_tables_from_textract(response)
    
    def _clean_and_merge_tables_simple_original(self, raw_tables):
        """
        Use the original working table merging logic from TextractTableExtractor
        with improved header similarity detection
        """
        merged = []
        last_header = None
        cur_rows = []
        
        for t in raw_tables:
            if not t or not t[0]:
                continue
            
            candidate_header = [cell.strip() for cell in t[0]]
            
            # Fallback: if first row is not a header, but second row is, use second row as header
            if not self.is_likely_header(candidate_header) and len(t) > 1 and self.is_likely_header([cell.strip() for cell in t[1]]):
                candidate_header = [cell.strip() for cell in t[1]]
                data_start_idx = 2
            else:
                data_start_idx = 1
            
            if self.is_likely_header(candidate_header):
                if last_header is not None and self._are_headers_similar_simple(last_header, candidate_header):
                    cur_rows += t[data_start_idx:]
                elif last_header is not None and not self._are_headers_similar_simple(last_header, candidate_header):
                    if cur_rows:
                        merged.append({"header": last_header, "rows": cur_rows})
                    last_header = candidate_header
                    cur_rows = t[data_start_idx:]
                else:
                    last_header = candidate_header
                    cur_rows = t[data_start_idx:]
            else:
                if last_header is not None:
                    cur_rows += t
                else:
                    continue  # can't process this page
        
        # Save the last one
        if last_header and cur_rows:
            merged.append({"header": last_header, "rows": cur_rows})
        
        # Clean and return only tables with at least 1 row
        cleaned_tables = [self._clean_table_simple_original(m) for m in merged if m and m.get("rows")]
        
        # Apply header normalization to merge similar headers
        return self._normalize_and_merge_similar_headers(cleaned_tables)
    
    def _clean_table_simple_original(self, table_dict):
        """Pad/trim rows to header length, skip summary rows."""
        header = table_dict["header"]
        rows = []
        for row in table_dict["rows"]:
            if self._is_summary_row_simple(row):
                continue
            # pad or trim
            clean_row = (row + [""] * (len(header) - len(row)))[:len(header)]
            rows.append([cell.strip() for cell in clean_row])
        return {"header": header, "rows": rows}
    
    def _normalize_and_merge_similar_headers(self, tables):
        """
        Normalize headers and merge tables with extremely similar headers
        """
        if not tables:
            return tables
        
        logger.info(f"Normalizing {len(tables)} tables with similar headers")
        
        # Group tables by similar headers
        header_groups = []
        processed = set()
        
        for i, table in enumerate(tables):
            if i in processed:
                continue
            
            group = [table]
            processed.add(i)
            
            for j, other_table in enumerate(tables[i+1:], i+1):
                if j in processed:
                    continue
                
                # Check if headers are extremely similar
                if self._are_headers_extremely_similar(table["header"], other_table["header"]):
                    group.append(other_table)
                    processed.add(j)
                    logger.info(f"Merging table {j} with table {i} due to similar headers")
            
            header_groups.append(group)
        
        # Merge each group and normalize headers
        merged_tables = []
        for group in header_groups:
            if len(group) == 1:
                # Single table - just normalize the header
                normalized_header = self._normalize_header(group[0]["header"])
                merged_table = {
                    "header": normalized_header,
                    "rows": group[0]["rows"]
                }
                merged_tables.append(merged_table)
            else:
                # Multiple tables - merge them
                primary_table = group[0]
                all_rows = []
                
                for table in group:
                    # Normalize rows to match the primary header
                    normalized_rows = self._normalize_rows_to_header(table["rows"], primary_table["header"])
                    all_rows.extend(normalized_rows)
                
                # Remove duplicate rows
                unique_rows = self._remove_duplicate_rows(all_rows)
                
                # Normalize the primary header
                normalized_header = self._normalize_header(primary_table["header"])
                
                merged_table = {
                    "header": normalized_header,
                    "rows": unique_rows
                }
                merged_tables.append(merged_table)
        
        logger.info(f"After normalization: {len(merged_tables)} tables")
        return merged_tables
    
    def _are_headers_extremely_similar(self, h1, h2):
        """
        Check if headers are extremely similar (allowing for OCR artifacts like empty strings)
        """
        if not h1 or not h2:
            return False
        
        # Remove empty strings from both headers
        h1_clean = [cell for cell in h1 if cell.strip()]
        h2_clean = [cell for cell in h2 if cell.strip()]
        
        # If cleaned headers are identical, they're extremely similar
        if h1_clean == h2_clean:
            return True
        
        # Check for high similarity with sequence matcher
        h1_text = ' '.join(h1_clean)
        h2_text = ' '.join(h2_clean)
        
        similarity = SequenceMatcher(None, h1_text.lower(), h2_text.lower()).ratio()
        
        # Consider extremely similar if similarity > 0.95
        return similarity > 0.95
    
    def _normalize_header(self, header):
        """
        Normalize header by removing empty strings and cleaning up OCR artifacts
        """
        if not header:
            return header
        
        # Remove empty strings and clean up
        normalized = []
        for cell in header:
            cell_clean = cell.strip()
            if cell_clean:  # Only add non-empty cells
                normalized.append(cell_clean)
        
        return normalized
    
    def _normalize_rows_to_header(self, rows, target_header):
        """
        Normalize rows to match the target header structure
        """
        if not rows or not target_header:
            return rows
        
        normalized_rows = []
        for row in rows:
            # Pad or trim row to match header length
            normalized_row = (row + [""] * (len(target_header) - len(row)))[:len(target_header)]
            normalized_rows.append(normalized_row)
        
        return normalized_rows
    
    def _remove_duplicate_rows(self, rows):
        """
        Remove duplicate rows that might appear across pages
        """
        seen = set()
        unique_rows = []
        
        for row in rows:
            # Create a hash of the row content
            row_hash = '|'.join([cell.strip() for cell in row if cell.strip()])
            
            if row_hash and row_hash not in seen:
                seen.add(row_hash)
                unique_rows.append(row)
        
        return unique_rows
    
    def combine_engine_results(self, engine_results: List[Tuple], page_num: int) -> List[Any]:
        """
        Combine results from multiple OCR engines
        """
        combined_tables = []
        
        for engine_name, result in engine_results:
            if engine_name == 'textract':
                tables = self.extract_tables_from_textract(result)
            else:
                tables = result
            
            for table in tables:
                if table and len(table) > 1:
                    combined_tables.append({
                        'rows': table,
                        'page_number': page_num,
                        'engine': engine_name
                    })
        
        return combined_tables
    
    def extract_tables_from_textract(self, response: Dict) -> List[List[List[str]]]:
        """
        Extract tables from AWS Textract response
        """
        tables = []
        blocks = response['Blocks']
        block_map = {block['Id']: block for block in blocks}
        
        for block in blocks:
            if block['BlockType'] == 'TABLE':
                table = []
                rows = {}
                
                for relationship in block.get('Relationships', []):
                    if relationship['Type'] == 'CHILD':
                        for cell_id in relationship['Ids']:
                            cell = block_map.get(cell_id)
                            if not cell or cell.get('BlockType') != 'CELL':
                                continue
                            
                            row_idx = cell['RowIndex']
                            col_idx = cell['ColumnIndex']
                            text = ''
                            
                            for rel in cell.get('Relationships', []):
                                if rel['Type'] == 'CHILD':
                                    text = ' '.join(
                                        block_map[cid]['Text']
                                        for cid in rel['Ids']
                                        if block_map[cid]['BlockType'] == 'WORD'
                                    )
                            
                            if row_idx not in rows:
                                rows[row_idx] = {}
                            rows[row_idx][col_idx] = text
                
                # Convert to list format
                max_col = max((col for row in rows.values() for col in row.keys()), default=0)
                for r in sorted(rows):
                    row_data = [rows[r].get(c, '') for c in range(1, max_col + 1)]
                    table.append(row_data)
                
                if table:
                    tables.append(table)
        
        return tables
    
    def find_best_header(self, table_rows: List[List[str]], header_candidates: List[TableHeader]) -> Optional[TableHeader]:
        """
        Find the best matching header for a table
        """
        if not table_rows or not header_candidates:
            return None
        
        best_header = None
        best_score = 0.0
        
        for candidate in header_candidates:
            # Check if this header matches the table structure
            if len(candidate.columns) <= len(table_rows[0]):
                score = candidate.confidence
                
                # Bonus for commission-related keywords
                commission_bonus = sum(
                    1 for col in candidate.columns 
                    if any(re.search(pattern, col.lower()) for pattern in self.commission_patterns)
                ) / len(candidate.columns)
                
                score += commission_bonus * 0.2
                
                if score > best_score:
                    best_score = score
                    best_header = candidate
        
        return best_header 