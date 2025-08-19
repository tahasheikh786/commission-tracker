from ..models import CarrierFormatLearning
from ..schemas import CarrierFormatLearningCreate, CarrierFormatLearningUpdate
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from uuid import UUID
from typing import List, Optional

async def save_carrier_format_learning(db: AsyncSession, format_learning: CarrierFormatLearningCreate):
    """
    Save or update carrier format learning data.
    """
    now = datetime.utcnow()
    
    # Check if format already exists for this company
    existing_format = await get_carrier_format_by_signature(db, format_learning.company_id, format_learning.format_signature)
    
    if existing_format:
        # Update existing format
        existing_format.usage_count += 1
        existing_format.last_used = now
        existing_format.updated_at = now
        
        # Update fields if provided
        if format_learning.header_patterns is not None:
            existing_format.header_patterns = format_learning.header_patterns
        if format_learning.column_types is not None:
            existing_format.column_types = format_learning.column_types
        if format_learning.column_patterns is not None:
            existing_format.column_patterns = format_learning.column_patterns
        if format_learning.sample_values is not None:
            existing_format.sample_values = format_learning.sample_values
        if format_learning.table_structure is not None:
            existing_format.table_structure = format_learning.table_structure
        if format_learning.data_quality_metrics is not None:
            existing_format.data_quality_metrics = format_learning.data_quality_metrics
        if format_learning.field_mapping is not None:
            existing_format.field_mapping = format_learning.field_mapping
        if format_learning.table_editor_settings is not None:
            existing_format.table_editor_settings = format_learning.table_editor_settings
        
        await db.commit()
        await db.refresh(existing_format)
        return existing_format
    else:
        # Create new format
        new_format = CarrierFormatLearning(
            company_id=format_learning.company_id,
            format_signature=format_learning.format_signature,
            headers=format_learning.headers,
            header_patterns=format_learning.header_patterns,
            column_types=format_learning.column_types,
            column_patterns=format_learning.column_patterns,
            sample_values=format_learning.sample_values,
            table_structure=format_learning.table_structure,
            data_quality_metrics=format_learning.data_quality_metrics,
            field_mapping=format_learning.field_mapping,
            table_editor_settings=format_learning.table_editor_settings,
            confidence_score=format_learning.confidence_score,
            usage_count=format_learning.usage_count,
            last_used=now,
            created_at=now,
            updated_at=now
        )
        db.add(new_format)
        await db.commit()
        await db.refresh(new_format)
        return new_format

async def get_carrier_format_by_signature(db: AsyncSession, company_id: UUID, format_signature: str):
    """
    Get carrier format learning by company ID and format signature.
    """
    result = await db.execute(
        select(CarrierFormatLearning)
        .where(CarrierFormatLearning.company_id == company_id)
        .where(CarrierFormatLearning.format_signature == format_signature)
    )
    return result.scalar_one_or_none()

async def get_carrier_formats_for_company(db: AsyncSession, company_id: UUID):
    """
    Get all carrier format learning records for a company.
    """
    result = await db.execute(
        select(CarrierFormatLearning)
        .where(CarrierFormatLearning.company_id == company_id)
        .order_by(CarrierFormatLearning.last_used.desc())
    )
    return result.scalars().all()

async def find_best_matching_format(db: AsyncSession, company_id: UUID, headers: List[str], table_structure: dict):
    """
    Find the best matching format for given headers and structure.
    """
    # Get all formats for this company
    formats = await get_carrier_formats_for_company(db, company_id)
    
    best_match = None
    best_score = 0
    
    for format_record in formats:
        # Calculate similarity score
        header_similarity = calculate_header_similarity(headers, format_record.headers)
        structure_similarity = calculate_structure_similarity(table_structure, format_record.table_structure)
        
        # Combined score (weighted average)
        total_score = (header_similarity * 0.7) + (structure_similarity * 0.3)
        
        if total_score > best_score and total_score > 0.8:  # Minimum threshold
            best_score = total_score
            best_match = format_record
    
    return best_match, best_score

def calculate_header_similarity(headers1: List[str], headers2: List[str]) -> float:
    """
    Calculate similarity between two header lists.
    """
    if not headers1 or not headers2:
        return 0.0
    
    # Normalize headers
    headers1_normalized = [h.lower().strip() for h in headers1]
    headers2_normalized = [h.lower().strip() for h in headers2]
    
    # Find common headers
    common_headers = set(headers1_normalized) & set(headers2_normalized)
    
    # Calculate Jaccard similarity
    union_headers = set(headers1_normalized) | set(headers2_normalized)
    
    if not union_headers:
        return 0.0
    
    return len(common_headers) / len(union_headers)

def calculate_structure_similarity(structure1: dict, structure2: dict) -> float:
    """
    Calculate similarity between two table structures.
    """
    if not structure1 or not structure2:
        return 0.0
    
    # Compare key structural elements
    score = 0.0
    comparisons = 0
    
    # Compare column count
    if 'column_count' in structure1 and 'column_count' in structure2:
        col_diff = abs(structure1['column_count'] - structure2['column_count'])
        max_cols = max(structure1['column_count'], structure2['column_count'])
        if max_cols > 0:
            score += 1.0 - (col_diff / max_cols)
        comparisons += 1
    
    # Compare row count (if available)
    if 'typical_row_count' in structure1 and 'typical_row_count' in structure2:
        row_diff = abs(structure1['typical_row_count'] - structure2['typical_row_count'])
        max_rows = max(structure1['typical_row_count'], structure2['typical_row_count'])
        if max_rows > 0:
            score += 1.0 - (row_diff / max_rows)
        comparisons += 1
    
    return score / comparisons if comparisons > 0 else 0.0
