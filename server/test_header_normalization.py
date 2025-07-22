#!/usr/bin/env python3
"""
Test script to verify header normalization and merging functionality
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.advanced_table_extractor_simple import AdvancedTableExtractor

def test_header_normalization():
    """Test the header normalization functionality"""
    extractor = AdvancedTableExtractor()
    
    # Test case 1: Headers with empty strings
    header1 = ["Group No.", "", "Group Name", "Billing Period", "Adj. Period", "Invoice Total", "Stoploss Total", "Agent Rate", "Calculation Method", "Census Ct.", "Paid Amount"]
    header2 = ["Group No.", "Group Name", "Billing Period", "Adj. Period", "Invoice Total", "Stoploss Total", "Agent Rate", "Calculation Method", "Census Ct.", "Paid Amount"]
    
    # Test case 2: Headers with slight OCR variations
    header3 = ["Group No.", "Group Name", "Billing Period", "Adj. Period", "Invoice Total", "Stoploss Total", "Agent Rate", "Calculation Method", "Census Ct.", "Paid Amount"]
    header4 = ["Group No.", "Group Name", "Billing Period", "Adj. Period", "Invoice Total", "Stoploss Total", "Agent Rate", "Calculation Method", "Census Ct.", "Paid Amount"]
    
    # Test case 3: Different headers
    header5 = ["Policy Number", "Carrier", "Effective Date", "Premium"]
    
    print("Testing Header Normalization and Similarity")
    print("=" * 60)
    
    # Test header normalization
    print("\n1. Testing header normalization:")
    normalized1 = extractor._normalize_header(header1)
    normalized2 = extractor._normalize_header(header2)
    print(f"Original header 1: {header1}")
    print(f"Normalized header 1: {normalized1}")
    print(f"Original header 2: {header2}")
    print(f"Normalized header 2: {normalized2}")
    
    # Test header similarity
    print("\n2. Testing header similarity:")
    similar_1_2 = extractor._are_headers_extremely_similar(header1, header2)
    similar_2_3 = extractor._are_headers_extremely_similar(header2, header3)
    similar_1_5 = extractor._are_headers_extremely_similar(header1, header5)
    print(f"Header 1 vs Header 2 (with empty string): {similar_1_2}")
    print(f"Header 2 vs Header 3 (identical): {similar_2_3}")
    print(f"Header 1 vs Header 5 (different): {similar_1_5}")
    
    # Test table merging
    print("\n3. Testing table merging:")
    tables = [
        {"header": header1, "rows": [["L241576", "", "BAEZA RAPID DELIVERY", "6/1/2025", "3/1/2025", "($915.96)", "($362.97)", "11.5%", "Premium Equivalent", "-3", "($105.33)"]]},
        {"header": header2, "rows": [["L241577", "ANOTHER COMPANY", "6/1/2025", "3/1/2025", "$1000.00", "$500.00", "10%", "Premium Equivalent", "5", "$100.00"]]},
        {"header": header5, "rows": [["POL123", "CARRIER A", "1/1/2025", "$500.00"]]}
    ]
    
    merged_tables = extractor._normalize_and_merge_similar_headers(tables)
    print(f"Original tables: {len(tables)}")
    print(f"Merged tables: {len(merged_tables)}")
    
    for i, table in enumerate(merged_tables):
        print(f"\nMerged table {i+1}:")
        print(f"Header: {table['header']}")
        print(f"Rows: {len(table['rows'])}")
        if table['rows']:
            print(f"First row: {table['rows'][0]}")
    
    print("\n" + "=" * 60)
    print("Test completed!")

if __name__ == "__main__":
    test_header_normalization() 