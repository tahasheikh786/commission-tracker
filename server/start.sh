#!/bin/bash

# Check if credentials file exists in secrets directory
if [ -f "/etc/secrets/pdf-tables-extractor-465009-d9172fd0045d.json" ]; then
    echo "✅ Credentials file found in /etc/secrets/"
else
    echo "⚠️  Credentials file not found in /etc/secrets/"
fi

# Enhanced timeout configuration for large file processing
# Use environment variables with fallback defaults
GUNICORN_TIMEOUT=${GUNICORN_TIMEOUT:-900}
GUNICORN_GRACEFUL_TIMEOUT=${GUNICORN_GRACEFUL_TIMEOUT:-900}
GUNICORN_KEEPALIVE=${GUNICORN_KEEPALIVE:-65}
GUNICORN_WORKERS=${GUNICORN_WORKERS:-1}

echo "🚀 Starting server with Gunicorn:"
echo "   - Timeout: ${GUNICORN_TIMEOUT}s"
echo "   - Graceful timeout: ${GUNICORN_GRACEFUL_TIMEOUT}s"
echo "   - Keep-alive: ${GUNICORN_KEEPALIVE}s"
echo "   - Workers: ${GUNICORN_WORKERS}"

# Start the FastAPI application via Gunicorn/uvicorn worker (matches Render config)
exec gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --workers ${GUNICORN_WORKERS} \
  --timeout ${GUNICORN_TIMEOUT} \
  --graceful-timeout ${GUNICORN_GRACEFUL_TIMEOUT} \
  --keep-alive ${GUNICORN_KEEPALIVE} \
  --log-level info