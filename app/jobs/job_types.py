"""
Job Types and Schemas

Defines enums, type hints, and Pydantic models for the background job system.
"""

from enum import Enum
from typing import Any, Dict, List, Optional, Union
from datetime import datetime
from pydantic import BaseModel, Field


class JobType(str, Enum):
    """Types of background jobs supported by TaxScape."""
    RD_PARSE_SESSION = "rd_parse_session"
    AI_EVALUATE_PROJECTS = "ai_evaluate_projects"
    AI_EVALUATE_SINGLE_PROJECT = "ai_evaluate_single_project"
    GENERATE_EXCEL_REPORT = "generate_excel_report"
    GENERATE_CREDIT_ESTIMATE_EXPORT = "generate_credit_estimate_export"
    GENERATE_STUDY_ARTIFACTS = "generate_study_artifacts"
    GENERATE_DEFENSE_PACK = "generate_defense_pack"
    EVIDENCE_REPROCESSING = "evidence_reprocessing"
    SYNC_EXPECTED_INPUTS = "sync_expected_inputs"
    INTAKE_FILE_PROCESSING = "intake_file_processing"
    BULK_IMPORT = "bulk_import"
    OTHER = "other"


class JobStatus(str, Enum):
    """Status of a background job."""
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    CANCELLATION_REQUESTED = "cancellation_requested"


class JobEventType(str, Enum):
    """Types of events that can be logged during job execution."""
    PROGRESS_UPDATE = "progress_update"
    STAGE_CHANGE = "stage_change"
    LOG = "log"
    WARNING = "warning"
    ERROR = "error"
    HEARTBEAT = "heartbeat"
    CHILD_JOB_CREATED = "child_job_created"
    RETRY_SCHEDULED = "retry_scheduled"


class JobProgress(BaseModel):
    """Progress information for a running job."""
    percent: float = Field(default=0, ge=0, le=100)
    stage: str = Field(default="queued")
    detail: Optional[str] = None
    counters: Optional[Dict[str, Any]] = None
    last_heartbeat_at: Optional[datetime] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class JobError(BaseModel):
    """Structured error information for failed jobs."""
    error_type: str  # e.g., "validation_error", "ai_quota_exceeded", "worker_lost"
    message: str
    stack_trace: Optional[str] = None  # Server-only, not exposed to UI
    hint: Optional[str] = None  # User-friendly suggestion
    failing_stage: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class JobParams(BaseModel):
    """Base parameters for starting a job."""
    job_type: JobType
    client_company_id: Optional[str] = None
    tax_year: Optional[int] = None
    params: Dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(default=5, ge=1, le=10)
    parent_job_id: Optional[str] = None


class JobResult(BaseModel):
    """Result of a completed job."""
    success: bool
    outputs: Dict[str, Any] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    metrics: Optional[Dict[str, Any]] = None  # e.g., duration, items_processed


# ============================================================================
# Job-specific parameter schemas
# ============================================================================

class RDParseSessionParams(BaseModel):
    """Parameters for rd_parse_session job."""
    session_id: str
    include_ai_eval: bool = True
    file_ids: Optional[List[str]] = None


class AIEvaluateProjectsParams(BaseModel):
    """Parameters for ai_evaluate_projects job."""
    project_ids: List[str]
    tax_year: int = 2024
    use_evidence: bool = True
    force: bool = False
    concurrency: int = Field(default=3, le=10)


class AIEvaluateSingleProjectParams(BaseModel):
    """Parameters for ai_evaluate_single_project job."""
    project_id: str
    tax_year: int = 2024
    use_evidence: bool = True
    force: bool = False


class GenerateExcelReportParams(BaseModel):
    """Parameters for generate_excel_report job."""
    study_id: Optional[str] = None
    study_version: Optional[int] = None
    include_sections: List[str] = Field(
        default_factory=lambda: [
            "summary", "employees", "timesheets", "projects", 
            "allocations", "vendors", "ap_transactions", "supplies",
            "automated_review", "qre_summary", "credit_computation",
            "sec_174_tieout", "sanity_checks", "form_6765", "four_part_test"
        ]
    )


class GenerateStudyArtifactsParams(BaseModel):
    """Parameters for generate_study_artifacts job."""
    study_id: str
    study_version: int
    artifact_types: List[str] = Field(
        default_factory=lambda: [
            "excel_study_workbook",
            "form_6765_export",
            "section_41_narratives_docx",
            "client_cover_summary_pdf",
            "client_package_zip"
        ]
    )
    force_regenerate: bool = False


class GenerateDefensePackParams(BaseModel):
    """Parameters for generate_defense_pack job."""
    study_id: str
    include_evidence: bool = True
    include_audit_trail: bool = True
    date_range_start: Optional[str] = None
    date_range_end: Optional[str] = None


class EvidenceReprocessingParams(BaseModel):
    """Parameters for evidence_reprocessing job."""
    evidence_file_id: Optional[str] = None
    evidence_request_id: Optional[str] = None
    reprocess_scope: str = "full"  # "full", "targeted", "rules_only"
    rule_ids: Optional[List[str]] = None
    trigger_ai_eval: bool = False


class IntakeFileProcessingParams(BaseModel):
    """Parameters for intake_file_processing job."""
    intake_file_id: str
    intake_session_id: str
    file_type: str  # "employees", "projects", "timesheets", etc.
    auto_map: bool = True


class BulkImportParams(BaseModel):
    """Parameters for bulk_import job."""
    import_type: str  # "employees", "projects", "vendors", etc.
    source_file_id: str
    mapping_config: Dict[str, str] = Field(default_factory=dict)
    upsert_mode: bool = True
    dry_run: bool = False


# ============================================================================
# API Response Schemas
# ============================================================================

class JobStartResponse(BaseModel):
    """Response when starting a job."""
    job_id: str
    status: JobStatus
    progress: JobProgress
    existing_job: bool = False  # True if returning existing job due to idempotency


class JobStatusResponse(BaseModel):
    """Response for job status query."""
    job_id: str
    status: JobStatus
    progress: JobProgress
    result: Optional[JobResult] = None
    error: Optional[JobError] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    can_cancel: bool = False
    can_retry: bool = False


class JobListItem(BaseModel):
    """Item in a job list response."""
    job_id: str
    job_type: JobType
    status: JobStatus
    progress: JobProgress
    client_company_id: Optional[str] = None
    tax_year: Optional[int] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class JobListResponse(BaseModel):
    """Response for job list query."""
    jobs: List[JobListItem]
    total_count: int
    has_more: bool


class JobEventItem(BaseModel):
    """Single job event."""
    id: str
    event_type: JobEventType
    message: str
    data: Optional[Dict[str, Any]] = None
    created_at: datetime


class JobEventsResponse(BaseModel):
    """Response for job events query."""
    job_id: str
    events: List[JobEventItem]
    total_count: int
