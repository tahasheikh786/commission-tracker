import hashlib
import json
import re
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import pandas as pd
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud, schemas
from app.utils.db_retry import with_db_retry


class FormatLearningService:
    """
    Service for learning and analyzing carrier file formats.
    """
    
    def __init__(self):
        self.data_type_patterns = {
            'date': [
                r'\d{1,2}/\d{1,2}/\d{2,4}',
                r'\d{4}-\d{2}-\d{2}',
                r'\d{1,2}-\d{1,2}-\d{2,4}',
                r'\d{1,2}\.\d{1,2}\.\d{2,4}'
            ],
            'currency': [
                r'^\$?\d{1,3}(,\d{3})*(\.\d{2})?$',
                r'^\d{1,3}(,\d{3})*(\.\d{2})?$'
            ],
            'percentage': [
                r'^\d+(\.\d+)?%$',
                r'^\d+(\.\d+)?\s*%$'
            ],
            'phone': [
                r'^\d{3}-\d{3}-\d{4}$',
                r'^\(\d{3}\)\s*\d{3}-\d{4}$',
                r'^\d{10}$'
            ],
            'ssn': [
                r'^\d{3}-\d{2}-\d{4}$',
                r'^\d{9}$'
            ]
        }
    
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
    
    def generate_format_signature(self, headers: List[str], table_structure: dict) -> str:
        """
        Generate a unique signature for a table format based on headers and structure.
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
    
    def analyze_column_types(self, table_data: List[List[str]], headers: List[str]) -> Dict[str, str]:
        """
        Analyze data types for each column based on sample values.
        """
        if not table_data or not headers:
            return {}
        
        column_types = {}
        
        # Convert to DataFrame for easier analysis
        df = pd.DataFrame(table_data, columns=headers)
        
        for column in headers:
            if column not in df.columns:
                continue
            
            # Get non-null values
            values = df[column].dropna().astype(str)
            if len(values) == 0:
                column_types[column] = 'string'
                continue
            
            # Sample values for analysis
            sample_values = values.head(20).tolist()
            
            # Analyze patterns
            detected_type = self._detect_column_type(sample_values)
            column_types[column] = detected_type
        
        return column_types
    
    def _detect_column_type(self, values: List[str]) -> str:
        """
        Detect the most likely data type for a column based on sample values.
        """
        if not values:
            return 'string'
        
        # Count matches for each pattern type
        type_scores = {
            'date': 0,
            'currency': 0,
            'percentage': 0,
            'phone': 0,
            'ssn': 0,
            'number': 0,
            'string': 0
        }
        
        for value in values:
            value = str(value).strip()
            
            # Check specific patterns
            for pattern_type, patterns in self.data_type_patterns.items():
                for pattern in patterns:
                    if re.match(pattern, value):
                        type_scores[pattern_type] += 1
                        break
            
            # Check if numeric
            try:
                float(value.replace(',', '').replace('$', '').replace('%', ''))
                type_scores['number'] += 1
            except ValueError:
                type_scores['string'] += 1
        
        # Find the type with highest score
        best_type = max(type_scores, key=type_scores.get)
        
        # If no specific pattern matched, default to string
        if best_type == 'string' and type_scores['number'] > 0:
            best_type = 'number'
        
        return best_type
    
    def extract_column_patterns(self, table_data: List[List[str]], headers: List[str]) -> Dict[str, str]:
        """
        Extract regex patterns for each column based on sample values.
        """
        if not table_data or not headers:
            return {}
        
        column_patterns = {}
        df = pd.DataFrame(table_data, columns=headers)
        
        for column in headers:
            if column not in df.columns:
                continue
            
            values = df[column].dropna().astype(str)
            if len(values) == 0:
                continue
            
            # Get sample values
            sample_values = values.head(10).tolist()
            
            # Generate pattern
            pattern = self._generate_pattern_from_values(sample_values)
            if pattern:
                column_patterns[column] = pattern
        
        return column_patterns
    
    def _generate_pattern_from_values(self, values: List[str]) -> Optional[str]:
        """
        Generate a regex pattern from sample values.
        """
        if not values:
            return None
        
        # Simple pattern generation based on common formats
        first_value = values[0]
        
        # Date patterns
        if re.match(r'\d{1,2}/\d{1,2}/\d{2,4}', first_value):
            return r'\d{1,2}/\d{1,2}/\d{2,4}'
        
        # Currency patterns
        if re.match(r'^\$?\d{1,3}(,\d{3})*(\.\d{2})?$', first_value):
            return r'^\$?\d{1,3}(,\d{3})*(\.\d{2})?$'
        
        # Percentage patterns
        if re.match(r'^\d+(\.\d+)?%$', first_value):
            return r'^\d+(\.\d+)?%$'
        
        # Phone patterns
        if re.match(r'^\d{3}-\d{3}-\d{4}$', first_value):
            return r'^\d{3}-\d{3}-\d{4}$'
        
        # SSN patterns
        if re.match(r'^\d{3}-\d{2}-\d{4}$', first_value):
            return r'^\d{3}-\d{2}-\d{4}$'
        
        return None
    
    def analyze_table_structure(self, table_data: List[List[str]], headers: List[str]) -> Dict[str, Any]:
        """
        Analyze the structure of a table.
        """
        if not table_data:
            return {}
        
        structure = {
            'column_count': len(headers),
            'row_count': len(table_data),
            'typical_row_count': len(table_data),
            'has_header_row': True,
            'max_column_lengths': {},
            'min_column_lengths': {},
            'avg_column_lengths': {}
        }
        
        # Analyze column lengths
        for i, header in enumerate(headers):
            column_values = [str(row[i]) if i < len(row) else '' for row in table_data]
            lengths = [len(val) for val in column_values]
            
            if lengths:
                structure['max_column_lengths'][header] = max(lengths)
                structure['min_column_lengths'][header] = min(lengths)
                structure['avg_column_lengths'][header] = sum(lengths) / len(lengths)
        
        return structure
    
    def calculate_data_quality_metrics(self, table_data: List[List[str]], headers: List[str]) -> Dict[str, Any]:
        """
        Calculate data quality metrics for the table.
        """
        if not table_data or not headers:
            return {}
        
        df = pd.DataFrame(table_data, columns=headers)
        
        quality_metrics = {
            'total_cells': len(df) * len(df.columns),
            'missing_cells': df.isnull().sum().sum(),
            'completeness': 1 - (df.isnull().sum().sum() / (len(df) * len(df.columns))),
            'column_completeness': {},
            'duplicate_rows': len(df) - len(df.drop_duplicates()),
            'duplicate_percentage': (len(df) - len(df.drop_duplicates())) / len(df) if len(df) > 0 else 0
        }
        
        # Calculate completeness for each column
        for column in headers:
            if column in df.columns:
                missing_count = df[column].isnull().sum()
                total_count = len(df)
                quality_metrics['column_completeness'][column] = 1 - (missing_count / total_count) if total_count > 0 else 0
        
        # Convert numpy types to native Python types
        quality_metrics = self._convert_numpy_types(quality_metrics)
        
        return quality_metrics
    
    def extract_sample_values(self, table_data: List[List[str]], headers: List[str], max_samples: int = 5) -> Dict[str, List[str]]:
        """
        Extract sample values for each column.
        """
        if not table_data or not headers:
            return {}
        
        sample_values = {}
        df = pd.DataFrame(table_data, columns=headers)
        
        for column in headers:
            if column in df.columns:
                values = df[column].dropna().astype(str).unique()
                sample_values[column] = values[:max_samples].tolist()
        
        return sample_values
    
    async def learn_from_processed_file(
        self, 
        db: AsyncSession, 
        company_id: str, 
        table_data: List[List[str]], 
        headers: List[str], 
        field_mapping: Dict[str, str],
        confidence_score: int = 80,
        table_editor_settings: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Learn from a processed file and save the format information.
        """
        try:
            # Analyze the table
            table_structure = self.analyze_table_structure(table_data, headers)
            column_types = self.analyze_column_types(table_data, headers)
            column_patterns = self.extract_column_patterns(table_data, headers)
            sample_values = self.extract_sample_values(table_data, headers)
            data_quality_metrics = self.calculate_data_quality_metrics(table_data, headers)
            
            # Generate format signature
            format_signature = self.generate_format_signature(headers, table_structure)
            
            # Convert all data to JSON-serializable format
            table_structure = self._convert_numpy_types(table_structure)
            column_types = self._convert_numpy_types(column_types)
            column_patterns = self._convert_numpy_types(column_patterns)
            sample_values = self._convert_numpy_types(sample_values)
            data_quality_metrics = self._convert_numpy_types(data_quality_metrics)
            field_mapping = self._convert_numpy_types(field_mapping)
            
            # Create format learning record
            format_learning = schemas.CarrierFormatLearningCreate(
                company_id=company_id,
                format_signature=format_signature,
                headers=headers,
                header_patterns=None,  # Could be enhanced later
                column_types=column_types,
                column_patterns=column_patterns,
                sample_values=sample_values,
                table_structure=table_structure,
                data_quality_metrics=data_quality_metrics,
                field_mapping=field_mapping,
                table_editor_settings=table_editor_settings,
                confidence_score=confidence_score,
                usage_count=1
            )
            
            # Save to database
            await with_db_retry(db, crud.save_carrier_format_learning, format_learning=format_learning)
            
            return True
            
        except Exception as e:
            print(f"Error learning from processed file: {e}")
            return False
    
    async def find_matching_format(
        self, 
        db: AsyncSession, 
        company_id: str, 
        headers: List[str], 
        table_structure: dict
    ) -> Tuple[Optional[Dict[str, Any]], float]:
        """
        Find the best matching format for a new file.
        """
        try:
            best_match, score = await with_db_retry(
                db, 
                crud.find_best_matching_format, 
                company_id=company_id, 
                headers=headers, 
                table_structure=table_structure
            )
            
            if best_match:
                            return {
                'format_signature': best_match.format_signature,
                'headers': best_match.headers,
                'column_types': best_match.column_types,
                'column_patterns': best_match.column_patterns,
                'field_mapping': best_match.field_mapping,
                'table_editor_settings': best_match.table_editor_settings,
                'confidence_score': best_match.confidence_score,
                'usage_count': best_match.usage_count
            }, score
            
            return None, 0.0
            
        except Exception as e:
            print(f"Error finding matching format: {e}")
            return None, 0.0
    
    def validate_data_against_learned_format(
        self, 
        table_data: List[List[str]], 
        headers: List[str], 
        learned_format: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Validate new data against a learned format.
        """
        validation_results = {
            'overall_score': 0.0,
            'header_match_score': 0.0,
            'data_type_validation': {},
            'pattern_validation': {},
            'structure_validation': {},
            'warnings': [],
            'errors': []
        }
        
        # Validate headers
        if 'headers' in learned_format:
            header_similarity = self._calculate_header_similarity(headers, learned_format['headers'])
            validation_results['header_match_score'] = header_similarity
        
        # Validate data types
        if 'column_types' in learned_format:
            current_column_types = self.analyze_column_types(table_data, headers)
            for column, expected_type in learned_format['column_types'].items():
                if column in current_column_types:
                    current_type = current_column_types[column]
                    validation_results['data_type_validation'][column] = {
                        'expected': expected_type,
                        'actual': current_type,
                        'match': expected_type == current_type
                    }
                    
                    if expected_type != current_type:
                        validation_results['warnings'].append(
                            f"Column '{column}' expected type '{expected_type}' but found '{current_type}'"
                        )
        
        # Validate patterns
        if 'column_patterns' in learned_format:
            current_patterns = self.extract_column_patterns(table_data, headers)
            for column, expected_pattern in learned_format['column_patterns'].items():
                if column in current_patterns:
                    current_pattern = current_patterns[column]
                    validation_results['pattern_validation'][column] = {
                        'expected': expected_pattern,
                        'actual': current_pattern,
                        'match': expected_pattern == current_pattern
                    }
        
        # Calculate overall score
        scores = [validation_results['header_match_score']]
        scores.extend([
            v['match'] for v in validation_results['data_type_validation'].values()
        ])
        scores.extend([
            v['match'] for v in validation_results['pattern_validation'].values()
        ])
        
        if scores:
            validation_results['overall_score'] = sum(scores) / len(scores)
        
        return validation_results
    
    def _calculate_header_similarity(self, headers1: List[str], headers2: List[str]) -> float:
        """
        Calculate similarity between two header lists.
        """
        if not headers1 or not headers2:
            return 0.0
        
        # Normalize headers
        headers1_normalized = [h.lower().strip() for h in headers1]
        headers2_normalized = [h.lower().strip() for h in headers2]
        
        # Find common headers
        common_headers = set(headers1_normalized) & set(headers2_normalized)
        
        # Calculate Jaccard similarity
        union_headers = set(headers1_normalized) | set(headers2_normalized)
        
        if not union_headers:
            return 0.0
        
        return len(common_headers) / len(union_headers)
