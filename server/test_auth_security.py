#!/usr/bin/env python3
"""
Authentication Security Test Script

This script tests the authentication and security improvements
to ensure they work correctly and prevent unauthorized access.
"""

import asyncio
import aiohttp
import json
import time
from typing import Dict, Any

class AuthSecurityTester:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.session = None
        self.test_results = []
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def make_request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make HTTP request and return response data"""
        url = f"{self.base_url}{endpoint}"
        try:
            async with self.session.request(method, url, **kwargs) as response:
                data = await response.json() if response.content_type == 'application/json' else {}
                return {
                    "status": response.status,
                    "data": data,
                    "headers": dict(response.headers),
                    "success": 200 <= response.status < 300
                }
        except Exception as e:
            return {
                "status": 0,
                "data": {"error": str(e)},
                "headers": {},
                "success": False
            }
    
    def log_test(self, test_name: str, result: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"    {details}")
        self.test_results.append({
            "test": test_name,
            "passed": result,
            "details": details
        })
    
    async def test_security_headers(self):
        """Test that security headers are present"""
        print("\n🔒 Testing Security Headers...")
        
        response = await self.make_request("GET", "/health")
        
        headers = response["headers"]
        required_headers = [
            "x-content-type-options",
            "x-frame-options", 
            "x-xss-protection",
            "referrer-policy"
        ]
        
        for header in required_headers:
            has_header = header in headers
            self.log_test(
                f"Security header: {header}",
                has_header,
                f"Value: {headers.get(header, 'Missing')}"
            )
    
    async def test_cors_configuration(self):
        """Test CORS configuration"""
        print("\n🌐 Testing CORS Configuration...")
        
        # Test preflight request
        headers = {
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type"
        }
        
        response = await self.make_request("OPTIONS", "/auth/otp/status", headers=headers)
        
        cors_headers = response["headers"]
        has_cors_origin = "access-control-allow-origin" in cors_headers
        has_cors_credentials = cors_headers.get("access-control-allow-credentials") == "true"
        
        self.log_test("CORS Origin header", has_cors_origin)
        self.log_test("CORS Credentials enabled", has_cors_credentials)
    
    async def test_unauthenticated_access(self):
        """Test that protected endpoints require authentication"""
        print("\n🔐 Testing Unauthenticated Access...")
        
        protected_endpoints = [
            "/auth/me",
            "/auth/permissions",
            "/dashboard/stats"
        ]
        
        for endpoint in protected_endpoints:
            response = await self.make_request("GET", endpoint)
            is_protected = response["status"] == 401
            self.log_test(
                f"Protected endpoint: {endpoint}",
                is_protected,
                f"Status: {response['status']}"
            )
    
    async def test_token_refresh_security(self):
        """Test token refresh security"""
        print("\n🔄 Testing Token Refresh Security...")
        
        # Test refresh without refresh token
        response = await self.make_request("POST", "/auth/otp/refresh")
        requires_token = response["status"] == 401
        self.log_test(
            "Refresh requires token",
            requires_token,
            f"Status: {response['status']}"
        )
        
        # Test refresh with invalid token
        cookies = {"refresh_token": "invalid_token"}
        response = await self.make_request("POST", "/auth/otp/refresh", cookies=cookies)
        rejects_invalid = response["status"] == 401
        self.log_test(
            "Refresh rejects invalid token",
            rejects_invalid,
            f"Status: {response['status']}"
        )
    
    async def test_session_management(self):
        """Test session management security"""
        print("\n📱 Testing Session Management...")
        
        # Test logout endpoint
        response = await self.make_request("POST", "/auth/otp/logout")
        logout_works = response["status"] in [200, 401]  # 401 is OK if not authenticated
        self.log_test(
            "Logout endpoint accessible",
            logout_works,
            f"Status: {response['status']}"
        )
        
        # Test cleanup endpoint
        response = await self.make_request("POST", "/auth/otp/cleanup")
        cleanup_works = response["status"] in [200, 401]  # 401 is OK if not authenticated
        self.log_test(
            "Cleanup endpoint accessible",
            cleanup_works,
            f"Status: {response['status']}"
        )
    
    async def test_rate_limiting(self):
        """Test rate limiting (basic check)"""
        print("\n⏱️ Testing Rate Limiting...")
        
        # Make multiple OTP requests quickly
        otp_requests = []
        for i in range(5):
            data = {"email": f"test{i}@example.com", "purpose": "login"}
            response = await self.make_request("POST", "/auth/otp/request", json=data)
            otp_requests.append(response)
        
        # Check if any requests were rate limited
        rate_limited = any(r["status"] == 429 for r in otp_requests)
        self.log_test(
            "Rate limiting active",
            rate_limited,
            f"Responses: {[r['status'] for r in otp_requests]}"
        )
    
    async def test_security_status_endpoint(self):
        """Test security status endpoint"""
        print("\n🛡️ Testing Security Status Endpoint...")
        
        response = await self.make_request("GET", "/security/status")
        endpoint_works = response["success"]
        
        if endpoint_works:
            data = response["data"]
            has_checks = "checks" in data
            has_recommendations = "recommendations" in data
            
            self.log_test("Security status endpoint", True)
            self.log_test("Has security checks", has_checks)
            self.log_test("Has recommendations", has_recommendations)
        else:
            self.log_test("Security status endpoint", False, f"Status: {response['status']}")
    
    async def run_all_tests(self):
        """Run all security tests"""
        print("🚀 Starting Authentication Security Tests...")
        print("=" * 50)
        
        await self.test_security_headers()
        await self.test_cors_configuration()
        await self.test_unauthenticated_access()
        await self.test_token_refresh_security()
        await self.test_session_management()
        await self.test_rate_limiting()
        await self.test_security_status_endpoint()
        
        # Summary
        print("\n" + "=" * 50)
        print("📊 Test Summary:")
        
        passed = sum(1 for result in self.test_results if result["passed"])
        total = len(self.test_results)
        
        print(f"✅ Passed: {passed}/{total}")
        print(f"❌ Failed: {total - passed}/{total}")
        
        if total - passed > 0:
            print("\n❌ Failed Tests:")
            for result in self.test_results:
                if not result["passed"]:
                    print(f"  - {result['test']}: {result['details']}")
        
        return passed == total

async def main():
    """Main test function"""
    async with AuthSecurityTester() as tester:
        success = await tester.run_all_tests()
        return 0 if success else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
