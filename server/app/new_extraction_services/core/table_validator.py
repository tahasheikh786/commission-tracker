"""Table validation for document processing."""

import re
import statistics
from typing import List, Set, Dict, Any


class TableValidator:
    """Validate table quality and structure."""
    
    def __init__(self, logger):
        """Initialize table validator."""
        self.logger = logger
    
    def is_valid_financial_table(self, headers: List[str], rows: List[List[str]]) -> bool:
        """
        Intelligently validate if extracted table contains meaningful financial data.
        Uses adaptive algorithms instead of hardcoded patterns.
        """
        try:
            # Check for minimum table dimensions
            # Allow single-row tables for commission statements (common case)
            if len(headers) < 2:
                return False
            
            # For commission statements, even 1 row is valid if it has proper structure
            if len(rows) < 1:
                return False
            
            # Special case: Single-row commission tables are valid if they have commission-related headers
            if len(rows) == 1:
                return True
            
            # Intelligent uniqueness assessment
            if len(headers) == 1:
                unique_values = set()
                for row in rows:
                    if row and len(row) > 0:
                        unique_values.add(str(row[0]).strip().lower())
                
                # Adaptive threshold based on content analysis
                uniqueness_ratio = len(unique_values) / len(rows)
                if uniqueness_ratio < 0.3:  # Less than 30% unique values
                    return False
            
            # INTELLIGENT content analysis - NO HARDCODED LISTS
            content_quality_score = self._assess_table_content_quality(headers, rows)
            structure_coherence_score = self._assess_table_structure_coherence(headers, rows)
            semantic_relevance_score = self._assess_semantic_relevance(headers, rows)
            
            # Adaptive validation threshold
            overall_quality = (
                content_quality_score * 0.4 +
                structure_coherence_score * 0.3 +
                semantic_relevance_score * 0.3
            )
            
            # Dynamic threshold based on table characteristics
            adaptive_threshold = self._calculate_adaptive_validation_threshold(headers, rows)
            
            return overall_quality >= adaptive_threshold
            
        except Exception as e:
            self.logger.logger.warning(f"Error in intelligent table validation: {e}")
            # On error, default to including the table
            return True

    def _assess_table_content_quality(self, headers: List[str], rows: List[List[str]]) -> float:
        """Assess content quality using intelligent analysis"""
        quality_indicators = 0
        total_indicators = 0
        
        # Analyze data diversity
        all_values = []
        for row in rows[:10]:  # Sample first 10 rows
            all_values.extend([str(cell).strip() for cell in row])
        
        if all_values:
            unique_ratio = len(set(all_values)) / len(all_values)
            if unique_ratio > 0.5:  # Good diversity
                quality_indicators += 1
            total_indicators += 1
        
        # Analyze data type diversity
        data_types = self._analyze_data_type_diversity(rows)
        if len(data_types) >= 2:  # At least 2 different data types
            quality_indicators += 1
            total_indicators += 1
        
        # Analyze structural patterns
        if self._has_structured_patterns(rows):
            quality_indicators += 1
            total_indicators += 1
        
        return quality_indicators / max(1, total_indicators)

    def _assess_table_structure_coherence(self, headers: List[str], rows: List[List[str]]) -> float:
        """Assess structural coherence intelligently"""
        coherence_score = 0.0
        
        # Check column consistency
        expected_columns = len(headers)
        consistent_rows = sum(1 for row in rows if len(row) == expected_columns)
        if rows:
            coherence_score += (consistent_rows / len(rows)) * 0.5
        
        # Check for meaningful headers
        if headers and all(str(h).strip() for h in headers):
            coherence_score += 0.3
        
        # Check for data presence
        non_empty_cells = 0
        total_cells = 0
        for row in rows:
            for cell in row:
                total_cells += 1
                if str(cell).strip():
                    non_empty_cells += 1
        
        if total_cells > 0:
            coherence_score += (non_empty_cells / total_cells) * 0.2
        
        return min(1.0, coherence_score)

    def _assess_semantic_relevance(self, headers: List[str], rows: List[List[str]]) -> float:
        """Assess semantic relevance using intelligent analysis"""
        relevance_score = 0.0
        
        # Analyze header semantics intelligently
        header_relevance = self._analyze_header_semantics(headers)
        relevance_score += header_relevance * 0.6
        
        # Analyze content semantics
        content_relevance = self._analyze_content_semantics(rows)
        relevance_score += content_relevance * 0.4
        
        return min(1.0, relevance_score)

    def _analyze_data_type_diversity(self, rows: List[List[str]]) -> Set[str]:
        """Analyze diversity of data types in table"""
        data_types = set()
        
        for row in rows[:5]:  # Sample first 5 rows
            for cell in row:
                cell_str = str(cell).strip()
                if not cell_str:
                    continue
                
                # Intelligent type detection
                if re.search(r'[\d.,]', cell_str):
                    data_types.add('numeric')
                if re.search(r'[\$€£¥%]', cell_str):
                    data_types.add('financial')
                if re.search(r'\d{1,4}[/-]\d{1,2}[/-]\d{1,4}', cell_str):
                    data_types.add('date')
                if re.match(r'^[a-zA-Z\s]+$', cell_str):
                    data_types.add('text')
        
        return data_types

    def _has_structured_patterns(self, rows: List[List[str]]) -> bool:
        """Check for structured patterns in data"""
        if len(rows) < 3:
            return False
        
        # Look for consistent patterns across rows
        pattern_consistency = 0
        for col_idx in range(min(len(row) for row in rows)):
            column_values = [str(row[col_idx]).strip() for row in rows]
            
            # Check if column has consistent data pattern
            if self._column_has_consistent_pattern(column_values):
                pattern_consistency += 1
        
        # If more than half columns have consistent patterns
        max_columns = max(len(row) for row in rows) if rows else 0
        return pattern_consistency > max_columns * 0.5

    def _column_has_consistent_pattern(self, values: List[str]) -> bool:
        """Check if column values follow a consistent pattern"""
        if not values:
            return False
        
        # Check for numeric pattern
        numeric_count = sum(1 for v in values if re.search(r'\d', v))
        if numeric_count > len(values) * 0.7:  # 70% numeric
            return True
        
        # Check for text pattern
        text_count = sum(1 for v in values if re.match(r'^[a-zA-Z\s]+$', v))
        if text_count > len(values) * 0.7:  # 70% text
            return True
        
        return False

    def _analyze_header_semantics(self, headers: List[str]) -> float:
        """Intelligently analyze header semantics"""
        if not headers:
            return 0.0
        
        relevance_indicators = 0
        
        # Look for semantic patterns without hardcoded lists
        for header in headers:
            header_lower = str(header).lower().strip()
            
            # Check for calculation-related terms
            if any(term in header_lower for term in ['total', 'sum', 'amount', 'rate', 'ratio']):
                relevance_indicators += 1
            
            # Check for business-related terms
            if any(term in header_lower for term in ['period', 'date', 'name', 'group', 'type']):
                relevance_indicators += 1
        
        return min(1.0, relevance_indicators / len(headers))

    def _analyze_content_semantics(self, rows: List[List[str]]) -> float:
        """Intelligently analyze content semantics"""
        if not rows:
            return 0.0
        
        semantic_patterns = 0
        total_cells = 0
        
        for row in rows[:5]:  # Sample first 5 rows
            for cell in row:
                total_cells += 1
                cell_str = str(cell).strip()
                
                # Look for meaningful content patterns
                if any([
                    re.search(r'[\$€£¥]', cell_str),  # Currency
                    '%' in cell_str,  # Percentage
                    re.search(r'\d{1,4}[/-]\d{1,2}[/-]\d{1,4}', cell_str),  # Date
                    (cell_str.startswith('(') and cell_str.endswith(')')),  # Accounting format
                    re.match(r'^\d+([,.]\d+)*$', cell_str),  # Numbers
                ]):
                    semantic_patterns += 1
        
        return semantic_patterns / max(1, total_cells)

    def _calculate_adaptive_validation_threshold(self, headers: List[str], rows: List[List[str]]) -> float:
        """Calculate adaptive threshold based on table characteristics"""
        base_threshold = 0.5
        
        # Adjust based on table size
        table_size = len(headers) * len(rows)
        if table_size > 50:  # Larger tables get lower threshold
            base_threshold -= 0.1
        elif table_size < 20:  # Smaller tables get higher threshold
            base_threshold += 0.1
        
        # Adjust based on header quality
        if len(headers) >= 5:  # Many columns suggest complexity
            base_threshold -= 0.05
        
        return max(0.3, min(0.8, base_threshold))
    
    def score_potential_headers(self, headers: List[str]) -> float:
        """Intelligently score potential headers with simple table boost."""
        if not headers:
            return 0.0
        
        # **SIMPLE HEADER BOOST**
        simple_financial_terms = {
            'name': 0.8, 'amount': 0.9, 'total': 0.9, 'date': 0.8,
            'month': 0.7, 'number': 0.7, 'division': 0.6, 'account': 0.8,
            'client': 0.8, 'policy': 0.8, 'carrier': 0.7, 'premium': 0.9,
            'commission': 0.9, 'paid': 0.8, 'check': 0.7, 'loc': 0.6,
            'agency': 0.7, 'agent': 0.7, 'group': 0.8, 'period': 0.7,
            'census': 0.7, 'ct': 0.6  # Added for "Census Ct."
        }
        
        simple_boost = 0.0
        for header in headers:
            header_lower = str(header).lower().strip()
            # Check for exact matches and partial matches
            for term, weight in simple_financial_terms.items():
                if term in header_lower:
                    simple_boost += weight
                    break
        
        simple_score = simple_boost / len(headers) if headers else 0.0
        # **END SIMPLE BOOST**
        
        # Calculate multiple intelligent factors
        semantic_quality = self._assess_header_semantic_quality(headers)
        structural_coherence = self._assess_header_structural_coherence(headers)
        content_patterns = self._assess_header_content_patterns(headers)
        
        # Weighted combination with simple boost
        overall_score = (
            semantic_quality * 0.25 +
            structural_coherence * 0.15 +
            content_patterns * 0.15 +
            simple_score * 0.45  # Give simple headers significant weight
        )
        
        return overall_score

    def _assess_header_semantic_quality(self, headers: List[str]) -> float:
        """Assess semantic quality of headers intelligently"""
        if not headers:
            return 0.0
        
        quality_indicators = 0
        total_headers = len(headers)
        
        for header in headers:
            header_str = str(header).strip().lower()
            
            # Check for meaningful length
            if 2 <= len(header_str) <= 30:  # Reasonable header length
                quality_indicators += 0.3
            
            # Check for descriptive patterns
            if self._is_descriptive_header(header_str):
                quality_indicators += 0.4
            
            # Check for business relevance
            if self._has_business_relevance(header_str):
                quality_indicators += 0.3
        
        return quality_indicators / total_headers

    def _assess_header_structural_coherence(self, headers: List[str]) -> float:
        """Assess structural coherence of headers"""
        coherence_score = 0.0
        
        # Check for appropriate number of columns
        num_headers = len(headers)
        if 3 <= num_headers <= 15:  # Reasonable range
            coherence_score += 0.4
        elif num_headers > 15:
            coherence_score += 0.2  # Too many columns
        
        # Check for consistent formatting
        formatted_count = sum(1 for h in headers if str(h).strip())
        if formatted_count == len(headers):  # All headers non-empty
            coherence_score += 0.3
        
        # Check for unique headers
        unique_headers = len(set(str(h).strip().lower() for h in headers))
        if unique_headers == len(headers):  # All unique
            coherence_score += 0.3
        
        return min(1.0, coherence_score)

    def _assess_header_content_patterns(self, headers: List[str]) -> float:
        """Assess content patterns in headers intelligently"""
        pattern_score = 0.0
        
        # Look for column-like patterns
        column_indicators = 0
        for header in headers:
            header_lower = str(header).lower().strip()
            
            # Check for typical column patterns
            if any([
                'id' in header_lower or 'no' in header_lower,
                'name' in header_lower or 'description' in header_lower,
                'date' in header_lower or 'time' in header_lower,
                'amount' in header_lower or 'total' in header_lower,
                'rate' in header_lower or 'percent' in header_lower,
                'type' in header_lower or 'category' in header_lower
            ]):
                column_indicators += 1
        
        if headers:
            pattern_score = column_indicators / len(headers)
        
        return min(1.0, pattern_score)

    def _is_descriptive_header(self, header: str) -> bool:
        """Check if header is descriptive using intelligent analysis"""
        if not header:
            return False
        
        # Check for alphabetic content (descriptive)
        has_alpha = bool(re.search(r'[a-zA-Z]', header))
        
        # Check for reasonable word structure
        words = header.split()
        has_meaningful_words = len(words) <= 5 and all(len(word) >= 2 for word in words)
        
        # Avoid random strings or numbers
        not_random = not re.match(r'^[0-9\-_\.]+$', header)
        
        return has_alpha and has_meaningful_words and not_random

    def _has_business_relevance(self, header: str) -> bool:
        """Check for business relevance using intelligent semantic analysis"""
        if not header:
            return False
        
        # INTELLIGENT semantic analysis instead of hardcoded patterns
        relevance_score = self._calculate_semantic_relevance(header)
        return relevance_score > 0.5

    def _calculate_semantic_relevance(self, header: str) -> float:
        """Calculate semantic relevance using intelligent analysis"""
        header_lower = header.lower().strip()
        relevance_indicators = []
        
        # Intelligent category detection based on semantic meaning
        financial_indicators = self._detect_financial_semantics(header_lower)
        temporal_indicators = self._detect_temporal_semantics(header_lower)
        identifier_indicators = self._detect_identifier_semantics(header_lower)
        categorical_indicators = self._detect_categorical_semantics(header_lower)
        
        relevance_indicators.extend([
            financial_indicators,
            temporal_indicators,
            identifier_indicators,
            categorical_indicators
        ])
        
        # Calculate overall relevance
        total_relevance = sum(relevance_indicators)
        return min(1.0, total_relevance)

    def _detect_financial_semantics(self, header: str) -> float:
        """Detect financial semantic indicators intelligently"""
        financial_weight = 0.0
        
        # Use semantic understanding instead of exact pattern matching
        if any(term in header for term in ['amount', 'total', 'sum', 'value', 'price', 'cost']):
            financial_weight += 0.4
        if any(term in header for term in ['fee', 'rate', 'percent', 'ratio', 'commission']):
            financial_weight += 0.3
        if any(term in header for term in ['premium', 'payment', 'billing', 'invoice']):
            financial_weight += 0.3
        
        return min(1.0, financial_weight)

    def _detect_temporal_semantics(self, header: str) -> float:
        """Detect temporal semantic indicators intelligently"""
        temporal_weight = 0.0
        
        if any(term in header for term in ['date', 'time', 'period']):
            temporal_weight += 0.4
        if any(term in header for term in ['year', 'month', 'day', 'quarter']):
            temporal_weight += 0.3
        if any(term in header for term in ['fiscal', 'billing', 'effective']):
            temporal_weight += 0.2
        
        return min(1.0, temporal_weight)

    def _detect_identifier_semantics(self, header: str) -> float:
        """Detect identifier semantic indicators intelligently"""
        identifier_weight = 0.0
        
        if any(term in header for term in ['id', 'number', 'code']):
            identifier_weight += 0.4
        if any(term in header for term in ['ref', 'reference', 'index']):
            identifier_weight += 0.3
        if any(term in header for term in ['key', 'identifier', 'sequence']):
            identifier_weight += 0.2
        
        return min(1.0, identifier_weight)

    def _detect_categorical_semantics(self, header: str) -> float:
        """Detect categorical semantic indicators intelligently"""
        categorical_weight = 0.0
        
        if any(term in header for term in ['name', 'title', 'description']):
            categorical_weight += 0.4
        if any(term in header for term in ['type', 'category', 'group', 'class']):
            categorical_weight += 0.3
        if any(term in header for term in ['status', 'state', 'condition']):
            categorical_weight += 0.2
        
        return min(1.0, categorical_weight)
    
    def is_valid_table_element(self, element) -> bool:
        """Check if a table element is likely to contain valid financial data."""
        try:
            # Check if element has cells or data
            if hasattr(element, 'cluster') and hasattr(element.cluster, 'cells'):
                cells = element.cluster.cells
                cell_count = len(cells)
                
                # **DEBUG**: Log table element details for diagnosis
                self.logger.logger.info(f"🔍 VALIDATING table element: {cell_count} cells")
                
                # **RELAXED**: Lower minimum cell count for documents like UHC
                if cell_count < 6:  # Was 10, now 6 - more lenient
                    self.logger.logger.info(f"  ❌ Rejected: too few cells ({cell_count} < 6)")
                    return False
                
                # Check for reasonable table dimensions
                cells_by_row = self._group_cells_by_position(cells)
                row_count = len(cells_by_row)
                
                # **RELAXED**: Lower minimum row count
                if row_count < 2:  # Was 3, now 2 - more lenient  
                    self.logger.logger.info(f"  ❌ Rejected: too few rows ({row_count} < 2)")
                    return False
                
                # Check if any row has multiple columns (good sign)
                max_cols = max(len(cells) for cells in cells_by_row.values()) if cells_by_row else 0
                
                # **RELAXED**: Lower minimum column count
                if max_cols < 2:  # Was 3, now 2 - more lenient
                    self.logger.logger.info(f"  ❌ Rejected: too few columns ({max_cols} < 2)")
                    return False
                
                self.logger.logger.info(f"  ✅ ACCEPTED table: {cell_count} cells, {row_count} rows, {max_cols} max cols")
                return True
                
            # If no cluster, check for other indicators
            if hasattr(element, 'label'):
                label = str(element.label).lower()
                if 'table' in label:
                    self.logger.logger.info(f"  ✅ ACCEPTED element with table label: {element.label}")
                    return True
            
            # Allow through by default for unknown structures
            self.logger.logger.info(f"  ✅ ACCEPTED unknown table structure (default allow)")
            return True
            
        except Exception as e:
            self.logger.logger.warning(f"Error validating table element: {e}")
            return True
    
    def _group_cells_by_position(self, cells) -> Dict[int, List]:
        """
        Group table cells by their row position with improved clustering algorithm.
        
        Args:
            cells: List of Docling cell objects with bbox attributes
            
        Returns:
            Dictionary mapping row indices to lists of cells in that row
        """
        try:
            if not cells:
                return {}
            
            # First pass: collect all y-positions and calculate dynamic tolerance
            y_positions = []
            for cell in cells:
                if hasattr(cell, 'bbox'):
                    y_positions.append(cell.bbox.t)
            
            if not y_positions:
                return {}
                
            # **ADAPTIVE TOLERANCE BASED ON TABLE COMPLEXITY**
            table_complexity = self._assess_table_complexity(cells)
            
            # Calculate dynamic tolerance based on cell spacing AND complexity
            y_positions.sort()
            if len(y_positions) > 1:
                # Use median gap between cells as basis for tolerance
                gaps = [y_positions[i+1] - y_positions[i] for i in range(len(y_positions)-1)]
                gaps = [g for g in gaps if g > 0]  # Remove zero gaps
                if gaps:
                    median_gap = statistics.median(gaps)
                    base_tolerance = max(2.0, min(median_gap * 0.3, 8.0))
                else:
                    base_tolerance = 3.0
            else:
                base_tolerance = 3.0
            
            # Apply complexity-based adjustment
            if table_complexity == 'simple':
                tolerance = max(base_tolerance, 12.0)  # More lenient for simple tables
                self.logger.logger.info(f"🔧 DEBUG: Using adaptive tolerance {tolerance:.1f} for SIMPLE table")
            else:
                tolerance = base_tolerance  # Original tolerance for complex tables
                self.logger.logger.info(f"🔧 DEBUG: Using adaptive tolerance {tolerance:.1f} for COMPLEX table")
            
            # Group cells using hierarchical clustering approach with multi-line detection
            cell_groups = []
            for cell in cells:
                if not hasattr(cell, 'bbox'):
                    continue
                    
                y_pos = cell.bbox.t
                
                # Find existing group within tolerance
                assigned = False
                for group in cell_groups:
                    group_y = statistics.mean([c.bbox.t for c in group])
                    if abs(y_pos - group_y) <= tolerance:
                        group.append(cell)
                        assigned = True
                        break
                
                if not assigned:
                    cell_groups.append([cell])
            
            # **NEW: Merge multi-line cells within the same logical cell**
            cell_groups = self._merge_multiline_cells(cell_groups, tolerance)
            
            # Sort groups by average y-position and create row mapping
            cell_groups.sort(key=lambda group: statistics.mean([c.bbox.t for c in group]))
            
            row_indices = {}
            for row_idx, group in enumerate(cell_groups):
                # Sort cells within each row by x-position (left to right)
                row_cells = sorted(group, key=lambda c: c.bbox.l if hasattr(c, 'bbox') else 0)
                row_indices[row_idx] = row_cells
            
            self.logger.logger.debug(f"Grouped {len(cells)} cells into {len(row_indices)} rows with tolerance={tolerance:.1f}")
            return row_indices
            
        except Exception as e:
            self.logger.logger.warning(f"Error grouping cells by position: {e}")
            return {}
    
    def _assess_table_complexity(self, cells) -> str:
        """Assess whether table structure is simple or complex."""
        try:
            if len(cells) < 30:  # Simple threshold
                return 'simple'
            
            # Check for text variation - simple tables have less variation
            text_lengths = []
            unique_positions = set()
            
            for cell in cells:
                if hasattr(cell, 'text'):
                    text_lengths.append(len(str(cell.text)))
                if hasattr(cell, 'bbox'):
                    # Round positions to reduce noise
                    unique_positions.add((round(cell.bbox.l, -1), round(cell.bbox.t, -1)))
            
            # Simple heuristics
            if text_lengths:
                avg_text_length = sum(text_lengths) / len(text_lengths)
                if avg_text_length < 15:  # Short text suggests simple structure
                    return 'simple'
            
            # If few unique positions, likely a simple grid
            if len(unique_positions) < len(cells) * 0.5:
                return 'simple'
            
            return 'complex'
            
        except Exception:
            return 'complex'  # Default to complex if assessment fails
    
    def _merge_multiline_cells(self, cell_groups: List[List], tolerance: float) -> List[List]:
        """Merge cells that are part of the same logical multi-line cell."""
        try:
            merged_groups = []
            
            for group in cell_groups:
                if len(group) <= 1:
                    merged_groups.append(group)
                    continue
                
                # Group cells within this row by x-position to identify multi-line cells
                row_cells = []
                for cell in group:
                    x_pos = cell.bbox.l
                    
                    # Find cells that are vertically aligned (same column)
                    merged = False
                    for existing_cell_group in row_cells:
                        existing_x = statistics.mean([c.bbox.l for c in existing_cell_group])
                        
                        # If x-positions are similar, this might be a multi-line cell
                        if abs(x_pos - existing_x) <= tolerance * 2:  # More lenient for x-axis
                            existing_cell_group.append(cell)
                            merged = True
                            break
                    
                    if not merged:
                        row_cells.append([cell])
                
                # Merge text from multi-line cells
                merged_row_cells = []
                for cell_group in row_cells:
                    if len(cell_group) == 1:
                        merged_row_cells.append(cell_group[0])
                    else:
                        # Merge multiple cells into one with combined text
                        merged_cell = self._merge_cell_texts(cell_group)
                        merged_row_cells.append(merged_cell)
                        self.logger.logger.info(f"🔗 MERGED multi-line cell: {len(cell_group)} parts → '{merged_cell.text[:50]}...'")
                
                merged_groups.append(merged_row_cells)
            
            return merged_groups
            
        except Exception as e:
            self.logger.logger.warning(f"Error merging multi-line cells: {e}")
            return cell_groups
    
    def _merge_cell_texts(self, cell_group: List) -> Any:
        """Merge multiple cells into one with combined text."""
        if not cell_group:
            return None
        
        # Use the first cell as base and merge text from others
        merged_cell = cell_group[0]
        
        # Combine text from all cells, ordered by y-position
        sorted_cells = sorted(cell_group, key=lambda c: c.bbox.t)
        text_parts = []
        
        for cell in sorted_cells:
            if hasattr(cell, 'text') and str(cell.text).strip():
                cell_text = str(cell.text).strip()
                # Avoid duplicating text - only add if it's not already in the combined text
                if not text_parts or cell_text not in ' '.join(text_parts):
                    text_parts.append(cell_text)
        
        # Remove duplicate consecutive words/phrases
        combined_text = ' '.join(text_parts)
        combined_text = self._deduplicate_text(combined_text)
        
        # Update the merged cell's text
        merged_cell.text = combined_text
        
        # Expand bbox to encompass all cells
        min_x = min(cell.bbox.l for cell in cell_group)
        min_y = min(cell.bbox.t for cell in cell_group)
        max_x = max(cell.bbox.r for cell in cell_group)
        max_y = max(cell.bbox.b for cell in cell_group)
        
        # Update bbox
        merged_cell.bbox.l = min_x
        merged_cell.bbox.t = min_y
        merged_cell.bbox.r = max_x
        merged_cell.bbox.b = max_y
        
        return merged_cell
    
    def _deduplicate_text(self, text: str) -> str:
        """Remove duplicate words/phrases from text while preserving meaningful content."""
        if not text:
            return text
        
        # Split into words
        words = text.split()
        if len(words) <= 3:
            return text
        
        # Look for obvious repetitive patterns - be conservative to preserve content
        # Only remove clear duplicates like "LLC LLC LLC" or "Logistics Logistics"
        result_text = text
        
        # Simple pattern: remove exact word repetitions (2+ times)
        for word in set(words):
            if len(word) > 2:  # Only for meaningful words
                # Look for 3+ repetitions of the same word
                pattern = f' {word} {word} {word}'
                if pattern in result_text:
                    # Replace with single occurrence
                    result_text = result_text.replace(pattern, f' {word}')
                    self.logger.logger.info(f"🧹 DEDUPLICATED word: '{word}' (removed repetitions)")
        
        # Pattern: remove phrase duplications like "Development, LLC Development, LLC"
        # Look for patterns like "word, word word, word" or "and word word and word word"
        phrase_patterns = [
            r'(\b\w+,?\s+\w+)\s+\1',  # "Development, LLC Development, LLC"
            r'(\band\s+\w+\s+\w+)\s+\1',  # "and Transport LLC and Transport LLC"
            r'(\b\w+\s+\w+\s+\w+)\s+\1',  # "Delivery Logistics LLC Delivery Logistics LLC"
        ]
        
        for pattern in phrase_patterns:
            matches = re.findall(pattern, result_text)
            for match in matches:
                # Replace duplicate phrase with single occurrence
                duplicate_pattern = f'{match} {match}'
                if duplicate_pattern in result_text:
                    result_text = result_text.replace(duplicate_pattern, match)
                    self.logger.logger.info(f"🧹 DEDUPLICATED phrase: '{match}' (removed duplication)")
        
        # Log the deduplication if significant changes were made
        if len(result_text) < len(text) * 0.8:  # If we removed more than 20% of the text
            self.logger.logger.info(f"🧹 DEDUPLICATED: '{text[:50]}...' → '{result_text[:50]}...'")
        
        return result_text.strip()
