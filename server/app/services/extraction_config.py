"""
Configuration for Advanced Table Extraction System
"""

from typing import Dict, List, Any
from dataclasses import dataclass

@dataclass
class ExtractionConfig:
    """Configuration for table extraction parameters"""
    
    # OCR and Image Processing
    dpi: int = 300
    image_enhancement_factor: float = 2.0
    sharpness_factor: float = 1.5
    noise_reduction_kernel_size: int = 3
    
    # Header Detection
    header_similarity_threshold: float = 0.85
    column_similarity_threshold: float = 0.75
    min_header_confidence: float = 0.6
    max_header_row_index: int = 3  # Check up to 3rd row for headers
    
    # Table Merging
    table_merge_threshold: float = 0.8
    min_rows_for_table: int = 2
    max_column_variance: float = 0.3
    
    # Quality Assessment
    min_quality_score: float = 0.5
    completeness_weight: float = 0.4
    consistency_weight: float = 0.3
    length_weight: float = 0.3
    
    # Commission Statement Specific
    commission_keywords: List[str] = None
    numeric_threshold: float = 0.3  # Max % of numeric cells in header
    min_header_length: int = 2
    max_header_length: int = 20
    
    def __post_init__(self):
        if self.commission_keywords is None:
            self.commission_keywords = [
                'commission', 'premium', 'policy', 'carrier', 'broker',
                'agent', 'client', 'effective', 'expiration', 'coverage',
                'plan', 'medical', 'dental', 'vision', 'life', 'disability',
                'amount', 'rate', 'percentage', 'fee', 'charge', 'deductible',
                'copay', 'coinsurance', 'benefit', 'enrollment', 'member',
                'group', 'employer', 'employee', 'dependent', 'spouse',
                'child', 'family', 'individual', 'monthly', 'annual',
                'quarterly', 'semi-annual', 'bi-weekly', 'weekly'
            ]

# Predefined configurations for different types of commission statements
CONFIGURATIONS = {
    "default": ExtractionConfig(),
    
    "high_quality": ExtractionConfig(
        dpi=400,
        header_similarity_threshold=0.9,
        min_quality_score=0.7,
        image_enhancement_factor=1.5
    ),
    
    "low_quality": ExtractionConfig(
        dpi=200,
        header_similarity_threshold=0.75,
        column_similarity_threshold=0.6,
        min_quality_score=0.3,
        image_enhancement_factor=3.0,
        sharpness_factor=2.0,
        noise_reduction_kernel_size=5
    ),
    
    "multi_page": ExtractionConfig(
        header_similarity_threshold=0.8,
        table_merge_threshold=0.75,
        max_header_row_index=5
    ),
    
    "complex_structure": ExtractionConfig(
        header_similarity_threshold=0.7,
        column_similarity_threshold=0.6,
        max_header_row_index=4,
        min_quality_score=0.4
    )
}

def get_config(config_type: str = "default") -> ExtractionConfig:
    """Get configuration by type"""
    return CONFIGURATIONS.get(config_type, CONFIGURATIONS["default"])

def create_custom_config(**kwargs) -> ExtractionConfig:
    """Create a custom configuration with overridden parameters"""
    base_config = ExtractionConfig()
    for key, value in kwargs.items():
        if hasattr(base_config, key):
            setattr(base_config, key, value)
    return base_config 