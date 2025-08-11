import hashlib
import json
import re
from typing import Dict, List, Any, Optional, Tuple, Set
from datetime import datetime
import pandas as pd
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.db.models import SummaryRowPattern
from app.utils.db_retry import with_db_retry


class SummaryRowService:
    """
    Service for learning and detecting summary row patterns in tables.
    """
    
    def __init__(self):
        self.summary_keywords = {
            'total', 'sum', 'summary', 'subtotal', 'grand total', 'net', 'balance',
            'amount', 'commission', 'premium', 'deduction', 'adjustment', 'fee',
            'charge', 'credit', 'debit', 'payment', 'receipt', 'invoice', 'statement'
        }
        
        self.summary_patterns = [
            r'total.*',
            r'sum.*',
            r'subtotal.*',
            r'grand.*total.*',
            r'net.*',
            r'balance.*',
            r'amount.*',
            r'commission.*',
            r'premium.*',
            r'deduction.*',
            r'adjustment.*',
            r'fee.*',
            r'charge.*',
            r'credit.*',
            r'debit.*',
            r'payment.*',
            r'receipt.*',
            r'invoice.*',
            r'statement.*'
        ]
    
    def _convert_numpy_types(self, obj):
        """
        Convert numpy types to native Python types for JSON serialization.
        """
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, dict):
            return {key: self._convert_numpy_types(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_numpy_types(item) for item in obj]
        else:
            return obj
    
    def generate_table_signature(self, headers: List[str], table_structure: dict) -> str:
        """
        Generate a unique signature for a table based on headers and structure.
        """
        # Create a normalized representation
        normalized_headers = [h.lower().strip() for h in headers]
        normalized_headers.sort()  # Sort for consistency
        
        # Include structural information
        structure_info = {
            'column_count': table_structure.get('column_count', len(headers)),
            'typical_row_count': table_structure.get('typical_row_count', 0),
            'has_header_row': table_structure.get('has_header_row', True)
        }
        
        # Create signature string
        signature_data = {
            'headers': normalized_headers,
            'structure': structure_info
        }
        
        # Generate hash
        signature_string = json.dumps(signature_data, sort_keys=True)
        return hashlib.md5(signature_string.encode()).hexdigest()
    
    def analyze_row_characteristics(self, row: List[str], headers: List[str]) -> Dict[str, Any]:
        """
        Analyze characteristics of a row to determine if it's a summary row.
        """
        characteristics = {
            'has_summary_keywords': False,
            'keyword_matches': [],
            'numeric_columns': 0,
            'empty_columns': 0,
            'total_columns': 0,
            'pattern_matches': [],
            'row_type': 'data'  # 'data', 'summary', 'header', 'footer'
        }
        
        # Check for summary keywords
        row_text = ' '.join([str(cell).lower() for cell in row])
        for keyword in self.summary_keywords:
            if keyword in row_text:
                characteristics['has_summary_keywords'] = True
                characteristics['keyword_matches'].append(keyword)
        
        # Check for summary patterns
        for pattern in self.summary_patterns:
            if re.search(pattern, row_text, re.IGNORECASE):
                characteristics['pattern_matches'].append(pattern)
        
        # Analyze column characteristics
        for i, cell in enumerate(row):
            cell_str = str(cell).strip()
            
            # Count empty columns
            if not cell_str:
                characteristics['empty_columns'] += 1
            
            # Count numeric columns
            try:
                # Remove currency symbols and commas
                clean_value = re.sub(r'[$,%]', '', cell_str)
                float(clean_value)
                characteristics['numeric_columns'] += 1
            except (ValueError, TypeError):
                pass
            
            # Check if column header suggests it's a total column
            if i < len(headers):
                header_lower = headers[i].lower()
                if any(keyword in header_lower for keyword in ['total', 'sum', 'amount', 'balance']):
                    characteristics['total_columns'] += 1
        
        # Determine row type based on characteristics
        if characteristics['has_summary_keywords'] or characteristics['pattern_matches']:
            characteristics['row_type'] = 'summary'
        elif characteristics['numeric_columns'] > len(row) * 0.7:  # Mostly numeric
            characteristics['row_type'] = 'data'
        elif characteristics['empty_columns'] > len(row) * 0.5:  # Mostly empty
            characteristics['row_type'] = 'footer'
        
        return characteristics
    
    def extract_column_patterns(self, rows: List[List[str]], headers: List[str], summary_row_indices: Set[int]) -> Dict[str, Any]:
        """
        Extract patterns for each column based on summary rows.
        """
        column_patterns = {}
        
        # Get summary rows
        summary_rows = [rows[i] for i in summary_row_indices if i < len(rows)]
        if not summary_rows:
            return column_patterns
        
        # Analyze each column
        for col_idx, header in enumerate(headers):
            col_values = [row[col_idx] if col_idx < len(row) else '' for row in summary_rows]
            col_patterns = self._analyze_column_pattern(col_values, header)
            column_patterns[str(col_idx)] = col_patterns
        
        return column_patterns
    
    def _analyze_column_pattern(self, values: List[str], header: str) -> Dict[str, Any]:
        """
        Analyze patterns in a specific column.
        """
        patterns = {
            'data_type': 'string',
            'common_values': [],
            'regex_patterns': [],
            'is_numeric': False,
            'is_currency': False,
            'is_percentage': False,
            'is_date': False,
            'is_empty': False,
            'summary_keywords': []
        }
        
        if not values:
            patterns['is_empty'] = True
            return patterns
        
        # Check data types
        numeric_count = 0
        currency_count = 0
        percentage_count = 0
        date_count = 0
        empty_count = 0
        
        for value in values:
            value_str = str(value).strip()
            
            if not value_str:
                empty_count += 1
                continue
            
            # Check for currency
            if re.match(r'^\$?\d{1,3}(,\d{3})*(\.\d{2})?$', value_str):
                currency_count += 1
                patterns['is_currency'] = True
            
            # Check for percentage
            elif re.match(r'^\d+(\.\d+)?%$', value_str):
                percentage_count += 1
                patterns['is_percentage'] = True
            
            # Check for date
            elif re.match(r'\d{1,2}/\d{1,2}/\d{2,4}|\d{4}-\d{2}-\d{2}', value_str):
                date_count += 1
                patterns['is_date'] = True
            
            # Check for numeric
            try:
                clean_value = re.sub(r'[$,%]', '', value_str)
                float(clean_value)
                numeric_count += 1
                patterns['is_numeric'] = True
            except (ValueError, TypeError):
                pass
            
            # Check for summary keywords
            value_lower = value_str.lower()
            for keyword in self.summary_keywords:
                if keyword in value_lower:
                    patterns['summary_keywords'].append(keyword)
        
        # Determine dominant data type
        total_values = len(values)
        if empty_count > total_values * 0.8:
            patterns['data_type'] = 'empty'
        elif currency_count > total_values * 0.5:
            patterns['data_type'] = 'currency'
        elif percentage_count > total_values * 0.5:
            patterns['data_type'] = 'percentage'
        elif date_count > total_values * 0.5:
            patterns['data_type'] = 'date'
        elif numeric_count > total_values * 0.5:
            patterns['data_type'] = 'numeric'
        
        # Generate regex patterns for common formats
        if patterns['is_currency']:
            patterns['regex_patterns'].append(r'^\$?\d{1,3}(,\d{3})*(\.\d{2})?$')
        if patterns['is_percentage']:
            patterns['regex_patterns'].append(r'^\d+(\.\d+)?%$')
        if patterns['is_date']:
            patterns['regex_patterns'].append(r'\d{1,2}/\d{1,2}/\d{2,4}')
        
        # Get common values (non-empty, non-numeric)
        non_numeric_values = [v for v in values if v.strip() and not patterns['is_numeric']]
        if non_numeric_values:
            value_counts = pd.Series(non_numeric_values).value_counts()
            patterns['common_values'] = value_counts.head(5).index.tolist()
        
        return patterns
    
    @with_db_retry
    async def learn_summary_row_pattern(
        self,
        db: AsyncSession,
        company_id: str,
        table_data: Dict[str, Any],
        summary_row_indices: Set[int]
    ) -> bool:
        """
        Learn a new summary row pattern from user-marked rows.
        """
        try:
            headers = table_data.get('header', [])
            rows = table_data.get('rows', [])
            
            if not headers or not rows or not summary_row_indices:
                return False
            
            # Generate table signature
            table_structure = {
                'column_count': len(headers),
                'typical_row_count': len(rows),
                'has_header_row': True
            }
            table_signature = self.generate_table_signature(headers, table_structure)
            
            # Extract column patterns
            column_patterns = self.extract_column_patterns(rows, headers, summary_row_indices)
            
            # Analyze row characteristics
            row_characteristics = []
            sample_rows = []
            
            for row_idx in summary_row_indices:
                if row_idx < len(rows):
                    row = rows[row_idx]
                    characteristics = self.analyze_row_characteristics(row, headers)
                    row_characteristics.append(characteristics)
                    sample_rows.append(row)
            
            # Create pattern name
            pattern_name = f"Summary_Pattern_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            # Check if pattern already exists
            existing_pattern = await db.execute(
                select(SummaryRowPattern).where(
                    SummaryRowPattern.company_id == company_id,
                    SummaryRowPattern.table_signature == table_signature
                )
            )
            existing_pattern = existing_pattern.scalar_one_or_none()
            
            if existing_pattern:
                # Update existing pattern
                await db.execute(
                    update(SummaryRowPattern)
                    .where(SummaryRowPattern.id == existing_pattern.id)
                    .values(
                        column_patterns=column_patterns,
                        row_characteristics=row_characteristics,
                        sample_rows=sample_rows,
                        usage_count=SummaryRowPattern.usage_count + 1,
                        last_used=datetime.now(),
                        updated_at=datetime.now()
                    )
                )
            else:
                # Create new pattern
                new_pattern = SummaryRowPattern(
                    company_id=company_id,
                    pattern_name=pattern_name,
                    table_signature=table_signature,
                    column_patterns=column_patterns,
                    row_characteristics=row_characteristics,
                    sample_rows=sample_rows,
                    confidence_score=80,
                    usage_count=1,
                    last_used=datetime.now(),
                    created_at=datetime.now(),
                    updated_at=datetime.now()
                )
                db.add(new_pattern)
            
            await db.commit()
            return True
            
        except Exception as e:
            await db.rollback()
            raise e
    
    @with_db_retry
    async def detect_summary_rows(
        self,
        db: AsyncSession,
        company_id: str,
        table_data: Dict[str, Any]
    ) -> List[int]:
        """
        Detect summary rows in a table using learned patterns.
        """
        try:
            headers = table_data.get('header', [])
            rows = table_data.get('rows', [])
            
            if not headers or not rows:
                return []
            
            # Generate table signature
            table_structure = {
                'column_count': len(headers),
                'typical_row_count': len(rows),
                'has_header_row': True
            }
            table_signature = self.generate_table_signature(headers, table_structure)
            
            # Find matching patterns
            patterns = await db.execute(
                select(SummaryRowPattern).where(
                    SummaryRowPattern.company_id == company_id,
                    SummaryRowPattern.table_signature == table_signature
                )
            )
            patterns = patterns.scalars().all()
            
            detected_rows = []
            
            for pattern in patterns:
                detected_rows.extend(
                    self._apply_pattern_to_table(rows, headers, pattern)
                )
            
            # Remove duplicates and sort
            detected_rows = sorted(list(set(detected_rows)))
            
            return detected_rows
            
        except Exception as e:
            raise e
    
    def _apply_pattern_to_table(
        self,
        rows: List[List[str]],
        headers: List[str],
        pattern: SummaryRowPattern
    ) -> List[int]:
        """
        Apply a learned pattern to detect summary rows in a table.
        """
        detected_rows = []
        column_patterns = pattern.column_patterns
        row_characteristics = pattern.row_characteristics
        
        for row_idx, row in enumerate(rows):
            if self._matches_pattern(row, headers, column_patterns, row_characteristics):
                detected_rows.append(row_idx)
        
        return detected_rows
    
    def _matches_pattern(
        self,
        row: List[str],
        headers: List[str],
        column_patterns: Dict[str, Any],
        row_characteristics: List[Dict[str, Any]]
    ) -> bool:
        """
        Check if a row matches the learned pattern.
        """
        # Analyze current row characteristics
        current_characteristics = self.analyze_row_characteristics(row, headers)
        
        # Check if row has summary characteristics
        if not current_characteristics['has_summary_keywords'] and not current_characteristics['pattern_matches']:
            return False
        
        # Check column patterns
        for col_idx_str, col_pattern in column_patterns.items():
            col_idx = int(col_idx_str)
            if col_idx >= len(row):
                continue
            
            cell_value = str(row[col_idx]).strip()
            
            # Check data type
            if col_pattern.get('is_numeric'):
                try:
                    clean_value = re.sub(r'[$,%]', '', cell_value)
                    float(clean_value)
                except (ValueError, TypeError):
                    return False
            
            # Check regex patterns
            if col_pattern.get('regex_patterns'):
                matches_pattern = False
                for regex_pattern in col_pattern['regex_patterns']:
                    if re.match(regex_pattern, cell_value):
                        matches_pattern = True
                        break
                if not matches_pattern:
                    return False
            
            # Check for summary keywords
            if col_pattern.get('summary_keywords'):
                cell_lower = cell_value.lower()
                has_keyword = any(keyword in cell_lower for keyword in col_pattern['summary_keywords'])
                if not has_keyword:
                    return False
        
        return True
    
    @with_db_retry
    async def get_learned_patterns(
        self,
        db: AsyncSession,
        company_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all learned summary row patterns for a company.
        """
        try:
            patterns = await db.execute(
                select(SummaryRowPattern).where(
                    SummaryRowPattern.company_id == company_id
                ).order_by(SummaryRowPattern.last_used.desc())
            )
            patterns = patterns.scalars().all()
            
            return [
                {
                    'id': str(pattern.id),
                    'pattern_name': pattern.pattern_name,
                    'table_signature': pattern.table_signature,
                    'column_patterns': pattern.column_patterns,
                    'row_characteristics': pattern.row_characteristics,
                    'sample_rows': pattern.sample_rows,
                    'confidence_score': pattern.confidence_score,
                    'usage_count': pattern.usage_count,
                    'last_used': pattern.last_used.isoformat() if pattern.last_used else None,
                    'created_at': pattern.created_at.isoformat() if pattern.created_at else None
                }
                for pattern in patterns
            ]
            
        except Exception as e:
            raise e
    
    @with_db_retry
    async def delete_pattern(
        self,
        db: AsyncSession,
        pattern_id: str,
        company_id: str
    ) -> bool:
        """
        Delete a learned summary row pattern.
        """
        try:
            pattern = await db.execute(
                select(SummaryRowPattern).where(
                    SummaryRowPattern.id == pattern_id,
                    SummaryRowPattern.company_id == company_id
                )
            )
            pattern = pattern.scalar_one_or_none()
            
            if pattern:
                await db.delete(pattern)
                await db.commit()
                return True
            
            return False
            
        except Exception as e:
            await db.rollback()
            raise e
