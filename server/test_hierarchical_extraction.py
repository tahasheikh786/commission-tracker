#!/usr/bin/env python3
"""
Test script for hierarchical extraction service
Demonstrates how the system handles commission statements with company names in headers
"""

import sys
import os
import logging
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Enable debug logging
logging.basicConfig(level=logging.DEBUG, format='%(levelname)s: %(message)s')

from app.services.hierarchical_extraction_service import HierarchicalExtractionService

def create_sample_hierarchical_data():
    """Create sample hierarchical commission statement data for testing."""
    return {
        "headers": [
            "Bill Eff Date", "Billed Premium", "Paid Premium", "Method", 
            "Rate", "Split %", "Comp Typ", "Bus Type", "Billed Fee Amount", 
            "Customer Paid Fee", "Paid Amount"
        ],
        "rows": [
            # Section header
            ["New Business", "", "", "", "", "", "", "", "", "", ""],
            # Customer block 1
            ["Customer: 1653402", "", "", "", "", "", "", "", "", "", ""],
            ["Customer Name: B & B Lightning Protection", "", "", "", "", "", "", "", "", "", ""],
            ["01/15/2024", "$5,000.00", "$5,000.00", "Check", "10.00", "100", "Comm", "New", "$0.00", "$0.00", "$500.00"],
            ["02/15/2024", "$5,000.00", "$5,000.00", "Check", "10.00", "100", "Comm", "New", "$0.00", "$0.00", "$500.00"],
            ["Sub-total", "", "", "", "", "", "", "", "", "", "$1,000.00"],
            # Customer block 2
            ["Customer: 1674097", "", "", "", "", "", "", "", "", "", ""],
            ["Customer Name: MAMMOTH DELIVERY LLC", "", "", "", "", "", "", "", "", "", ""],
            ["01/20/2024", "$3,000.00", "$3,000.00", "Check", "15.00", "100", "Comm", "New", "$0.00", "$0.00", "$450.00"],
            ["02/20/2024", "$1,500.00", "$1,500.00", "Check", "15.00", "100", "Comm", "New", "$0.00", "$0.00", "$225.00"],
            ["Sub-total", "", "", "", "", "", "", "", "", "", "$675.00"],
            # Section header
            ["Renewal", "", "", "", "", "", "", "", "", "", ""],
            # Customer block 3
            ["Customer: 1475161", "", "", "", "", "", "", "", "", "", ""],
            ["Customer Name: ALPHA ONE LOGISTICS LLC", "", "", "", "", "", "", "", "", "", ""],
            ["01/10/2024", "$2,000.00", "$2,000.00", "Check", "20.00", "100", "Comm", "Renewal", "$0.00", "$0.00", "$400.00"],
            ["Sub-total", "", "", "", "", "", "", "", "", "", "$400.00"],
            # Customer block 4
            ["Customer: 1536824", "", "", "", "", "", "", "", "", "", ""],
            ["Customer Name: Go Go Logistics", "", "", "", "", "", "", "", "", "", ""],
            ["01/25/2024", "$1,500.00", "$1,500.00", "Check", "15.00", "100", "Comm", "Renewal", "$0.00", "$0.00", "$225.00"],
            ["02/25/2024", "$1,500.00", "$1,500.00", "Check", "15.00", "100", "Comm", "Renewal", "$0.00", "$0.00", "$225.00"],
            ["Sub-total", "", "", "", "", "", "", "", "", "", "$450.00"],
        ]
    }

def test_hierarchical_extraction():
    """Test the hierarchical extraction service."""
    print("🧪 Testing Hierarchical Extraction Service")
    print("=" * 50)
    
    # Initialize the service
    service = HierarchicalExtractionService()
    
    # Create sample data
    sample_data = create_sample_hierarchical_data()
    print(f"📊 Sample data created with {len(sample_data['rows'])} rows")
    
    # Test hierarchical table detection
    is_hierarchical = service._is_hierarchical_table(sample_data)
    print(f"🔍 Hierarchical table detection: {'✅ YES' if is_hierarchical else '❌ NO'}")
    
    if not is_hierarchical:
        print("❌ Expected hierarchical table but detection failed")
        return
    
    # Process the hierarchical statement
    print("\n🔄 Processing hierarchical statement...")
    result = service.process_hierarchical_statement(sample_data)
    
    # Display results
    print(f"\n📈 Extraction Results:")
    print(f"   Structure Type: {result['structure_type']}")
    print(f"   Customer Blocks Found: {len(result['customer_blocks'])}")
    print(f"   Total Commission: ${result['extraction_summary']['total_commission']:.2f}")
    
    print(f"\n👥 Customer Details:")
    for i, block in enumerate(result['customer_blocks'], 1):
        print(f"   {i}. {block.customer_name} (ID: {block.customer_id})")
        print(f"      Section: {block.section_type}")
        print(f"      Commission: ${block.subtotal:.2f}")
        print(f"      Transactions: {len(block.transactions)}")
        print()
    
    # Test conversion to standard format
    print("🔄 Converting to standard format...")
    standard_rows = service.convert_to_standard_format(result)
    
    print(f"\n📋 Standard Format Output:")
    print("Company Name | Commission Earned | Invoice Total | Customer ID | Section Type")
    print("-" * 80)
    for row in standard_rows:
        print(f"{row['Company Name']:<25} | {row['Commission Earned']:<15} | {row['Invoice Total']:<12} | {row['Customer ID']:<10} | {row['Section Type']}")
    
    print(f"\n✅ Hierarchical extraction test completed successfully!")

def test_edge_cases():
    """Test edge cases and error handling."""
    print("\n🧪 Testing Edge Cases")
    print("=" * 30)
    
    service = HierarchicalExtractionService()
    
    # Test empty data
    empty_data = {"headers": [], "rows": []}
    result = service.process_hierarchical_statement(empty_data)
    print(f"📭 Empty data handling: {'✅ OK' if result['customer_blocks'] == [] else '❌ FAILED'}")
    
    # Test malformed data
    malformed_data = {"headers": ["Col1"], "rows": [["data"]]}
    result = service.process_hierarchical_statement(malformed_data)
    print(f"🔧 Malformed data handling: {'✅ OK' if result['structure_type'] == 'hierarchical' else '❌ FAILED'}")
    
    # Test non-hierarchical data
    standard_data = {
        "headers": ["Company Name", "Commission Earned", "Invoice Total"],
        "rows": [
            ["Company A", "$100.00", "$1,000.00"],
            ["Company B", "$200.00", "$2,000.00"]
        ]
    }
    is_hierarchical = service._is_hierarchical_table(standard_data)
    print(f"📊 Standard table detection: {'✅ OK' if not is_hierarchical else '❌ FAILED'}")

if __name__ == "__main__":
    print("🚀 Starting Hierarchical Extraction Tests")
    print("=" * 60)
    
    try:
        test_hierarchical_extraction()
        test_edge_cases()
        print("\n🎉 All tests completed successfully!")
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
