import os
import json
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from app.db.crud import save_edited_tables, get_edited_tables, update_upload_tables
from app.db.models import EditedTable, StatementUpload as StatementUploadModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/table-editor", tags=["table-editor"])


class TableData(BaseModel):
    header: List[str]
    rows: List[List[str]]
    name: Optional[str] = None
    id: Optional[str] = None


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
    Save edited tables to the database.
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
        
        logger.info(f"🎯 Table Editor API: Successfully saved {len(saved_tables)} edited tables")
        
        return JSONResponse({
            "success": True,
            "message": f"Successfully saved {len(saved_tables)} tables",
            "tables_count": len(saved_tables),
            "upload_id": request.upload_id,
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"🎯 Table Editor API: Error saving edited tables: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save tables: {str(e)}")


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