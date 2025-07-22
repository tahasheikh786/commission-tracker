#!/usr/bin/env python3
"""
Test script to verify header detection improvements
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.advanced_table_extractor_simple import AdvancedTableExtractor

def test_header_detection():
    """Test the header detection with sample data"""
    extractor = AdvancedTableExtractor()
    
    # Test case 1: Actual header row from your document
    header_row = ["Group No.", "Group Name", "Billing Period", "Adj. Period", "Invoice Total", "Stoploss Total", "Agent Rate", "Calculation Method", "Census Ct.", "Paid Amount"]
    
    # Test case 2: Data row that was incorrectly identified as header
    data_row = ["L241576", "BAEZA RAPID DELIVERY", "6/1/2025", "3/1/2025", "($915.96)", "($362.97)", "11.5%", "Premium Equivalent", "-3", "($105.33)"]
    
    print("Testing Header Detection Improvements")
    print("=" * 50)
    
    # Test header row
    print("\n1. Testing actual header row:")
    print(f"Row: {header_row}")
    is_header = extractor.is_likely_header(header_row)
    print(f"Is likely header: {is_header}")
    
    # Test individual cells for digits
    print("Checking for digits in each cell:")
    for i, cell in enumerate(header_row):
        has_digit = any(char.isdigit() for char in cell)
        print(f"  Cell {i}: '{cell}' - Has digit: {has_digit}")
    
    # Test non-numeric count
    non_numeric = sum(1 for cell in header_row if cell and not extractor._is_number(cell))
    print(f"Non-numeric cells: {non_numeric}/{len(header_row)}")
    
    # Test long cells
    long_cells = sum(1 for cell in header_row if cell and len(cell.strip()) > 5)
    print(f"Long cells (>5 chars): {long_cells}")
    
    # Test data row
    print("\n2. Testing data row (should NOT be identified as header):")
    print(f"Row: {data_row}")
    is_header = extractor.is_likely_header(data_row)
    print(f"Is likely header: {is_header}")
    
    # Test individual cells for digits
    print("Checking for digits in each cell:")
    for i, cell in enumerate(data_row):
        has_digit = any(char.isdigit() for char in cell)
        print(f"  Cell {i}: '{cell}' - Has digit: {has_digit}")
    
    # Test non-numeric count
    non_numeric = sum(1 for cell in data_row if cell and not extractor._is_number(cell))
    print(f"Non-numeric cells: {non_numeric}/{len(data_row)}")
    
    # Test long cells
    long_cells = sum(1 for cell in data_row if cell and len(cell.strip()) > 5)
    print(f"Long cells (>5 chars): {long_cells}")
    
    # Test individual cell detection
    print("\n3. Testing individual cell detection:")
    for i, cell in enumerate(data_row):
        is_number = extractor._is_number(cell)
        print(f"Cell {i}: '{cell}' - Is number: {is_number}")
    
    print("\n" + "=" * 50)
    print("Test completed!")

if __name__ == "__main__":
    test_header_detection() 