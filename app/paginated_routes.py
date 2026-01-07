"""
Paginated Data Routes

Server-side pagination for large datasets (timesheets, AP transactions).
Includes filtering, sorting, and bulk operations.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.supabase_client import get_supabase
from app.auth_permissions import (
    AuthContext, get_auth_context, verify_client_access,
    Capability, rate_limit, log_audit
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/data", tags=["paginated-data"])


# =============================================================================
# RESPONSE MODELS
# =============================================================================

class PaginationMeta(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int
    has_next: bool
    has_prev: bool


class PaginatedResponse(BaseModel):
    data: List[Dict[str, Any]]
    meta: PaginationMeta


class BulkUpdateRequest(BaseModel):
    ids: List[str]
    field: str
    value: Any


class BulkUpdateResponse(BaseModel):
    success: bool
    updated_count: int
    failed_ids: List[str] = Field(default_factory=list)


# =============================================================================
# TIMESHEETS (PAGINATED)
# =============================================================================

@router.get("/timesheets", response_model=PaginatedResponse)
@rate_limit("data_fetch")
async def get_timesheets_paginated(
    client_company_id: str = Query(...),
    tax_year: int = Query(default=2024),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=10, le=250),
    employee_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    sort_by: str = Query(default="work_date"),
    sort_dir: str = Query(default="desc"),
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Get timesheets with server-side pagination, filtering, and sorting.
    """
    verify_client_access(auth, client_company_id)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    try:
        # Build base query
        query = supabase.table("timesheets")\
            .select("*", count="exact")\
            .eq("client_company_id", client_company_id)\
            .eq("tax_year", tax_year)
        
        # Apply filters
        if employee_id:
            query = query.eq("employee_id", employee_id)
        if project_id:
            query = query.eq("project_id", project_id)
        if date_from:
            query = query.gte("work_date", date_from)
        if date_to:
            query = query.lte("work_date", date_to)
        
        # For contributors, only show their own timesheets
        if not auth.has_capability(Capability.VIEW_ALL_DATA):
            # Get employee ID for this user
            emp = supabase.table("employees")\
                .select("id")\
                .eq("user_id", auth.user_id)\
                .single()\
                .execute()
            if emp.data:
                query = query.eq("employee_id", emp.data["id"])
            else:
                # User has no employee record - return empty
                return PaginatedResponse(
                    data=[],
                    meta=PaginationMeta(
                        page=page,
                        page_size=page_size,
                        total_items=0,
                        total_pages=0,
                        has_next=False,
                        has_prev=False
                    )
                )
        
        # Apply sorting
        sort_column = sort_by if sort_by in ["work_date", "hours", "employee_id", "project_id", "created_at"] else "work_date"
        query = query.order(sort_column, desc=(sort_dir == "desc"))
        
        # Apply pagination
        offset = (page - 1) * page_size
        query = query.range(offset, offset + page_size - 1)
        
        result = query.execute()
        
        total_items = result.count or 0
        total_pages = (total_items + page_size - 1) // page_size if total_items > 0 else 0
        
        return PaginatedResponse(
            data=result.data or [],
            meta=PaginationMeta(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=total_pages,
                has_next=page < total_pages,
                has_prev=page > 1
            )
        )
        
    except Exception as e:
        logger.error(f"Error fetching timesheets: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch timesheets")


@router.post("/timesheets/bulk-update", response_model=BulkUpdateResponse)
@rate_limit("bulk_update")
async def bulk_update_timesheets(
    request: BulkUpdateRequest,
    client_company_id: str = Query(...),
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Bulk update a field on multiple timesheet records.
    """
    verify_client_access(auth, client_company_id)
    auth.require_capability(Capability.EDIT_FINANCIALS)
    
    # Validate allowed fields for bulk update
    allowed_fields = ["project_id", "category", "notes"]
    if request.field not in allowed_fields:
        raise HTTPException(
            status_code=400, 
            detail=f"Field '{request.field}' not allowed for bulk update. Allowed: {allowed_fields}"
        )
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    updated_count = 0
    failed_ids = []
    
    try:
        for id in request.ids:
            try:
                supabase.table("timesheets")\
                    .update({request.field: request.value, "updated_at": datetime.utcnow().isoformat()})\
                    .eq("id", id)\
                    .eq("client_company_id", client_company_id)\
                    .execute()
                updated_count += 1
            except Exception as e:
                logger.warning(f"Failed to update timesheet {id}: {e}")
                failed_ids.append(id)
        
        # Log audit
        log_audit(
            auth=auth,
            action="bulk_update_timesheets",
            resource_type="timesheets",
            client_company_id=client_company_id,
            details={
                "field": request.field,
                "value": request.value,
                "updated_count": updated_count,
                "failed_count": len(failed_ids)
            }
        )
        
        return BulkUpdateResponse(
            success=len(failed_ids) == 0,
            updated_count=updated_count,
            failed_ids=failed_ids
        )
        
    except Exception as e:
        logger.error(f"Bulk update failed: {e}")
        raise HTTPException(status_code=500, detail="Bulk update failed")


# =============================================================================
# AP TRANSACTIONS (PAGINATED)
# =============================================================================

@router.get("/ap-transactions", response_model=PaginatedResponse)
@rate_limit("data_fetch")
async def get_ap_transactions_paginated(
    client_company_id: str = Query(...),
    tax_year: int = Query(default=2024),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=10, le=250),
    vendor_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    min_amount: Optional[float] = Query(None),
    max_amount: Optional[float] = Query(None),
    sort_by: str = Query(default="transaction_date"),
    sort_dir: str = Query(default="desc"),
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Get AP transactions with server-side pagination, filtering, and sorting.
    """
    verify_client_access(auth, client_company_id)
    auth.require_capability(Capability.VIEW_ALL_DATA, "Financial data access required")
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    try:
        # Build base query
        query = supabase.table("ap_transactions")\
            .select("*", count="exact")\
            .eq("client_company_id", client_company_id)\
            .eq("tax_year", tax_year)
        
        # Apply filters
        if vendor_id:
            query = query.eq("vendor_id", vendor_id)
        if category:
            query = query.eq("category", category)
        if date_from:
            query = query.gte("transaction_date", date_from)
        if date_to:
            query = query.lte("transaction_date", date_to)
        if min_amount is not None:
            query = query.gte("amount", min_amount)
        if max_amount is not None:
            query = query.lte("amount", max_amount)
        
        # Apply sorting
        sort_column = sort_by if sort_by in ["transaction_date", "amount", "vendor_id", "category", "created_at"] else "transaction_date"
        query = query.order(sort_column, desc=(sort_dir == "desc"))
        
        # Apply pagination
        offset = (page - 1) * page_size
        query = query.range(offset, offset + page_size - 1)
        
        result = query.execute()
        
        total_items = result.count or 0
        total_pages = (total_items + page_size - 1) // page_size if total_items > 0 else 0
        
        return PaginatedResponse(
            data=result.data or [],
            meta=PaginationMeta(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=total_pages,
                has_next=page < total_pages,
                has_prev=page > 1
            )
        )
        
    except Exception as e:
        logger.error(f"Error fetching AP transactions: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch AP transactions")


@router.post("/ap-transactions/bulk-update", response_model=BulkUpdateResponse)
@rate_limit("bulk_update")
async def bulk_update_ap_transactions(
    request: BulkUpdateRequest,
    client_company_id: str = Query(...),
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Bulk update a field on multiple AP transaction records.
    """
    verify_client_access(auth, client_company_id)
    auth.require_capability(Capability.EDIT_FINANCIALS)
    
    # Validate allowed fields for bulk update
    allowed_fields = ["category", "project_id", "notes", "vendor_id"]
    if request.field not in allowed_fields:
        raise HTTPException(
            status_code=400, 
            detail=f"Field '{request.field}' not allowed for bulk update. Allowed: {allowed_fields}"
        )
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    updated_count = 0
    failed_ids = []
    
    try:
        for id in request.ids:
            try:
                supabase.table("ap_transactions")\
                    .update({request.field: request.value, "updated_at": datetime.utcnow().isoformat()})\
                    .eq("id", id)\
                    .eq("client_company_id", client_company_id)\
                    .execute()
                updated_count += 1
            except Exception as e:
                logger.warning(f"Failed to update AP transaction {id}: {e}")
                failed_ids.append(id)
        
        # Log audit
        log_audit(
            auth=auth,
            action="bulk_update_ap_transactions",
            resource_type="ap_transactions",
            client_company_id=client_company_id,
            details={
                "field": request.field,
                "value": request.value,
                "updated_count": updated_count,
                "failed_count": len(failed_ids)
            }
        )
        
        return BulkUpdateResponse(
            success=len(failed_ids) == 0,
            updated_count=updated_count,
            failed_ids=failed_ids
        )
        
    except Exception as e:
        logger.error(f"Bulk update failed: {e}")
        raise HTTPException(status_code=500, detail="Bulk update failed")


# =============================================================================
# SUPPLIES (PAGINATED)
# =============================================================================

@router.get("/supplies", response_model=PaginatedResponse)
@rate_limit("data_fetch")
async def get_supplies_paginated(
    client_company_id: str = Query(...),
    tax_year: int = Query(default=2024),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=10, le=250),
    category: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    sort_by: str = Query(default="purchase_date"),
    sort_dir: str = Query(default="desc"),
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Get supplies with server-side pagination.
    """
    verify_client_access(auth, client_company_id)
    auth.require_capability(Capability.VIEW_ALL_DATA, "Financial data access required")
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    try:
        query = supabase.table("supplies")\
            .select("*", count="exact")\
            .eq("client_company_id", client_company_id)\
            .eq("tax_year", tax_year)
        
        if category:
            query = query.eq("category", category)
        if project_id:
            query = query.eq("project_id", project_id)
        
        sort_column = sort_by if sort_by in ["purchase_date", "amount", "category", "created_at"] else "purchase_date"
        query = query.order(sort_column, desc=(sort_dir == "desc"))
        
        offset = (page - 1) * page_size
        query = query.range(offset, offset + page_size - 1)
        
        result = query.execute()
        
        total_items = result.count or 0
        total_pages = (total_items + page_size - 1) // page_size if total_items > 0 else 0
        
        return PaginatedResponse(
            data=result.data or [],
            meta=PaginationMeta(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=total_pages,
                has_next=page < total_pages,
                has_prev=page > 1
            )
        )
        
    except Exception as e:
        logger.error(f"Error fetching supplies: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch supplies")


# =============================================================================
# EMPLOYEES (PAGINATED)
# =============================================================================

@router.get("/employees", response_model=PaginatedResponse)
@rate_limit("data_fetch")
async def get_employees_paginated(
    client_company_id: str = Query(...),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=10, le=250),
    department: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: str = Query(default="name"),
    sort_dir: str = Query(default="asc"),
    auth: AuthContext = Depends(get_auth_context)
):
    """
    Get employees with server-side pagination.
    """
    verify_client_access(auth, client_company_id)
    
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    try:
        query = supabase.table("employees")\
            .select("*", count="exact")\
            .eq("client_company_id", client_company_id)
        
        if department:
            query = query.eq("department", department)
        if search:
            query = query.ilike("name", f"%{search}%")
        
        # Contributors can only see themselves
        if not auth.has_capability(Capability.VIEW_ALL_DATA):
            query = query.eq("user_id", auth.user_id)
        
        sort_column = sort_by if sort_by in ["name", "department", "hourly_rate", "created_at"] else "name"
        query = query.order(sort_column, desc=(sort_dir == "desc"))
        
        offset = (page - 1) * page_size
        query = query.range(offset, offset + page_size - 1)
        
        result = query.execute()
        
        total_items = result.count or 0
        total_pages = (total_items + page_size - 1) // page_size if total_items > 0 else 0
        
        return PaginatedResponse(
            data=result.data or [],
            meta=PaginationMeta(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=total_pages,
                has_next=page < total_pages,
                has_prev=page > 1
            )
        )
        
    except Exception as e:
        logger.error(f"Error fetching employees: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch employees")

