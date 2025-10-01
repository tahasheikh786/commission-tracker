#!/usr/bin/env python3
"""
Simple test script to verify authentication endpoints work locally
"""

import requests
import json

# Test local authentication endpoints
BASE_URL = "http://localhost:8000"

def test_auth_endpoints():
    print("🧪 Testing authentication endpoints...")
    
    # Test 1: Check if OTP request endpoint exists
    print("\n1. Testing OTP request endpoint...")
    try:
        response = requests.post(f"{BASE_URL}/api/auth/otp/request", 
                               json={"email": "test@example.com", "purpose": "login"})
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:200]}...")
    except Exception as e:
        print(f"   Error: {e}")
    
    # Test 2: Check if auth status endpoint exists
    print("\n2. Testing auth status endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/api/auth/otp/status")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:200]}...")
    except Exception as e:
        print(f"   Error: {e}")
    
    # Test 3: Check if permissions endpoint exists
    print("\n3. Testing permissions endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/api/auth/permissions")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:200]}...")
    except Exception as e:
        print(f"   Error: {e}")
    
    # Test 4: Check if refresh endpoint exists
    print("\n4. Testing refresh endpoint...")
    try:
        response = requests.post(f"{BASE_URL}/api/auth/otp/refresh")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:200]}...")
    except Exception as e:
        print(f"   Error: {e}")

if __name__ == "__main__":
    test_auth_endpoints()
