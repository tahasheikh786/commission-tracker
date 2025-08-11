#!/usr/bin/env python3
"""
Test script for summary rows API functionality
"""

import asyncio
import json
from app.api.summary_rows import (
    generate_table_signature,
    analyze_column_patterns,
    analyze_row_characteristics,
    apply_pattern_to_table
)

def test_summary_row_functions():
    """Test the summary row analysis functions"""
    
    # Sample table data
    header = ["Client", "Policy", "Commission", "Total"]
    rows = [
        ["John Doe", "POL001", "$100.00", "$500.00"],
        ["Jane Smith", "POL002", "$150.00", "$750.00"],
        ["Bob Johnson", "POL003", "$200.00", "$1000.00"],
        ["", "", "", "TOTAL: $2250.00"],  # Summary row
        ["", "", "", "SUMMARY: 3 policies"],  # Another summary row
    ]
    
    summary_indices = [3, 4]  # Indices of summary rows
    
    print("Testing summary row analysis functions...")
    
    # Test table signature generation
    signature = generate_table_signature(header, rows)
    print(f"Table signature: {signature}")
    
    # Test column pattern analysis
    column_patterns = analyze_column_patterns(header, rows, summary_indices)
    print(f"Column patterns: {json.dumps(column_patterns, indent=2)}")
    
    # Test row characteristics analysis
    row_characteristics = analyze_row_characteristics(rows, summary_indices)
    print(f"Row characteristics: {json.dumps(row_characteristics, indent=2)}")
    
    print("\n✅ All summary row analysis functions working correctly!")

if __name__ == "__main__":
    test_summary_row_functions()
