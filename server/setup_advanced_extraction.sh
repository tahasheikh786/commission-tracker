#!/bin/bash

# Advanced Table Extraction System Setup Script
# This script installs all required dependencies

set -e

echo "🚀 Setting up Advanced Table Extraction System..."
echo "=================================================="

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
else
    echo "❌ Unsupported operating system: $OSTYPE"
    exit 1
fi

echo "📋 Detected OS: $OS"

# Function to install system dependencies
install_system_deps() {
    echo "📦 Installing system dependencies..."
    
    if [[ "$OS" == "linux" ]]; then
        # Ubuntu/Debian
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y \
                tesseract-ocr \
                tesseract-ocr-eng \
                libopencv-dev \
                python3-opencv \
                poppler-utils \
                python3-pip \
                python3-venv
        else
            echo "❌ Package manager not found. Please install dependencies manually."
            exit 1
        fi
    elif [[ "$OS" == "macos" ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew update
            brew install tesseract
            brew install opencv
            brew install poppler
        else
            echo "❌ Homebrew not found. Please install Homebrew first:"
            echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            exit 1
        fi
    fi
    
    echo "✅ System dependencies installed"
}

# Function to setup Python environment
setup_python_env() {
    echo "🐍 Setting up Python environment..."
    
    # Create virtual environment if it doesn't exist
    if [[ ! -d "venv" ]]; then
        echo "Creating virtual environment..."
        python3 -m venv venv
    fi
    
    # Activate virtual environment
    source venv/bin/activate
    
    # Upgrade pip
    pip install --upgrade pip
    
    # Install Python dependencies
    echo "Installing Python dependencies..."
    pip install -r requirements.txt
    
    echo "✅ Python environment setup complete"
}

# Function to verify installation
verify_installation() {
    echo "🔍 Verifying installation..."
    
    # Check if virtual environment is activated
    if [[ -z "$VIRTUAL_ENV" ]]; then
        echo "⚠️  Virtual environment not activated. Activating now..."
        source venv/bin/activate
    fi
    
    # Test imports
    echo "Testing Python imports..."
    python3 -c "
import cv2
import numpy as np
import pytesseract
from PIL import Image
from sklearn.feature_extraction.text import TfidfVectorizer
print('✅ All Python dependencies imported successfully')
"
    
    # Test Tesseract
    echo "Testing Tesseract..."
    if command -v tesseract &> /dev/null; then
        tesseract --version
        echo "✅ Tesseract is working"
    else
        echo "❌ Tesseract not found"
        exit 1
    fi
    
    # Test OpenCV
    echo "Testing OpenCV..."
    python3 -c "
import cv2
print(f'✅ OpenCV version: {cv2.__version__}')
"
    
    echo "✅ Installation verification complete"
}

# Function to run test suite
run_tests() {
    echo "🧪 Running test suite..."
    
    if [[ -z "$VIRTUAL_ENV" ]]; then
        source venv/bin/activate
    fi
    
    python3 test_advanced_extraction.py
    
    echo "✅ Test suite completed"
}

# Function to show next steps
show_next_steps() {
    echo ""
    echo "🎉 Setup completed successfully!"
    echo "=================================="
    echo ""
    echo "📋 Next Steps:"
    echo "1. Configure AWS credentials for Textract:"
    echo "   aws configure"
    echo ""
    echo "2. Set up your database and environment variables"
    echo ""
    echo "3. Start the server:"
    echo "   source venv/bin/activate"
    echo "   uvicorn app.main:app --reload"
    echo ""
    echo "4. Test with actual commission statement PDFs"
    echo ""
    echo "5. Check the API documentation at:"
    echo "   http://localhost:8000/docs"
    echo ""
    echo "📚 Documentation:"
    echo "   - Advanced Extraction README: ADVANCED_EXTRACTION_README.md"
    echo "   - API Documentation: http://localhost:8000/docs"
    echo ""
}

# Main execution
main() {
    install_system_deps
    setup_python_env
    verify_installation
    run_tests
    show_next_steps
}

# Check if script is run with sudo
if [[ $EUID -eq 0 ]]; then
    echo "❌ Please don't run this script as root"
    exit 1
fi

# Run main function
main 