"""
Claude Document AI Service - Superior PDF Table Extraction

This service provides intelligent document extraction capabilities using Claude 3.5 Sonnet
or Claude 4 for commission statement processing with excellent accuracy.

Enhanced Features:
- Enhanced prompts for Google Gemini-quality summaries
- Semantic entity extraction and relationship mapping
- 3-phase intelligent extraction pipeline
"""

from .service import ClaudeDocumentAIService
from .models import (
    ClaudeExtractionResponse,
    ClaudeDocumentMetadata,
    ClaudeTableData,
    ClaudeQualityMetrics
)
from .enhanced_prompts import EnhancedClaudePrompts
from .semantic_extractor import SemanticExtractionService

__all__ = [
    'ClaudeDocumentAIService',
    'ClaudeExtractionResponse',
    'ClaudeDocumentMetadata',
    'ClaudeTableData',
    'ClaudeQualityMetrics',
    'EnhancedClaudePrompts',
    'SemanticExtractionService'
]

