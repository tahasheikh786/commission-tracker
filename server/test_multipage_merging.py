#!/usr/bin/env python3
"""
Comprehensive test script for multipage table merging logic covering real-world scenarios.
"""

import asyncio
import json
from app.new_extraction_services.core.multipage_handler import MultiPageTableHandler, PageTable
from app.new_extraction_services.utils.config import Config

async def test_scenario_1_header_only_on_first_page():
    """Test Scenario 1: Multipage table with header only on first page."""
    print("\n" + "="*80)
    print("SCENARIO 1: Multipage table with header only on first page")
    print("="*80)
    
    # This simulates a commission statement where the header appears only on page 1
    # and subsequent pages have data rows as "headers"
    scenario_1_data = [
        # Page 1 - Has proper headers
        {
            "page_number": 1,
            "headers": [
                "Billing Group",
                "Group ID", 
                "Group State",
                "Premium",
                "Current Month Subscribers",
                "Prior Month(s)",
                "Subscriber Adjustments", 
                "Total Subscribers",
                "Rate",
                "Commission Due"
            ],
            "rows": [
                ["Ace Logistics and Transport LLC", "UT548468", "TX", "$6,654.37", "21", "-2", "19", "$85.00/subscriber", "$1,615.00", ""],
                ["Apcore Logistics LLC", "UT394959", "WA", "$8,198.66", "21", "-1", "20", "$45.00/subscriber", "$900.00", ""],
                ["Baxter Logistics", "UT104325", "MS", "$6,257.04", "18", "-1", "17", "$90.00/subscriber", "$1,530.00", ""],
                ["Bell Business Development, LLC", "UT256921", "PA", "$5,753.02", "12", "2", "14", "$35.00/subscriber", "$490.00", ""],
                ["BH Hoover LLC", "UT168971", "AL", "$2,907.45", "5", "0", "5", "$45.00/subscriber", "$225.00", ""]
            ]
        },
        # Page 2 - "Headers" are actually data rows (continuation)
        {
            "page_number": 2,
            "headers": [
                "Bulldog Logistics",
                "UT603353", 
                "OK",
                "$11,175.03",
                "29",
                "-2", 
                "27",
                "$45.00/subscriber",
                "$1,215.00",
                ""
            ],
            "rows": [
                ["Butterdrive LLC", "UT408400", "CT", "$4,672.17", "9", "0", "9", "$45.00/subscriber", "$405.00", ""],
                ["Dicey Logistics Service LLC", "UT972195", "OH", "$6,595.26", "14", "0", "14", "$65.00/subscriber", "$910.00", ""],
                ["Doorstep Delivery Logistics LLC", "UT308959", "NJ", "$6,135.24", "14", "2", "16", "$45.00/subscriber", "$720.00", ""],
                ["Drop Off Logistics LLC", "UT999704", "NC", "$6,818.23", "15", "0", "15", "$45.00/subscriber", "$675.00", ""],
                ["Dubolyu Logistics Inc", "UT250694", "GA", "$5,880.16", "15", "0", "15", "$45.00/subscriber", "$675.00", ""]
            ]
        },
        # Page 3 - "Headers" are actually data rows (continuation)
        {
            "page_number": 3,
            "headers": [
                "EAGLES LOGISTICS",
                "UT897081", 
                "PA",
                "$6,055.59",
                "16",
                "-2", 
                "14",
                "$45.00/subscriber",
                "$630.00",
                ""
            ],
            "rows": [
                ["GetYourStuff LLC", "UT737806", "MO", "$9,255.74", "20", "1", "21", "$45.00/subscriber", "$945.00", ""],
                ["Global Kingdom Work LLC", "UT402742", "GA", "$11,007.29", "18", "3", "21", "$45.00/subscriber", "$945.00", ""],
                ["House2Home Deliveries LLC", "UT221117", "GA", "$15,396.36", "27", "0", "27", "$45.00/subscriber", "$1,215.00", ""],
                ["Influx Interactive Technology LLC", "UT639701", "TX", "$1,801.05", "2", "0", "2", "$35.00/subscriber", "$70.00", ""]
            ]
        }
    ]
    
    return await test_multipage_scenario(scenario_1_data, "Header only on first page")

async def test_scenario_2_header_repeating_on_each_page():
    """Test Scenario 2: Multipage table with header repeating on each page."""
    print("\n" + "="*80)
    print("SCENARIO 2: Multipage table with header repeating on each page")
    print("="*80)
    
    # This simulates a different commission statement where headers repeat on each page
    scenario_2_data = [
        # Page 1 - Has headers
        {
            "page_number": 1,
            "headers": [
                "Company Name",
                "Account Number", 
                "State",
                "Monthly Premium",
                "Active Members",
                "New Members",
                "Total Members",
                "Commission Rate",
                "Commission Amount"
            ],
            "rows": [
                ["Alpha Insurance Co", "ACC001", "CA", "$12,500.00", "45", "3", "48", "15%", "$1,875.00"],
                ["Beta Health Group", "ACC002", "NY", "$8,750.00", "32", "1", "33", "12%", "$1,050.00"],
                ["Gamma Medical LLC", "ACC003", "TX", "$15,200.00", "58", "5", "63", "18%", "$2,736.00"],
                ["Delta Care Inc", "ACC004", "FL", "$9,300.00", "28", "2", "30", "14%", "$1,302.00"],
                ["Epsilon Benefits", "ACC005", "IL", "$11,800.00", "42", "4", "46", "16%", "$1,888.00"]
            ]
        },
        # Page 2 - Same headers repeated
        {
            "page_number": 2,
            "headers": [
                "Company Name",
                "Account Number", 
                "State",
                "Monthly Premium",
                "Active Members",
                "New Members",
                "Total Members",
                "Commission Rate",
                "Commission Amount"
            ],
            "rows": [
                ["Zeta Insurance", "ACC006", "WA", "$7,900.00", "25", "1", "26", "13%", "$1,027.00"],
                ["Eta Health Solutions", "ACC007", "CO", "$13,400.00", "48", "3", "51", "17%", "$2,278.00"],
                ["Theta Medical Group", "ACC008", "AZ", "$10,600.00", "38", "2", "40", "15%", "$1,590.00"],
                ["Iota Care Partners", "ACC009", "NC", "$8,200.00", "29", "1", "30", "12%", "$984.00"],
                ["Kappa Benefits Co", "ACC010", "GA", "$14,100.00", "52", "4", "56", "16%", "$2,256.00"]
            ]
        },
        # Page 3 - Same headers repeated
        {
            "page_number": 3,
            "headers": [
                "Company Name",
                "Account Number", 
                "State",
                "Monthly Premium",
                "Active Members",
                "New Members",
                "Total Members",
                "Commission Rate",
                "Commission Amount"
            ],
            "rows": [
                ["Lambda Insurance", "ACC011", "MI", "$9,800.00", "35", "2", "37", "14%", "$1,372.00"],
                ["Mu Health Systems", "ACC012", "OH", "$12,300.00", "44", "3", "47", "15%", "$1,845.00"],
                ["Nu Medical LLC", "ACC013", "PA", "$11,500.00", "41", "2", "43", "16%", "$1,840.00"]
            ]
        }
    ]
    
    return await test_multipage_scenario(scenario_2_data, "Header repeating on each page")

async def test_scenario_3_multiple_different_tables():
    """Test Scenario 3: Multipage file with multiple different tables."""
    print("\n" + "="*80)
    print("SCENARIO 3: Multipage file with multiple different tables")
    print("="*80)
    
    # This simulates a complex document with different tables on different pages
    scenario_3_data = [
        # Page 1 - Commission Summary Table
        {
            "page_number": 1,
            "headers": [
                "Agent Name",
                "Total Policies", 
                "Total Premium",
                "Commission Rate",
                "Commission Earned"
            ],
            "rows": [
                ["John Smith", "125", "$45,000.00", "12%", "$5,400.00"],
                ["Jane Doe", "89", "$32,500.00", "15%", "$4,875.00"],
                ["Mike Johnson", "156", "$58,200.00", "10%", "$5,820.00"],
                ["Sarah Wilson", "67", "$24,800.00", "14%", "$3,472.00"]
            ]
        },
        # Page 2 - Policy Details Table (different structure)
        {
            "page_number": 2,
            "headers": [
                "Policy Number",
                "Customer Name", 
                "Policy Type",
                "Start Date",
                "End Date",
                "Premium Amount",
                "Status"
            ],
            "rows": [
                ["POL001", "Robert Brown", "Auto", "2024-01-15", "2025-01-15", "$1,200.00", "Active"],
                ["POL002", "Lisa Davis", "Home", "2024-02-01", "2025-02-01", "$850.00", "Active"],
                ["POL003", "David Miller", "Life", "2024-01-30", "2024-12-30", "$2,400.00", "Active"],
                ["POL004", "Emily Garcia", "Auto", "2024-03-10", "2025-03-10", "$1,350.00", "Active"],
                ["POL005", "James Rodriguez", "Business", "2024-02-15", "2025-02-15", "$3,600.00", "Active"]
            ]
        },
        # Page 3 - Commission Summary Table (continuation of page 1)
        {
            "page_number": 3,
            "headers": [
                "Agent Name",
                "Total Policies", 
                "Total Premium",
                "Commission Rate",
                "Commission Earned"
            ],
            "rows": [
                ["Tom Anderson", "92", "$28,900.00", "13%", "$3,757.00"],
                ["Amy Taylor", "134", "$41,200.00", "11%", "$4,532.00"],
                ["Chris Martinez", "78", "$29,500.00", "16%", "$4,720.00"],
                ["Rachel Lee", "103", "$35,800.00", "12%", "$4,296.00"]
            ]
        },
        # Page 4 - Claims Summary Table (completely different)
        {
            "page_number": 4,
            "headers": [
                "Claim ID",
                "Policy Number", 
                "Claim Date",
                "Claim Amount",
                "Settlement Amount",
                "Status",
                "Adjuster"
            ],
            "rows": [
                ["CLM001", "POL001", "2024-03-15", "$5,000.00", "$4,200.00", "Settled", "Mark Wilson"],
                ["CLM002", "POL003", "2024-02-28", "$12,000.00", "$10,500.00", "Settled", "Lisa Chen"],
                ["CLM003", "POL005", "2024-04-01", "$8,500.00", "$0.00", "Denied", "John Davis"],
                ["CLM004", "POL002", "2024-03-22", "$3,200.00", "$2,800.00", "Settled", "Sarah Johnson"]
            ]
        }
    ]
    
    return await test_multipage_scenario(scenario_3_data, "Multiple different tables")

async def test_multipage_scenario(scenario_data, scenario_name):
    """Test a specific multipage scenario."""
    
    # Initialize the multipage handler
    config = Config()
    handler = MultiPageTableHandler(config)
    
    print(f"🔍 Testing {scenario_name}...")
    print(f"📊 Input: {len(scenario_data)} pages")
    
    # Convert to PageTable objects
    all_page_tables = []
    for page_data in scenario_data:
        page_table = PageTable(
            page_number=page_data['page_number'],
            table_data={
                'headers': page_data['headers'],
                'rows': page_data['rows'],
                'page_number': page_data['page_number'],
                'bbox': [0, 0, 0, 0],
                'confidence': 1.0
            },
            headers=page_data['headers'],
            bbox=[0, 0, 0, 0],
            confidence=1.0
        )
        all_page_tables.append(page_table)
        print(f"   Page {page_data['page_number']}: {len(page_data['headers'])} headers, {len(page_data['rows'])} rows")
        print(f"      Headers: {page_data['headers'][:3]}...")
    
    # Test finding continuation groups
    print(f"\n🔍 Testing continuation group detection for {scenario_name}...")
    continuation_groups = await handler._find_continuation_groups(all_page_tables)
    print(f"   Found {len(continuation_groups)} continuation groups")
    
    for i, group in enumerate(continuation_groups):
        print(f"   Group {i}: {len(group)} tables from pages {[pt.page_number for pt in group]}")
        for j, table in enumerate(group):
            print(f"      Table {j}: page {table.page_number}, {len(table.headers)} headers")
            if j == 0:
                print(f"         Sample headers: {table.headers[:3]}...")
    
    # Test full multipage linking
    print(f"\n🔍 Testing full multipage linking for {scenario_name}...")
    # Group tables by page
    page_tables_dict = {}
    for table in all_page_tables:
        page_num = table.page_number
        if page_num not in page_tables_dict:
            page_tables_dict[page_num] = []
        page_tables_dict[page_num].append(table.table_data)
    
    # Convert to list format expected by multipage handler
    max_page = max(page_tables_dict.keys()) if page_tables_dict else 0
    page_tables_list = [page_tables_dict.get(i, []) for i in range(1, max_page + 1)]
    
    linked_tables = await handler.link_multipage_tables(page_tables_list)
    print(f"   Result: {len(linked_tables)} tables")
    
    for i, table in enumerate(linked_tables):
        print(f"   Table {i}: {len(table.get('headers', []))} headers, {len(table.get('rows', []))} rows")
        if 'multipage_info' in table:
            print(f"      Multipage info: {table['multipage_info']}")
        print(f"      Sample headers: {table.get('headers', [])[:3]}...")
        print(f"      Sample rows: {table.get('rows', [])[:2] if table.get('rows') else []}")
    
    return {
        'scenario': scenario_name,
        'input_pages': len(scenario_data),
        'continuation_groups': len(continuation_groups),
        'output_tables': len(linked_tables),
        'linked_tables': linked_tables
    }

async def run_comprehensive_test():
    """Run all three scenarios and provide summary."""
    print("🧪 COMPREHENSIVE MULTIPAGE TABLE MERGING TEST")
    print("="*80)
    
    results = []
    
    # Test all three scenarios
    results.append(await test_scenario_1_header_only_on_first_page())
    results.append(await test_scenario_2_header_repeating_on_each_page())
    results.append(await test_scenario_3_multiple_different_tables())
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY OF RESULTS")
    print("="*80)
    
    for result in results:
        print(f"\n📊 {result['scenario']}:")
        print(f"   Input: {result['input_pages']} pages")
        print(f"   Continuation groups detected: {result['continuation_groups']}")
        print(f"   Output tables: {result['output_tables']}")
        
        # Validate results based on scenario
        if "Header only on first page" in result['scenario']:
            expected_tables = 1
            if result['output_tables'] == expected_tables:
                print(f"   ✅ PASS: Correctly merged into {expected_tables} table")
            else:
                print(f"   ❌ FAIL: Expected {expected_tables} table, got {result['output_tables']}")
                
        elif "Header repeating on each page" in result['scenario']:
            expected_tables = 1
            if result['output_tables'] == expected_tables:
                print(f"   ✅ PASS: Correctly merged into {expected_tables} table")
            else:
                print(f"   ❌ FAIL: Expected {expected_tables} table, got {result['output_tables']}")
                
        elif "Multiple different tables" in result['scenario']:
            expected_tables = 3  # Should detect 3 different tables
            if result['output_tables'] == expected_tables:
                print(f"   ✅ PASS: Correctly identified {expected_tables} different tables")
            else:
                print(f"   ❌ FAIL: Expected {expected_tables} tables, got {result['output_tables']}")
    
    print("\n✅ Comprehensive test completed!")

if __name__ == "__main__":
    asyncio.run(run_comprehensive_test())
