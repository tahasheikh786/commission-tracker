# Use Python 3.10 slim image as base
FROM python:3.10-slim

# Set working directory in the container
WORKDIR /app

# Set environment variables to optimize Python performance
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Model cache directories
    EASYOCR_MODULE_PATH=/app/model_cache/easyocr \
    DOCLING_CACHE_DIR=/app/model_cache/docling \
    HF_HOME=/app/model_cache/transformers \
    TRANSFORMERS_CACHE=/app/model_cache/transformers \
    # OpenAI configuration
    OPENAI_API_KEY="" \
    OPENAI_API_BASE="https://api.openai.com/v1" \
    # Database configuration
    RENDER_DB_KEY="" \
    SUPABASE_DB_KEY=""

# Install system dependencies required for OpenCV, EasyOCR, Tesseract, and other packages
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgtk-3-0 \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    libv4l-dev \
    libxvidcore-dev \
    libx264-dev \
    libjpeg-dev \
    libpng-dev \
    libtiff-dev \
    libatlas-base-dev \
    libhdf5-dev \
    libhdf5-serial-dev \
    libhdf5-103 \
    python3-dev \
    curl \
    # Tesseract OCR dependencies
    tesseract-ocr \
    tesseract-ocr-eng \
    libtesseract-dev \
    # Additional ML dependencies
    liblapack-dev \
    libblas-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first (for better Docker layer caching)
COPY server/requirements.txt .

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Pre-download EasyOCR English model during build to avoid slow first-time downloads
RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False, download_enabled=True)"

# Pre-download Docling models to avoid runtime downloads
RUN python -c "from docling import document_converter; converter = document_converter.DocumentConverter()"

# Pre-download TableFormer models for the new extraction service
RUN python -c "from transformers import AutoImageProcessor, AutoModelForObjectDetection; AutoImageProcessor.from_pretrained('microsoft/table-transformer-detection'); AutoModelForObjectDetection.from_pretrained('microsoft/table-transformer-detection')"
RUN python -c "from transformers import AutoImageProcessor, AutoModelForObjectDetection; AutoImageProcessor.from_pretrained('microsoft/table-transformer-structure-recognition-v1.1-all'); AutoModelForObjectDetection.from_pretrained('microsoft/table-transformer-structure-recognition-v1.1-all')"

# Create persistent model cache directories
RUN mkdir -p /app/model_cache/easyocr /app/model_cache/docling /app/model_cache/transformers

# Copy downloaded models to persistent location
RUN cp -r /root/.cache/easyocr/* /app/model_cache/easyocr/ 2>/dev/null || true
RUN cp -r /root/.cache/docling/* /app/model_cache/docling/ 2>/dev/null || true
RUN cp -r /root/.cache/huggingface/* /app/model_cache/transformers/ 2>/dev/null || true

# Copy the entire server directory
COPY server/ .

# Make the startup script executable
RUN chmod +x start.sh

# Run as root to access Render secrets directory
# Render mounts secrets with root-only permissions

# Expose port 8000
EXPOSE 8000

# Health check to ensure the application is running
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Command to run the startup script which checks credentials and starts the app
CMD ["./start.sh"] 