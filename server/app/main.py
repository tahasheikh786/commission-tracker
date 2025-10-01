# Apply compatibility fixes first
from app.new_extraction_services.utils.compatibility import apply_compatibility_fixes
apply_compatibility_fixes()

from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from collections import defaultdict
import time
import os
from app.api import company, mapping, review, statements, database_fields, plan_types, table_editor, improve_extraction, pending, dashboard, format_learning, new_extract, summary_rows, date_extraction, excel_extract, user_management, admin, otp_auth, auth, websocket
from app.utils.auth_utils import cleanup_expired_sessions
from app.db.database import get_db
from app.security_config import (
    get_security_headers, 
    get_cors_config, 
    get_trusted_hosts,
    get_environment_security_check,
    get_security_recommendations
)
import asyncio

app = FastAPI()

@app.get("/health")
async def health_check():
    """Health check endpoint for Docker and monitoring"""
    return {"status": "healthy", "message": "Commission tracker backend is running"}

@app.get("/security/status")
async def security_status():
    """Security status endpoint for monitoring"""
    security_checks = get_environment_security_check()
    recommendations = get_security_recommendations()
    
    return {
        "status": "secure" if not recommendations else "needs_attention",
        "checks": security_checks,
        "recommendations": recommendations,
        "timestamp": time.time()
    }

@app.get("/debug/cors")
async def debug_cors():
    """Debug endpoint to check CORS configuration"""
    cors_config = get_cors_config()
    return {
        "cors_origins": cors_config["allow_origins"],
        "cors_credentials": cors_config["allow_credentials"],
        "cors_methods": cors_config["allow_methods"],
        "cors_headers": cors_config["allow_headers"],
        "environment": os.getenv("ENVIRONMENT", "development"),
        "cors_origins_env": os.getenv("CORS_ORIGINS", "not_set")
    }

# Security Configuration
cors_config = get_cors_config()
trusted_hosts = get_trusted_hosts()
security_headers = get_security_headers()

# Security middleware - CORS must be added first
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_config["allow_origins"],
    allow_credentials=cors_config["allow_credentials"],
    allow_methods=cors_config["allow_methods"],
    allow_headers=cors_config["allow_headers"],
    expose_headers=["Set-Cookie", "Authorization", "Content-Type", "X-Process-Time"],  # Important for cookie visibility
)

app.add_middleware(
    TrustedHostMiddleware, 
    allowed_hosts=trusted_hosts
)

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    
    # Add security headers
    for header, value in security_headers.items():
        response.headers[header] = value
    
    # Add HSTS header for HTTPS
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    
    return response

# Rate limiting storage
rate_limit_storage = defaultdict(list)

# Rate limiting middleware
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"
    current_time = time.time()
    
    # Clean old entries (older than 1 hour)
    rate_limit_storage[client_ip] = [
        timestamp for timestamp in rate_limit_storage[client_ip]
        if current_time - timestamp < 3600
    ]
    
    # Check rate limits based on endpoint
    if request.url.path.startswith("/auth/otp/request"):
        # OTP requests: 10 per hour
        if len(rate_limit_storage[client_ip]) >= 10:
            raise HTTPException(
                status_code=429,
                detail="Too many OTP requests. Please try again later."
            )
        rate_limit_storage[client_ip].append(current_time)
    
    response = await call_next(request)
    return response

# Request timing middleware for monitoring
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response


app.include_router(auth.router)
app.include_router(otp_auth.router)
app.include_router(user_management.router)
app.include_router(admin.router)
app.include_router(dashboard.router)
app.include_router(company.router)
app.include_router(mapping.router)
app.include_router(review.router)
app.include_router(statements.router)
app.include_router(database_fields.router)
app.include_router(plan_types.router)
app.include_router(table_editor.router)
app.include_router(improve_extraction.router)
app.include_router(pending.router)
app.include_router(format_learning.router)
app.include_router(new_extract.router)
app.include_router(summary_rows.router)
app.include_router(date_extraction.router)
app.include_router(excel_extract.router)
app.include_router(websocket.router, tags=["WebSocket"])

# Background task for session cleanup
async def cleanup_sessions_periodically():
    """Clean up expired and inactive sessions every hour"""
    while True:
        try:
            async for db in get_db():
                cleaned_count = await cleanup_expired_sessions(db)
                if cleaned_count > 0:
                    print(f"Cleaned up {cleaned_count} expired/inactive sessions")
                break
        except Exception as e:
            print(f"Error during session cleanup: {e}")
        
        # Wait 1 hour before next cleanup
        await asyncio.sleep(3600)

# Start background task
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cleanup_sessions_periodically())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
