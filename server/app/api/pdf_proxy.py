"""
Minimal PDF Proxy for CORS-compliant PDF viewing
Proxies GCS signed URLs through backend to avoid CORS issues
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from fastapi.concurrency import run_in_threadpool
import httpx
import logging
from urllib.parse import urlparse, unquote
from typing import Optional

from app.services.gcs_utils import GCSService, GCS_BUCKET_NAME

router = APIRouter()
logger = logging.getLogger(__name__)
gcs_service = GCSService()


def _extract_gcs_key_from_url(url: str) -> Optional[str]:
    try:
        parsed = urlparse(url)
        if "storage.googleapis.com" not in parsed.netloc:
            return None
        
        path = unquote(parsed.path or "")
        bucket_prefix = f"/{GCS_BUCKET_NAME}/"
        if path.startswith(bucket_prefix):
            return path[len(bucket_prefix):]
        return path.lstrip("/")
    except Exception as exc:
        logger.warning(f"Failed to parse GCS key from URL: {exc}")
        return None


async def _fetch_directly_from_gcs(url: str) -> Optional[bytes]:
    """
    Fallback when signed URL fetch fails (due to expiration or signature issues).
    Downloads the PDF using the service account credentials directly from GCS.
    """
    if not gcs_service.is_available():
        logger.warning("GCS service unavailable - cannot perform fallback download")
        return None
    
    gcs_key = _extract_gcs_key_from_url(url)
    if not gcs_key:
        logger.warning("Unable to derive GCS key from URL for fallback download")
        return None
    
    logger.info(f"🔁 Falling back to direct GCS download for: {gcs_key}")
    return await run_in_threadpool(gcs_service.download_file_bytes, gcs_key)


def _build_pdf_response(content: bytes) -> Response:
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Content-Disposition": "inline; filename=\"document.pdf\"",
            "Cache-Control": "public, max-age=3600",
        }
    )

@router.get("/pdf-proxy")
async def proxy_pdf(url: str = Query(..., description="GCS signed URL to proxy")):
    """
    Simple proxy that fetches PDF from GCS signed URL and returns it with CORS headers.
    This avoids browser CORS restrictions when loading PDFs directly from GCS.
    """
    try:
        if not url or not url.strip():
            raise HTTPException(status_code=400, detail="Missing or invalid url parameter")
        
        # Validate it's a GCS URL
        if "storage.googleapis.com" not in url:
            raise HTTPException(status_code=400, detail="Invalid URL: must be a Google Cloud Storage URL")
        
        logger.info(f"🔄 Proxying PDF from: {url[:100]}...")
        
        # Fetch PDF from GCS signed URL
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(url)
            
            if response.status_code == 200:
                return _build_pdf_response(response.content)
            
            logger.error(f"❌ Failed to fetch PDF via signed URL: HTTP {response.status_code}")
            
            fallback_bytes = await _fetch_directly_from_gcs(url)
            if fallback_bytes:
                return _build_pdf_response(fallback_bytes)
            
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to fetch PDF from storage: {response.status_code}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ PDF proxy error: {e}")
        fallback_bytes = await _fetch_directly_from_gcs(url)
        if fallback_bytes:
            return _build_pdf_response(fallback_bytes)
        raise HTTPException(status_code=500, detail=f"Failed to proxy PDF: {str(e)}")

@router.options("/pdf-proxy")
async def pdf_proxy_options():
    """CORS preflight handler"""
    return Response(
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "86400",
        }
    )

