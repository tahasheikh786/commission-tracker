#!/usr/bin/env python3
"""
Test script for Excel upload integration
This script tests the complete Excel upload flow from frontend to backend.
"""

import sys
import os
import pandas as pd
import tempfile
import requests
import json
from pathlib import Path

def create_test_excel_file():
    """Create a test Excel file with commission data."""
    
    # Create a temporary Excel file
    with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as tmp_file:
        excel_path = tmp_file.name
    
    # Create sample commission data
    with pd.ExcelWriter(excel_path, engine='openpyxl') as writer:
        
        # Sheet 1: Commission data
        commission_data = {
            'Agent': ['John Doe', 'Jane Smith', 'Bob Johnson', 'Alice Brown'],
            'Policy Number': ['POL001', 'POL002', 'POL003', 'POL004'],
            'Premium Amount': ['$1,200.00', '$850.50', '$2,100.00', '$950.25'],
            'Commission Rate': ['15%', '12%', '18%', '14%'],
            'Commission Amount': ['$180.00', '$102.06', '$378.00', '$133.04']
        }
        df1 = pd.DataFrame(commission_data)
        df1.to_excel(writer, sheet_name='Commission_Data', index=False)
        
        # Sheet 2: Summary data
        summary_data = {
            'Month': ['January', 'February', 'March', 'April', 'May'],
            'Total Premiums': ['$45,000', '$52,000', '$38,000', '$61,000', '$48,000'],
            'Total Commissions': ['$6,750', '$7,800', '$5,700', '$9,150', '$7,200'],
            'Average Commission Rate': ['15%', '15%', '15%', '15%', '15%']
        }
        df2 = pd.DataFrame(summary_data)
        df2.to_excel(writer, sheet_name='Summary', index=False)
    
    return excel_path

def test_excel_upload_api():
    """Test the Excel upload API endpoint."""
    
    print("🧪 Testing Excel Upload API Integration")
    print("=" * 50)
    
    # Create test file
    print("📄 Creating test Excel file...")
    test_file_path = create_test_excel_file()
    print(f"✅ Test file created: {test_file_path}")
    
    try:
        # Test API endpoint
        api_url = "http://localhost:8000/extract-tables-excel/"
        
        # Prepare form data
        with open(test_file_path, 'rb') as f:
            files = {'file': ('test_commission.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            data = {
                'company_id': 'test-company-123',
                'max_tables_per_sheet': '10',
                'enable_quality_checks': 'true'
            }
            
            print(f"\n🌐 Testing API endpoint: {api_url}")
            response = requests.post(api_url, files=files, data=data)
            
            print(f"📊 Response Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print("✅ API call successful!")
                print(f"📋 Results:")
                print(f"   - Status: {result.get('status')}")
                print(f"   - Success: {result.get('success')}")
                print(f"   - File name: {result.get('file_name')}")
                print(f"   - Total tables: {result.get('document_info', {}).get('total_tables', 0)}")
                print(f"   - Total sheets: {result.get('document_info', {}).get('total_sheets', 0)}")
                print(f"   - Sheets with tables: {result.get('document_info', {}).get('sheets_with_tables', 0)}")
                print(f"   - Processing time: {result.get('processing_time_seconds', 0):.2f} seconds")
                
                # Show table details
                tables = result.get('tables', [])
                if tables:
                    print(f"\n📋 Table Details:")
                    for i, table in enumerate(tables):
                        print(f"   Table {i+1}:")
                        print(f"     - Name: {table.get('name', 'Unknown')}")
                        print(f"     - Headers: {table.get('header', [])}")
                        print(f"     - Rows: {len(table.get('rows', []))}")
                        print(f"     - Confidence: {table.get('metadata', {}).get('confidence', 0):.2f}")
                        print(f"     - Quality Score: {table.get('metadata', {}).get('quality_score', 0):.2f}")
                
                # Check quality summary
                quality_summary = result.get('quality_summary', {})
                if quality_summary:
                    print(f"\n📊 Quality Summary:")
                    print(f"   - Total tables: {quality_summary.get('total_tables', 0)}")
                    print(f"   - Valid tables: {quality_summary.get('valid_tables', 0)}")
                    print(f"   - Average quality score: {quality_summary.get('average_quality_score', 0):.2f}")
                    print(f"   - Overall confidence: {quality_summary.get('overall_confidence', 'Unknown')}")
                
                print("\n🎉 Excel upload API test passed successfully!")
                
            else:
                print(f"❌ API call failed with status {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"Error: {error_data}")
                except:
                    print(f"Error: {response.text}")
                    
    except Exception as e:
        print(f"❌ Test failed with error: {str(e)}")
        import traceback
        traceback.print_exc()
        
    finally:
        # Clean up test file
        try:
            os.unlink(test_file_path)
            print(f"\n🧹 Cleaned up test file: {test_file_path}")
        except Exception as e:
            print(f"⚠️  Warning: Could not clean up test file: {str(e)}")

def test_file_type_detection():
    """Test file type detection logic."""
    
    print("\n🔍 Testing File Type Detection")
    print("=" * 30)
    
    # Test different file extensions
    test_files = [
        'commission.xlsx',
        'data.xls', 
        'report.xlsm',
        'summary.xlsb',
        'document.pdf',
        'image.png'
    ]
    
    for filename in test_files:
        is_excel = (filename.lower().endswith('.xlsx') or 
                   filename.lower().endswith('.xls') or
                   filename.lower().endswith('.xlsm') or
                   filename.lower().endswith('.xlsb'))
        
        is_pdf = filename.lower().endswith('.pdf')
        
        supported = is_excel or is_pdf
        
        status = "✅ Supported" if supported else "❌ Not Supported"
        file_type = "Excel" if is_excel else "PDF" if is_pdf else "Other"
        
        print(f"   {filename:<15} -> {file_type:<6} {status}")

if __name__ == "__main__":
    test_file_type_detection()
    test_excel_upload_api()
