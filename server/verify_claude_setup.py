#!/usr/bin/env python3
"""
Claude Setup Verification Script

This script checks if Claude AI integration is properly set up and configured.
Run this before starting your server to verify everything is ready.

Usage:
    python verify_claude_setup.py
"""

import os
import sys
from pathlib import Path

def print_header(text):
    """Print a formatted header"""
    print("\n" + "="*60)
    print(f"  {text}")
    print("="*60 + "\n")

def print_success(text):
    """Print success message"""
    print(f"✅ {text}")

def print_warning(text):
    """Print warning message"""
    print(f"⚠️  {text}")

def print_error(text):
    """Print error message"""
    print(f"❌ {text}")

def check_python_version():
    """Check Python version"""
    print_header("Checking Python Version")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 8:
        print_success(f"Python {version.major}.{version.minor}.{version.micro} - Compatible")
        return True
    else:
        print_error(f"Python {version.major}.{version.minor}.{version.micro} - Requires Python 3.8+")
        return False

def check_dependencies():
    """Check if required packages are installed"""
    print_header("Checking Dependencies")
    
    required_packages = [
        ('anthropic', 'Anthropic SDK'),
        ('tiktoken', 'Token counting'),
        ('fitz', 'PDF processing (PyMuPDF)'),  # PyMuPDF imports as 'fitz'
        ('fastapi', 'API framework'),
        ('pydantic', 'Data validation')
    ]
    
    all_installed = True
    
    for package, description in required_packages:
        try:
            __import__(package)
            print_success(f"{description} ({package}) - Installed")
        except ImportError:
            print_error(f"{description} ({package}) - NOT INSTALLED")
            all_installed = False
    
    return all_installed

def check_environment_variables():
    """Check if environment variables are set"""
    print_header("Checking Environment Variables")
    
    # Load .env if it exists
    env_path = Path('.env')
    if env_path.exists():
        print_success(".env file found")
        from dotenv import load_dotenv
        load_dotenv()
    else:
        print_warning(".env file not found (will check environment)")
    
    # Check required variables
    claude_key = os.getenv('CLAUDE_API_KEY')
    if claude_key and claude_key != 'your_claude_api_key_here':
        print_success(f"CLAUDE_API_KEY set ({claude_key[:10]}...)")
        has_key = True
    else:
        print_error("CLAUDE_API_KEY not set or is placeholder value")
        has_key = False
    
    # Check optional variables
    optional_vars = [
        ('CLAUDE_MODEL_PRIMARY', 'claude-sonnet-4-20250514'),
        ('CLAUDE_MODEL_FALLBACK', 'claude-3-5-sonnet-20241022'),
        ('CLAUDE_MAX_FILE_SIZE', '33554432'),
        ('CLAUDE_MAX_PAGES', '100'),
        ('CLAUDE_TIMEOUT_SECONDS', '300')
    ]
    
    for var, default in optional_vars:
        value = os.getenv(var, default)
        if os.getenv(var):
            print_success(f"{var} = {value}")
        else:
            print_warning(f"{var} using default = {default}")
    
    return has_key

def check_file_structure():
    """Check if required files exist"""
    print_header("Checking File Structure")
    
    required_files = [
        'app/services/claude/__init__.py',
        'app/services/claude/service.py',
        'app/services/claude/models.py',
        'app/services/claude/prompts.py',
        'app/services/claude/utils.py',
        'app/services/enhanced_extraction_service.py',
        'app/config.py',
        'requirements.txt'
    ]
    
    all_exist = True
    
    for file_path in required_files:
        path = Path(file_path)
        if path.exists():
            size = path.stat().st_size
            print_success(f"{file_path} ({size:,} bytes)")
        else:
            print_error(f"{file_path} - NOT FOUND")
            all_exist = False
    
    return all_exist

def test_claude_connection():
    """Test connection to Claude API"""
    print_header("Testing Claude API Connection")
    
    try:
        from anthropic import Anthropic
        
        api_key = os.getenv('CLAUDE_API_KEY')
        if not api_key or api_key == 'your_claude_api_key_here':
            print_warning("Skipping API test - CLAUDE_API_KEY not set")
            return False
        
        client = Anthropic(api_key=api_key)
        
        # Simple test message
        print("Sending test message to Claude...")
        response = client.messages.create(
            model="claude-sonnet-4-20250514",  # Use primary model
            max_tokens=50,
            messages=[
                {"role": "user", "content": "Reply with only: API connection successful"}
            ]
        )
        
        if response.content:
            print_success("Claude API connection successful!")
            print(f"Response: {response.content[0].text}")
            return True
        else:
            print_error("Claude API returned empty response")
            return False
            
    except ImportError:
        print_error("anthropic package not installed")
        return False
    except Exception as e:
        print_error(f"API connection failed: {str(e)}")
        if "authentication" in str(e).lower() or "api_key" in str(e).lower():
            print_warning("Check your CLAUDE_API_KEY is valid")
        return False

def check_service_initialization():
    """Check if Claude service can be initialized"""
    print_header("Testing Service Initialization")
    
    try:
        # Add app directory to path
        sys.path.insert(0, str(Path.cwd()))
        
        from app.services.claude.service import ClaudeDocumentAIService
        
        print("Initializing ClaudeDocumentAIService...")
        service = ClaudeDocumentAIService()
        
        if service.is_available():
            print_success("Claude service initialized and available")
            print(f"Primary model: {service.primary_model}")
            print(f"Fallback model: {service.fallback_model}")
            print(f"Max file size: {service.max_file_size_mb}MB")
            print(f"Max pages: {service.max_pages}")
            return True
        else:
            print_warning("Claude service initialized but not available")
            print("This usually means CLAUDE_API_KEY is not set")
            return False
            
    except Exception as e:
        print_error(f"Service initialization failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main verification function"""
    print("\n" + "🔍 Claude AI Setup Verification" + "\n")
    print("This script will check if your Claude AI integration is properly configured.")
    
    # Run all checks
    checks = [
        ("Python Version", check_python_version),
        ("Dependencies", check_dependencies),
        ("Environment Variables", check_environment_variables),
        ("File Structure", check_file_structure),
        ("Claude API Connection", test_claude_connection),
        ("Service Initialization", check_service_initialization)
    ]
    
    results = {}
    for name, check_func in checks:
        try:
            results[name] = check_func()
        except Exception as e:
            print_error(f"{name} check failed with error: {str(e)}")
            results[name] = False
    
    # Summary
    print_header("Verification Summary")
    
    passed = sum(1 for result in results.values() if result)
    total = len(results)
    
    for name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nPassed: {passed}/{total}")
    
    if passed == total:
        print_success("\n🎉 All checks passed! Claude AI is ready to use.")
        print("\nNext steps:")
        print("1. Start your server: python -m uvicorn app.main:app --reload")
        print("2. Upload a test PDF")
        print("3. Monitor logs for extraction status")
        return 0
    else:
        print_error("\n⚠️  Some checks failed. Please review the errors above.")
        print("\nCommon fixes:")
        print("1. Install missing packages: pip install -r requirements.txt")
        print("2. Set CLAUDE_API_KEY in .env file")
        print("3. Get API key from: https://console.anthropic.com/")
        return 1

if __name__ == "__main__":
    sys.exit(main())

