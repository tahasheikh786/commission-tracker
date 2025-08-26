"""
Shared Company Name Detection Service
Works with both GPT Vision and Google DocAI extraction pipelines
"""

import re
import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)


class CompanyNameDetectionService:
    """
    Shared service for detecting company names scattered between rows
    Works with both GPT Vision and Google DocAI extraction results
    """
    
    def __init__(self):
        # Company name patterns (legal entity suffixes)
        self.company_patterns = [
            r'([A-Z][A-Za-z\s&\.]+(?:LLC|Inc|Corp|Co|Corporation|Company|Ltd|Limited))',
            r'([A-Z]{2,}\s[A-Z][A-Za-z\s]+(?:LLC|Inc|Corp))',
            r'([A-Z][A-Z\s]+(?:LOGISTICS|DELIVERY|SERVICES|SOLUTIONS))',
            r'([A-Z][A-Za-z\s&\.]+(?:PROTECTION|HEATING|COOLING))',
            r'([A-Z][A-Za-z\s&\.]+(?:GROUP|AGENCY|ASSOCIATES))',
            # Add more patterns based on commission statement formats
        ]
        
        # Customer header patterns for hierarchical documents
        self.customer_header_patterns = [
            r'Customer:\s*(\d+)',
            r'Customer ID:\s*(\d+)',
            r'Customer\s+(\d+)',
        ]
        
        self.customer_name_patterns = [
            r'Customer Name:\s*(.+)',
            r'Customer\s+Name:\s*(.+)',
            r'Name:\s*(.+)',
        ]
        
        # Section patterns
        self.section_patterns = [
            r'New Business',
            r'Renewal',
            r'Existing Business',
            r'Current Business',
        ]
        
        # Try to load spaCy model for NER (optional enhancement)
        self.nlp = None
        try:
            import spacy
            self.nlp = spacy.load("en_core_web_sm")
            logger.info("spaCy model loaded for enhanced NER")
        except (ImportError, OSError):
            logger.info("spaCy not available, using pattern matching only")
    
    def detect_company_names_in_extracted_data(self, 
                                             table_data: Dict[str, Any], 
                                             extraction_method: str = "unknown") -> Dict[str, Any]:
        """
        Main method to detect company names in extracted table data
        Works for both GPT and DocAI results with enhanced hierarchical support
        """
        try:
            headers = table_data.get("header", []) or table_data.get("headers", [])
            rows = table_data.get("rows", [])
            
            if not rows:
                return table_data
            
            logger.info(f"🔍 Company Detection: Processing {len(rows)} rows with {len(headers)} headers")
            
            # Check if GPT already provided company column
            if "Company Name" in headers or any("company" in str(h).lower() for h in headers):
                logger.info("✅ Company column already detected by GPT")
                return table_data
            
            # Strategy 1: Look for hierarchical customer patterns
            hierarchical_companies = self._detect_hierarchical_companies(rows, headers)
            
            # Strategy 2: Look for company names in individual cells
            scattered_companies = self._detect_scattered_companies(rows, headers)
            
            # Strategy 3: Use NER if available
            ner_companies = []
            if self.nlp and not (hierarchical_companies or scattered_companies):
                ner_companies = self._extract_with_ner(rows)
            
            # Combine all detected companies
            all_companies = hierarchical_companies + scattered_companies + ner_companies
            unique_companies = list(set(all_companies))  # Remove duplicates
            
            # Enhanced company mapping for hierarchical structures
            if hierarchical_companies:
                enhanced_table = self._create_hierarchical_company_column(rows, headers, unique_companies)
            else:
                # Fallback to basic enhancement
                enhanced_rows = self._enhance_rows_with_companies(rows, headers, unique_companies)
                enhanced_table = {
                    **table_data,
                    "rows": enhanced_rows,
                    "detected_companies": unique_companies,
                    "company_detection_metadata": {
                        "extraction_method": extraction_method,
                        "companies_count": len(unique_companies),
                        "hierarchical_companies": len(hierarchical_companies),
                        "scattered_companies": len(scattered_companies),
                        "ner_companies": len(ner_companies),
                        "detection_timestamp": datetime.now().isoformat(),
                        "enhancement_applied": True,
                        "hierarchical_structure_detected": bool(hierarchical_companies)
                    }
                }
            
            logger.info(f"✅ Company Detection: Found {len(unique_companies)} companies: {unique_companies}")
            return enhanced_table
            
        except Exception as e:
            logger.error(f"Error in company name detection: {e}")
            return table_data
    
    def _detect_hierarchical_companies(self, rows: List[List[str]], headers: List[str]) -> List[str]:
        """Detect companies from hierarchical customer patterns with enhanced detection"""
        companies = []
        current_customer_name = None
        
        for row in rows:
            row_text = ' '.join(str(cell) for cell in row if cell)
            
            # Check for customer name patterns
            for pattern in self.customer_name_patterns:
                match = re.search(pattern, row_text, re.IGNORECASE)
                if match:
                    customer_name = match.group(1).strip()
                    if customer_name and len(customer_name) > 2:
                        companies.append(customer_name)
                        current_customer_name = customer_name
                        break
            
            # Enhanced company detection for standalone company names
            # Look for rows that contain only or primarily company names
            if self._is_company_header_row(row, row_text):
                company_name = self._extract_company_from_header_row(row, row_text)
                if company_name and company_name not in companies:
                    companies.append(company_name)
                    current_customer_name = company_name
        
        return companies
    
    def _is_company_header_row(self, row: List[str], row_text: str) -> bool:
        """Check if a row looks like a company header row"""
        # Check if row contains company indicators
        company_indicators = [
            'LLC', 'Inc', 'Corp', 'Co', 'Corporation', 'Company', 'Ltd', 'Limited',
            'LOGISTICS', 'DELIVERY', 'SERVICES', 'SOLUTIONS', 'PROTECTION', 'HEATING', 'COOLING'
        ]
        
        # Check for company patterns in the row
        for indicator in company_indicators:
            if indicator in row_text.upper():
                return True
        
        # Check if row looks like a standalone company name (not transaction data)
        # Company headers often have fewer cells or different formatting
        if len(row) <= 3 and len(row_text.strip()) > 5:
            # Check if it doesn't contain typical transaction data
            transaction_indicators = ['$', '%', '/', '\\d{2}/\\d{2}/\\d{4}', 'Med', 'Den', 'Vis']
            has_transaction_data = any(re.search(indicator, row_text) for indicator in transaction_indicators)
            if not has_transaction_data:
                return True
        
        return False
    
    def _extract_company_from_header_row(self, row: List[str], row_text: str) -> Optional[str]:
        """Extract company name from a header row"""
        # Try to extract company name using patterns
        for pattern in self.company_patterns:
            try:
                matches = re.findall(pattern, row_text, re.IGNORECASE)
                for match in matches:
                    if match and match.strip() and len(match.strip()) > 3:
                        return match.strip()
            except re.error:
                continue
        
        # If no pattern match, try to extract the most likely company name
        words = row_text.split()
        for i, word in enumerate(words):
            # Look for words that might be company names
            if (len(word) > 3 and 
                any(indicator in word.upper() for indicator in ['LLC', 'INC', 'CORP', 'CO', 'LOGISTICS', 'DELIVERY'])):
                # Try to get the full company name
                if i > 0:
                    # Include previous word if it looks like part of company name
                    potential_name = f"{words[i-1]} {word}"
                    if len(potential_name) > 5:
                        return potential_name
                return word
        
        return None
    
    def _detect_scattered_companies(self, rows: List[List[str]], headers: List[str]) -> List[str]:
        """Detect companies scattered throughout the data"""
        companies = []
        
        for row in rows:
            for cell in row:
                if not cell or not isinstance(cell, str):
                    continue
                
                # Check for company patterns
                companies_in_cell = self._extract_companies_from_text(cell)
                if companies_in_cell:
                    companies.extend(companies_in_cell)
        
        return companies
    
    def _extract_companies_from_text(self, text: str) -> List[str]:
        """Extract company names from text using pattern matching"""
        companies = []
        
        for pattern in self.company_patterns:
            try:
                matches = re.findall(pattern, text, re.IGNORECASE)
                for match in matches:
                    if match and match.strip() and len(match.strip()) > 3:
                        companies.append(match.strip())
            except re.error:
                continue
        
        return companies
    
    def _extract_with_ner(self, rows: List[List[str]]) -> List[str]:
        """Extract companies using NER (Named Entity Recognition)"""
        if not self.nlp:
            return []
        
        companies = []
        
        # Combine all text for NER processing
        all_text = " ".join([" ".join(str(cell) for cell in row) for row in rows])
        doc = self.nlp(all_text)
        
        # Extract organization entities
        for ent in doc.ents:
            if ent.label_ == "ORG":  # Organization
                companies.append(ent.text.strip())
        
        return list(set(companies))
    
    def _enhance_rows_with_companies(self, rows: List[List[str]], headers: List[str], companies: List[str]) -> List[List[str]]:
        """Enhance rows with company name information"""
        enhanced_rows = []
        current_company = ""
        
        # Check if we already have a company name column
        has_company_column = any("company" in str(header).lower() for header in headers)
        
        for row in rows:
            row_text = ' '.join(str(cell) for cell in row if cell)
            
            # Check if this row contains a company name
            found_company = None
            for company in companies:
                if company in row_text:
                    found_company = company
                    current_company = company
                    break
            
            # If we found a company in this row, it might be a header row
            if found_company:
                # This could be a company header row - keep it as is
                enhanced_rows.append(row)
            else:
                # Regular transaction row - associate with current company
                if not has_company_column and current_company:
                    # Add company name as first column
                    enhanced_row = [current_company] + row
                else:
                    enhanced_row = row
                enhanced_rows.append(enhanced_row)
        
        return enhanced_rows
    
    def _create_hierarchical_company_column(self, rows: List[List[str]], headers: List[str], companies: List[str]) -> Dict[str, Any]:
        """
        Create a proper company name column for hierarchical structures.
        Maps each transaction row to its corresponding company.
        """
        try:
            enhanced_rows = []
            current_company = ""
            company_mapping = {}
            row_company_map = {}
            
            # Add Company Name as first column
            enhanced_headers = ["Company Name"] + headers
            
            for row_idx, row in enumerate(rows):
                row_text = ' '.join(str(cell) for cell in row if cell)
                
                # Check if this row contains a company name
                found_company = None
                for company in companies:
                    # Use exact match or partial match for company names
                    if company in row_text or any(word in row_text for word in company.split()):
                        found_company = company
                        current_company = company
                        break
                
                # If we found a company in this row, it's likely a company header row
                if found_company:
                    # This is a company header row - use the company name
                    enhanced_row = [found_company] + row
                    enhanced_rows.append(enhanced_row)
                    row_company_map[row_idx] = found_company
                    
                    # Initialize company mapping if not exists
                    if found_company not in company_mapping:
                        company_mapping[found_company] = []
                    company_mapping[found_company].append(row_idx)
                    
                else:
                    # This is a transaction row - inherit company from previous
                    if current_company:
                        enhanced_row = [current_company] + row
                        enhanced_rows.append(enhanced_row)
                        row_company_map[row_idx] = current_company
                        
                        # Add to company mapping
                        if current_company not in company_mapping:
                            company_mapping[current_company] = []
                        company_mapping[current_company].append(row_idx)
                    else:
                        # No company context yet - add empty company column
                        enhanced_row = [""] + row
                        enhanced_rows.append(enhanced_row)
            
            return {
                "header": enhanced_headers,
                "rows": enhanced_rows,
                "detected_companies": companies,
                "company_transaction_mapping": company_mapping,
                "row_company_map": row_company_map,
                "company_detection_metadata": {
                    "extraction_method": "hierarchical_enhanced",
                    "companies_count": len(companies),
                    "hierarchical_structure_detected": True,
                    "company_column_added": True,
                    "detection_timestamp": datetime.now().isoformat(),
                    "enhancement_applied": True,
                    "structure_type": "hierarchical_with_company_column"
                }
            }
            
        except Exception as e:
            logger.error(f"Error creating hierarchical company column: {e}")
            return {
                "header": headers,
                "rows": rows,
                "detected_companies": companies,
                "company_detection_metadata": {
                    "extraction_method": "hierarchical_fallback",
                    "error": str(e),
                    "enhancement_applied": False
                }
            }
    
    def create_company_transaction_mapping(self, rows: List[List[str]], companies: List[str]) -> Dict[str, List[int]]:
        """Create mapping between companies and their transaction rows"""
        mapping = {}
        current_company = None
        
        for row_idx, row in enumerate(rows):
            row_text = ' '.join(str(cell) for cell in row if cell)
            
            # Check if this row contains a company name
            for company in companies:
                if company in row_text:
                    current_company = company
                    if company not in mapping:
                        mapping[company] = []
                    break
            
            # If we have a current company and this looks like a transaction row
            if current_company and self._is_transaction_row(row):
                if current_company not in mapping:
                    mapping[current_company] = []
                mapping[current_company].append(row_idx)
        
        return mapping
    
    def _is_transaction_row(self, row: List[str]) -> bool:
        """Check if a row looks like a transaction row"""
        if not row or len(row) < 3:
            return False
        
        # Check for transaction indicators
        row_text = ' '.join(str(cell) for cell in row if cell)
        
        # Look for date patterns
        date_patterns = [
            r'\d{1,2}/\d{1,2}/\d{2,4}',
            r'\d{1,2}-\d{1,2}-\d{2,4}',
            r'\d{4}-\d{2}-\d{2}'
        ]
        
        # Look for amount patterns
        amount_patterns = [
            r'\$\d+\.?\d*',
            r'\d+\.?\d*',
        ]
        
        has_date = any(re.search(pattern, row_text) for pattern in date_patterns)
        has_amount = any(re.search(pattern, row_text) for pattern in amount_patterns)
        
        return has_date or has_amount
    
    def validate_company_name(self, company_name: str) -> Dict[str, Any]:
        """Validate a detected company name"""
        validation_result = {
            "company_name": company_name,
            "is_valid": False,
            "confidence": 0.0,
            "issues": [],
            "suggestions": []
        }
        
        if not company_name or len(company_name.strip()) < 3:
            validation_result["issues"].append("Company name too short")
            return validation_result
        
        # Check for common company suffixes
        suffixes = ['LLC', 'Inc', 'Corp', 'Co', 'Corporation', 'Company', 'Ltd', 'Limited']
        has_suffix = any(suffix in company_name.upper() for suffix in suffixes)
        
        # Check for reasonable length
        is_reasonable_length = 3 <= len(company_name) <= 100
        
        # Check for valid characters
        has_valid_chars = bool(re.match(r'^[A-Za-z0-9\s&\.\-]+$', company_name))
        
        # Calculate confidence score
        confidence = 0.0
        if has_suffix:
            confidence += 0.4
        if is_reasonable_length:
            confidence += 0.3
        if has_valid_chars:
            confidence += 0.3
        
        validation_result.update({
            "is_valid": confidence > 0.5,
            "confidence": confidence,
            "has_suffix": has_suffix,
            "is_reasonable_length": is_reasonable_length,
            "has_valid_chars": has_valid_chars
        })
        
        if not has_suffix:
            validation_result["suggestions"].append("Consider adding company suffix (LLC, Inc, Corp, etc.)")
        
        if not has_valid_chars:
            validation_result["issues"].append("Contains invalid characters")
        
        return validation_result
