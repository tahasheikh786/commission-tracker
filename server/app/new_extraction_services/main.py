"""Main entry point for the table extraction pipeline."""

import asyncio
import argparse
import sys
from pathlib import Path
from typing import Optional

from src.utils.config import get_config
from src.utils.logging_utils import setup_logging, get_logger
from src.pipeline.extraction_pipeline import ExtractionPipeline, ExtractionOptions

try:
    from src.api.rest_api import run_server
    API_AVAILABLE = True
except ImportError:
    API_AVAILABLE = False
    def run_server(*args, **kwargs):
        print("❌ API server not available. Install API dependencies or check src/api/rest_api.py")
        sys.exit(1)


async def extract_single_document(
    document_path: str,
    output_path: Optional[str] = None,
    config_path: Optional[str] = None,
    **options
):
    """Extract tables from a single document."""
    
    # Load configuration
    config = get_config(config_path)
    setup_logging(config)
    logger = get_logger(__name__, config)
    
    # Initialize pipeline
    logger.logger.info("Initializing table extraction pipeline...")
    pipeline = ExtractionPipeline(config)
    
    # Create extraction options
    extraction_options = ExtractionOptions(**options)
    
    try:
        # Extract tables
        logger.logger.info(f"Processing document: {document_path}")
        result = await pipeline.extract_tables(document_path, extraction_options)
        
        # Display results
        print(f"\n🎉 Extraction completed!")
        print(f"📄 Document: {document_path}")
        print(f"📊 Tables found: {len(result.tables)}")
        print(f"⏱️  Processing time: {result.processing_time:.2f}s")
        print(f"🎯 Overall confidence: {result.confidence_scores.get('overall', 0):.1%}")
        
        if result.warnings:
            print(f"\n⚠️  Warnings:")
            for warning in result.warnings:
                print(f"  - {warning}")
        
        if result.errors:
            print(f"\n❌ Errors:")
            for error in result.errors:
                print(f"  - {error}")
        
        # Save results
        if output_path:
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(output_file, 'w') as f:
                f.write(result.to_json())
            
            print(f"💾 Results saved to: {output_path}")
        else:
            print(f"\n📋 Results:")
            print(result.to_json())
        
        return result
        
    except Exception as e:
        logger.logger.error(f"Extraction failed: {e}")
        print(f"❌ Extraction failed: {e}")
        return None


async def extract_batch_documents(
    input_dir: str,
    output_dir: str,
    config_path: Optional[str] = None,
    **options
):
    """Extract tables from multiple documents in a directory."""
    
    # Load configuration
    config = get_config(config_path)
    setup_logging(config)
    logger = get_logger(__name__, config)
    
    # Initialize pipeline
    logger.logger.info("Initializing table extraction pipeline...")
    pipeline = ExtractionPipeline(config)
    
    # Create extraction options
    extraction_options = ExtractionOptions(**options)
    
    # Find documents
    input_path = Path(input_dir)
    supported_extensions = {'.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.docx'}
    documents = [
        f for f in input_path.rglob('*')
        if f.suffix.lower() in supported_extensions
    ]
    
    if not documents:
        print(f"❌ No supported documents found in {input_dir}")
        return
    
    print(f"📁 Found {len(documents)} documents to process")
    
    # Process documents
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    results = []
    successful = 0
    failed = 0
    
    for i, doc_path in enumerate(documents, 1):
        try:
            print(f"\n[{i}/{len(documents)}] Processing: {doc_path.name}")
            
            result = await pipeline.extract_tables(str(doc_path), extraction_options)
            
            # Save individual result
            output_file = output_path / f"{doc_path.stem}_tables.json"
            with open(output_file, 'w') as f:
                f.write(result.to_json())
            
            results.append(result)
            successful += 1
            
            print(f"  ✅ {len(result.tables)} tables extracted in {result.processing_time:.1f}s")
            
        except Exception as e:
            failed += 1
            logger.logger.error(f"Failed to process {doc_path}: {e}")
            print(f"  ❌ Failed: {e}")
    
    # Summary
    print(f"\n📊 Batch Processing Summary:")
    print(f"  📄 Documents processed: {len(documents)}")
    print(f"  ✅ Successful: {successful}")
    print(f"  ❌ Failed: {failed}")
    print(f"  📊 Total tables extracted: {sum(len(r.tables) for r in results)}")
    print(f"  💾 Results saved to: {output_dir}")


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Table Extraction Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Extract tables from a single document
  python main.py extract document.pdf --output results.json
  
  # Extract with custom options
  python main.py extract document.pdf --confidence-threshold 0.8 --enable-ocr
  
  # Process multiple documents
  python main.py batch input_folder/ output_folder/ --enable-quality-checks
  
  # Start API server
  python main.py serve --port 8000
  
  # Start with custom config
  python main.py serve --config configs/production.yaml
        """
    )
    
    # Common arguments
    parser.add_argument('--config', type=str, help='Configuration file path')
    parser.add_argument('--log-level', choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'], 
                       default='INFO', help='Logging level')
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Extract command
    extract_parser = subparsers.add_parser('extract', help='Extract tables from a single document')
    extract_parser.add_argument('document', help='Path to document file')
    extract_parser.add_argument('--output', '-o', help='Output file path (default: print to console)')
    extract_parser.add_argument('--enable-ocr', action='store_true', default=True, help='Enable OCR text extraction')
    extract_parser.add_argument('--enable-multipage', action='store_true', default=True, help='Process all pages')
    extract_parser.add_argument('--confidence-threshold', type=float, default=0.5, help='Detection confidence threshold')
    extract_parser.add_argument('--max-tables-per-page', type=int, default=10, help='Maximum tables per page')
    extract_parser.add_argument('--output-format', choices=['json', 'csv', 'xlsx'], default='json', help='Output format')
    extract_parser.add_argument('--enable-quality-checks', action='store_true', default=True, help='Enable quality assessment')
    
    # Batch command
    batch_parser = subparsers.add_parser('batch', help='Extract tables from multiple documents')
    batch_parser.add_argument('input_dir', help='Input directory containing documents')
    batch_parser.add_argument('output_dir', help='Output directory for results')
    batch_parser.add_argument('--enable-ocr', action='store_true', default=True, help='Enable OCR text extraction')
    batch_parser.add_argument('--enable-multipage', action='store_true', default=True, help='Process all pages')
    batch_parser.add_argument('--confidence-threshold', type=float, default=0.5, help='Detection confidence threshold')
    batch_parser.add_argument('--max-tables-per-page', type=int, default=10, help='Maximum tables per page')
    batch_parser.add_argument('--output-format', choices=['json', 'csv', 'xlsx'], default='json', help='Output format')
    batch_parser.add_argument('--enable-quality-checks', action='store_true', default=True, help='Enable quality assessment')
    
    # Serve command
    serve_parser = subparsers.add_parser('serve', help='Start API server')
    serve_parser.add_argument('--host', default=None, help='Server host')
    serve_parser.add_argument('--port', type=int, default=None, help='Server port')
    serve_parser.add_argument('--workers', type=int, default=None, help='Number of workers')
    
    args = parser.parse_args()
    
    # Handle no command
    if not args.command:
        parser.print_help()
        return
    
    try:
        if args.command == 'extract':
            # Extract single document
            options = {
                'enable_ocr': args.enable_ocr,
                'enable_multipage': args.enable_multipage,
                'confidence_threshold': args.confidence_threshold,
                'max_tables_per_page': args.max_tables_per_page,
                'output_format': args.output_format,
                'enable_quality_checks': args.enable_quality_checks
            }
            
            asyncio.run(extract_single_document(
                args.document,
                args.output,
                args.config,
                **options
            ))
            
        elif args.command == 'batch':
            # Batch processing
            options = {
                'enable_ocr': args.enable_ocr,
                'enable_multipage': args.enable_multipage,
                'confidence_threshold': args.confidence_threshold,
                'max_tables_per_page': args.max_tables_per_page,
                'output_format': args.output_format,
                'enable_quality_checks': args.enable_quality_checks
            }
            
            asyncio.run(extract_batch_documents(
                args.input_dir,
                args.output_dir,
                args.config,
                **options
            ))
            
        elif args.command == 'serve':
            # Start API server
            if not API_AVAILABLE:
                print("❌ API server not available. Please ensure src/api/rest_api.py exists.")
                sys.exit(1)
            
            print("🚀 Starting Table Extraction API server...")
            run_server(
                config_path=args.config,
                host=args.host,
                port=args.port,
                workers=args.workers
            )
            
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
