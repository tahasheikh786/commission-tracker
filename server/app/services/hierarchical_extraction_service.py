"""
Hierarchical Extraction Service for Commission Statements
Handles documents where company names appear as descriptive headers rather than in dedicated columns.
"""

import re
import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class CustomerBlock:
    """Represents a customer's data block in a hierarchical document."""
    customer_id: str
    customer_name: str
    section_type: str
    start_row: int
    end_row: int
    transactions: List[Dict[str, Any]]
    subtotal: float


class HierarchicalExtractionService:
    """Service for extracting data from hierarchical commission statements."""
    
    def __init__(self):
        self.customer_patterns = [
            r'Customer:\s*(\d+)',
            r'Customer ID:\s*(\d+)',
        ]
        
        self.customer_name_patterns = [
            r'Customer Name:\s*(.+)',
            r'Customer\s+Name:\s*(.+)',
        ]
        
        self.section_patterns = [
            r'New Business',
            r'Renewal',
        ]
        
        self.subtotal_patterns = [
            r'Sub-total',
            r'Subtotal',
        ]
    
    def _is_hierarchical_table(self, table: Dict[str, Any]) -> bool:
        """Check if a table has hierarchical structure with customer headers."""
        try:
            headers = table.get('headers', [])
            rows = table.get('rows', [])
            
            if not headers or not rows:
                return False
            
            # Check for hierarchical patterns in the data
            hierarchical_indicators = 0
            
            # Look for customer header patterns in rows
            for row in rows[:20]:  # Check first 20 rows
                if not isinstance(row, list):
                    continue
                    
                row_text = ' '.join(str(cell) for cell in row if cell)
                
                # Check for customer patterns
                if any(re.search(pattern, row_text, re.IGNORECASE) for pattern in self.customer_patterns):
                    hierarchical_indicators += 2
                
                # Check for customer name patterns
                if any(re.search(pattern, row_text, re.IGNORECASE) for pattern in self.customer_name_patterns):
                    hierarchical_indicators += 2
                
                # Check for section patterns
                if any(re.search(pattern, row_text, re.IGNORECASE) for pattern in self.section_patterns):
                    hierarchical_indicators += 1
                
                # Check for subtotal patterns
                if any(re.search(pattern, row_text, re.IGNORECASE) for pattern in self.subtotal_patterns):
                    hierarchical_indicators += 1
            
            # Check if headers contain commission-related terms but no company name column
            has_commission_headers = any('paid amount' in str(h).lower() or 'commission' in str(h).lower() for h in headers)
            has_company_column = any('company' in str(h).lower() or 'customer' in str(h).lower() or 'name' in str(h).lower() for h in headers)
            
            if has_commission_headers and not has_company_column:
                hierarchical_indicators += 1
            
            # Threshold for hierarchical detection
            return hierarchical_indicators >= 3
            
        except Exception as e:
            logger.error(f"Error checking hierarchical table: {e}")
            return False
    
    def process_hierarchical_statement(self, table_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process a hierarchical commission statement."""
        try:
            headers = table_data.get('headers', [])
            rows = table_data.get('rows', [])
            
            if not headers or not rows:
                return self._create_empty_result()
            
            customer_blocks = self._extract_customer_blocks(headers, rows)
            processed_data = []
            
            for block in customer_blocks:
                processed_block = self._process_customer_block(block, headers)
                if processed_block:
                    processed_data.append(processed_block)
            
            return {
                'structure_type': 'hierarchical',
                'customer_blocks': customer_blocks,
                'processed_data': processed_data,
                'extraction_summary': {
                    'total_customers': len(customer_blocks),
                    'total_commission': sum(block.subtotal for block in customer_blocks),
                }
            }
            
        except Exception as e:
            logger.error(f"Error in hierarchical processing: {e}")
            return self._create_empty_result()
    
    def _extract_customer_blocks(self, headers: List[str], rows: List[List[str]]) -> List[CustomerBlock]:
        """Extract customer blocks from the hierarchical document."""
        customer_blocks = []
        current_section = "Unknown"
        current_customer = None
        current_transactions = []
        
        logger.info(f"Starting customer block extraction with {len(rows)} rows")
        
        for row_idx, row in enumerate(rows):
            row_text = ' '.join(str(cell) for cell in row if cell)
            logger.debug(f"Row {row_idx}: {row_text[:100]}...")
            
            # Check for section headers
            for pattern in self.section_patterns:
                if re.search(pattern, row_text, re.IGNORECASE):
                    current_section = pattern
                    logger.debug(f"Found section: {current_section}")
                    break
            
            # Check for customer headers
            customer_id = None
            customer_name = None
            
            for pattern in self.customer_patterns:
                match = re.search(pattern, row_text, re.IGNORECASE)
                if match:
                    customer_id = match.group(1)
                    logger.debug(f"Found customer ID: {customer_id}")
                    break
            
            for pattern in self.customer_name_patterns:
                match = re.search(pattern, row_text, re.IGNORECASE)
                if match:
                    customer_name = match.group(1).strip()
                    logger.debug(f"Found customer name: {customer_name}")
                    break
            
            # Handle customer ID and name found in separate rows
            if customer_id and not customer_name:
                # Store the customer ID for the next row
                if not current_customer:
                    current_customer = {'id': customer_id, 'start_row': row_idx}
                    logger.debug(f"Started customer block with ID: {customer_id}")
            elif customer_name and current_customer and current_customer.get('id'):
                # Complete the customer block
                current_customer['name'] = customer_name
                logger.debug(f"Completed customer: {customer_name} (ID: {current_customer['id']})")
            elif customer_id and customer_name:
                # Both found in same row
                if current_customer:
                    # Save previous customer
                    block = CustomerBlock(
                        customer_id=current_customer['id'],
                        customer_name=current_customer['name'],
                        section_type=current_section,
                        start_row=current_customer['start_row'],
                        end_row=row_idx - 1,
                        transactions=current_transactions,
                        subtotal=self._calculate_subtotal(current_transactions, headers)
                    )
                    customer_blocks.append(block)
                    logger.info(f"Completed customer block: {current_customer['name']} with ${block.subtotal:.2f}")
                
                # Start new customer
                current_customer = {
                    'id': customer_id,
                    'name': customer_name,
                    'start_row': row_idx
                }
                current_transactions = []
                logger.info(f"Found customer: {customer_name} (ID: {customer_id})")
                logger.info(f"Found customer: {customer_name} (ID: {customer_id})")
            
            # Check for subtotal rows
            elif any(re.search(pattern, row_text, re.IGNORECASE) for pattern in self.subtotal_patterns):
                if current_customer:
                    block = CustomerBlock(
                        customer_id=current_customer['id'],
                        customer_name=current_customer['name'],
                        section_type=current_section,
                        start_row=current_customer['start_row'],
                        end_row=row_idx,
                        transactions=current_transactions,
                        subtotal=self._calculate_subtotal(current_transactions, headers)
                    )
                    customer_blocks.append(block)
                    logger.info(f"Completed customer block: {current_customer['name']} with ${block.subtotal:.2f}")
                    current_customer = None
                    current_transactions = []
            
            # Add transaction rows
            elif current_customer and self._is_transaction_row(row, headers):
                transaction = self._create_transaction(row, headers, row_idx)
                if transaction:
                    current_transactions.append(transaction)
        
        # Handle last customer block
        if current_customer:
            block = CustomerBlock(
                customer_id=current_customer['id'],
                customer_name=current_customer['name'],
                section_type=current_section,
                start_row=current_customer['start_row'],
                end_row=len(rows) - 1,
                transactions=current_transactions,
                subtotal=self._calculate_subtotal(current_transactions, headers)
            )
            customer_blocks.append(block)
        
        return customer_blocks
    
    def _is_transaction_row(self, row: List[str], headers: List[str]) -> bool:
        """Check if a row looks like a transaction row."""
        if not row or len(row) < 3:
            return False
        
        has_date = any(self._looks_like_date(cell) for cell in row)
        has_amount = any(self._looks_like_amount(cell) for cell in row)
        
        return has_date or has_amount
    
    def _looks_like_date(self, cell: str) -> bool:
        """Check if a cell looks like a date."""
        if not cell:
            return False
        
        cell_str = str(cell).strip()
        date_patterns = [
            r'\d{1,2}/\d{1,2}/\d{2,4}',
            r'\d{1,2}-\d{1,2}-\d{2,4}',
        ]
        return any(re.match(pattern, cell_str) for pattern in date_patterns)
    
    def _looks_like_amount(self, cell: str) -> bool:
        """Check if a cell looks like a monetary amount."""
        if not cell:
            return False
        
        cell_str = str(cell).strip()
        clean_amount = re.sub(r'[$,]', '', cell_str)
        return bool(re.match(r'^\d+\.?\d*$', clean_amount))
    
    def _create_transaction(self, row: List[str], headers: List[str], row_idx: int) -> Optional[Dict[str, Any]]:
        """Create a transaction record from a row."""
        if len(row) != len(headers):
            return None
        
        transaction = {
            'row_index': row_idx,
            'data': {}
        }
        
        for i, header in enumerate(headers):
            if i < len(row):
                transaction['data'][header] = row[i]
        
        return transaction
    
    def _calculate_subtotal(self, transactions: List[Dict[str, Any]], headers: List[str]) -> float:
        """Calculate subtotal for a customer block."""
        total = 0.0
        
        # Find the commission column (usually "Paid Amount")
        commission_col = None
        for i, header in enumerate(headers):
            if 'paid amount' in str(header).lower():
                commission_col = i
                break
        
        if commission_col is None:
            return 0.0
        
        for transaction in transactions:
            if 'data' in transaction and commission_col < len(headers):
                header = headers[commission_col]
                amount_str = transaction['data'].get(header, '0')
                if amount_str:
                    try:
                        clean_amount = re.sub(r'[$,]', '', str(amount_str))
                        amount = float(clean_amount)
                        total += amount
                    except (ValueError, TypeError):
                        continue
        
        return total
    
    def _process_customer_block(self, block: CustomerBlock, headers: List[str]) -> Optional[Dict[str, Any]]:
        """Process a customer block into the required format."""
        try:
            # Calculate invoice total from available columns
            invoice_total = 0.0
            for transaction in block.transactions:
                if 'data' in transaction:
                    for header, value in transaction['data'].items():
                        if any(pattern in header.lower() for pattern in ['billed premium', 'paid premium']):
                            try:
                                clean_amount = re.sub(r'[$,]', '', str(value))
                                amount = float(clean_amount)
                                invoice_total += amount
                            except (ValueError, TypeError):
                                continue
            
            return {
                'company_name': block.customer_name,
                'commission_earned': block.subtotal,
                'invoice_total': invoice_total,
                'customer_id': block.customer_id,
                'section_type': block.section_type,
                'transaction_count': len(block.transactions),
            }
            
        except Exception as e:
            logger.error(f"Error processing customer block: {e}")
            return None
    
    def _create_empty_result(self) -> Dict[str, Any]:
        """Create an empty result structure."""
        return {
            'structure_type': 'hierarchical',
            'customer_blocks': [],
            'processed_data': [],
            'extraction_summary': {
                'total_customers': 0,
                'total_commission': 0.0,
            }
        }
    
    def convert_to_standard_format(self, hierarchical_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Convert hierarchical data to standard table format."""
        standard_rows = []
        
        for customer_data in hierarchical_data.get('processed_data', []):
            row = {
                'Company Name': customer_data.get('company_name', ''),
                'Commission Earned': f"${customer_data.get('commission_earned', 0):.2f}",
                'Invoice Total': f"${customer_data.get('invoice_total', 0):.2f}",
                'Customer ID': customer_data.get('customer_id', ''),
                'Section Type': customer_data.get('section_type', ''),
            }
            standard_rows.append(row)
        
        return standard_rows
