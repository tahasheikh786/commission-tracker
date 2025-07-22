# Advanced Table Extraction System

## Overview

The Advanced Table Extraction System is a comprehensive solution designed to handle the complex and dynamic nature of commission statement PDFs. It addresses common challenges such as:

- **Multi-page tables** with headers on different rows
- **Low-quality PDFs** with poor OCR results
- **Dynamic table structures** that vary between documents
- **Header mismatches** across pages of the same table
- **Inconsistent data formats** in commission statements

## Key Features

### 🧠 AI-Powered Preprocessing
- **Multi-engine OCR**: Combines AWS Textract and Tesseract for better accuracy
- **Advanced Image Enhancement**: Contrast, sharpness, and noise reduction
- **Adaptive Thresholding**: Optimizes image processing for different quality levels

### 🔍 Intelligent Header Detection
- **Multi-row Analysis**: Checks 1st, 2nd, and 3rd rows for headers
- **Commission-Specific Patterns**: Recognizes insurance and commission terminology
- **Confidence Scoring**: Rates header quality and reliability

### 🔗 Fuzzy Table Merging
- **95% Similarity Matching**: Merges tables with similar headers across pages
- **TF-IDF Vectorization**: Advanced text similarity analysis
- **Sequence Matching**: Handles OCR variations and typos

### 📊 Quality Assessment & Validation
- **Comprehensive Metrics**: Completeness, consistency, accuracy, and structure quality
- **Data Type Validation**: Currency, percentage, date, and text format checking
- **Automatic Corrections**: Fixes common OCR and formatting issues

### ⚙️ Configurable Extraction Profiles
- **Predefined Configurations**: Optimized for different document types
- **Custom Parameters**: Adjustable thresholds and processing options
- **Quality Thresholds**: Configurable minimum quality requirements

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PDF Upload    │───▶│  Image Preproc   │───▶│ Multi-Engine    │
│                 │    │                  │    │     OCR         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Quality Report  │◀───│   Validation     │◀───│ Header Detection│
│                 │    │                  │    │ & Table Merging │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Installation

### Prerequisites

1. **System Dependencies**:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install tesseract-ocr tesseract-ocr-eng
   sudo apt-get install libopencv-dev python3-opencv
   sudo apt-get install poppler-utils
   
   # macOS
   brew install tesseract
   brew install opencv
   brew install poppler
   ```

2. **Python Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

### Environment Setup

1. **AWS Credentials**: Configure AWS credentials for Textract access
2. **Database**: Ensure PostgreSQL is running and configured
3. **S3 Bucket**: Set up S3 bucket for file storage

## Usage

### Basic Advanced Extraction

```python
# Using the advanced extraction endpoint
POST /advanced/extract-tables/
{
    "file": "commission_statement.pdf",
    "company_id": "uuid",
    "config_type": "default",
    "quality_threshold": 0.6,
    "enable_validation": true
}
```

### Custom Configuration

```python
# Extract with custom parameters
POST /advanced/extract-with-custom-config/
{
    "file": "low_quality_statement.pdf",
    "company_id": "uuid",
    "dpi": 400,
    "header_similarity_threshold": 0.75,
    "quality_threshold": 0.5,
    "enable_validation": true
}
```

### Quality Report

```python
# Get detailed quality analysis
GET /advanced/quality-report/{upload_id}
```

## Configuration Profiles

### Default Profile
- **Best for**: Most commission statements
- **DPI**: 300
- **Header Similarity**: 85%
- **Quality Threshold**: 60%

### High Quality Profile
- **Best for**: Clear, well-formatted PDFs
- **DPI**: 400
- **Header Similarity**: 90%
- **Quality Threshold**: 70%

### Low Quality Profile
- **Best for**: Scanned or poor-quality documents
- **DPI**: 200
- **Header Similarity**: 75%
- **Quality Threshold**: 30%
- **Enhanced Preprocessing**: Yes

### Multi-Page Profile
- **Best for**: Tables spanning multiple pages
- **Header Similarity**: 80%
- **Merge Threshold**: 75%
- **Max Header Row**: 5

### Complex Structure Profile
- **Best for**: Irregular table layouts
- **Header Similarity**: 70%
- **Column Similarity**: 60%
- **Max Header Row**: 4

## API Endpoints

### Advanced Extraction
- `POST /advanced/extract-tables/` - Main extraction endpoint
- `POST /advanced/extract-with-custom-config/` - Custom configuration
- `GET /advanced/quality-report/{upload_id}` - Quality analysis
- `GET /advanced/extraction-configs` - Available configurations

### Response Format

```json
{
    "tables": [
        {
            "header": ["Policy", "Carrier", "Premium", "Commission"],
            "rows": [["POL001", "ABC Ins", "$1000", "15%"]],
            "metadata": {
                "quality_metrics": {
                    "overall_score": 0.85,
                    "completeness": 0.90,
                    "consistency": 0.80,
                    "accuracy": 0.85,
                    "confidence_level": "HIGH"
                }
            }
        }
    ],
    "quality_summary": {
        "total_tables": 1,
        "valid_tables": 1,
        "average_quality_score": 0.85,
        "overall_confidence": "HIGH",
        "issues_found": [],
        "recommendations": []
    }
}
```

## Quality Metrics Explained

### Overall Score (0-1)
Weighted combination of all quality metrics

### Completeness (0-1)
Percentage of non-empty cells in the table

### Consistency (0-1)
Data type and format consistency across columns

### Accuracy (0-1)
Valid format compliance (currency, dates, etc.)

### Structure Quality (0-1)
Header quality and row alignment

### Data Quality (0-1)
Reasonableness of values (commission rates, amounts)

## Troubleshooting

### Common Issues

1. **No Tables Found**
   - Try different configuration profiles
   - Increase DPI setting
   - Check PDF quality

2. **Low Quality Scores**
   - Use "low_quality" profile
   - Enable enhanced preprocessing
   - Lower quality threshold

3. **Header Detection Issues**
   - Adjust header similarity threshold
   - Check for commission-specific keywords
   - Review table structure

4. **Table Merging Problems**
   - Lower merge threshold
   - Check for OCR variations
   - Review header consistency

### Performance Optimization

1. **Large Files**: Use background processing
2. **Multiple Files**: Implement batch processing
3. **Memory Usage**: Monitor and adjust DPI settings

## Best Practices

### For High-Quality Results

1. **Use Appropriate Profile**: Match configuration to document quality
2. **Validate Results**: Always review quality reports
3. **Iterate**: Adjust parameters based on results
4. **Monitor**: Track quality metrics over time

### For Production Use

1. **Error Handling**: Implement proper exception handling
2. **Logging**: Enable detailed logging for debugging
3. **Monitoring**: Track extraction success rates
4. **Backup**: Keep original files for reprocessing

## Advanced Features

### Background Processing
```python
# Enable background tasks for large files
background_tasks.add_task(perform_detailed_analysis, upload_id, tables)
```

### Custom Validation Rules
```python
# Add company-specific validation
validator.add_custom_rule("policy_format", custom_policy_validator)
```

### Machine Learning Integration
```python
# Train custom models for specific document types
extractor.train_custom_model(training_data)
```

## Contributing

1. **Code Style**: Follow PEP 8 guidelines
2. **Testing**: Add tests for new features
3. **Documentation**: Update docs for changes
4. **Performance**: Monitor impact on extraction speed

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review quality reports for insights
3. Try different configuration profiles
4. Contact the development team

## Future Enhancements

- **Deep Learning Models**: Custom neural networks for specific document types
- **Real-time Processing**: Stream processing for large volumes
- **Cloud Integration**: Multi-cloud OCR support
- **Advanced Analytics**: Predictive quality assessment 