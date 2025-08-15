"""Advanced multi-page table linking and reconstruction."""

from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from dataclasses import dataclass
import asyncio
from ..utils.logging_utils import get_logger
from ..utils.config import Config

@dataclass
class PageTable:
    """Represents a table found on a specific page."""
    page_number: int
    table_data: Dict[str, Any]
    headers: List[str]
    bbox: List[float]
    confidence: float
    
class MultiPageTableHandler:
    """Handler for linking and reconstructing tables across multiple pages."""
    
    def __init__(self, config: Config):
        self.config = config
        self.logger = get_logger(__name__, config)
        
        # Similarity thresholds
        self.header_similarity_threshold = 0.85
        self.position_similarity_threshold = 0.1  # 10% of page width
        self.structure_similarity_threshold = 0.8
    
    async def link_multipage_tables(
        self, 
        page_tables: List[List[Dict[str, Any]]]
    ) -> List[Dict[str, Any]]:
        """Link tables that span multiple pages."""
        
        try:
            self.logger.logger.info(f"🔗 Multipage handler: Processing {len(page_tables)} pages")
            
            # Convert to PageTable objects
            all_page_tables = []
            for page_num, tables in enumerate(page_tables):
                for table in tables:
                    page_table = PageTable(
                        page_number=page_num,
                        table_data=table,
                        headers=table.get('headers', []),
                        bbox=table.get('bbox', [0, 0, 0, 0]),
                        confidence=table.get('confidence', 0.0)
                    )
                    all_page_tables.append(page_table)
            
            self.logger.logger.info(f"📋 Converted to {len(all_page_tables)} PageTable objects")
            
            # Find table continuation candidates
            continuation_groups = await self._find_continuation_groups(all_page_tables)
            
            self.logger.logger.info(f"🔍 Found {len(continuation_groups)} continuation groups")
            for i, group in enumerate(continuation_groups):
                self.logger.logger.info(f"   Group {i}: {len(group)} tables from pages {[pt.page_number for pt in group]}")
            
            # Merge continued tables
            merged_tables = []
            processed_tables = set()
            
            for group in continuation_groups:
                if group:
                    merged_table = await self._merge_table_group(group)
                    merged_tables.append(merged_table)
                    
                    # Mark as processed
                    for page_table in group:
                        processed_tables.add(id(page_table))
            
            # Add non-continued tables
            for page_table in all_page_tables:
                if id(page_table) not in processed_tables:
                    merged_tables.append(page_table.table_data)
            
            self.logger.logger.info(f"🔗 Linked {len(page_tables)} pages into {len(merged_tables)} tables")
            return merged_tables
            
        except Exception as e:
            self.logger.logger.error(f"Multi-page linking failed: {e}")
            # Return original tables if linking fails
            return [table for page in page_tables for table in page]
    
    async def _find_continuation_groups(
        self, 
        page_tables: List[PageTable]
    ) -> List[List[PageTable]]:
        """Find groups of tables that are continuations of each other."""
        
        continuation_groups = []
        processed = set()
        
        # Sort tables by page number
        sorted_tables = sorted(page_tables, key=lambda t: t.page_number)
        
        self.logger.logger.info(f"🔍 Finding continuation groups among {len(sorted_tables)} tables")
        
        for i, table in enumerate(sorted_tables):
            if id(table) in processed:
                continue
            
            # Start a new continuation group
            group = [table]
            processed.add(id(table))
            
            self.logger.logger.info(f"🔍 Starting new group with table from page {table.page_number}")
            self.logger.logger.info(f"   Table headers: {table.headers[:3]}...")
            
            # Look for continuations in subsequent pages
            current_table = table
            for j in range(i + 1, len(sorted_tables)):
                candidate = sorted_tables[j]
                
                if id(candidate) in processed:
                    continue
                
                self.logger.logger.info(f"🔍 Checking candidate table from page {candidate.page_number}")
                self.logger.logger.info(f"   Candidate headers: {candidate.headers[:3]}...")
                
                # Check if candidate is a continuation
                if await self._is_table_continuation(current_table, candidate):
                    group.append(candidate)
                    processed.add(id(candidate))
                    current_table = candidate
                    self.logger.logger.info(f"✅ Added candidate to group (now {len(group)} tables)")
                else:
                    # Check for gaps (table might continue after missing pages)
                    if candidate.page_number - current_table.page_number <= 3:  # Allow 3 page gap
                        if await self._is_table_continuation_with_gap(current_table, candidate):
                            group.append(candidate)
                            processed.add(id(candidate))
                            current_table = candidate
                            self.logger.logger.info(f"✅ Added candidate to group (gap detected, now {len(group)} tables)")
                        else:
                            self.logger.logger.info(f"❌ Candidate not a continuation (gap scenario)")
                    else:
                        self.logger.logger.info(f"❌ Candidate not a continuation (gap too large)")
            
            if len(group) > 1:  # Only add groups with multiple tables
                continuation_groups.append(group)
                self.logger.logger.info(f"✅ Added continuation group with {len(group)} tables")
            else:
                # Single table, remove from processed to add individually
                processed.remove(id(table))
                self.logger.logger.info(f"📋 Single table group, will add individually")
        
        return continuation_groups
    
    async def _is_table_continuation(
        self, 
        table1: PageTable, 
        table2: PageTable
    ) -> bool:
        """Check if table2 is a continuation of table1."""
        
        # Must be consecutive or near-consecutive pages
        if table2.page_number - table1.page_number > 2:
            return False
        
        # **IMPROVED: Check if table2's "headers" are actually data (strongest continuation indicator)**
        table2_headers_look_like_data = self._headers_look_like_data(table2.headers)
        
        # If table2 headers look like data, it's very likely a continuation
        if table2_headers_look_like_data:
            self.logger.logger.info(f"🔍 Table2 headers look like data: {table2.headers[:3]}...")
            
            # Check if the "headers" match the structure of table1's data
            if self._matches_table_structure(table2.headers, table1.table_data):
                self.logger.logger.info(f"✅ Structure matches - likely continuation")
                # Additional check: ensure the data types/content are similar
                if self._has_similar_content_pattern(table2.headers, table1.table_data):
                    self.logger.logger.info(f"✅ Content patterns match - confirming continuation")
                    return True
                else:
                    self.logger.logger.info(f"⚠️ Content patterns don't match, but structure does")
                    # Still return True if structure matches, as this is a strong indicator
                    return True
        
        # Check header similarity (for cases where headers are repeated)
        header_sim = self._calculate_header_similarity(table1.headers, table2.headers)
        
        # High header similarity indicates same table with repeated headers
        if header_sim >= 0.8:  # High similarity threshold for repeated headers
            self.logger.logger.info(f"🔍 High header similarity ({header_sim:.2f}) - likely repeated headers")
            # Check position similarity (tables should be in similar positions)
            pos_sim = self._calculate_position_similarity(table1.bbox, table2.bbox)
            if pos_sim >= 0.6:  # Reasonable position similarity
                # Check structure similarity
                struct_sim = self._calculate_structure_similarity(table1.table_data, table2.table_data)
                if struct_sim >= 0.7:  # High structure similarity
                    self.logger.logger.info(f"✅ Position and structure similarity confirm continuation")
                    return True  # No content validation needed for identical headers
        
        # Medium header similarity with content validation
        elif header_sim >= 0.6:  # Medium similarity threshold
            self.logger.logger.info(f"🔍 Medium header similarity ({header_sim:.2f}) - checking additional criteria")
            # Check position similarity (tables should be in similar positions)
            pos_sim = self._calculate_position_similarity(table1.bbox, table2.bbox)
            if pos_sim >= 0.7:  # Higher position similarity requirement
                # Check structure similarity
                struct_sim = self._calculate_structure_similarity(table1.table_data, table2.table_data)
                if struct_sim >= 0.6:  # Medium structure similarity
                    # Additional check: ensure content patterns are similar
                    if self._has_similar_content_pattern(table2.headers, table1.table_data):
                        self.logger.logger.info(f"✅ All criteria met - confirming continuation")
                        return True
        
        # Additional checks for continuation patterns
        continuation_score = await self._calculate_continuation_score(table1, table2)
        
        if continuation_score > 0.6:
            self.logger.logger.info(f"✅ Continuation score ({continuation_score:.2f}) indicates continuation")
            return True
        
        self.logger.logger.info(f"❌ No continuation detected (score: {continuation_score:.2f})")
        return False
    
    async def _is_table_continuation_with_gap(
        self, 
        table1: PageTable, 
        table2: PageTable
    ) -> bool:
        """Check if table2 continues table1 with potential gaps."""
        
        # More lenient checks for tables with gaps
        header_sim = self._calculate_header_similarity(table1.headers, table2.headers)
        pos_sim = self._calculate_position_similarity(table1.bbox, table2.bbox)
        
        # Lower thresholds for gap scenarios
        return (
            header_sim > 0.7 and 
            pos_sim > 0.7 and
            self._has_continuation_indicators(table1, table2)
        )
    
    def _calculate_header_similarity(self, headers1: List[str], headers2: List[str]) -> float:
        """Calculate similarity between header lists."""
        
        if not headers1 or not headers2:
            return 0.0
        
        # Normalize headers
        h1_norm = [h.lower().strip() for h in headers1]
        h2_norm = [h.lower().strip() for h in headers2]
        
        # Calculate Jaccard similarity
        set1 = set(h1_norm)
        set2 = set(h2_norm)
        
        intersection = len(set1.intersection(set2))
        union = len(set1.union(set2))
        
        return intersection / union if union > 0 else 0.0
    
    def _calculate_position_similarity(self, bbox1: List[float], bbox2: List[float]) -> float:
        """Calculate position similarity between table bounding boxes."""
        
        if not bbox1 or not bbox2 or len(bbox1) != 4 or len(bbox2) != 4:
            return 0.0
        
        # Compare x-positions (horizontal alignment)
        x1_center = (bbox1[0] + bbox1[2]) / 2
        x2_center = (bbox2[0] + bbox2[2]) / 2
        
        # Compare widths
        width1 = bbox1[2] - bbox1[0]
        width2 = bbox2[2] - bbox2[0]
        
        # Calculate similarity
        x_similarity = 1 - abs(x1_center - x2_center) / max(width1, width2, 1)
        width_similarity = 1 - abs(width1 - width2) / max(width1, width2, 1)
        
        return (x_similarity + width_similarity) / 2
    
    def _calculate_structure_similarity(
        self, 
        table1: Dict[str, Any], 
        table2: Dict[str, Any]
    ) -> float:
        """Calculate structural similarity between tables."""
        
        # Compare number of columns
        cols1 = table1.get('column_count', 0)
        cols2 = table2.get('column_count', 0)
        
        if cols1 == 0 or cols2 == 0:
            return 0.0
        
        col_similarity = 1 - abs(cols1 - cols2) / max(cols1, cols2)
        
        # Compare cell patterns
        cells1 = table1.get('cells', [])
        cells2 = table2.get('cells', [])
        
        if not cells1 or not cells2:
            return col_similarity
        
        # Analyze cell confidence patterns
        conf1 = [cell.get('confidence', 0) for cell in cells1]
        conf2 = [cell.get('confidence', 0) for cell in cells2]
        
        conf_similarity = 1 - abs(np.mean(conf1) - np.mean(conf2))
        
        return (col_similarity + conf_similarity) / 2
    
    async def _calculate_continuation_score(
        self, 
        table1: PageTable, 
        table2: PageTable
    ) -> float:
        """Calculate overall continuation likelihood score."""
        
        score = 0.0
        
        # Sequential page bonus
        if table2.page_number == table1.page_number + 1:
            score += 0.3
        
        # Position consistency
        if table2.bbox[1] < 100:  # Table starts near top of page (continuation)
            score += 0.2
        
        # Check header similarity for repeated headers scenario
        header_sim = self._calculate_header_similarity(table1.headers, table2.headers)
        if header_sim >= 0.8:  # Very high similarity (identical headers)
            score += 0.5  # Strong indicator for repeated headers
        elif header_sim >= 0.6:  # High similarity
            score += 0.3
        
        # **IMPROVED: Check if table2's "headers" are actually data (strongest continuation indicator)**
        if self._headers_look_like_data(table2.headers):
            score += 0.6  # Increased from 0.4 - this is a very strong indicator
            
            # Additional check: ensure the data patterns match
            if self._has_similar_content_pattern(table2.headers, table1.table_data):
                score += 0.4  # Increased from 0.3 - content patterns match
            else:
                # Even if content patterns don't match exactly, headers looking like data is still a strong indicator
                score += 0.2
        
        # Header presence patterns
        if not table2.headers and table1.headers:  # Continued table might not repeat headers
            score += 0.1
        
        # Row count patterns (continued tables often have fewer rows per page)
        rows1 = table1.table_data.get('row_count', 0)
        rows2 = table2.table_data.get('row_count', 0)
        
        if rows1 > 0 and rows2 > 0 and rows2 < rows1:
            score += 0.1  # Second part might have fewer rows
        
        # Column count consistency
        cols1 = table1.table_data.get('column_count', len(table1.headers))
        cols2 = table2.table_data.get('column_count', len(table2.headers))
        if cols1 > 0 and cols2 > 0 and abs(cols1 - cols2) <= 1:
            score += 0.2  # Column counts are similar
        
        return min(score, 1.0)
    
    def _has_continuation_indicators(self, table1: PageTable, table2: PageTable) -> bool:
        """Check for specific continuation indicators."""
        
        # Check if first table ends near bottom of page
        if len(table1.bbox) >= 4 and table1.bbox[3] > 700:  # Assuming ~800px page height
            return True
        
        # Check if second table starts near top of page
        if len(table2.bbox) >= 4 and table2.bbox[1] < 100:
            return True
        
        # Check for "continued" keywords in nearby text
        # This would require OCR context - implement if available
        
        return False
    
    async def _merge_table_group(self, table_group: List[PageTable]) -> Dict[str, Any]:
        """Merge a group of continued tables into a single table."""
        
        if not table_group:
            return {}
        
        if len(table_group) == 1:
            return table_group[0].table_data
        
        # Use first table as base
        base_table = table_group[0].table_data.copy()
        
        # Merge rows from subsequent tables
        all_rows = list(base_table.get('rows', []))
        all_cells = list(base_table.get('cells', []))
        
        current_row_offset = len(all_rows)
        
        for i, page_table in enumerate(table_group[1:], 1):
            table_data = page_table.table_data
            
            # Add rows (skip headers if they exist)
            rows = table_data.get('rows', [])
            
            # Check if the "headers" of this table are actually data
            if self._headers_look_like_data(table_data.get('headers', [])):
                # The "headers" are actually data, so include them as the first row
                if table_data.get('headers'):
                    rows = [table_data.get('headers')] + rows
            elif rows and table_data.get('headers') and i > 0:
                # Skip first row if it looks like headers
                if self._is_header_row(rows[0], base_table.get('headers', [])):
                    rows = rows[1:]
            
            all_rows.extend(rows)
            
            # Add cells with updated row indices
            cells = table_data.get('cells', [])
            for cell in cells:
                if cell.get('is_header', False) and i > 0:
                    continue  # Skip header cells from continuation pages
                
                # Update row index
                updated_cell = cell.copy()
                updated_cell['row'] = cell.get('row', 0) + current_row_offset
                all_cells.append(updated_cell)
            
            current_row_offset = len(all_rows)
        
        # Update merged table
        base_table['rows'] = all_rows
        base_table['cells'] = all_cells
        base_table['row_count'] = len(all_rows)
        
        # Add multipage metadata
        base_table['multipage_info'] = {
            'is_multipage': True,
            'page_count': len(table_group),
            'page_numbers': [pt.page_number for pt in table_group],
            'merge_confidence': np.mean([pt.confidence for pt in table_group])
        }
        
        # Preserve page order information for sequential merging
        base_table['page_number'] = table_group[0].page_number  # Use first page number
        base_table['page_sequence'] = [pt.page_number for pt in table_group]  # Track all pages
        
        return base_table
    
    def _is_header_row(self, row: List[str], expected_headers: List[str]) -> bool:
        """Check if a row looks like a header row."""
        
        if not row or not expected_headers:
            return False
        
        # Compare with expected headers
        similarity = sum(
            1 for r, h in zip(row, expected_headers) 
            if r.lower().strip() == h.lower().strip()
        ) / max(len(row), len(expected_headers))
        
        return similarity > 0.7
    
    def _headers_look_like_data(self, headers: List[str]) -> bool:
        """Check if headers actually look like data rows instead of headers using adaptive learning."""
        if not headers:
            return False
        
        # Use statistical analysis to determine if headers look like data
        data_indicators = 0
        total_headers = len(headers)
        
        for header in headers:
            header_str = str(header).strip()
            
            # Check for data-like characteristics using statistical patterns
            if self._is_data_like_content(header_str):
                data_indicators += 1
        
        # **IMPROVED: More lenient threshold for financial documents**
        # If more than 40% of headers look like data, they probably are data
        # This is especially true for financial documents where continuation tables
        # often have company names, IDs, and amounts as "headers"
        threshold = 0.4 if total_headers >= 5 else 0.5  # More lenient for larger tables
        
        result = data_indicators >= total_headers * threshold
        
        if result:
            self.logger.logger.info(f"🔍 Headers look like data: {data_indicators}/{total_headers} indicators (threshold: {threshold:.1f})")
            self.logger.logger.info(f"   Sample headers: {headers[:3]}...")
        
        return result
    
    def _is_data_like_content(self, content: str) -> bool:
        """Determine if content looks like data using statistical analysis."""
        if not content:
            return False
        
        # Calculate various statistical indicators
        indicators = 0
        
        # 1. Length analysis (data often has consistent, moderate lengths)
        if 3 <= len(content) <= 50:
            indicators += 1
        
        # 2. Character type distribution
        alpha_count = sum(1 for c in content if c.isalpha())
        digit_count = sum(1 for c in content if c.isdigit())
        special_count = len(content) - alpha_count - digit_count
        
        # Data often has mixed character types
        if alpha_count > 0 and digit_count > 0:
            indicators += 1
        
        # 3. Case pattern analysis (data often has mixed case or specific patterns)
        if content != content.upper() and content != content.lower():
            indicators += 1
        
        # 4. Numeric content detection (without hardcoding currency symbols)
        if any(c.isdigit() for c in content):
            # Check if it's a pure number or mixed content
            if digit_count > alpha_count:
                indicators += 1
        
        # 5. Word count analysis (data often has 1-3 words)
        word_count = len(content.split())
        if 1 <= word_count <= 3:
            indicators += 1
        
        # 6. Special character analysis (data often has specific patterns)
        if any(c in content for c in [',', '.', '-', '/', '(', ')']):
            indicators += 1
        
        # **NEW: Financial document specific patterns**
        # 7. Company name patterns (LLC, Inc, Corp, etc.)
        if any(suffix in content.upper() for suffix in ['LLC', 'INC', 'CORP', 'CO', 'COMPANY']):
            indicators += 2  # Strong indicator
        
        # 8. State codes (2-letter uppercase)
        if len(content) == 2 and content.isupper() and content.isalpha():
            indicators += 2  # Strong indicator
        
        # 9. ID patterns (alphanumeric codes like UT123456)
        if len(content) >= 6 and any(c.isdigit() for c in content) and any(c.isalpha() for c in content):
            indicators += 1
        
        # 10. Currency amounts ($X,XXX.XX pattern)
        if '$' in content and any(c.isdigit() for c in content):
            indicators += 2  # Strong indicator
        
        # 11. Subscriber counts (small numbers)
        if content.isdigit() and 1 <= int(content) <= 100:
            indicators += 1
        
        # 12. Rate patterns (X.XX/subscriber)
        if '/subscriber' in content.lower() or '/month' in content.lower():
            indicators += 2  # Strong indicator
        
        # 7. Header-like content detection (negative indicators)
        header_indicators = 0
        
        # Headers are often shorter and more generic
        if len(content) <= 15 and alpha_count > digit_count:
            header_indicators += 1
        
        # Headers often have consistent case patterns
        if content.islower() or content.istitle():
            header_indicators += 1
        
        # Headers often have common words that appear in headers (detected statistically)
        # This is a very minimal list of common header words, but the system primarily relies on statistical analysis
        # The main detection comes from length, case patterns, and character distribution analysis above
        if len(content) <= 10 and content.islower():
            header_indicators += 1
        
        # **NEW: Strong header indicators (negative)**
        # Common header words that indicate this is actually a header
        header_words = ['billing', 'group', 'premium', 'commission', 'rate', 'subscriber', 'total', 'due', 'current', 'prior', 'adjustment']
        if any(word in content.lower() for word in header_words):
            header_indicators += 2  # Strong negative indicator
        
        # Subtract header indicators from data indicators
        final_score = indicators - header_indicators
        
        # Return True if content shows strong data-like characteristics
        return final_score >= 2
    
    def _matches_table_structure(self, potential_data_row: List[str], table_data: Dict[str, Any]) -> bool:
        """Check if a potential data row matches the structure of the table."""
        if not potential_data_row or not table_data:
            return False
        
        # Get the number of columns in the original table
        original_columns = table_data.get('column_count', 0)
        if original_columns == 0:
            # Try to get from headers
            original_headers = table_data.get('headers', [])
            original_columns = len(original_headers)
        
        # Check if the potential data row has the same number of columns
        if len(potential_data_row) == original_columns:
            return True
        
        # Check if it's close (within 1 column difference)
        if abs(len(potential_data_row) - original_columns) <= 1:
            return True
        
        return False
    
    def _has_similar_content_pattern(self, potential_data_row: List[str], table_data: Dict[str, Any]) -> bool:
        """Check if the potential data row has similar content patterns to the table using adaptive learning."""
        if not potential_data_row or not table_data:
            return False
        
        # Get sample rows from the table to compare patterns
        rows = table_data.get('rows', [])
        if not rows:
            return False
        
        # Learn patterns from existing table data
        column_patterns = self._learn_column_patterns(rows)
        
        # Check if the potential data row matches learned patterns
        pattern_matches = 0
        total_checks = 0
        
        for i, cell in enumerate(potential_data_row):
            if i >= len(column_patterns):
                break
            
            cell_str = str(cell).strip()
            column_pattern = column_patterns[i]
            
            # Check if cell matches the learned pattern for this column
            if self._matches_column_pattern(cell_str, column_pattern):
                pattern_matches += 1
            
            total_checks += 1
        
        # Require at least 60% pattern match for continuation
        return total_checks > 0 and (pattern_matches / total_checks) >= 0.6
    
    def _learn_column_patterns(self, rows: List[List[str]]) -> List[Dict[str, Any]]:
        """Learn patterns from table data for each column."""
        if not rows:
            return []
        
        num_columns = max(len(row) for row in rows) if rows else 0
        column_patterns = []
        
        for col_idx in range(num_columns):
            column_data = []
            for row in rows:
                if col_idx < len(row):
                    column_data.append(str(row[col_idx]).strip())
            
            if column_data:
                pattern = self._analyze_column_pattern(column_data)
                column_patterns.append(pattern)
            else:
                column_patterns.append({})
        
        return column_patterns
    
    def _analyze_column_pattern(self, column_data: List[str]) -> Dict[str, Any]:
        """Analyze the pattern of a single column."""
        if not column_data:
            return {}
        
        pattern = {
            'length_stats': self._calculate_length_stats(column_data),
            'char_type_distribution': self._calculate_char_type_distribution(column_data),
            'case_patterns': self._analyze_case_patterns(column_data),
            'numeric_patterns': self._analyze_numeric_patterns(column_data),
            'special_char_patterns': self._analyze_special_char_patterns(column_data),
            'word_patterns': self._analyze_word_patterns(column_data)
        }
        
        return pattern
    
    def _calculate_length_stats(self, data: List[str]) -> Dict[str, float]:
        """Calculate length statistics for a column."""
        lengths = [len(item) for item in data if item]
        if not lengths:
            return {'mean': 0, 'std': 0, 'min': 0, 'max': 0}
        
        mean_length = sum(lengths) / len(lengths)
        variance = sum((x - mean_length) ** 2 for x in lengths) / len(lengths)
        std_length = variance ** 0.5
        
        return {
            'mean': mean_length,
            'std': std_length,
            'min': min(lengths),
            'max': max(lengths)
        }
    
    def _calculate_char_type_distribution(self, data: List[str]) -> Dict[str, float]:
        """Calculate character type distribution for a column."""
        total_chars = 0
        alpha_chars = 0
        digit_chars = 0
        special_chars = 0
        
        for item in data:
            for char in item:
                total_chars += 1
                if char.isalpha():
                    alpha_chars += 1
                elif char.isdigit():
                    digit_chars += 1
                else:
                    special_chars += 1
        
        if total_chars == 0:
            return {'alpha_ratio': 0, 'digit_ratio': 0, 'special_ratio': 0}
        
        return {
            'alpha_ratio': alpha_chars / total_chars,
            'digit_ratio': digit_chars / total_chars,
            'special_ratio': special_chars / total_chars
        }
    
    def _analyze_case_patterns(self, data: List[str]) -> Dict[str, Any]:
        """Analyze case patterns in a column."""
        all_upper = sum(1 for item in data if item.isupper())
        all_lower = sum(1 for item in data if item.islower())
        mixed_case = sum(1 for item in data if not item.isupper() and not item.islower() and item)
        title_case = sum(1 for item in data if item.istitle())
        
        total = len(data)
        if total == 0:
            return {'all_upper_ratio': 0, 'all_lower_ratio': 0, 'mixed_case_ratio': 0, 'title_case_ratio': 0}
        
        return {
            'all_upper_ratio': all_upper / total,
            'all_lower_ratio': all_lower / total,
            'mixed_case_ratio': mixed_case / total,
            'title_case_ratio': title_case / total
        }
    
    def _analyze_numeric_patterns(self, data: List[str]) -> Dict[str, Any]:
        """Analyze numeric patterns in a column."""
        numeric_count = 0
        decimal_count = 0
        currency_count = 0
        
        for item in data:
            # Remove common non-numeric characters for analysis
            clean_item = item.replace(',', '').replace('$', '').replace('%', '').strip()
            
            if clean_item.replace('.', '').isdigit():
                numeric_count += 1
                if '.' in clean_item:
                    decimal_count += 1
            
            if '$' in item or '%' in item:
                currency_count += 1
        
        total = len(data)
        if total == 0:
            return {'numeric_ratio': 0, 'decimal_ratio': 0, 'currency_ratio': 0}
        
        return {
            'numeric_ratio': numeric_count / total,
            'decimal_ratio': decimal_count / total,
            'currency_ratio': currency_count / total
        }
    
    def _analyze_special_char_patterns(self, data: List[str]) -> Dict[str, float]:
        """Analyze special character patterns in a column."""
        special_chars = set()
        for item in data:
            for char in item:
                if not char.isalnum() and char != ' ':
                    special_chars.add(char)
        
        # Calculate frequency of each special character
        char_freq = {}
        total_chars = sum(len(item) for item in data)
        
        if total_chars > 0:
            for char in special_chars:
                freq = sum(item.count(char) for item in data) / total_chars
                char_freq[char] = freq
        
        return char_freq
    
    def _analyze_word_patterns(self, data: List[str]) -> Dict[str, Any]:
        """Analyze word patterns in a column."""
        word_counts = [len(item.split()) for item in data]
        
        if not word_counts:
            return {'mean_words': 0, 'std_words': 0, 'max_words': 0}
        
        mean_words = sum(word_counts) / len(word_counts)
        variance = sum((x - mean_words) ** 2 for x in word_counts) / len(word_counts)
        std_words = variance ** 0.5
        
        return {
            'mean_words': mean_words,
            'std_words': std_words,
            'max_words': max(word_counts)
        }
    
    def _matches_column_pattern(self, cell: str, pattern: Dict[str, Any]) -> bool:
        """Check if a cell matches the learned pattern for a column."""
        if not pattern or not cell:
            return False
        
        matches = 0
        total_checks = 0
        
        # Check length pattern
        if 'length_stats' in pattern:
            length_stats = pattern['length_stats']
            cell_length = len(cell)
            mean_length = length_stats['mean']
            std_length = length_stats['std']
            
            # Check if length is within 2 standard deviations
            if abs(cell_length - mean_length) <= 2 * std_length:
                matches += 1
            total_checks += 1
        
        # Check character type distribution
        if 'char_type_distribution' in pattern:
            char_dist = pattern['char_type_distribution']
            alpha_count = sum(1 for c in cell if c.isalpha())
            digit_count = sum(1 for c in cell if c.isdigit())
            special_count = len(cell) - alpha_count - digit_count
            
            if len(cell) > 0:
                alpha_ratio = alpha_count / len(cell)
                digit_ratio = digit_count / len(cell)
                special_ratio = special_count / len(cell)
                
                # Check if ratios are similar (within 0.3 tolerance)
                if (abs(alpha_ratio - char_dist['alpha_ratio']) <= 0.3 and
                    abs(digit_ratio - char_dist['digit_ratio']) <= 0.3 and
                    abs(special_ratio - char_dist['special_ratio']) <= 0.3):
                    matches += 1
                total_checks += 1
        
        # Check case pattern
        if 'case_patterns' in pattern:
            case_patterns = pattern['case_patterns']
            if cell.isupper() and case_patterns['all_upper_ratio'] > 0.5:
                matches += 1
            elif cell.islower() and case_patterns['all_lower_ratio'] > 0.5:
                matches += 1
            elif not cell.isupper() and not cell.islower() and case_patterns['mixed_case_ratio'] > 0.3:
                matches += 1
            total_checks += 1
        
        # Check numeric pattern
        if 'numeric_patterns' in pattern:
            numeric_patterns = pattern['numeric_patterns']
            clean_cell = cell.replace(',', '').replace('$', '').replace('%', '').strip()
            
            if clean_cell.replace('.', '').isdigit():
                if numeric_patterns['numeric_ratio'] > 0.5:
                    matches += 1
                if '.' in clean_cell and numeric_patterns['decimal_ratio'] > 0.3:
                    matches += 1
            if ('$' in cell or '%' in cell) and numeric_patterns['currency_ratio'] > 0.3:
                matches += 1
            total_checks += 1
        
        # Check word count pattern
        if 'word_patterns' in pattern:
            word_patterns = pattern['word_patterns']
            word_count = len(cell.split())
            mean_words = word_patterns['mean_words']
            std_words = word_patterns['std_words']
            
            if abs(word_count - mean_words) <= 2 * std_words:
                matches += 1
            total_checks += 1
        
        # Return True if at least 60% of checks pass
        return total_checks > 0 and (matches / total_checks) >= 0.6
