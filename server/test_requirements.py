#!/usr/bin/env python3
"""
Test script to verify all requirements.txt packages are compatible
"""

import subprocess
import sys
import os
from pathlib import Path

def test_requirements_installation():
    """Test if all requirements can be installed together."""
    
    print("🧪 Testing Requirements.txt Compatibility")
    print("=" * 60)
    
    # Read requirements.txt
    requirements_file = Path(__file__).parent / "requirements.txt"
    
    if not requirements_file.exists():
        print("❌ requirements.txt not found!")
        return False
    
    with open(requirements_file, 'r') as f:
        requirements = f.read()
    
    print("📋 Requirements file content:")
    print(requirements)
    print("-" * 60)
    
    # Create a temporary requirements file for testing
    test_requirements = Path(__file__).parent / "test_requirements_temp.txt"
    
    try:
        # Write requirements to temp file
        with open(test_requirements, 'w') as f:
            f.write(requirements)
        
        print("🔧 Testing pip install...")
        
        # Test pip install
        result = subprocess.run([
            sys.executable, "-m", "pip", "install", 
            "-r", str(test_requirements),
            "--dry-run"
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✅ Dry-run successful - no conflicts detected")
            return True
        else:
            print("❌ Dry-run failed:")
            print(result.stderr)
            return False
            
    except Exception as e:
        print(f"❌ Error during testing: {e}")
        return False
    finally:
        # Clean up temp file
        if test_requirements.exists():
            test_requirements.unlink()

def test_individual_packages():
    """Test individual package installations."""
    
    print("\n🔬 Testing Individual Package Installations")
    print("=" * 60)
    
    # List of critical packages to test
    critical_packages = [
        "fastapi==0.104.1",
        "torch==2.2.2+cpu",
        "torchvision==0.17.2+cpu", 
        "transformers==4.36.2",
        "opencv-python==4.6.0.66",
        "numpy==1.26.4",
        "pandas==2.1.4",
        "easyocr==1.7.0",
        "paddleocr==2.7.3",
        "docling==1.20.0"
    ]
    
    all_success = True
    
    for package in critical_packages:
        print(f"📦 Testing {package}...")
        
        try:
            result = subprocess.run([
                sys.executable, "-m", "pip", "install", 
                package, "--dry-run"
            ], capture_output=True, text=True)
            
            if result.returncode == 0:
                print(f"  ✅ {package} - OK")
            else:
                print(f"  ❌ {package} - FAILED")
                print(f"     Error: {result.stderr}")
                all_success = False
                
        except Exception as e:
            print(f"  ❌ {package} - ERROR: {e}")
            all_success = False
    
    return all_success

def test_python_version_compatibility():
    """Test if packages are compatible with Python 3.11.13."""
    
    print(f"\n🐍 Testing Python Version Compatibility")
    print("=" * 60)
    
    python_version = sys.version_info
    print(f"Current Python version: {python_version.major}.{python_version.minor}.{python_version.micro}")
    
    if python_version.major == 3 and python_version.minor == 11:
        print("✅ Python 3.11 detected - compatible with requirements")
        return True
    else:
        print(f"⚠️  Warning: Python {python_version.major}.{python_version.minor} detected")
        print("   Some packages may require Python 3.11")
        return False

def main():
    """Run all tests."""
    
    print("🚀 Starting Requirements Compatibility Tests")
    print("=" * 60)
    
    # Test Python version
    version_ok = test_python_version_compatibility()
    
    # Test individual packages
    packages_ok = test_individual_packages()
    
    # Test full requirements
    requirements_ok = test_requirements_installation()
    
    print("\n🎉 Test Results Summary")
    print("=" * 60)
    print(f"Python Version: {'✅ PASS' if version_ok else '❌ FAIL'}")
    print(f"Individual Packages: {'✅ PASS' if packages_ok else '❌ FAIL'}")
    print(f"Full Requirements: {'✅ PASS' if requirements_ok else '❌ FAIL'}")
    
    overall_success = version_ok and packages_ok and requirements_ok
    
    if overall_success:
        print("\n🎯 SUCCESS: All requirements are compatible!")
    else:
        print("\n❌ ISSUES FOUND: Some compatibility problems detected")
        print("Please check the errors above and fix the requirements.txt")
    
    return overall_success

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
