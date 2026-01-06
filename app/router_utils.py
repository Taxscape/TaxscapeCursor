from fastapi import HTTPException
from typing import Any, List, Optional
from app.schemas import ApiResponse, ApiMeta, ApiError
from datetime import datetime

def wrap_response(data: Any, meta: Optional[dict] = None, errors: Optional[List[ApiError]] = None) -> ApiResponse:
    """Wraps data in the standardized API envelope."""
    return ApiResponse(
        data=data,
        meta=ApiMeta(
            timestamp=datetime.utcnow(),
            pagination=meta.get("pagination") if meta else None
        ),
        errors=errors
    )

def handle_conflict(db_version: int, incoming_version: int):
    """Detects and handles version conflicts."""
    if db_version != incoming_version:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "CONFLICT",
                "message": "The record has been modified by another user. Please reload.",
                "db_version": db_version,
                "incoming_version": incoming_version
            }
        )



