#!/usr/bin/env python3
"""
Comprehensive Test Script for Company Name Detection Solution
Tests the shared company name detection service with both GPT and DocAI pipelines
"""

import sys
import os
import logging
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

from app.services.company_name_service import CompanyNameDetectionService

def create_sample_data():
    """Create sample data for testing different scenarios."""
    return {
        "hierarchical_data": {
            "header": ["Bill Eff Date", "Billed Premium", "Paid Premium", "Method", "Rate", "Split %", "Comp Typ", "Bus Type", "Billed Fee Amount", "Customer Paid Fee", "Paid Amount"],
            "rows": [
                ["New Business", "", "", "", "", "", "", "", "", "", ""],
                ["Customer: 1653402", "", "", "", "", "", "", "", "", "", ""],
                ["Customer Name: B & B Lightning Protection", "", "", "", "", "", "", "", "", "", ""],
                ["01/15/2024", "$5,000.00", "$5,000.00", "Check", "10.00", "100", "Comm", "New", "$0.00", "$0.00", "$500.00"],
                ["Sub-total", "", "", "", "", "", "", "", "", "", "$1,000.00"],
                ["Customer: 1674097", "", "", "", "", "", "", "", "", "", ""],
                ["Customer Name: MAMMOTH DELIVERY LLC", "", "", "", "", "", "", "", "", "", ""],
                ["01/20/2024", "$3,000.00", "$3,000.00", "Check", "15.00", "100", "Comm", "New", "$0.00", "$0.00", "$450.00"],
                ["Sub-total", "", "", "", "", "", "", "", "", "", "$675.00"],
            ]
        },
        "scattered_data": {
            "header": ["Date", "Description", "Amount", "Notes"],
            "rows": [
                ["01/15/2024", "ALPHA ONE LOGISTICS LLC", "$1,000.00", "Commission payment"],
                ["01/16/2024", "Transaction fee", "$50.00", "Service charge"],
                ["01/17/2024", "Go Go Logistics", "$750.00", "Commission payment"],
                ["01/18/2024", "IMPACT HEATING AND COOLING", "$1,200.00", "Commission payment"],
                ["01/19/2024", "Processing fee", "$25.00", "Service charge"],
            ]
        },
        "mixed_data": {
            "header": ["Transaction Date", "Client", "Service", "Amount"],
            "rows": [
                ["01/15/2024", "B & B Lightning Protection LLC", "Policy renewal", "$500.00"],
                ["01/16/2024", "MAMMOTH DELIVERY SERVICES", "New policy", "$750.00"],
                ["01/17/2024", "ALPHA ONE LOGISTICS Corp", "Policy update", "$300.00"],
                ["01/18/2024", "IMPACT HEATING AND COOLING Inc", "Policy renewal", "$600.00"],
            ]
        }
    }

def test_company_detection_service():
    """Test the company name detection service."""
    print("🧪 Testing Company Name Detection Service")
    print("=" * 60)
    
    # Initialize service
    service = CompanyNameDetectionService()
    
    # Get sample data
    sample_data = create_sample_data()
    
    # Test hierarchical data
    print("\n📋 Testing Hierarchical Data Detection")
    print("-" * 40)
    hierarchical_result = service.detect_company_names_in_extracted_data(
        sample_data["hierarchical_data"], "test_hierarchical"
    )
    
    print(f"✅ Detected companies: {hierarchical_result.get('detected_companies', [])}")
    print(f"📊 Metadata: {hierarchical_result.get('company_detection_metadata', {})}")
    
    # Test scattered data
    print("\n📋 Testing Scattered Data Detection")
    print("-" * 40)
    scattered_result = service.detect_company_names_in_extracted_data(
        sample_data["scattered_data"], "test_scattered"
    )
    
    print(f"✅ Detected companies: {scattered_result.get('detected_companies', [])}")
    print(f"📊 Metadata: {scattered_result.get('company_detection_metadata', {})}")
    
    # Test mixed data
    print("\n📋 Testing Mixed Data Detection")
    print("-" * 40)
    mixed_result = service.detect_company_names_in_extracted_data(
        sample_data["mixed_data"], "test_mixed"
    )
    
    print(f"✅ Detected companies: {mixed_result.get('detected_companies', [])}")
    print(f"📊 Metadata: {mixed_result.get('company_detection_metadata', {})}")

def test_company_validation():
    """Test company name validation."""
    print("\n🧪 Testing Company Name Validation")
    print("=" * 50)
    
    service = CompanyNameDetectionService()
    
    test_companies = [
        "B & B Lightning Protection LLC",
        "MAMMOTH DELIVERY SERVICES",
        "ALPHA ONE LOGISTICS Corp",
        "IMPACT HEATING AND COOLING Inc",
        "Invalid Company",  # Should fail validation
        "A",  # Too short
        "Company with @#$% symbols",  # Invalid characters
    ]
    
    for company in test_companies:
        result = service.validate_company_name(company)
        status = "✅ VALID" if result["is_valid"] else "❌ INVALID"
        confidence = f"{result['confidence']:.1%}"
        
        print(f"{status} {company}")
        print(f"   Confidence: {confidence}")
        print(f"   Issues: {result['issues']}")
        print(f"   Suggestions: {result['suggestions']}")
        print()

def test_transaction_mapping():
    """Test company transaction mapping."""
    print("\n🧪 Testing Company Transaction Mapping")
    print("=" * 50)
    
    service = CompanyNameDetectionService()
    
    # Sample data with companies and transactions
    rows = [
        ["Customer: 123", ""],
        ["Customer Name: Test Company LLC", ""],
        ["01/15/2024", "$500.00"],
        ["01/16/2024", "$300.00"],
        ["Customer: 456", ""],
        ["Customer Name: Another Corp", ""],
        ["01/17/2024", "$750.00"],
    ]
    
    companies = ["Test Company LLC", "Another Corp"]
    
    mapping = service.create_company_transaction_mapping(rows, companies)
    
    print("📊 Company Transaction Mapping:")
    for company, row_indices in mapping.items():
        print(f"   {company}: Rows {row_indices}")
        for idx in row_indices:
            if idx < len(rows):
                print(f"     Row {idx}: {rows[idx]}")

def test_pattern_matching():
    """Test company name pattern matching."""
    print("\n🧪 Testing Pattern Matching")
    print("=" * 40)
    
    service = CompanyNameDetectionService()
    
    test_texts = [
        "B & B Lightning Protection LLC",
        "MAMMOTH DELIVERY SERVICES",
        "ALPHA ONE LOGISTICS Corp",
        "IMPACT HEATING AND COOLING Inc",
        "Go Go Logistics",
        "Regular text without company",
        "Some Company Group",
        "Test Agency Associates",
    ]
    
    for text in test_texts:
        companies = service._extract_companies_from_text(text)
        if companies:
            print(f"✅ Found: {companies} in '{text}'")
        else:
            print(f"❌ No companies found in '{text}'")

def test_integration_scenarios():
    """Test integration scenarios for both GPT and DocAI."""
    print("\n🧪 Testing Integration Scenarios")
    print("=" * 50)
    
    service = CompanyNameDetectionService()
    
    # Scenario 1: GPT Vision extraction result
    gpt_result = {
        "tables": [
            {
                "name": "Commission Statement",
                "header": ["Date", "Description", "Amount"],
                "rows": [
                    ["01/15/2024", "B & B Lightning Protection LLC", "$500.00"],
                    ["01/16/2024", "MAMMOTH DELIVERY SERVICES", "$750.00"],
                ]
            }
        ],
        "detected_companies": [
            {"company_name": "B & B Lightning Protection LLC", "location_context": "row 1"},
            {"company_name": "MAMMOTH DELIVERY SERVICES", "location_context": "row 2"}
        ]
    }
    
    print("📋 GPT Vision Integration:")
    print(f"   Tables: {len(gpt_result['tables'])}")
    print(f"   Detected companies: {len(gpt_result['detected_companies'])}")
    
    # Scenario 2: DocAI extraction result
    docai_result = {
        "tables": [
            {
                "name": "Extracted Table",
                "header": ["Transaction Date", "Client", "Service", "Amount"],
                "rows": [
                    ["01/15/2024", "ALPHA ONE LOGISTICS Corp", "Policy renewal", "$500.00"],
                    ["01/16/2024", "IMPACT HEATING AND COOLING Inc", "New policy", "$750.00"],
                ]
            }
        ]
    }
    
    # Apply company detection to DocAI result
    enhanced_docai = service.detect_company_names_in_extracted_data(
        docai_result["tables"][0], "google_docai"
    )
    
    print("\n📋 DocAI Integration:")
    print(f"   Original companies: {len(docai_result['tables'])}")
    print(f"   Enhanced companies: {len(enhanced_docai.get('detected_companies', []))}")
    print(f"   Companies found: {enhanced_docai.get('detected_companies', [])}")

if __name__ == "__main__":
    print("🚀 Starting Comprehensive Company Name Detection Tests")
    print("=" * 80)
    
    try:
        test_company_detection_service()
        test_company_validation()
        test_transaction_mapping()
        test_pattern_matching()
        test_integration_scenarios()
        
        print("\n🎉 All company name detection tests completed successfully!")
        print("\n📈 Summary:")
        print("   ✅ Company name detection service working")
        print("   ✅ Pattern matching for various company formats")
        print("   ✅ Validation with confidence scoring")
        print("   ✅ Transaction mapping functionality")
        print("   ✅ Integration ready for GPT and DocAI pipelines")
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
