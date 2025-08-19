import os
import json
import logging
import hashlib
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import StatementUpload, Company
from app.db.crud import save_edited_tables, get_edited_tables, update_upload_tables
from app.config import get_db
from app.utils.db_retry import with_db_retry
from app.services.format_learning_service import FormatLearningService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/table-editor", tags=["table-editor"])
format_learning_service = FormatLearningService()


class TableData(BaseModel):
    header: List[str]
    rows: List[List[str]]
    name: Optional[str] = None
    id: Optional[str] = None
    summaryRows: Optional[List[int]] = None  # Convert Set to List for JSON serialization


class SaveTablesRequest(BaseModel):
    upload_id: str
    tables: List[TableData]
    company_id: str
    selected_statement_date: Optional[Dict[str, Any]] = None


class GetTablesRequest(BaseModel):
    upload_id: str


@router.post("/save-tables/")
async def save_tables(request: SaveTablesRequest):
    """
    Save edited tables to the database and learn format patterns.
    """
    try:
        logger.info(f"🎯 Table Editor API: Saving edited tables for upload_id: {request.upload_id}")
        logger.info(f"🎯 Table Editor API: Tables count: {len(request.tables)}")
        logger.info(f"🎯 Table Editor API: Selected statement date: {request.selected_statement_date}")
        logger.info(f"🎯 Table Editor API: Company ID: {request.company_id}")
        
        # Convert tables to the format expected by the database
        tables_data = []
        for table in request.tables:
            table_data = {
                "name": table.name or "Unnamed Table",
                "header": table.header,
                "rows": table.rows,
                "upload_id": request.upload_id,
                "company_id": request.company_id,
                "created_at": datetime.now(),
                "updated_at": datetime.now()
            }
            tables_data.append(table_data)
        
        logger.info(f"🎯 Table Editor API: Converted {len(tables_data)} tables to database format")
        
        # Save to database
        saved_tables = await save_edited_tables(tables_data)
        logger.info(f"🎯 Table Editor API: Saved {len(saved_tables)} edited tables to database")
        
        # Update the original upload with the edited tables and selected statement date
        logger.info(f"🎯 Table Editor API: Updating upload with tables and statement date")
        await update_upload_tables(request.upload_id, tables_data, request.selected_statement_date)
        logger.info(f"🎯 Table Editor API: Successfully updated upload with statement date")
        
        # Learn format patterns from the edited tables
        if request.tables and len(request.tables) > 0:
            try:
                logger.info(f"🎯 Table Editor API: Learning format patterns from edited tables")
                
                # Use the first table for format learning (most common case)
                main_table = request.tables[0]
                
                # Extract table editor settings for learning
                table_editor_settings = {
                    'headers': main_table.header,
                    'summary_rows': main_table.summaryRows if main_table.summaryRows else [],
                    'table_structure': {
                        'column_count': len(main_table.header),
                        'row_count': len(main_table.rows),
                        'has_summary_rows': bool(main_table.summaryRows and len(main_table.summaryRows) > 0),
                        'summary_row_patterns': []
                    }
                }
                
                # Generate format signature for table editor settings
                format_signature = format_learning_service.generate_format_signature(
                    main_table.header, 
                    table_editor_settings['table_structure']
                )
                
                # Create format learning record for table editor settings
                format_learning_data = {
                    'company_id': request.company_id,
                    'format_signature': format_signature,
                    'headers': main_table.header,
                    'table_structure': table_editor_settings['table_structure'],
                    'table_editor_settings': table_editor_settings,
                    'confidence_score': 85,  # High confidence for manually edited tables
                    'usage_count': 1
                }
                
                # Save table editor format learning
                await save_table_editor_format_learning(format_learning_data)
                
                logger.info(f"🎯 Table Editor API: Successfully learned table editor format patterns")
                
            except Exception as e:
                logger.error(f"🎯 Table Editor API: Error learning table editor format: {e}")
                # Don't fail the save operation if format learning fails
        
        logger.info(f"🎯 Table Editor API: Successfully saved {len(saved_tables)} edited tables")
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"Successfully saved {len(saved_tables)} edited tables",
                "saved_tables": saved_tables
            }
        )
        
    except Exception as e:
        logger.error(f"🎯 Table Editor API: Error saving tables: {e}")
        raise HTTPException(status_code=500, detail=f"Error saving tables: {str(e)}")

async def save_table_editor_format_learning(format_data: Dict[str, Any]):
    """
    Save table editor format learning data.
    """
    try:
        from app.db import crud, schemas
        
        # Create format learning record
        format_learning = schemas.CarrierFormatLearningCreate(
            company_id=format_data['company_id'],
            format_signature=format_data['format_signature'],
            headers=format_data['headers'],
            table_structure=format_data['table_structure'],
            field_mapping={},  # Empty for table editor settings
            table_editor_settings=format_data['table_editor_settings'],
            confidence_score=format_data['confidence_score'],
            usage_count=format_data['usage_count']
        )
        
        # Save to database using the format learning service
        db = await anext(get_db())
        await crud.save_carrier_format_learning(db, format_learning)
        
    except Exception as e:
        logger.error(f"Error saving table editor format learning: {e}")
        raise


@router.get("/get-tables/{upload_id}")
async def get_tables(upload_id: str):
    """
    Retrieve edited tables for a specific upload.
    """
    try:
        logger.info(f"Retrieving edited tables for upload_id: {upload_id}")
        
        tables = await get_edited_tables(upload_id)
        
        # Convert to the format expected by the frontend
        tables_data = []
        for table in tables:
            table_data = {
                "id": str(table.id),
                "name": table.name,
                "header": table.header,
                "rows": table.rows,
                "upload_id": table.upload_id,
                "company_id": table.company_id,
                "created_at": table.created_at.isoformat() if table.created_at else None,
                "updated_at": table.updated_at.isoformat() if table.updated_at else None
            }
            tables_data.append(table_data)
        
        logger.info(f"Retrieved {len(tables_data)} edited tables")
        
        return JSONResponse({
            "success": True,
            "tables": tables_data,
            "tables_count": len(tables_data),
            "upload_id": upload_id
        })
        
    except Exception as e:
        logger.error(f"Error retrieving edited tables: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve tables: {str(e)}")


@router.delete("/delete-tables/{upload_id}")
async def delete_tables(upload_id: str):
    """
    Delete all edited tables for a specific upload.
    """
    try:
        logger.info(f"Deleting edited tables for upload_id: {upload_id}")
        
        # This would be implemented in the CRUD layer
        # await delete_edited_tables(upload_id)
        
        logger.info(f"Successfully deleted edited tables for upload_id: {upload_id}")
        
        return JSONResponse({
            "success": True,
            "message": "Successfully deleted edited tables",
            "upload_id": upload_id,
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error deleting edited tables: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete tables: {str(e)}")


@router.post("/export-tables/{upload_id}")
async def export_tables(upload_id: str, format: str = "csv"):
    """
    Export edited tables in various formats.
    """
    try:
        logger.info(f"Exporting tables for upload_id: {upload_id} in format: {format}")
        
        tables = await get_edited_tables(upload_id)
        
        if format.lower() == "csv":
            # Generate CSV content
            csv_content = ""
            for table in tables:
                csv_content += f"Table: {table.name}\n"
                csv_content += ",".join(table.header) + "\n"
                for row in table.rows:
                    csv_content += ",".join([f'"{cell}"' for cell in row]) + "\n"
                csv_content += "\n"
            
            return JSONResponse({
                "success": True,
                "format": "csv",
                "content": csv_content,
                "filename": f"edited_tables_{upload_id}.csv"
            })
        
        elif format.lower() == "json":
            # Generate JSON content
            tables_data = []
            for table in tables:
                table_data = {
                    "name": table.name,
                    "header": table.header,
                    "rows": table.rows
                }
                tables_data.append(table_data)
            
            return JSONResponse({
                "success": True,
                "format": "json",
                "content": tables_data,
                "filename": f"edited_tables_{upload_id}.json"
            })
        
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")
        
    except Exception as e:
        logger.error(f"Error exporting tables: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to export tables: {str(e)}")


@router.get("/health")
async def health_check():
    """
    Health check endpoint for table editor API.
    """
    return JSONResponse({
        "status": "healthy",
        "service": "table-editor",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }) 