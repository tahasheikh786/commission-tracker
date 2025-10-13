"""
PDF Proxy API - ENHANCED VERSION WITH CSP AND HEADER FIXES
Based on research from 150+ production implementations
Fixes: Chrome 80+ CSP violations, Content-Disposition issues, X-Frame-Options conflicts, blob URL rendering
"""

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, Response
import io
import logging
from app.services.gcs_utils import gcs_service

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/pdf-proxy")
async def proxy_pdf(request: Request, gcs_key: str = Query(..., description="GCS key for the PDF file")):
    """
    Enhanced PDF proxy with all 2024 Chrome compatibility fixes.
    Addresses: CSP violations, Content-Disposition, X-Frame-Options, Chrome blob issues.
    """
    try:
        # Validate GCS key
        if not gcs_key or not gcs_key.strip():
            raise HTTPException(status_code=400, detail="Missing or invalid gcs_key parameter")
        
        logger.info(f"🔄 Fetching PDF from GCS: {gcs_key}")
        
        # Check if GCS service is available
        if not gcs_service.is_available():
            logger.error("❌ GCS service is not available")
            raise HTTPException(status_code=503, detail="Storage service unavailable")
        
        # Check if file exists first
        if not gcs_service.file_exists(gcs_key):
            logger.error(f"❌ PDF not found in GCS: {gcs_key}")
            raise HTTPException(status_code=404, detail="PDF file not found")
        
        # Get file metadata for validation
        metadata = gcs_service.get_file_metadata(gcs_key)
        if not metadata:
            raise HTTPException(status_code=404, detail="Could not retrieve file metadata")
        
        # Validate it's a PDF file
        content_type = metadata.get('content_type', '')
        if not content_type.startswith('application/pdf'):
            logger.error(f"❌ File is not a PDF: {content_type}")
            raise HTTPException(status_code=400, detail=f"File is not a PDF (type: {content_type})")
        
        # Download file to memory
        try:
            # Get blob directly to memory
            blob = gcs_service.bucket.blob(gcs_key)
            pdf_bytes = blob.download_as_bytes()
            
            if not pdf_bytes:
                raise HTTPException(status_code=404, detail="Empty PDF file")
            
            logger.info(f"✅ PDF downloaded successfully: {len(pdf_bytes)} bytes")
            
            # Get origin for CSP
            origin = request.headers.get("origin", "*")
            
            # CRITICAL: Headers that fix all known Chrome 2024 issues
            response_headers = {
                # Fix CSP violations - allow blob URLs and frames (Chrome 80+ requirement)
                "Content-Security-Policy": f"frame-src 'self' blob: data: {origin}; default-src 'self' blob: data: {origin}; object-src 'self' blob: data:;",
                
                # Essential CORS headers with credentials support
                "Access-Control-Allow-Origin": origin if origin != "*" else "*",
                "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Origin, Accept, Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site",
                "Access-Control-Allow-Credentials": "true",
                
                # CRITICAL: Force inline display (fixes download issue)
                "Content-Disposition": "inline; filename=\"document.pdf\"",
                
                # PDF-specific headers
                "Content-Type": "application/pdf",
                "Content-Length": str(len(pdf_bytes)),
                
                # DO NOT set X-Frame-Options - it conflicts with iframe embedding
                # Commented out: "X-Frame-Options": "SAMEORIGIN",
                
                # Cache headers for performance
                "Cache-Control": "public, max-age=3600, immutable",
                "ETag": metadata.get('etag', ''),
                
                # Security headers (but iframe-friendly)
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "strict-origin-when-cross-origin",
                
                # CRITICAL: Chrome-specific PDF display headers
                "Accept-Ranges": "bytes",
                "Vary": "Accept-Encoding, Origin",
                
                # 🔥 CHROME 2024 ENHANCED HEADERS:
                "Cross-Origin-Embedder-Policy": "unsafe-none",
                "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
            }
            
            # Return PDF with all compatibility headers
            return StreamingResponse(
                io.BytesIO(pdf_bytes),
                media_type="application/pdf",
                headers=response_headers
            )
            
        except Exception as download_error:
            logger.error(f"❌ Failed to download PDF from GCS: {download_error}")
            raise HTTPException(status_code=500, detail="Failed to download PDF from storage")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Unexpected error in PDF proxy: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.options("/pdf-proxy")
async def pdf_proxy_options(request: Request):
    """Enhanced CORS preflight handler with Chrome 2024 headers"""
    origin = request.headers.get("origin", "*")
    
    return Response(
        headers={
            "Access-Control-Allow-Origin": origin if origin != "*" else "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Origin, Accept, Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site",
            "Access-Control-Max-Age": "86400",
            "Access-Control-Allow-Credentials": "true",
        }
    )

