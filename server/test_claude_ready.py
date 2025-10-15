#!/usr/bin/env python3
"""
Test script to verify Claude service is ready
Run this before starting the server to ensure Claude is properly configured
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_claude_configuration():
    """Test Claude configuration"""
    print("\n" + "="*60)
    print("CLAUDE SERVICE CONFIGURATION TEST")
    print("="*60 + "\n")
    
    # Test 1: Check if anthropic SDK is available
    print("Test 1: Checking Anthropic SDK...")
    try:
        import anthropic
        print(f"✅ Anthropic SDK installed (version: {anthropic.__version__})")
    except ImportError as e:
        print(f"❌ Anthropic SDK not installed: {e}")
        print("   Install with: pip install anthropic>=0.28.0")
        return False
    
    # Test 2: Check API key
    print("\nTest 2: Checking CLAUDE_API_KEY...")
    api_key = os.getenv('CLAUDE_API_KEY')
    if api_key:
        print(f"✅ CLAUDE_API_KEY is set: {api_key[:15]}...")
    else:
        print("❌ CLAUDE_API_KEY is not set")
        print("   Add CLAUDE_API_KEY to your .env file")
        return False
    
    # Test 3: Initialize Claude service
    print("\nTest 3: Initializing Claude service...")
    try:
        from app.services.claude.service import ClaudeDocumentAIService
        service = ClaudeDocumentAIService()
        
        if service.is_available():
            print("✅ Claude service is available and ready!")
            print(f"   Primary model: {service.primary_model}")
            print(f"   Client: {type(service.client)}")
            return True
        else:
            print("❌ Claude service is NOT available")
            print(f"   Client: {service.client}")
            return False
    except Exception as e:
        print(f"❌ Error initializing Claude service: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_enhanced_service():
    """Test EnhancedExtractionService with Claude"""
    print("\n" + "="*60)
    print("ENHANCED EXTRACTION SERVICE TEST")
    print("="*60 + "\n")
    
    try:
        from app.services.enhanced_extraction_service import EnhancedExtractionService
        
        print("Initializing EnhancedExtractionService...")
        service = EnhancedExtractionService()
        
        print(f"\nClaude service available: {service.claude_service.is_available()}")
        print(f"Mistral service available: {service.mistral_service.is_available()}")
        
        if service.claude_service.is_available():
            print("\n✅ SUCCESS! Claude will be used as primary extraction method")
            return True
        else:
            print("\n⚠️  WARNING! Claude not available, will fall back to Mistral")
            print(f"Claude client: {service.claude_service.client}")
            return False
            
    except Exception as e:
        print(f"\n❌ Error testing EnhancedExtractionService: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("\n🔍 Testing Claude configuration before server start...\n")
    
    test1_passed = test_claude_configuration()
    test2_passed = test_enhanced_service()
    
    print("\n" + "="*60)
    print("TEST RESULTS")
    print("="*60)
    
    if test1_passed and test2_passed:
        print("\n✅ ALL TESTS PASSED!")
        print("   Claude is properly configured and will be used for extraction")
        print("\n🚀 You can now start the server:")
        print("   uvicorn app.main:app --reload\n")
    else:
        print("\n❌ TESTS FAILED!")
        print("   Please fix the issues above before starting the server")
        print("   If issues persist, check:")
        print("   1. .env file has CLAUDE_API_KEY set")
        print("   2. Anthropic SDK is installed (pip install anthropic>=0.28.0)")
        print("   3. Virtual environment is activated\n")

