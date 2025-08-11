"""Streamlit web interface for table extraction pipeline."""

import asyncio
import tempfile
import time
from typing import List, Dict, Any, Optional
from pathlib import Path
import json
import pandas as pd

import streamlit as st
from PIL import Image
import numpy as np

from ..pipeline.extraction_pipeline import ExtractionPipeline, ExtractionOptions
from ..utils.config import get_config
from ..utils.logging_utils import get_logger


# Page configuration
st.set_page_config(
    page_title="Table Extraction Pipeline",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        color: #1f77b4;
        text-align: center;
        margin-bottom: 2rem;
    }
    .stat-card {
        background-color: #f0f2f6;
        padding: 1rem;
        border-radius: 0.5rem;
        border-left: 4px solid #1f77b4;
    }
    .warning-box {
        background-color: #fff3cd;
        border: 1px solid #ffeaa7;
        border-radius: 0.25rem;
        padding: 0.75rem;
        margin: 0.5rem 0;
    }
    .error-box {
        background-color: #f8d7da;
        border: 1px solid #f5c6cb;
        border-radius: 0.25rem;
        padding: 0.75rem;
        margin: 0.5rem 0;
    }
</style>
""", unsafe_allow_html=True)


@st.cache_resource
def initialize_pipeline():
    """Initialize the extraction pipeline."""
    try:
        config = get_config()
        pipeline = ExtractionPipeline(config)
        return pipeline, config
    except Exception as e:
        st.error(f"Failed to initialize pipeline: {e}")
        return None, None


def display_statistics(pipeline: ExtractionPipeline):
    """Display pipeline statistics."""
    stats = pipeline.get_statistics()
    
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.markdown("""
        <div class="stat-card">
            <h4>Documents Processed</h4>
            <h2>{}</h2>
        </div>
        """.format(stats.get('total_documents_processed', 0)), unsafe_allow_html=True)
    
    with col2:
        st.markdown("""
        <div class="stat-card">
            <h4>Tables Extracted</h4>
            <h2>{}</h2>
        </div>
        """.format(stats.get('total_tables_extracted', 0)), unsafe_allow_html=True)
    
    with col3:
        st.markdown("""
        <div class="stat-card">
            <h4>Average Time</h4>
            <h2>{:.1f}s</h2>
        </div>
        """.format(stats.get('average_processing_time', 0)), unsafe_allow_html=True)
    
    with col4:
        st.markdown("""
        <div class="stat-card">
            <h4>Success Rate</h4>
            <h2>{:.1%}</h2>
        </div>
        """.format(stats.get('success_rate', 0)), unsafe_allow_html=True)


def display_extraction_options():
    """Display extraction options in sidebar."""
    st.sidebar.header("⚙️ Extraction Options")
    
    # Basic options
    enable_ocr = st.sidebar.checkbox("Enable OCR", value=True, help="Extract text from table cells")
    enable_multipage = st.sidebar.checkbox("Enable Multi-page", value=True, help="Process all pages in document")
    
    # Advanced options
    with st.sidebar.expander("🔧 Advanced Options"):
        confidence_threshold = st.slider(
            "Confidence Threshold",
            min_value=0.0,
            max_value=1.0,
            value=0.5,
            step=0.05,
            help="Minimum confidence score for table detection"
        )
        
        max_tables_per_page = st.number_input(
            "Max Tables per Page",
            min_value=1,
            max_value=50,
            value=10,
            help="Maximum number of tables to extract per page"
        )
        
        output_format = st.selectbox(
            "Output Format",
            options=["json", "csv", "xlsx"],
            index=0,
            help="Format for extracted table data"
        )
        
        include_raw_data = st.checkbox(
            "Include Raw Data",
            value=False,
            help="Include raw processing data in results"
        )
        
        enable_quality_checks = st.checkbox(
            "Enable Quality Checks",
            value=True,
            help="Perform quality assessment on extracted tables"
        )
    
    return ExtractionOptions(
        enable_ocr=enable_ocr,
        enable_multipage=enable_multipage,
        confidence_threshold=confidence_threshold,
        max_tables_per_page=max_tables_per_page,
        output_format=output_format,
        include_raw_data=include_raw_data,
        enable_quality_checks=enable_quality_checks
    )


def display_table_result(table: Dict[str, Any], table_idx: int):
    """Display a single table result."""
    with st.expander(f"📊 Table {table_idx + 1}", expanded=True):
        col1, col2 = st.columns([2, 1])
        
        with col2:
            # Table metadata
            st.subheader("Metadata")
            structure = table.get('structure', {})
            st.write(f"**Rows:** {structure.get('rows', 'Unknown')}")
            st.write(f"**Columns:** {structure.get('columns', 'Unknown')}")
            st.write(f"**Detection Confidence:** {table.get('detection_confidence', 0):.2%}")
            st.write(f"**Structure Confidence:** {table.get('structure_confidence', 0):.2%}")
            
            if 'quality_score' in table:
                st.write(f"**Quality Score:** {table['quality_score']:.2%}")
            
            if 'page_number' in table:
                st.write(f"**Page:** {table['page_number'] + 1}")
        
        with col1:
            # Table data
            st.subheader("Extracted Data")
            cells = table.get('cells', [])
            
            if cells:
                # Convert cells to DataFrame for display
                try:
                    # Create a grid based on cell positions
                    max_row = max(cell.get('row', 0) for cell in cells) + 1
                    max_col = max(cell.get('column', 0) for cell in cells) + 1
                    
                    # Initialize grid
                    grid = [["" for _ in range(max_col)] for _ in range(max_row)]
                    
                    # Fill grid with cell data
                    for cell in cells:
                        row = cell.get('row', 0)
                        col = cell.get('column', 0)
                        text = cell.get('text', '')
                        if row < max_row and col < max_col:
                            grid[row][col] = text
                    
                    # Create DataFrame
                    df = pd.DataFrame(grid)
                    st.dataframe(df, use_container_width=True)
                    
                    # Download options
                    if table.get('output_format') == 'csv':
                        csv = df.to_csv(index=False)
                        st.download_button(
                            label="📥 Download as CSV",
                            data=csv,
                            file_name=f"table_{table_idx + 1}.csv",
                            mime="text/csv"
                        )
                    
                except Exception as e:
                    st.error(f"Error displaying table: {e}")
                    # Fallback: show raw cell data
                    st.json(cells[:10])  # Show first 10 cells
            else:
                st.warning("No cell data available for this table")


async def process_uploaded_file(uploaded_file, options: ExtractionOptions, pipeline: ExtractionPipeline):
    """Process uploaded file and return results."""
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(uploaded_file.name).suffix) as tmp_file:
        tmp_file.write(uploaded_file.getvalue())
        tmp_file_path = tmp_file.name
    
    try:
        # Extract tables
        result = await pipeline.extract_tables(tmp_file_path, options)
        return result
    finally:
        # Cleanup
        Path(tmp_file_path).unlink(missing_ok=True)


def main():
    """Main Streamlit application."""
    
    # Header
    st.markdown('<h1 class="main-header">📊 Table Extraction Pipeline</h1>', unsafe_allow_html=True)
    
    # Initialize pipeline
    pipeline, config = initialize_pipeline()
    
    if pipeline is None:
        st.error("Failed to initialize pipeline. Please check the configuration.")
        return
    
    # Display statistics
    st.subheader("📈 Pipeline Statistics")
    display_statistics(pipeline)
    
    st.markdown("---")
    
    # Main content
    col1, col2 = st.columns([2, 1])
    
    with col1:
        st.subheader("📄 Upload Document")
        
        # File upload
        uploaded_file = st.file_uploader(
            "Choose a document file",
            type=['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'docx'],
            help="Upload a document containing tables for extraction"
        )
        
        if uploaded_file is not None:
            # Display file info
            file_details = {
                "Filename": uploaded_file.name,
                "File size": f"{uploaded_file.size / 1024:.1f} KB",
                "File type": uploaded_file.type
            }
            st.write("**File Details:**")
            for key, value in file_details.items():
                st.write(f"- **{key}:** {value}")
            
            # Preview for images
            if uploaded_file.type.startswith('image/'):
                try:
                    image = Image.open(uploaded_file)
                    st.image(image, caption="Uploaded Image", width=400)
                except Exception as e:
                    st.warning(f"Could not preview image: {e}")
    
    with col2:
        # Extraction options
        options = display_extraction_options()
    
    # Process button
    if uploaded_file is not None:
        if st.button("🚀 Extract Tables", type="primary"):
            with st.spinner("Processing document... This may take a few minutes."):
                try:
                    # Run extraction
                    result = asyncio.run(process_uploaded_file(uploaded_file, options, pipeline))
                    
                    # Display results
                    st.markdown("---")
                    st.subheader("📊 Extraction Results")
                    
                    # Summary
                    col1, col2, col3 = st.columns(3)
                    with col1:
                        st.metric("Tables Found", len(result.tables))
                    with col2:
                        st.metric("Processing Time", f"{result.processing_time:.1f}s")
                    with col3:
                        avg_confidence = result.confidence_scores.get('overall', 0)
                        st.metric("Avg Confidence", f"{avg_confidence:.1%}")
                    
                    # Warnings and errors
                    if result.warnings:
                        st.markdown('<div class="warning-box">', unsafe_allow_html=True)
                        st.warning("Warnings:")
                        for warning in result.warnings:
                            st.write(f"- {warning}")
                        st.markdown('</div>', unsafe_allow_html=True)
                    
                    if result.errors:
                        st.markdown('<div class="error-box">', unsafe_allow_html=True)
                        st.error("Errors:")
                        for error in result.errors:
                            st.write(f"- {error}")
                        st.markdown('</div>', unsafe_allow_html=True)
                    
                    # Display tables
                    if result.tables:
                        for i, table in enumerate(result.tables):
                            display_table_result(table, i)
                        
                        # Download all results
                        st.markdown("---")
                        st.subheader("📥 Download Results")
                        
                        result_json = result.to_json()
                        st.download_button(
                            label="📄 Download Full Results (JSON)",
                            data=result_json,
                            file_name=f"extraction_results_{int(time.time())}.json",
                            mime="application/json"
                        )
                    else:
                        st.info("No tables were detected in the document.")
                
                except Exception as e:
                    st.error(f"Extraction failed: {e}")
                    st.exception(e)
    
    # Footer
    st.markdown("---")
    st.markdown("""
    <div style="text-align: center; color: #666;">
        <p>Built with ❤️ using Streamlit | Table Extraction Pipeline v1.0.0</p>
    </div>
    """, unsafe_allow_html=True)


if __name__ == "__main__":
    main()
