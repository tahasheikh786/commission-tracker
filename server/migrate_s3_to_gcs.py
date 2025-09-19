#!/usr/bin/env python3
"""
S3 to GCS Migration Script

This script migrates all files from your S3 bucket to Google Cloud Storage (GCS)
while preserving the same folder structure and file metadata.

Usage:
    python migrate_s3_to_gcs.py [--dry-run] [--batch-size N] [--prefix PREFIX]

Options:
    --dry-run: Show what would be migrated without actually doing it
    --batch-size: Number of files to process in each batch (default: 10)
    --prefix: Only migrate files with this prefix (e.g., 'statements/')
"""

import os
import sys
import argparse
import logging
import tempfile
from typing import List, Dict, Any, Optional
from datetime import datetime
import boto3
from botocore.exceptions import ClientError
from google.cloud import storage
from google.auth import default
from google.cloud.exceptions import GoogleCloudError
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('migration.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class S3ToGCSMigrator:
    """Migrates files from S3 to GCS while preserving structure and metadata."""
    
    def __init__(self):
        self.s3_bucket_name = os.environ.get('S3_BUCKET_NAME', 'text-extraction-pdf')
        self.gcs_bucket_name = "pdf_extraction_files_saver"
        self.gcs_project_id = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'pdf-tables-extractor-465009')
        
        # Initialize S3 client
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
            region_name=os.environ.get('AWS_REGION', 'us-east-1')
        )
        
        # Initialize GCS client
        self._initialize_gcs_client()
        
        # Migration statistics
        self.stats = {
            'total_files': 0,
            'migrated_files': 0,
            'failed_files': 0,
            'skipped_files': 0,
            'total_size': 0,
            'start_time': None,
            'end_time': None
        }
    
    def _initialize_gcs_client(self):
        """Initialize Google Cloud Storage client."""
        try:
            # Set up environment variables if not already set
            if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
                possible_paths = [
                    "/etc/secrets/pdf-tables-extractor-465009-d9172fd0045d.json",
                    "/app/pdf-tables-extractor-465009-d9172fd0045d.json",
                    os.path.join(os.path.dirname(os.path.abspath(__file__)), "pdf-tables-extractor-465009-d9172fd0045d.json"),
                    os.path.join(os.getcwd(), "pdf-tables-extractor-465009-d9172fd0045d.json"),
                ]
                
                creds_file = None
                for path in possible_paths:
                    if os.path.exists(path):
                        creds_file = path
                        break
                
                if creds_file:
                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_file
                    logger.info(f"✅ Set GOOGLE_APPLICATION_CREDENTIALS to: {creds_file}")
                else:
                    raise Exception(f"❌ Credentials file not found. Tried paths: {possible_paths}")
            
            # Set project ID if not already set
            if not os.getenv("GOOGLE_CLOUD_PROJECT_ID"):
                os.environ["GOOGLE_CLOUD_PROJECT_ID"] = self.gcs_project_id
                logger.info(f"✅ Set GOOGLE_CLOUD_PROJECT_ID to: {self.gcs_project_id}")
            
            # Initialize GCS client
            credentials, project_id = default()
            if not project_id:
                project_id = self.gcs_project_id
            
            self.gcs_client = storage.Client(credentials=credentials, project=project_id)
            self.gcs_bucket = self.gcs_client.bucket(self.gcs_bucket_name)
            
            logger.info(f"✅ GCS initialized - Project: {project_id}, Bucket: {self.gcs_bucket_name}")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize GCS: {e}")
            raise
    
    def list_s3_files(self, prefix: str = "") -> List[Dict[str, Any]]:
        """List all files in S3 bucket with optional prefix filter."""
        files = []
        paginator = self.s3_client.get_paginator('list_objects_v2')
        
        try:
            page_iterator = paginator.paginate(
                Bucket=self.s3_bucket_name,
                Prefix=prefix
            )
            
            for page in page_iterator:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        files.append({
                            'key': obj['Key'],
                            'size': obj['Size'],
                            'last_modified': obj['LastModified'],
                            'etag': obj['ETag']
                        })
            
            logger.info(f"Found {len(files)} files in S3 bucket '{self.s3_bucket_name}' with prefix '{prefix}'")
            return files
            
        except ClientError as e:
            logger.error(f"Error listing S3 files: {e}")
            raise
    
    def file_exists_in_gcs(self, gcs_key: str) -> bool:
        """Check if file already exists in GCS."""
        try:
            blob = self.gcs_bucket.blob(gcs_key)
            return blob.exists()
        except Exception as e:
            logger.error(f"Error checking GCS file existence: {e}")
            return False
    
    def migrate_file(self, s3_key: str, gcs_key: str, dry_run: bool = False) -> bool:
        """Migrate a single file from S3 to GCS."""
        try:
            if dry_run:
                logger.info(f"[DRY RUN] Would migrate: {s3_key} -> {gcs_key}")
                return True
            
            # Check if file already exists in GCS
            if self.file_exists_in_gcs(gcs_key):
                logger.info(f"File already exists in GCS, skipping: {gcs_key}")
                self.stats['skipped_files'] += 1
                return True
            
            # Download from S3 to temporary file
            with tempfile.NamedTemporaryFile(delete=False) as temp_file:
                temp_path = temp_file.name
            
            try:
                # Download from S3
                logger.info(f"Downloading from S3: {s3_key}")
                self.s3_client.download_file(self.s3_bucket_name, s3_key, temp_path)
                
                # Get file metadata from S3
                s3_metadata = self.s3_client.head_object(Bucket=self.s3_bucket_name, Key=s3_key)
                content_type = s3_metadata.get('ContentType', 'application/octet-stream')
                
                # Upload to GCS
                logger.info(f"Uploading to GCS: {gcs_key}")
                blob = self.gcs_bucket.blob(gcs_key)
                blob.upload_from_filename(temp_path, content_type=content_type)
                
                # Set metadata
                blob.metadata = {
                    'migrated_from_s3': 'true',
                    'original_s3_key': s3_key,
                    'migration_date': datetime.utcnow().isoformat(),
                    'original_etag': s3_metadata.get('ETag', '').strip('"')
                }
                blob.patch()
                
                logger.info(f"✅ Successfully migrated: {s3_key} -> {gcs_key}")
                self.stats['migrated_files'] += 1
                return True
                
            finally:
                # Clean up temporary file
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
                    
        except ClientError as e:
            logger.error(f"S3 error migrating {s3_key}: {e}")
            self.stats['failed_files'] += 1
            return False
        except GoogleCloudError as e:
            logger.error(f"GCS error migrating {s3_key}: {e}")
            self.stats['failed_files'] += 1
            return False
        except Exception as e:
            logger.error(f"Unexpected error migrating {s3_key}: {e}")
            self.stats['failed_files'] += 1
            return False
    
    def migrate_files(self, files: List[Dict[str, Any]], batch_size: int = 10, dry_run: bool = False) -> None:
        """Migrate a list of files in batches."""
        self.stats['start_time'] = datetime.utcnow()
        self.stats['total_files'] = len(files)
        
        logger.info(f"Starting migration of {len(files)} files (batch size: {batch_size})")
        if dry_run:
            logger.info("🔍 DRY RUN MODE - No files will actually be migrated")
        
        # Process files in batches
        for i in range(0, len(files), batch_size):
            batch = files[i:i + batch_size]
            logger.info(f"Processing batch {i//batch_size + 1}/{(len(files) + batch_size - 1)//batch_size}")
            
            for file_info in batch:
                s3_key = file_info['key']
                gcs_key = s3_key  # Keep the same key structure
                
                # Update total size
                self.stats['total_size'] += file_info['size']
                
                # Migrate file
                self.migrate_file(s3_key, gcs_key, dry_run)
        
        self.stats['end_time'] = datetime.utcnow()
        self._print_migration_summary()
    
    def _print_migration_summary(self):
        """Print migration summary statistics."""
        duration = self.stats['end_time'] - self.stats['start_time'] if self.stats['start_time'] else None
        
        logger.info("=" * 60)
        logger.info("MIGRATION SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Total files found: {self.stats['total_files']}")
        logger.info(f"Successfully migrated: {self.stats['migrated_files']}")
        logger.info(f"Failed migrations: {self.stats['failed_files']}")
        logger.info(f"Skipped (already exist): {self.stats['skipped_files']}")
        logger.info(f"Total data size: {self.stats['total_size'] / (1024*1024):.2f} MB")
        if duration:
            logger.info(f"Migration duration: {duration}")
            if self.stats['migrated_files'] > 0:
                logger.info(f"Average time per file: {duration.total_seconds() / self.stats['migrated_files']:.2f} seconds")
        logger.info("=" * 60)
    
    def verify_migration(self, files: List[Dict[str, Any]]) -> None:
        """Verify that all files were migrated successfully."""
        logger.info("Verifying migration...")
        
        verified = 0
        missing = 0
        
        for file_info in files:
            s3_key = file_info['key']
            gcs_key = s3_key
            
            if self.file_exists_in_gcs(gcs_key):
                verified += 1
            else:
                missing += 1
                logger.warning(f"Missing in GCS: {gcs_key}")
        
        logger.info(f"Verification complete: {verified} verified, {missing} missing")

def main():
    parser = argparse.ArgumentParser(description='Migrate files from S3 to GCS')
    parser.add_argument('--dry-run', action='store_true', 
                       help='Show what would be migrated without actually doing it')
    parser.add_argument('--batch-size', type=int, default=10,
                       help='Number of files to process in each batch (default: 10)')
    parser.add_argument('--prefix', type=str, default='',
                       help='Only migrate files with this prefix (e.g., "statements/")')
    parser.add_argument('--verify', action='store_true',
                       help='Verify migration after completion')
    
    args = parser.parse_args()
    
    try:
        # Initialize migrator
        migrator = S3ToGCSMigrator()
        
        # List files to migrate
        logger.info(f"Listing files from S3 bucket '{migrator.s3_bucket_name}' with prefix '{args.prefix}'")
        files = migrator.list_s3_files(args.prefix)
        
        if not files:
            logger.info("No files found to migrate")
            return
        
        # Migrate files
        migrator.migrate_files(files, args.batch_size, args.dry_run)
        
        # Verify migration if requested and not dry run
        if args.verify and not args.dry_run:
            migrator.verify_migration(files)
        
        logger.info("Migration completed successfully!")
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
