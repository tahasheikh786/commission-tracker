"""
Pydantic schemas for structured outputs with GPT-4o Vision.
Guarantees JSON Schema compliance and eliminates parsing errors.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime


class TableType(str, Enum):
    """Table classification"""
    COMMISSION = "commission"
    SUMMARY = "summary"
    HIERARCHY = "hierarchy"
    VENDOR_TOTAL = "vendor_total"
    GRAND_TOTAL = "grand_total"
    GENERAL = "general"


class ExtractedTable(BaseModel):
    """Structured table with metadata"""
    table_id: str = Field(..., description="Unique table identifier")
    table_type: TableType = Field(..., description="Classification of table")
    headers: List[str] = Field(..., min_length=1, description="Column headers")
    rows: List[List[str]] = Field(..., min_length=0, description="Table rows as 2D array")
    summary_rows: List[int] = Field(default_factory=list, description="Indices of summary rows")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Extraction confidence")
    page_number: int = Field(..., ge=1, description="Source page number")
    
    class Config:
        json_schema_extra = {
            "example": {
                "table_id": "table_1_page_3",
                "table_type": "commission",
                "headers": ["Agent Name", "Policy #", "Premium", "Commission"],
                "rows": [
                    ["John Doe", "POL-12345", "$5,000", "$500"],
                    ["Jane Smith", "POL-67890", "$3,000", "$300"]
                ],
                "summary_rows": [],
                "confidence": 0.95,
                "page_number": 3
            }
        }


class DocumentMetadata(BaseModel):
    """Document-level metadata"""
    carrier_name: Optional[str] = Field(None, description="Insurance carrier name")
    carrier_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    statement_date: Optional[str] = Field(None, description="Date in YYYY-MM-DD format")
    date_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    broker_company: Optional[str] = Field(None, description="Broker or agent company name")
    statement_period: Optional[str] = Field(None, description="Statement period (e.g., 'Q1 2024')")
    total_amount: Optional[float] = Field(None, ge=0, description="Total commission amount")
    total_amount_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    document_type: str = Field(default="commission_statement")


class Entity(BaseModel):
    """Generic entity extracted from document"""
    entity_type: str = Field(..., description="Type: agent, broker, company, group")
    name: str = Field(..., description="Entity name")
    identifier: Optional[str] = Field(None, description="ID or code")
    amount: Optional[float] = Field(None, description="Associated monetary value")
    page_number: int = Field(..., ge=1)
    confidence: float = Field(..., ge=0.0, le=1.0)


class Relationship(BaseModel):
    """Relationship between entities"""
    source_entity: str = Field(..., description="Source entity name")
    target_entity: str = Field(..., description="Target entity name")
    relationship_type: str = Field(..., description="Type: reports_to, part_of, pays_to")
    confidence: float = Field(..., ge=0.0, le=1.0)


class BusinessIntelligence(BaseModel):
    """Business intelligence metrics"""
    number_of_groups: int = Field(default=0, ge=0)
    number_of_agents: int = Field(default=0, ge=0)
    top_contributors: List[Dict[str, Any]] = Field(default_factory=list)
    total_premium: Optional[float] = Field(None, ge=0)
    total_commission: Optional[float] = Field(None, ge=0)
    average_commission_rate: Optional[float] = Field(None, ge=0, le=1)


class ExtractionResult(BaseModel):
    """Complete extraction result with structured outputs"""
    success: bool = Field(..., description="Extraction success flag")
    document_metadata: DocumentMetadata = Field(..., description="Document-level metadata")
    tables: List[ExtractedTable] = Field(default_factory=list, description="Extracted tables")
    entities: List[Entity] = Field(default_factory=list, description="Extracted entities")
    relationships: List[Relationship] = Field(default_factory=list, description="Entity relationships")
    business_intelligence: BusinessIntelligence = Field(default_factory=BusinessIntelligence)
    summary: Optional[str] = Field(None, description="Natural language summary")
    extraction_method: str = Field(default="gpt5_vision")
    processing_time_seconds: float = Field(..., ge=0)
    total_pages_processed: int = Field(..., ge=1)
    total_tokens_used: int = Field(..., ge=0)
    estimated_cost_usd: float = Field(..., ge=0)
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "document_metadata": {
                    "carrier_name": "Allied Benefit Systems",
                    "carrier_confidence": 0.95,
                    "statement_date": "2024-03-31",
                    "date_confidence": 0.98,
                    "broker_company": "ABC Insurance Agency",
                    "total_amount": 15430.50,
                    "total_amount_confidence": 0.92
                },
                "tables": [],
                "entities": [],
                "relationships": [],
                "business_intelligence": {
                    "number_of_groups": 5,
                    "number_of_agents": 3,
                    "total_commission": 15430.50
                },
                "summary": "Commission statement for March 2024...",
                "extraction_method": "gpt5_vision_enhanced",
                "processing_time_seconds": 12.5,
                "total_pages_processed": 8,
                "total_tokens_used": 5420,
                "estimated_cost_usd": 0.081
            }
        }


class TableExtractionResponse(BaseModel):
    """Response schema for table extraction with structured outputs"""
    tables: List[ExtractedTable] = Field(..., description="List of extracted tables")
    
    class Config:
        json_schema_extra = {
            "example": {
                "tables": [
                    {
                        "table_id": "table_1_page_1",
                        "table_type": "commission",
                        "headers": ["Agent", "Premium", "Commission"],
                        "rows": [["John Doe", "$5000", "$500"]],
                        "summary_rows": [],
                        "confidence": 0.95,
                        "page_number": 1
                    }
                ]
            }
        }


class MetadataExtractionResponse(BaseModel):
    """Response schema for metadata extraction"""
    carrier_name: Optional[str] = Field(None)
    carrier_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    statement_date: Optional[str] = Field(None)
    date_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    broker_company: Optional[str] = Field(None)
    statement_period: Optional[str] = Field(None)
    total_amount: Optional[float] = Field(None)
    document_type: str = Field(default="commission_statement")


def get_table_extraction_schema() -> Dict:
    """
    Get JSON Schema for structured table extraction.
    
    This schema is used with OpenAI's structured outputs mode to guarantee
    JSON Schema compliance (99.9% success rate vs 85% with traditional prompting).
    
    ⚠️ IMPORTANT: Keep schema simple to avoid empty responses from API
    - Avoid deep nesting (max 3 levels)
    - Use clear, simple types
    - Add descriptions for all fields
    - Set additionalProperties: False to prevent hallucinations
    """
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "table_extraction",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "tables": {
                        "type": "array",
                        "description": "List of extracted tables from the page",
                        "items": {
                            "type": "object",
                            "properties": {
                                "table_id": {
                                    "type": "string",
                                    "description": "Unique identifier for the table"
                                },
                                "table_type": {
                                    "type": "string",
                                    "enum": ["commission", "summary", "hierarchy", "vendor_total", "grand_total", "general"],
                                    "description": "Classification of table type"
                                },
                                "headers": {
                                    "type": "array",
                                    "description": "Column headers",
                                    "items": {"type": "string"}
                                },
                                "rows": {
                                    "type": "array",
                                    "description": "Table data rows (2D array)",
                                    "items": {
                                        "type": "array",
                                        "items": {"type": "string"}
                                    }
                                },
                                "summary_rows": {
                                    "type": "array",
                                    "description": "Indices of rows that are summaries/totals",
                                    "items": {"type": "integer"}
                                },
                                "confidence": {
                                    "type": "number",
                                    "description": "Confidence score 0.0-1.0",
                                    "minimum": 0,
                                    "maximum": 1
                                },
                                "page_number": {
                                    "type": "integer",
                                    "description": "Source page number (1-indexed)",
                                    "minimum": 1
                                }
                            },
                            "required": ["table_id", "table_type", "headers", "rows", "summary_rows", "confidence", "page_number"],
                            "additionalProperties": False
                        }
                    }
                },
                "required": ["tables"],
                "additionalProperties": False
            }
        }
    }


def get_metadata_extraction_schema() -> Dict:
    """Get JSON Schema for metadata extraction."""
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "metadata_extraction",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "carrier_name": {"type": ["string", "null"]},
                    "carrier_confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "statement_date": {"type": ["string", "null"]},
                    "date_confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "broker_company": {"type": ["string", "null"]},
                    "statement_period": {"type": ["string", "null"]},
                    "total_amount": {"type": ["number", "null"]},
                    "document_type": {"type": "string"}
                },
                "required": ["carrier_name", "carrier_confidence", "statement_date", "date_confidence", "broker_company", "statement_period", "total_amount", "document_type"],
                "additionalProperties": False
            }
        }
    }

