#!/bin/bash

# Simple dependency installation script for Python 3.13 compatibility
# This script installs dependencies without problematic ML libraries

set -e

echo "🔧 Installing dependencies for Advanced Table Extraction System..."
echo "================================================================"

# Check Python version
python_version=$(python3 --version 2>&1 | grep -o '[0-9]\+\.[0-9]\+' | head -1)
echo "📋 Detected Python version: $python_version"

# Check if virtual environment exists
if [[ ! -d "venv" ]]; then
    echo "🐍 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "⬆️  Upgrading pip..."
pip install --upgrade pip

# Install basic dependencies first
echo "📦 Installing basic dependencies..."
pip install fastapi uvicorn sqlalchemy[asyncio] asyncpg boto3 pdf2image pillow python-dotenv pydantic python-multipart

# Install NumPy (compatible version - MUST be <2.0.0)
echo "📦 Installing NumPy (compatible version)..."
pip install "numpy<2.0.0"

# Install OpenCV (headless version to avoid GUI dependencies)
echo "📦 Installing OpenCV (headless)..."
pip install opencv-python-headless==4.8.1.78

# Install Tesseract wrapper
echo "📦 Installing Tesseract wrapper..."
pip install pytesseract==0.3.10

# Install image processing libraries
echo "📦 Installing image processing libraries..."
pip install imageio==2.31.1

# Install additional utilities
echo "📦 Installing additional utilities..."
pip install "Pillow>=10.0.0"

echo ""
echo "✅ Dependencies installed successfully!"
echo ""
echo "📋 What was installed:"
echo "   ✅ FastAPI and web framework"
echo "   ✅ Database drivers (PostgreSQL)"
echo "   ✅ AWS SDK (Textract)"
echo "   ✅ PDF processing (pdf2image)"
echo "   ✅ Image processing (OpenCV, Pillow)"
echo "   ✅ OCR (Tesseract wrapper)"
echo "   ✅ Numerical computing (NumPy <2.0.0)"
echo ""
echo "📋 What was NOT installed (due to Python 3.13 compatibility):"
echo "   ❌ scikit-learn (replaced with built-in text similarity)"
echo "   ❌ scipy (not required for core functionality)"
echo "   ❌ pandas (not required for core functionality)"
echo ""
echo "🚀 The advanced extraction system will work with simplified text similarity algorithms."
echo ""
echo "📋 Next steps:"
echo "1. Install system dependencies:"
echo "   # macOS:"
echo "   brew install tesseract poppler"
echo "   # Ubuntu/Debian:"
echo "   sudo apt-get install tesseract-ocr tesseract-ocr-eng poppler-utils"
echo ""
echo "2. Configure AWS credentials:"
echo "   aws configure"
echo ""
echo "3. Start the server:"
echo "   source venv/bin/activate"
echo "   uvicorn app.main:app --reload"
echo ""
echo "🎉 Installation complete!" 