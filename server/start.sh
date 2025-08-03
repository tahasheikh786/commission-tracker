#!/bin/bash

# Check if credentials file exists in secrets directory
if [ -f "/etc/secrets/pdf-tables-extractor-465009-d9172fd0045d.json" ]; then
    echo "✅ Credentials file found in /etc/secrets/"
else
    echo "⚠️  Credentials file not found in /etc/secrets/"
fi

# Start the FastAPI application as root (to access secrets)
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 