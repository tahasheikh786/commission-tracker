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
    """Handler for linking and reconstructing tables across multiple pages using sequence-based approach."""
    
    def __init__(self, config: Config):
        self.config = config
        self.logger = get_logger(__name__, config)
        
        # Similarity thresholds for header detection
        self.header_similarity_threshold = 0.85
        self.new_table_detection_threshold = 0.3  # Low threshold to detect new tables
    
    async def link_multipage_tables(
        self, 
        page_tables: List[List[Dict[str, Any]]]
    ) -> List[Dict[str, Any]]:
        """Link tables that span multiple pages using sequence-based approach."""
        
        try:
            self.logger.logger.info(f"🔗 Sequence-based multipage handler: Processing {len(page_tables)} pages")
            
            # Convert to PageTable objects and sort by page number
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
            
            # Sort by page number to maintain sequence
            all_page_tables.sort(key=lambda t: t.page_number)
            
            self.logger.logger.info(f"📋 Converted to {len(all_page_tables)} PageTable objects across {len(page_tables)} pages")
            
            # Group tables by sequence-based continuation
            table_groups = await self._group_tables_by_sequence(all_page_tables)
            
            self.logger.logger.info(f"🔍 Found {len(table_groups)} table groups")
            for i, group in enumerate(table_groups):
                self.logger.logger.info(f"   Group {i}: {len(group)} tables from pages {[pt.page_number for pt in group]}")
            
            # Merge each group into a single table
            merged_tables = []
            for group in table_groups:
                if group:
                    merged_table = await self._merge_table_group(group)
                    merged_tables.append(merged_table)
            
            self.logger.logger.info(f"🔗 Linked {len(page_tables)} pages into {len(merged_tables)} tables")
            return merged_tables
            
        except Exception as e:
            self.logger.logger.error(f"Sequence-based multi-page linking failed: {e}")
            # Return original tables if linking fails
            return [table for page in page_tables for table in page]
    
    async def _group_tables_by_sequence(
        self, 
        page_tables: List[PageTable]
    ) -> List[List[PageTable]]:
        """Group tables by sequence-based continuation logic."""
        
        if not page_tables:
            return []
        
        table_groups = []
        current_group = []
        current_headers = None
        
        self.logger.logger.info(f"🔍 Starting sequence-based grouping of {len(page_tables)} tables")
        
        for i, table in enumerate(page_tables):
            self.logger.logger.info(f"🔍 Processing table {i} from page {table.page_number}")
            self.logger.logger.info(f"   Headers: {table.headers[:3]}...")
            
            # Check if this table starts a new table group
            is_new_table = await self._is_new_table_start(table, current_headers)
            
            if is_new_table:
                # Save current group if it exists
                if current_group:
                    table_groups.append(current_group)
                    self.logger.logger.info(f"✅ Completed group with {len(current_group)} tables")
                
                # Start new group
                current_group = [table]
                current_headers = table.headers
                self.logger.logger.info(f"🆕 Started new table group with headers: {table.headers[:3]}...")
                
            else:
                # Continue current group
                current_group.append(table)
                self.logger.logger.info(f"✅ Added to current group (now {len(current_group)} tables)")
        
        # Add the last group
        if current_group:
            table_groups.append(current_group)
            self.logger.logger.info(f"✅ Completed final group with {len(current_group)} tables")
        
        return table_groups
    
    async def _is_new_table_start(
        self, 
        table: PageTable, 
        current_headers: Optional[List[str]]
    ) -> bool:
        """Determine if this table starts a new table group."""
        
        # If no current headers, this is definitely a new table
        if current_headers is None:
            self.logger.logger.info(f"🆕 First table - starting new group")
            return True
        
        # If table has no headers, it's likely a continuation
        if not table.headers:
            self.logger.logger.info(f"📋 No headers - likely continuation")
            return False
        
        # Check if headers look like data (strong continuation indicator)
        if self._headers_look_like_data(table.headers):
            self.logger.logger.info(f"📋 Headers look like data - likely continuation")
            return False
        
        # Check header similarity with current table
        header_similarity = self._calculate_header_similarity(current_headers, table.headers)
        
        # If headers are very similar, it's likely the same table with repeated headers
        if header_similarity >= 0.8:
            self.logger.logger.info(f"📋 High header similarity ({header_similarity:.2f}) - likely repeated headers")
            return False
        
        # If headers are moderately similar, check additional criteria
        elif header_similarity >= 0.5:
            # Check if this looks like a continuation with similar structure
            if await self._looks_like_continuation(table, current_headers):
                self.logger.logger.info(f"📋 Moderate similarity but looks like continuation")
                return False
            else:
                self.logger.logger.info(f"🆕 Moderate similarity but different table structure")
                return True
        
        # Low similarity indicates new table
        else:
            self.logger.logger.info(f"🆕 Low header similarity ({header_similarity:.2f}) - new table")
            return True
    
    async def _looks_like_continuation(
        self, 
        table: PageTable, 
        current_headers: List[str]
    ) -> bool:
        """Check if table looks like a continuation despite moderate header similarity."""
        
        # Check if table structure matches current headers
        if self._matches_table_structure(table.headers, {'headers': current_headers}):
            return True
        
        # Check if table position is consistent with continuation
        if table.bbox and len(table.bbox) >= 4:
            # Tables that continue often start near the top of the page
            if table.bbox[1] < 100:  # Near top of page
                return True
        
        # Check if the "headers" actually contain data patterns
        if self._has_similar_content_pattern(table.headers, {'headers': current_headers}):
            return True
        
        return False
    
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
    
    def _headers_look_like_data(self, headers: List[str]) -> bool:
        """Check if headers actually look like data rows instead of headers."""
        if not headers:
            return False
        
        # Use statistical analysis to determine if headers look like data
        data_indicators = 0
        total_headers = len(headers)
        
        for header in headers:
            header_str = str(header).strip()
            
            # Check for data-like characteristics
            if self._is_data_like_content(header_str):
                data_indicators += 1
        
        # If more than 40% of headers look like data, they probably are data
        threshold = 0.4 if total_headers >= 5 else 0.5
        
        result = data_indicators >= total_headers * threshold
        
        if result:
            self.logger.logger.info(f"🔍 Headers look like data: {data_indicators}/{total_headers} indicators")
        
        return result
    
    def _is_data_like_content(self, content: str) -> bool:
        """Determine if content looks like data using statistical analysis."""
        if not content:
            return False
        
        indicators = 0
        
        # Length analysis
        if 3 <= len(content) <= 50:
            indicators += 1
        
        # Character type distribution
        alpha_count = sum(1 for c in content if c.isalpha())
        digit_count = sum(1 for c in content if c.isdigit())
        
        # Data often has mixed character types
        if alpha_count > 0 and digit_count > 0:
            indicators += 1
        
        # Case pattern analysis
        if content != content.upper() and content != content.lower():
            indicators += 1
        
        # Numeric content detection
        if any(c.isdigit() for c in content):
            if digit_count > alpha_count:
                indicators += 1
        
        # Word count analysis
        word_count = len(content.split())
        if 1 <= word_count <= 3:
            indicators += 1
        
        # Special character analysis
        if any(c in content for c in [',', '.', '-', '/', '(', ')']):
            indicators += 1
        
        # Financial document specific patterns
        if any(suffix in content.upper() for suffix in ['LLC', 'INC', 'CORP', 'CO', 'COMPANY']):
            indicators += 2
        
        if len(content) == 2 and content.isupper() and content.isalpha():
            indicators += 2
        
        if len(content) >= 6 and any(c.isdigit() for c in content) and any(c.isalpha() for c in content):
            indicators += 1
        
        if '$' in content and any(c.isdigit() for c in content):
            indicators += 2
        
        if content.isdigit() and 1 <= int(content) <= 100:
            indicators += 1
        
        if '/subscriber' in content.lower() or '/month' in content.lower():
            indicators += 2
        
        # Header-like content detection (negative indicators)
        header_indicators = 0
        
        if len(content) <= 15 and alpha_count > digit_count:
            header_indicators += 1
        
        if content.islower() or content.istitle():
            header_indicators += 1
        
        if len(content) <= 10 and content.islower():
            header_indicators += 1
        
        # Strong header indicators
        header_words = ['billing', 'group', 'premium', 'commission', 'rate', 'subscriber', 'total', 'due', 'current', 'prior', 'adjustment']
        if any(word in content.lower() for word in header_words):
            header_indicators += 2
        
        final_score = indicators - header_indicators
        return final_score >= 2
    
    def _matches_table_structure(self, potential_data_row: List[str], table_data: Dict[str, Any]) -> bool:
        """Check if a potential data row matches the structure of the table."""
        if not potential_data_row or not table_data:
            return False
        
        # Get the number of columns in the original table
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
        """Check if the potential data row has similar content patterns to the table."""
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
        
        return total_checks > 0 and (matches / total_checks) >= 0.6
    
    async def _merge_table_group(self, table_group: List[PageTable]) -> Dict[str, Any]:
        """Merge a group of continued tables into a single table."""
        
        if not table_group:
            return {}
        
        if len(table_group) == 1:
            # For single tables, still add multipage_info
            base_table = table_group[0].table_data.copy()
            base_table['multipage_info'] = {
                'is_multipage': False,
                'page_count': 1,
                'page_numbers': [table_group[0].page_number],
                'merge_confidence': table_group[0].confidence
            }
            base_table['page_number'] = table_group[0].page_number
            base_table['page_sequence'] = [table_group[0].page_number]
            return base_table
        
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
        
        # Add multipage metadata (always add, even for single tables)
        base_table['multipage_info'] = {
            'is_multipage': len(table_group) > 1,
            'page_count': len(table_group),
            'page_numbers': [pt.page_number for pt in table_group],
            'merge_confidence': np.mean([pt.confidence for pt in table_group])
        }
        
        # Preserve page order information
        base_table['page_number'] = table_group[0].page_number
        base_table['page_sequence'] = [pt.page_number for pt in table_group]
        
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
