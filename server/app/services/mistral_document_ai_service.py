"""
Mistral Document AI Service - Simple and Dynamic
"""
from __future__ import annotations
import os
import base64
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from mistralai import Mistral
from mistralai.extra import response_format_from_pydantic_model

logger = logging.getLogger(__name__)

# Pydantic models for Mistral Document AI annotations
class CommissionTable(BaseModel):
    """Model for commission table extraction using Mistral Document AI"""
    headers: List[str] = Field(..., description="Column headers of the commission table")
    rows: List[List[str]] = Field(..., description="Data rows of the commission table")
    table_type: str = Field(default="commission_table", description="Type of table")
    company_name: Optional[str] = Field(None, description="Company name if detected")

class DocumentMetadata(BaseModel):
    """Model for document metadata extraction"""
    company_name: Optional[str] = Field(None, description="Main company name from the document")
    document_date: Optional[str] = Field(None, description="Statement date or document date")
    statement_month: Optional[str] = Field(None, description="Statement month if available")
    agent_company: Optional[str] = Field(None, description="Agent or broker company name")
    agent_id: Optional[str] = Field(None, description="Agent ID or number")
    total_commission: Optional[str] = Field(None, description="Total commission amount")
    document_type: str = Field(default="commission_statement", description="Type of document")

class CommissionDocument(BaseModel):
    """Model for complete commission document extraction"""
    document_metadata: DocumentMetadata = Field(..., description="Document-level metadata")
    tables: List[CommissionTable] = Field(..., description="All tables found in the document")
    total_tables: int = Field(..., description="Total number of tables found")
    extraction_confidence: str = Field(default="0.9", description="Confidence score for the extraction")


class MistralDocumentAIService:
    """
    Simple Mistral Document AI service for commission data extraction using SDK.
    """
    
    def __init__(self):
        self.client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Mistral client"""
        try:
            api_key = os.getenv("MISTRAL_API_KEY")
            if not api_key:
                logger.warning("MISTRAL_API_KEY not found in environment variables")
                return
            
            self.client = Mistral(api_key=api_key)
            logger.info("Mistral Document AI client initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize Mistral client: {e}")
            self.client = None
    
    def is_available(self) -> bool:
        """Check if Mistral Document AI service is available"""
        return self.client is not None
    
    def test_connection(self) -> Dict[str, Any]:
        """Test connection to Mistral Document AI"""
        try:
            if not self.is_available():
                return {"success": False, "error": "Mistral client not initialized"}
            
            # Simple test with Document QnA
            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "What is in this document?"
                        },
                        {
                            "type": "document_url",
                            "document_url": "data:application/pdf;base64,JVBERi0xLjcKJeLjz9MKMTUgMCBvYmoKPDwKL0xlbmd0aCAxNiAwIFIKL0ZpbHRlciBbL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlXQo+PgpzdHJlYW0K"
                        }
                    ]
                }
            ]
            
            response = self.client.chat.complete(
                model="mistral-small-latest",
                messages=messages,
                max_tokens=100
            )
            
            return {"success": True, "message": "Connection successful"}
            
        except Exception as e:
            logger.error(f"Mistral connection test failed: {e}")
            return {"success": False, "error": str(e)}
    
    def extract_commission_data(self, file_path: str, max_pages: int = None) -> Dict[str, Any]:
        """
        Extract commission data from PDF using Mistral Document QnA with structured output.
        """
        try:
            logger.info(f"Starting Mistral Document QnA extraction for: {file_path}")
            
            # Read PDF and convert to base64
            with open(file_path, 'rb') as f:
                pdf_content = f.read()
            
            pdf_base64 = base64.b64encode(pdf_content).decode('utf-8')
            
            # Use Document QnA with structured output
            messages = [
                {
                    "role": "system",
                    "content": "You are an expert at extracting commission data from insurance documents. Extract all tables, company information, dates, and commission details from the document."
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Extract all commission tables from this document. For each table, provide the headers, all data rows, company name, and any relevant metadata like dates and commission amounts."
                        },
                        {
                            "type": "document_url",
                            "document_url": f"data:application/pdf;base64,{pdf_base64}"
                        }
                    ]
                }
            ]
            
            # Call Mistral Document QnA with structured output
            response = self.client.chat.parse(
                model="mistral-small-latest",
                messages=messages,
                response_format=CommissionDocument,
                max_tokens=4000,
                temperature=0
            )
            
            # Extract parsed data from Document QnA response
            if hasattr(response, 'choices') and response.choices:
                parsed_data = response.choices[0].message.parsed
                logger.info(f"Parsed Document QnA data: {parsed_data}")
                
                if parsed_data and hasattr(parsed_data, 'tables'):
                    # Transform to expected format
                    formatted_tables = []
                    for table in parsed_data.tables:
                        formatted_table = {
                            "headers": table.headers,
                            "rows": table.rows,
                            "extractor": "mistral_document_qna",
                            "table_type": table.table_type,
                            "company_name": parsed_data.document_metadata.company_name,
                            "metadata": {
                                "extraction_method": "mistral_document_qna_structured",
                                "timestamp": datetime.now().isoformat(),
                                "confidence": float(parsed_data.extraction_confidence),
                                "document_metadata": {
                                    "company_name": parsed_data.document_metadata.company_name,
                                    "document_date": parsed_data.document_metadata.document_date,
                                    "statement_month": parsed_data.document_metadata.statement_month,
                                    "agent_company": parsed_data.document_metadata.agent_company,
                                    "agent_id": parsed_data.document_metadata.agent_id,
                                    "total_commission": parsed_data.document_metadata.total_commission,
                                    "document_type": parsed_data.document_metadata.document_type
                                }
                            }
                        }
                        formatted_tables.append(formatted_table)
                    
                    tables = formatted_tables
                else:
                    logger.info("No tables found in Document QnA response")
                    tables = []
            else:
                logger.info("No parsed data found in Document QnA response")
                tables = []
            
            return {
                "success": True,
                "tables": tables,
                "extraction_metadata": {
                    "method": "mistral_document_ai_document_annotation",
                    "timestamp": datetime.now().isoformat(),
                    "confidence": 0.9
                }
            }
            
        except Exception as e:
            logger.error(f"Mistral Document AI extraction failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "tables": [],
                "extraction_metadata": {
                    "method": "mistral_document_ai_error",
                    "timestamp": datetime.now().isoformat(),
                    "error": str(e)
                }
            }
    
    def _extract_tables_from_content(self, content: str) -> List[Dict[str, Any]]:
        """
        Extract tables from raw content when JSON parsing fails.
        """
        try:
            import re
            
            # Extract basic information
            companies = re.findall(r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Inc|Corp|LLC|Ltd|Company|Group))', content)
            amounts = re.findall(r'\$[\d,]+\.?\d*', content)
            dates = re.findall(r'[A-Za-z]{3}\s+\d{4}', content)
            
            # Create a simple table structure
            headers = ["Company", "Date", "Amount", "Commission"]
            rows = []
            
            # Create rows from extracted data
            for i, company in enumerate(companies[:3]):  # Limit to 3 rows
                row = [
                    company,
                    dates[i] if i < len(dates) else dates[0] if dates else "",
                    amounts[i] if i < len(amounts) else "",
                    amounts[i + 1] if i + 1 < len(amounts) else ""
                ]
                rows.append(row)
            
            if rows:
                return [{
                    "headers": headers,
                    "rows": rows,
                    "extractor": "mistral_document_ai",
                    "table_type": "commission_table",
                    "company_name": companies[0] if companies else "Unknown Company",
                    "metadata": {
                        "extraction_method": "mistral_document_ai_simple",
                        "timestamp": datetime.now().isoformat(),
                        "confidence": 0.8,
                        "note": f"Simple extraction - found {len(rows)} rows"
                    }
                }]
            
            return []
            
        except Exception as e:
            logger.error(f"Error extracting tables from content: {e}")
            return []
