from typing import List, Dict, Any, Optional, Generic, TypeVar
from pydantic import BaseModel, Field, validator
from datetime import datetime
import uuid

T = TypeVar('T')

# =============================================================================
# API ENVELOPE
# =============================================================================

class ApiMeta(BaseModel):
    version: int = 1
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    pagination: Optional[Dict[str, Any]] = None

class ApiError(BaseModel):
    code: str
    message: str
    target: Optional[str] = None # Field name or entity ID
    details: Optional[Any] = None

class ApiResponse(BaseModel, Generic[T]):
    data: Optional[T] = None
    meta: ApiMeta = Field(default_factory=ApiMeta)
    errors: Optional[List[ApiError]] = None

# =============================================================================
# CANONICAL ENTITIES
# =============================================================================

class BaseEntity(BaseModel):
    id: uuid.UUID
    version: int = 1
    created_at: datetime
    updated_at: datetime
    last_modified_by: Optional[uuid.UUID] = None

class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    technical_uncertainty: Optional[str] = None
    process_of_experimentation: Optional[str] = None
    qualification_status: str = Field(default="pending")

    @validator('qualification_status')
    def validate_status(cls, v):
        allowed = ["qualified", "not_qualified", "pending", "needs_review"]
        if v not in allowed:
            raise ValueError(f"Status must be one of {allowed}")
        return v

class EmployeeBase(BaseModel):
    name: str
    title: Optional[str] = None
    total_wages: float = Field(default=0.0, ge=0)
    qualified_percent: float = Field(default=0.0, ge=0, le=100)
    state: Optional[str] = None

class ContractorBase(BaseModel):
    name: str
    cost: float = Field(default=0.0, ge=0)
    is_qualified: bool = True
    location: str = "US" # US or Foreign

class BudgetBase(BaseModel):
    name: str
    total_amount: float = Field(default=0.0, ge=0)
    category: Optional[str] = None
    fiscal_year: int = 2024

class ExpenseBase(BaseModel):
    description: str
    amount: float = Field(..., ge=0)
    category: str
    vendor_name: Optional[str] = None
    expense_date: datetime

class SavedViewBase(BaseModel):
    name: str
    entity_type: str
    filters: List[Dict[str, Any]] = []
    sort: List[Dict[str, Any]] = []
    grouping: List[Dict[str, Any]] = []
    visible_columns: List[str] = []
    pinned: bool = False
    is_shared: bool = False

# =============================================================================
# BATCH OPERATIONS
# =============================================================================

class BatchUpdateItem(BaseModel):
    id: uuid.UUID
    updates: Dict[str, Any]

class BatchUpdateResponse(BaseModel):
    success_ids: List[uuid.UUID]
    failed_items: List[Dict[str, Any]] # {id, error}

