#!/usr/bin/env python3
"""
Quick test for the improved header detection logic.
"""

from app.new_extraction_services.pipeline.extraction_pipeline import ExtractionPipeline
from app.new_extraction_services.utils.config import Config

def test_header_detection():
    """Test the improved header detection logic."""
    
    # Initialize the pipeline
    config = Config()
    pipeline = ExtractionPipeline(config)
    
    # Test headers from the real data
    real_headers = [
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
    ]
    
    data_like_headers = [
        "JC Logistics",
        "Company Incorporated", 
        "UT467236",
        "NC",
        "$7,323.40",
        "14",
        "1", 
        "15",
        "$75.00/subscriber",
        "$1,125.00"
    ]
    
    print("🔍 Testing header detection logic...")
    
    # Test real headers
    real_looks_like_data = pipeline._headers_look_like_data(real_headers)
    print(f"Real headers look like data: {real_looks_like_data}")
    print(f"Real headers: {real_headers[:3]}...")
    
    # Test data-like headers
    data_looks_like_data = pipeline._headers_look_like_data(data_like_headers)
    print(f"Data-like headers look like data: {data_looks_like_data}")
    print(f"Data-like headers: {data_like_headers[:3]}...")
    
    # Test similarity calculation
    similarity = pipeline._calculate_header_similarity(real_headers, data_like_headers)
    print(f"Header similarity: {similarity:.3f}")
    
    # Test the merging logic
    print(f"\n🔍 Testing merging logic...")
    if data_looks_like_data:
        print("✅ Data-like headers detected - should be merged!")
    else:
        print("❌ Data-like headers not detected - won't be merged")
    
    print("\n✅ Test completed!")

if __name__ == "__main__":
    test_header_detection()
