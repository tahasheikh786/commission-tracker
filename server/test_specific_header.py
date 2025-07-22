#!/usr/bin/env python3
"""
Specific test for the exact header row from the user's document
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.advanced_table_extractor_simple import AdvancedTableExtractor
import re

def test_specific_header():
    """Test with the exact header from the user's document"""
    extractor = AdvancedTableExtractor()
    
    # The exact header row from the user's document
    header_row = ["Group No.", "Group Name", "Billing Period", "Adj. Period", "Invoice Total", "Stoploss Total", "Agent Rate", "Calculation Method", "Census Ct.", "Paid Amount"]
    
    print("Testing Specific Header Detection")
    print("=" * 50)
    print(f"Header row: {header_row}")
    print()
    
    # Test each cell individually
    print("Testing each header cell:")
    for i, cell in enumerate(header_row):
        cell_lower = cell.lower().strip()
        print(f"Cell {i}: '{cell}' -> '{cell_lower}'")
        
        # Test against the exact patterns
        exact_patterns = [
            r'^group\s+no\.?$',
            r'^group\s+name$',
            r'^billing\s+period$',
            r'^adj\.?\s+period$',
            r'^invoice\s+total$',
            r'^stoploss\s+total$',
            r'^agent\s+rate$',
            r'^calculation\s+method$',
            r'^census\s+ct\.?$',
            r'^paid\s+amount$'
        ]
        
        matched = False
        for j, pattern in enumerate(exact_patterns):
            if re.match(pattern, cell_lower, re.IGNORECASE):
                print(f"  ✓ Matches pattern {j}: {pattern}")
                matched = True
                break
        
        if not matched:
            print(f"  ✗ No exact pattern match")
    
    print()
    
    # Test the full header detection
    print("Testing full header detection:")
    is_header = extractor.is_likely_header(header_row)
    is_data = extractor._is_data_row(header_row)
    header_score = extractor._calculate_comprehensive_header_score(header_row, 0)
    pattern_score = extractor._calculate_header_pattern_score(header_row)
    numeric_ratio = extractor._calculate_numeric_ratio(header_row)
    keyword_score = extractor._calculate_keyword_score(header_row)
    
    print(f"Is likely header: {is_header}")
    print(f"Is data row: {is_data}")
    print(f"Header score: {header_score:.3f}")
    print(f"Pattern score: {pattern_score:.3f}")
    print(f"Numeric ratio: {numeric_ratio:.3f}")
    print(f"Keyword score: {keyword_score:.3f}")
    
    # Test the individual methods
    print()
    print("Testing individual detection methods:")
    print(f"_is_data_row: {extractor._is_data_row(header_row)}")
    print(f"_is_summary_row: {extractor._is_summary_row(header_row)}")
    print(f"_calculate_header_pattern_score: {extractor._calculate_header_pattern_score(header_row):.3f}")
    print(f"_calculate_numeric_ratio: {extractor._calculate_numeric_ratio(header_row):.3f}")
    print(f"_calculate_keyword_score: {extractor._calculate_keyword_score(header_row):.3f}")
    print(f"_calculate_structure_score: {extractor._calculate_structure_score(header_row):.3f}")

if __name__ == "__main__":
    test_specific_header() 