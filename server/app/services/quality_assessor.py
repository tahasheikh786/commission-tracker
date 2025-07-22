"""
Quality Assessment and Validation Service for Commission Statement Tables
"""

import re
import numpy as np
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

@dataclass
class QualityMetrics:
    """Quality metrics for extracted table data"""
    overall_score: float
    completeness: float
    consistency: float
    accuracy: float
    structure_quality: float
    data_quality: float
    confidence_level: str
    issues: List[str]
    recommendations: List[str]

@dataclass
class ValidationResult:
    """Result of table validation"""
    is_valid: bool
    quality_metrics: QualityMetrics
    corrected_data: Optional[List[List[str]]] = None
    warnings: List[str] = None

class CommissionStatementValidator:
    """
    Validates and assesses quality of commission statement tables
    """
    
    def __init__(self):
        # Commission statement specific validation patterns
        self.currency_pattern = r'^\s*[$-]?\s*[\d,]+(\.\d{2})?\s*$'
        self.percentage_pattern = r'^\s*\d+(\.\d+)?\s*%?\s*$'
        self.date_pattern = r'^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|^\d{4}-\d{2}-\d{2}$'
        self.policy_pattern = r'^[A-Z0-9\-_]{6,20}$'
        
        # Expected column patterns for commission statements
        self.expected_columns = {
            'policy_number': r'policy|number|id',
            'carrier': r'carrier|insurance|company',
            'client': r'client|customer|group',
            'effective_date': r'effective|start|begin',
            'expiration_date': r'expiration|end|termination',
            'premium': r'premium|amount|billing',
            'commission': r'commission|rate|percentage',
            'plan_type': r'plan|type|coverage|medical|dental|vision'
        }
        
        # Data type expectations
        self.column_types = {
            'policy_number': 'text',
            'carrier': 'text', 
            'client': 'text',
            'effective_date': 'date',
            'expiration_date': 'date',
            'premium': 'currency',
            'commission': 'percentage',
            'plan_type': 'text'
        }
    
    def assess_table_quality(self, table: Dict) -> QualityMetrics:
        """
        Comprehensive quality assessment of extracted table
        """
        header = table.get('header', [])
        rows = table.get('rows', [])
        
        if not header or not rows:
            return QualityMetrics(
                overall_score=0.0,
                completeness=0.0,
                consistency=0.0,
                accuracy=0.0,
                structure_quality=0.0,
                data_quality=0.0,
                confidence_level="LOW",
                issues=["Empty table or missing header"],
                recommendations=["Check PDF quality and extraction parameters"]
            )
        
        # Calculate individual metrics
        completeness = self._assess_completeness(header, rows)
        consistency = self._assess_consistency(header, rows)
        accuracy = self._assess_accuracy(header, rows)
        structure_quality = self._assess_structure_quality(header, rows)
        data_quality = self._assess_data_quality(header, rows)
        
        # Calculate overall score
        overall_score = (
            completeness * 0.25 +
            consistency * 0.25 +
            accuracy * 0.20 +
            structure_quality * 0.15 +
            data_quality * 0.15
        )
        
        # Determine confidence level
        confidence_level = self._determine_confidence_level(overall_score)
        
        # Identify issues and recommendations
        issues = self._identify_issues(header, rows, overall_score)
        recommendations = self._generate_recommendations(issues, overall_score)
        
        return QualityMetrics(
            overall_score=overall_score,
            completeness=completeness,
            consistency=consistency,
            accuracy=accuracy,
            structure_quality=structure_quality,
            data_quality=data_quality,
            confidence_level=confidence_level,
            issues=issues,
            recommendations=recommendations
        )
    
    def _assess_completeness(self, header: List[str], rows: List[List[str]]) -> float:
        """
        Assess data completeness (no empty cells, proper row lengths)
        """
        if not header or not rows:
            return 0.0
        
        expected_columns = len(header)
        total_cells = 0
        filled_cells = 0
        
        for row in rows:
            # Pad or truncate row to match header length
            padded_row = (row + [''] * (expected_columns - len(row)))[:expected_columns]
            total_cells += len(padded_row)
            filled_cells += sum(1 for cell in padded_row if cell and cell.strip())
        
        return filled_cells / total_cells if total_cells > 0 else 0.0
    
    def _assess_consistency(self, header: List[str], rows: List[List[str]]) -> float:
        """
        Assess data consistency (consistent data types, formats)
        """
        if not header or not rows:
            return 0.0
        
        consistency_scores = []
        
        for col_idx, col_name in enumerate(header):
            col_values = []
            for row in rows:
                if col_idx < len(row) and row[col_idx].strip():
                    col_values.append(row[col_idx].strip())
            
            if not col_values:
                continue
            
            # Check data type consistency
            col_type = self._infer_column_type(col_name, col_values)
            type_consistency = self._check_type_consistency(col_values, col_type)
            
            # Check format consistency
            format_consistency = self._check_format_consistency(col_values, col_type)
            
            consistency_scores.append((type_consistency + format_consistency) / 2)
        
        return np.mean(consistency_scores) if consistency_scores else 0.0
    
    def _assess_accuracy(self, header: List[str], rows: List[List[str]]) -> float:
        """
        Assess data accuracy (valid formats, reasonable values)
        """
        if not header or not rows:
            return 0.0
        
        accuracy_scores = []
        
        for col_idx, col_name in enumerate(header):
            col_values = []
            for row in rows:
                if col_idx < len(row) and row[col_idx].strip():
                    col_values.append(row[col_idx].strip())
            
            if not col_values:
                continue
            
            # Check for valid formats
            valid_format_count = 0
            for value in col_values:
                if self._is_valid_format(value, col_name):
                    valid_format_count += 1
            
            accuracy_scores.append(valid_format_count / len(col_values))
        
        return np.mean(accuracy_scores) if accuracy_scores else 0.0
    
    def _assess_structure_quality(self, header: List[str], rows: List[List[str]]) -> float:
        """
        Assess table structure quality (proper header, row alignment)
        """
        if not header:
            return 0.0
        
        scores = []
        
        # Header quality
        header_quality = self._assess_header_quality(header)
        scores.append(header_quality)
        
        # Row alignment
        if rows:
            alignment_scores = []
            expected_cols = len(header)
            
            for row in rows:
                # Check if row has reasonable number of columns
                if len(row) >= expected_cols * 0.8:
                    alignment_scores.append(1.0)
                elif len(row) >= expected_cols * 0.5:
                    alignment_scores.append(0.5)
                else:
                    alignment_scores.append(0.0)
            
            if alignment_scores:
                scores.append(np.mean(alignment_scores))
        
        return np.mean(scores) if scores else 0.0
    
    def _assess_data_quality(self, header: List[str], rows: List[List[str]]) -> float:
        """
        Assess data quality (no obvious errors, reasonable ranges)
        """
        if not header or not rows:
            return 0.0
        
        quality_scores = []
        
        for col_idx, col_name in enumerate(header):
            col_values = []
            for row in rows:
                if col_idx < len(row) and row[col_idx].strip():
                    col_values.append(row[col_idx].strip())
            
            if not col_values:
                continue
            
            # Check for reasonable values
            reasonableness_score = self._check_value_reasonableness(col_name, col_values)
            quality_scores.append(reasonableness_score)
        
        return np.mean(quality_scores) if quality_scores else 0.0
    
    def _assess_header_quality(self, header: List[str]) -> float:
        """
        Assess header quality (commission statement specific)
        """
        if not header:
            return 0.0
        
        # Check for commission statement keywords
        commission_keywords = 0
        for col in header:
            col_lower = col.lower()
            for pattern in self.expected_columns.values():
                if re.search(pattern, col_lower):
                    commission_keywords += 1
                    break
        
        return commission_keywords / len(header)
    
    def _infer_column_type(self, col_name: str, values: List[str]) -> str:
        """
        Infer the data type of a column based on name and values
        """
        col_lower = col_name.lower()
        
        # Check column name patterns
        for expected_col, pattern in self.expected_columns.items():
            if re.search(pattern, col_lower):
                return self.column_types.get(expected_col, 'text')
        
        # Infer from values
        if all(self._is_currency(val) for val in values if val):
            return 'currency'
        elif all(self._is_percentage(val) for val in values if val):
            return 'percentage'
        elif all(self._is_date(val) for val in values if val):
            return 'date'
        else:
            return 'text'
    
    def _is_currency(self, value: str) -> bool:
        """Check if value is currency format"""
        return bool(re.match(self.currency_pattern, value))
    
    def _is_percentage(self, value: str) -> bool:
        """Check if value is percentage format"""
        return bool(re.match(self.percentage_pattern, value))
    
    def _is_date(self, value: str) -> bool:
        """Check if value is date format"""
        return bool(re.match(self.date_pattern, value))
    
    def _is_valid_format(self, value: str, col_name: str) -> bool:
        """
        Check if value has valid format for the column type
        """
        col_type = self._infer_column_type(col_name, [value])
        
        if col_type == 'currency':
            return self._is_currency(value)
        elif col_type == 'percentage':
            return self._is_percentage(value)
        elif col_type == 'date':
            return self._is_date(value)
        else:
            return len(value.strip()) > 0
    
    def _check_type_consistency(self, values: List[str], expected_type: str) -> float:
        """
        Check consistency of data types in a column
        """
        if not values:
            return 0.0
        
        valid_count = 0
        for value in values:
            if expected_type == 'currency' and self._is_currency(value):
                valid_count += 1
            elif expected_type == 'percentage' and self._is_percentage(value):
                valid_count += 1
            elif expected_type == 'date' and self._is_date(value):
                valid_count += 1
            elif expected_type == 'text':
                valid_count += 1
        
        return valid_count / len(values)
    
    def _check_format_consistency(self, values: List[str], expected_type: str) -> float:
        """
        Check format consistency within a column
        """
        if not values or expected_type == 'text':
            return 1.0
        
        # For currency, check if all have same decimal places
        if expected_type == 'currency':
            decimal_places = []
            for value in values:
                if '.' in value:
                    decimal_places.append(len(value.split('.')[-1]))
                else:
                    decimal_places.append(0)
            
            if len(set(decimal_places)) <= 2:  # Allow some variation
                return 0.8
            else:
                return 0.4
        
        return 1.0
    
    def _check_value_reasonableness(self, col_name: str, values: List[str]) -> float:
        """
        Check if values are reasonable for commission statement data
        """
        if not values:
            return 0.0
        
        col_lower = col_name.lower()
        
        # Check for commission rates (should be reasonable percentages)
        if 'commission' in col_lower or 'rate' in col_lower:
            reasonable_count = 0
            for value in values:
                try:
                    # Extract numeric value
                    num_str = re.sub(r'[^\d.]', '', value)
                    if num_str:
                        num_val = float(num_str)
                        if 0 <= num_val <= 100:  # Reasonable commission rate
                            reasonable_count += 1
                except:
                    pass
            return reasonable_count / len(values)
        
        # Check for premium amounts (should be positive)
        elif 'premium' in col_lower or 'amount' in col_lower:
            positive_count = 0
            for value in values:
                try:
                    num_str = re.sub(r'[^\d.]', '', value)
                    if num_str:
                        num_val = float(num_str)
                        if num_val > 0:
                            positive_count += 1
                except:
                    pass
            return positive_count / len(values)
        
        return 1.0  # Default to reasonable for text fields
    
    def _determine_confidence_level(self, score: float) -> str:
        """
        Determine confidence level based on quality score
        """
        if score >= 0.9:
            return "VERY_HIGH"
        elif score >= 0.8:
            return "HIGH"
        elif score >= 0.7:
            return "MEDIUM_HIGH"
        elif score >= 0.6:
            return "MEDIUM"
        elif score >= 0.5:
            return "MEDIUM_LOW"
        else:
            return "LOW"
    
    def _identify_issues(self, header: List[str], rows: List[List[str]], score: float) -> List[str]:
        """
        Identify specific issues with the extracted data
        """
        issues = []
        
        if score < 0.5:
            issues.append("Overall quality is very low - consider re-extraction")
        
        if not header:
            issues.append("Missing or invalid header")
        
        if not rows:
            issues.append("No data rows found")
        
        # Check for specific issues
        if header and rows:
            completeness = self._assess_completeness(header, rows)
            if completeness < 0.8:
                issues.append(f"Low data completeness ({completeness:.1%})")
            
            consistency = self._assess_consistency(header, rows)
            if consistency < 0.7:
                issues.append(f"Data consistency issues ({consistency:.1%})")
            
            # Check for empty columns
            for i, col_name in enumerate(header):
                col_values = [row[i] for row in rows if i < len(row) and row[i].strip()]
                if len(col_values) < len(rows) * 0.5:
                    issues.append(f"Column '{col_name}' has many empty values")
        
        return issues
    
    def _generate_recommendations(self, issues: List[str], score: float) -> List[str]:
        """
        Generate recommendations for improving data quality
        """
        recommendations = []
        
        if score < 0.6:
            recommendations.append("Consider using higher DPI for PDF conversion")
            recommendations.append("Try different image preprocessing settings")
            recommendations.append("Review PDF quality - consider requesting better source")
        
        if "completeness" in str(issues).lower():
            recommendations.append("Adjust table detection parameters")
            recommendations.append("Check for multi-page table structures")
        
        if "consistency" in str(issues).lower():
            recommendations.append("Review data format standardization")
            recommendations.append("Consider post-processing data cleaning")
        
        if not recommendations:
            recommendations.append("Data quality is acceptable for processing")
        
        return recommendations
    
    def validate_table(self, table: Dict) -> ValidationResult:
        """
        Validate extracted table and provide corrections if needed
        """
        quality_metrics = self.assess_table_quality(table)
        
        # Determine if table is valid
        is_valid = quality_metrics.overall_score >= 0.6 and len(quality_metrics.issues) < 3
        
        # Generate corrected data if needed
        corrected_data = None
        warnings = []
        
        if quality_metrics.overall_score < 0.8:
            corrected_data = self._apply_corrections(table)
            warnings.append("Data corrections applied - review results")
        
        return ValidationResult(
            is_valid=is_valid,
            quality_metrics=quality_metrics,
            corrected_data=corrected_data,
            warnings=warnings
        )
    
    def _apply_corrections(self, table: Dict) -> List[List[str]]:
        """
        Apply automatic corrections to table data
        """
        header = table.get('header', [])
        rows = table.get('rows', [])
        
        if not header or not rows:
            return rows
        
        corrected_rows = []
        expected_cols = len(header)
        
        for row in rows:
            # Pad or truncate row to match header length
            corrected_row = (row + [''] * (expected_cols - len(row)))[:expected_cols]
            
            # Clean individual cells
            for i, cell in enumerate(corrected_row):
                corrected_row[i] = self._clean_cell(cell, header[i] if i < len(header) else '')
            
            corrected_rows.append(corrected_row)
        
        return corrected_rows
    
    def _clean_cell(self, cell: str, col_name: str) -> str:
        """
        Clean individual cell data
        """
        if not cell:
            return ""
        
        cell = cell.strip()
        
        # Remove extra whitespace
        cell = re.sub(r'\s+', ' ', cell)
        
        # Standardize currency format
        if self._is_currency(cell):
            # Remove extra currency symbols and standardize
            cell = re.sub(r'[^\d.,-]', '', cell)
            if cell.endswith('-'):
                cell = '-' + cell[:-1]
        
        # Standardize percentage format
        if self._is_percentage(cell):
            cell = re.sub(r'[^\d.]', '', cell) + '%'
        
        return cell 