#!/bin/bash

# Check if credentials file exists in secrets directory
if [ -f "/etc/secrets/pdf-tables-extractor-465009-d9172fd0045d.json" ]; then
    echo "✅ Credentials file found in /etc/secrets/"
else
    echo "⚠️  Credentials file not found in /etc/secrets/"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Enhanced timeout configuration for large file processing (30-minute extraction support)
# ═══════════════════════════════════════════════════════════════════════════════
# ✅ SYNCED WITH: server/config/timeouts.py
# - uvicorn_graceful_shutdown: 1800s (30 minutes)
# - uvicorn_keepalive: 1800s (30 minutes)
# - total_extraction: 1800s (30 minutes)
# ═══════════════════════════════════════════════════════════════════════════════

# Use environment variables with fallback defaults
# ✅ Defaults match Dockerfile and config/timeouts.py
GUNICORN_TIMEOUT=${GUNICORN_TIMEOUT:-1800}           # 30 minutes (matches total_extraction timeout)
GUNICORN_GRACEFUL_TIMEOUT=${GUNICORN_GRACEFUL_TIMEOUT:-1800}  # 30 minutes (matches uvicorn_graceful_shutdown)
GUNICORN_KEEPALIVE=${GUNICORN_KEEPALIVE:-1800}       # 30 minutes (matches uvicorn_keepalive)
GUNICORN_WORKERS=${GUNICORN_WORKERS:-1}              # Single worker (recommended for long-running tasks)

echo "🚀 Starting server with Gunicorn (optimized for 30-minute extractions):"
echo "   - Worker timeout: ${GUNICORN_TIMEOUT}s (30 minutes)"
echo "   - Graceful shutdown: ${GUNICORN_GRACEFUL_TIMEOUT}s (30 minutes)"
echo "   - Keep-alive: ${GUNICORN_KEEPALIVE}s (30 minutes)"
echo "   - Workers: ${GUNICORN_WORKERS}"
echo "   - Worker class: uvicorn.workers.UvicornWorker"

# Start the FastAPI application via Gunicorn/uvicorn worker
# ✅ CRITICAL: Timeout must exceed longest extraction time (1800s)
exec gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --workers ${GUNICORN_WORKERS} \
  --timeout ${GUNICORN_TIMEOUT} \
  --graceful-timeout ${GUNICORN_GRACEFUL_TIMEOUT} \
  --keep-alive ${GUNICORN_KEEPALIVE} \
  --log-level info \
  --access-logfile - \
  --error-logfile -