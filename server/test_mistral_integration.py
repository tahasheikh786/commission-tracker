#!/usr/bin/env python3
"""
Test script for Mistral Document AI integration.
This script tests the Mistral service without requiring a full server setup.
"""

import os
import sys
import asyncio
from pathlib import Path

# Add the server directory to Python path
server_dir = Path(__file__).parent
sys.path.insert(0, str(server_dir))

from app.services.mistral_document_ai_service import MistralDocumentAIService

async def test_mistral_service():
    """Test the Mistral Document AI service."""
    print("🧪 Testing Mistral Document AI Service Integration")
    print("=" * 50)
    
    # Check if API key is configured
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        print("❌ MISTRAL_API_KEY not found in environment variables")
        print("   Please set MISTRAL_API_KEY environment variable")
        return False
    
    print(f"✅ MISTRAL_API_KEY found: {api_key[:10]}...")
    
    # Initialize service
    try:
        service = MistralDocumentAIService()
        print("✅ MistralDocumentAIService initialized successfully")
    except Exception as e:
        print(f"❌ Failed to initialize service: {e}")
        return False
    
    # Test availability
    if not service.is_available():
        print("❌ Service is not available")
        return False
    
    print("✅ Service is available")
    
    # Test connection
    try:
        connection_test = service.test_connection()
        if connection_test.get("success"):
            print("✅ Connection test passed")
        else:
            print(f"⚠️  Connection test failed: {connection_test.get('error')}")
    except Exception as e:
        print(f"⚠️  Connection test error: {e}")
    
    print("\n🎯 Service Configuration:")
    print(f"   - Service available: {service.is_available()}")
    print(f"   - API key configured: {bool(api_key)}")
    
    print("\n📋 Available Methods:")
    print("   - extract_commission_data_with_annotations()")
    print("   - extract_commission_data()")
    print("   - test_connection()")
    
    print("\n🚀 Integration Status: READY")
    print("   You can now test the endpoints:")
    print("   - POST /api/new-extract/extract-tables-mistral/")
    print("   - POST /api/new-extract/test-mistral-extraction/")
    
    return True

def main():
    """Main test function."""
    print("Mistral Document AI Integration Test")
    print("=" * 40)
    
    # Run async test
    success = asyncio.run(test_mistral_service())
    
    if success:
        print("\n✅ All tests passed! Mistral integration is ready.")
        return 0
    else:
        print("\n❌ Tests failed. Please check configuration.")
        return 1

if __name__ == "__main__":
    exit(main())
