from fastapi import APIRouter, HTTPException, Depends
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.config import get_db
from app.db import crud, schemas

router = APIRouter(prefix="/review", tags=["review"])

# --- Pydantic payload models for request bodies ---

class ApprovePayload(BaseModel):
    upload_id: UUID
    final_data: List[Dict[str, Any]]
    field_config: Optional[List[Dict[str, str]]] = None

class RejectPayload(BaseModel):
    upload_id: UUID
    final_data: List[Dict[str, Any]]
    rejection_reason: str
    field_config: Optional[List[Dict[str, str]]] = None

@router.post("/approve/")
async def approve_statement(
    payload: ApprovePayload,
    db: AsyncSession = Depends(get_db)
):
    updated = await crud.save_statement_review(
        db,
        upload_id=payload.upload_id,
        final_data=payload.final_data,
        status="Approved",
        field_config=payload.field_config,
    )
    return {"success": True, "review": schemas.StatementReview.from_orm(updated)}

@router.post("/reject/")
async def reject_statement(
    payload: RejectPayload,
    db: AsyncSession = Depends(get_db)
):
    updated = await crud.save_statement_review(
        db,
        upload_id=payload.upload_id,
        final_data=payload.final_data,
        status="Rejected",
        field_config=payload.field_config,
        rejection_reason=payload.rejection_reason,
    )
    return {"success": True, "review": schemas.StatementReview.from_orm(updated)}

@router.get("/all/")
async def get_all_reviews(db: AsyncSession = Depends(get_db)):
    rows = await crud.get_all_statement_reviews(db)
    return rows
