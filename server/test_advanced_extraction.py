#!/usr/bin/env python3
"""
Test script for Advanced Table Extraction System
Demonstrates different configurations and use cases
"""

import os
import sys
import tempfile
import json
from pathlib import Path

# Add the app directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from services.advanced_table_extractor import AdvancedTableExtractor
from services.quality_assessor import CommissionStatementValidator
from services.extraction_config import get_config, CONFIGURATIONS

def create_sample_pdf():
    """
    Create a sample PDF for testing (placeholder)
    In real usage, you would use actual commission statement PDFs
    """
    print("⚠️  Note: This is a placeholder. Use actual commission statement PDFs for testing.")
    return None

def test_basic_extraction():
    """Test basic extraction functionality"""
    print("\n🧪 Testing Basic Extraction...")
    
    extractor = AdvancedTableExtractor()
    validator = CommissionStatementValidator()
    
    # Test with sample data (in real usage, use actual PDF)
    sample_tables = [
        {
            "header": ["Policy Number", "Carrier", "Premium", "Commission Rate"],
            "rows": [
                ["POL001", "ABC Insurance", "$1,250.00", "15%"],
                ["POL002", "XYZ Insurance", "$2,100.00", "12%"],
                ["POL003", "DEF Insurance", "$850.00", "18%"]
            ],
            "metadata": {"page_number": 1, "confidence": 0.9}
        }
    ]
    
    # Validate the sample table
    for i, table in enumerate(sample_tables):
        print(f"  Validating table {i+1}...")
        validation_result = validator.validate_table(table)
        
        print(f"    Overall Score: {validation_result.quality_metrics.overall_score:.2f}")
        print(f"    Confidence: {validation_result.quality_metrics.confidence_level}")
        print(f"    Is Valid: {validation_result.is_valid}")
        
        if validation_result.quality_metrics.issues:
            print(f"    Issues: {validation_result.quality_metrics.issues}")
    
    print("✅ Basic extraction test completed")

def test_configurations():
    """Test different extraction configurations"""
    print("\n⚙️  Testing Configurations...")
    
    for config_name, config in CONFIGURATIONS.items():
        print(f"\n  Configuration: {config_name}")
        print(f"    DPI: {config.dpi}")
        print(f"    Header Similarity Threshold: {config.header_similarity_threshold}")
        print(f"    Min Quality Score: {config.min_quality_score}")
        print(f"    Description: {get_config_description(config_name)}")

def test_quality_assessment():
    """Test quality assessment with different scenarios"""
    print("\n📊 Testing Quality Assessment...")
    
    validator = CommissionStatementValidator()
    
    # Test scenarios
    test_cases = [
        {
            "name": "Perfect Table",
            "table": {
                "header": ["Policy", "Carrier", "Premium", "Commission"],
                "rows": [
                    ["POL001", "ABC Ins", "$1000.00", "15%"],
                    ["POL002", "XYZ Ins", "$2000.00", "12%"]
                ]
            }
        },
        {
            "name": "Table with Missing Data",
            "table": {
                "header": ["Policy", "Carrier", "Premium", "Commission"],
                "rows": [
                    ["POL001", "", "$1000.00", "15%"],
                    ["", "XYZ Ins", "", "12%"]
                ]
            }
        },
        {
            "name": "Table with Format Issues",
            "table": {
                "header": ["Policy", "Carrier", "Premium", "Commission"],
                "rows": [
                    ["POL001", "ABC Ins", "1000", "15"],
                    ["POL002", "XYZ Ins", "2000 dollars", "12 percent"]
                ]
            }
        }
    ]
    
    for test_case in test_cases:
        print(f"\n  Testing: {test_case['name']}")
        validation_result = validator.validate_table(test_case['table'])
        
        metrics = validation_result.quality_metrics
        print(f"    Overall Score: {metrics.overall_score:.2f}")
        print(f"    Completeness: {metrics.completeness:.2f}")
        print(f"    Consistency: {metrics.consistency:.2f}")
        print(f"    Accuracy: {metrics.accuracy:.2f}")
        print(f"    Structure Quality: {metrics.structure_quality:.2f}")
        print(f"    Data Quality: {metrics.data_quality:.2f}")
        print(f"    Confidence: {metrics.confidence_level}")
        
        if metrics.issues:
            print(f"    Issues: {metrics.issues}")
        if metrics.recommendations:
            print(f"    Recommendations: {metrics.recommendations}")

def test_header_similarity():
    """Test header similarity detection"""
    print("\n🔍 Testing Header Similarity...")
    
    extractor = AdvancedTableExtractor()
    
    # Test header pairs
    header_pairs = [
        {
            "name": "Identical Headers",
            "h1": ["Policy", "Carrier", "Premium", "Commission"],
            "h2": ["Policy", "Carrier", "Premium", "Commission"]
        },
        {
            "name": "Similar Headers (OCR variations)",
            "h1": ["Policy Number", "Carrier", "Premium Amount", "Commission Rate"],
            "h2": ["Policy Num", "Carrier", "Premium Amt", "Commission Rate"]
        },
        {
            "name": "Different Headers",
            "h1": ["Policy", "Carrier", "Premium", "Commission"],
            "h2": ["Client", "Plan", "Amount", "Fee"]
        }
    ]
    
    for pair in header_pairs:
        print(f"\n  Testing: {pair['name']}")
        
        # Create TableHeader objects
        from services.advanced_table_extractor import TableHeader
        h1 = TableHeader(columns=pair['h1'], confidence=0.9, page_number=1, row_index=0)
        h2 = TableHeader(columns=pair['h2'], confidence=0.9, page_number=2, row_index=0)
        
        is_similar, similarity = extractor.are_headers_similar(h1, h2)
        print(f"    Similar: {is_similar}")
        print(f"    Similarity Score: {similarity:.2f}")

def test_api_endpoints():
    """Test API endpoint structure"""
    print("\n🌐 Testing API Endpoints...")
    
    endpoints = [
        {
            "method": "POST",
            "path": "/advanced/extract-tables/",
            "description": "Main advanced extraction endpoint",
            "parameters": ["file", "company_id", "config_type", "quality_threshold", "enable_validation"]
        },
        {
            "method": "POST", 
            "path": "/advanced/extract-with-custom-config/",
            "description": "Custom configuration extraction",
            "parameters": ["file", "company_id", "dpi", "header_similarity_threshold", "quality_threshold"]
        },
        {
            "method": "GET",
            "path": "/advanced/quality-report/{upload_id}",
            "description": "Get detailed quality report",
            "parameters": ["upload_id"]
        },
        {
            "method": "GET",
            "path": "/advanced/extraction-configs",
            "description": "Get available configurations",
            "parameters": []
        }
    ]
    
    for endpoint in endpoints:
        print(f"\n  {endpoint['method']} {endpoint['path']}")
        print(f"    Description: {endpoint['description']}")
        print(f"    Parameters: {', '.join(endpoint['parameters'])}")

def get_config_description(config_name):
    """Get description for configuration type"""
    descriptions = {
        "default": "Balanced configuration for most commission statements",
        "high_quality": "Optimized for high-quality PDFs with clear table structures",
        "low_quality": "Enhanced preprocessing for low-quality or scanned documents",
        "multi_page": "Specialized for multi-page tables with repeating headers",
        "complex_structure": "For complex table layouts with irregular structures"
    }
    return descriptions.get(config_name, "Custom configuration")

def main():
    """Main test function"""
    print("🚀 Advanced Table Extraction System - Test Suite")
    print("=" * 60)
    
    try:
        test_basic_extraction()
        test_configurations()
        test_quality_assessment()
        test_header_similarity()
        test_api_endpoints()
        
        print("\n" + "=" * 60)
        print("✅ All tests completed successfully!")
        print("\n📋 Next Steps:")
        print("1. Install system dependencies (tesseract, opencv, poppler)")
        print("2. Install Python dependencies: pip install -r requirements.txt")
        print("3. Configure AWS credentials for Textract")
        print("4. Test with actual commission statement PDFs")
        print("5. Use the API endpoints for integration")
        
    except Exception as e:
        print(f"\n❌ Test failed: {str(e)}")
        print("Make sure all dependencies are installed and configured properly.")

if __name__ == "__main__":
    main() 