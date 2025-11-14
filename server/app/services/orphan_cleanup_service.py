"""
Orphan Cleanup Service - Removes stale extraction records.

Runs periodically to clean up:
- Files stuck in 'processing' status for > 30 minutes
- Files stuck in 'pending' status with no rawdata for > 1 hour
- Failed extractions older than 24 hours
"""

import asyncio
import logging
from datetime import datetime, timedelta
from sqlalchemy import select, delete, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import StatementUpload
from app.services.gcs_utils import delete_gcs_file
from app.db.database import get_db

logger = logging.getLogger(__name__)


async def cleanup_orphan_records():
    """
    Clean up orphan records that never completed extraction.
    
    Removes:
    - Processing files older than 15 minutes (stuck or abandoned)
    - Pending files with no data older than 30 minutes (incomplete)
    - Cancelled files older than 1 hour (abandoned mid-extraction)
    - Failed files older than 24 hours (errors)
    """
    logger.info("🧹 Starting orphan cleanup job...")
    
    async for db in get_db():
        try:
            now = datetime.utcnow()
            
            # 1. Clean up stuck 'processing' files (> 15 minutes old) - REDUCED from 30 to catch abandoned uploads faster
            processing_cutoff = now - timedelta(minutes=15)
            stuck_processing = await db.execute(
                select(StatementUpload).where(
                    and_(
                        StatementUpload.status == 'processing',
                        StatementUpload.uploaded_at < processing_cutoff
                    )
                )
            )
            stuck_processing_records = stuck_processing.scalars().all()
            
            for record in stuck_processing_records:
                logger.warning(f"⚠️ Cleaning up stuck processing file: {record.id} (uploaded {record.uploaded_at})")
                await delete_upload_and_files(db, record)
            
            # 2. Clean up incomplete 'pending' files (> 30 minutes old, no rawdata) - REDUCED from 1 hour
            pending_cutoff = now - timedelta(minutes=30)
            incomplete_pending = await db.execute(
                select(StatementUpload).where(
                    and_(
                        StatementUpload.status == 'pending',
                        StatementUpload.uploaded_at < pending_cutoff,
                        StatementUpload.raw_data.is_(None)  # No extraction data
                    )
                )
            )
            incomplete_pending_records = incomplete_pending.scalars().all()
            
            for record in incomplete_pending_records:
                logger.warning(f"⚠️ Cleaning up incomplete pending file: {record.id} (uploaded {record.uploaded_at})")
                await delete_upload_and_files(db, record)
            
            # 3. Clean up 'cancelled' files (> 1 hour old) - NEW: Handle abandoned extractions
            cancelled_cutoff = now - timedelta(hours=1)
            cancelled_records = await db.execute(
                select(StatementUpload).where(
                    and_(
                        StatementUpload.status == 'cancelled',
                        StatementUpload.uploaded_at < cancelled_cutoff
                    )
                )
            )
            cancelled_records_list = cancelled_records.scalars().all()
            
            for record in cancelled_records_list:
                logger.info(f"🗑️ Cleaning up cancelled file: {record.id} (uploaded {record.uploaded_at})")
                await delete_upload_and_files(db, record)
            
            # 4. Clean up old 'failed' records (> 24 hours old)
            failed_cutoff = now - timedelta(hours=24)
            old_failed = await db.execute(
                select(StatementUpload).where(
                    and_(
                        StatementUpload.status == 'failed',
                        StatementUpload.uploaded_at < failed_cutoff
                    )
                )
            )
            old_failed_records = old_failed.scalars().all()
            
            for record in old_failed_records:
                logger.info(f"🗑️ Cleaning up old failed file: {record.id} (uploaded {record.uploaded_at})")
                await delete_upload_and_files(db, record)
            
            # 5. NEW: Clean up orphaned 'extracting' status files (> 15 minutes old)
            # These are files that started extraction but never completed
            extracting_cutoff = now - timedelta(minutes=15)
            stuck_extracting = await db.execute(
                select(StatementUpload).where(
                    and_(
                        StatementUpload.status == 'extracting',
                        StatementUpload.uploaded_at < extracting_cutoff
                    )
                )
            )
            stuck_extracting_records = stuck_extracting.scalars().all()
            
            for record in stuck_extracting_records:
                logger.warning(f"⚠️ Cleaning up stuck extracting file: {record.id} (uploaded {record.uploaded_at})")
                await delete_upload_and_files(db, record)
            
            await db.commit()
            
            total_cleaned = (
                len(stuck_processing_records) + 
                len(incomplete_pending_records) + 
                len(cancelled_records_list) + 
                len(old_failed_records) +
                len(stuck_extracting_records)
            )
            if total_cleaned > 0:
                logger.info(f"✅ Orphan cleanup completed: removed {total_cleaned} orphan records")
            else:
                logger.info("✅ Orphan cleanup completed: no orphans found")
                
        except Exception as e:
            logger.error(f"❌ Error in orphan cleanup: {e}")
            await db.rollback()
        finally:
            break  # Only process first db session


async def delete_upload_and_files(db: AsyncSession, upload: StatementUpload):
    """Delete upload record and associated GCS files."""
    
    # Delete GCS files
    if upload.gcs_key:
        try:
            delete_gcs_file(upload.gcs_key)
            logger.info(f"✅ Deleted GCS file: {upload.gcs_key}")
        except Exception as e:
            logger.error(f"❌ Failed to delete GCS file {upload.gcs_key}: {e}")
    
    if upload.file_name and upload.file_name != upload.gcs_key:
        try:
            delete_gcs_file(upload.file_name)
            logger.info(f"✅ Deleted GCS file: {upload.file_name}")
        except Exception as e:
            logger.error(f"❌ Failed to delete GCS file {upload.file_name}: {e}")
    
    # Delete DB record
    await db.execute(
        delete(StatementUpload).where(StatementUpload.id == upload.id)
    )


async def start_orphan_cleanup_scheduler():
    """Run orphan cleanup every 3 minutes for faster cleanup of abandoned uploads."""
    logger.info("🚀 Starting orphan cleanup scheduler (runs every 3 minutes)")
    
    while True:
        try:
            await cleanup_orphan_records()
        except Exception as e:
            logger.error(f"❌ Error in orphan cleanup scheduler: {e}")
        
        # Run every 3 minutes (reduced from 5 for faster cleanup)
        await asyncio.sleep(180)

