#!/bin/bash

# Copy credentials file from secrets directory to app directory if it exists
if [ -f "/etc/secrets/pdf-tables-extractor-465009-d9172fd0045d.json" ]; then
    echo "📁 Copying credentials file from secrets directory..."
    cp /etc/secrets/pdf-tables-extractor-465009-d9172fd0045d.json /app/pdf-tables-extractor-465009-d9172fd0045d.json
    chmod 644 /app/pdf-tables-extractor-465009-d9172fd0045d.json
    chown app:app /app/pdf-tables-extractor-465009-d9172fd0045d.json
    echo "✅ Credentials file copied successfully"
else
    echo "⚠️  Credentials file not found in /etc/secrets/"
fi

# Switch to app user for security
exec su -c "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1" app 