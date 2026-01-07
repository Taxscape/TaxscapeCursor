"""
Authorization & Permissions Module

Centralized capability-based authorization for the TaxScape API.
Implements defense-in-depth with backend checks complementing RLS.
"""

import os
import uuid
import time
import logging
import functools
from typing import List, Dict, Any, Optional, Callable
from datetime import datetime, timedelta
from enum import Enum

from fastapi import HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.supabase_client import get_supabase, verify_supabase_token, get_user_profile

logger = logging.getLogger(__name__)

# =============================================================================
# CAPABILITY DEFINITIONS
# =============================================================================

class Capability(str, Enum):
    """All available capabilities in the system"""
    MANAGE_ORG = "can_manage_org"
    MANAGE_CLIENTS = "can_manage_clients"
    EDIT_FINANCIALS = "can_edit_financials"
    EDIT_PROJECTS = "can_edit_projects"
    VIEW_AI = "can_view_ai"
    RUN_AI = "can_run_ai"
    GENERATE_STUDIES = "can_generate_studies"
    APPROVE_STUDIES = "can_approve_studies"
    UPLOAD_EVIDENCE = "can_upload_evidence"
    RESOLVE_GAPS = "can_resolve_gaps"
    WAIVE_GAPS = "can_waive_gaps"
    VIEW_AUDIT_PACKAGE = "can_view_audit_package"
    MANAGE_TASKS = "can_manage_tasks"
    VIEW_ALL_DATA = "can_view_all_data"
    SUBMIT_TIMESHEETS = "can_submit_timesheets"
    ANSWER_QUESTIONNAIRES = "can_answer_questionnaires"
    VIEW_ASSIGNED_TASKS = "can_view_assigned_tasks"
    COMPLETE_TASKS = "can_complete_tasks"


# Default capabilities by role (fallback if DB is unavailable)
DEFAULT_CAPABILITIES = {
    "executive": {
        Capability.MANAGE_ORG: True,
        Capability.MANAGE_CLIENTS: True,
        Capability.EDIT_FINANCIALS: True,
        Capability.EDIT_PROJECTS: True,
        Capability.VIEW_AI: True,
        Capability.RUN_AI: True,
        Capability.GENERATE_STUDIES: True,
        Capability.APPROVE_STUDIES: True,
        Capability.UPLOAD_EVIDENCE: True,
        Capability.RESOLVE_GAPS: True,
        Capability.WAIVE_GAPS: True,
        Capability.VIEW_AUDIT_PACKAGE: True,
        Capability.MANAGE_TASKS: True,
        Capability.VIEW_ALL_DATA: True,
    },
    "admin": {
        Capability.MANAGE_ORG: True,
        Capability.MANAGE_CLIENTS: True,
        Capability.EDIT_FINANCIALS: True,
        Capability.EDIT_PROJECTS: True,
        Capability.VIEW_AI: True,
        Capability.RUN_AI: True,
        Capability.GENERATE_STUDIES: True,
        Capability.APPROVE_STUDIES: True,
        Capability.UPLOAD_EVIDENCE: True,
        Capability.RESOLVE_GAPS: True,
        Capability.WAIVE_GAPS: True,
        Capability.VIEW_AUDIT_PACKAGE: True,
        Capability.MANAGE_TASKS: True,
        Capability.VIEW_ALL_DATA: True,
    },
    "cpa": {
        Capability.MANAGE_ORG: False,
        Capability.MANAGE_CLIENTS: True,
        Capability.EDIT_FINANCIALS: True,
        Capability.EDIT_PROJECTS: True,
        Capability.VIEW_AI: True,
        Capability.RUN_AI: True,
        Capability.GENERATE_STUDIES: True,
        Capability.APPROVE_STUDIES: True,
        Capability.UPLOAD_EVIDENCE: True,
        Capability.RESOLVE_GAPS: True,
        Capability.WAIVE_GAPS: True,
        Capability.VIEW_AUDIT_PACKAGE: True,
        Capability.MANAGE_TASKS: True,
        Capability.VIEW_ALL_DATA: True,
    },
    "engineer": {
        Capability.MANAGE_ORG: False,
        Capability.MANAGE_CLIENTS: False,
        Capability.EDIT_FINANCIALS: False,
        Capability.EDIT_PROJECTS: False,
        Capability.VIEW_AI: False,
        Capability.RUN_AI: False,
        Capability.GENERATE_STUDIES: False,
        Capability.APPROVE_STUDIES: False,
        Capability.UPLOAD_EVIDENCE: True,
        Capability.RESOLVE_GAPS: False,
        Capability.WAIVE_GAPS: False,
        Capability.VIEW_AUDIT_PACKAGE: False,
        Capability.MANAGE_TASKS: False,
        Capability.VIEW_ALL_DATA: False,
        Capability.SUBMIT_TIMESHEETS: True,
        Capability.ANSWER_QUESTIONNAIRES: True,
        Capability.VIEW_ASSIGNED_TASKS: True,
        Capability.COMPLETE_TASKS: True,
    },
}


# =============================================================================
# AUTHORIZATION CONTEXT
# =============================================================================

class AuthContext:
    """
    Authorization context for a request.
    Contains user info, org membership, and capabilities.
    """
    def __init__(
        self,
        user_id: str,
        email: str,
        org_id: Optional[str] = None,
        role: Optional[str] = None,
        capabilities: Optional[Dict[str, bool]] = None,
        request_id: Optional[str] = None
    ):
        self.user_id = user_id
        self.email = email
        self.org_id = org_id
        self.role = role
        self.capabilities = capabilities or {}
        self.request_id = request_id or str(uuid.uuid4())[:8]
    
    def has_capability(self, cap: Capability) -> bool:
        """Check if user has a specific capability"""
        cap_key = cap.value if isinstance(cap, Capability) else cap
        
        # Check user-specific capabilities first
        if cap_key in self.capabilities:
            return self.capabilities[cap_key]
        
        # Fall back to role defaults
        if self.role and self.role in DEFAULT_CAPABILITIES:
            return DEFAULT_CAPABILITIES[self.role].get(cap, False)
        
        return False
    
    def require_capability(self, cap: Capability, message: str = None):
        """Raise HTTPException if capability is missing"""
        if not self.has_capability(cap):
            raise HTTPException(
                status_code=403,
                detail=message or f"Permission denied: {cap.value} required"
            )
    
    def to_log_context(self) -> Dict[str, Any]:
        """Return context suitable for logging"""
        return {
            "user_id": self.user_id,
            "org_id": self.org_id,
            "role": self.role,
            "request_id": self.request_id,
        }


# =============================================================================
# AUTHENTICATION HELPERS
# =============================================================================

security = HTTPBearer(auto_error=False)


async def get_auth_context(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> AuthContext:
    """
    Extract and validate authentication, returning an AuthContext.
    This is the primary auth dependency for protected endpoints.
    """
    # Generate request ID for tracing
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:8]
    
    # Get token from header
    token = None
    if credentials:
        token = credentials.credentials
    else:
        # Try Authorization header directly
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Verify token
    user = verify_supabase_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    user_id = user.get("id") or user.get("sub")
    email = user.get("email", "")
    
    # Get profile and org membership
    profile = get_user_profile(user_id)
    org_id = profile.get("organization_id") if profile else None
    
    # Get role and capabilities from org membership
    role = None
    capabilities = {}
    
    if org_id:
        supabase = get_supabase()
        if supabase:
            try:
                member = supabase.table("organization_members")\
                    .select("role, capabilities")\
                    .eq("organization_id", org_id)\
                    .eq("user_id", user_id)\
                    .eq("status", "active")\
                    .single()\
                    .execute()
                
                if member.data:
                    role = member.data.get("role")
                    capabilities = member.data.get("capabilities") or {}
            except Exception as e:
                logger.warning(f"Failed to fetch capabilities: {e}")
    
    return AuthContext(
        user_id=user_id,
        email=email,
        org_id=org_id,
        role=role,
        capabilities=capabilities,
        request_id=request_id
    )


async def get_optional_auth_context(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Optional[AuthContext]:
    """
    Like get_auth_context but returns None instead of raising for unauthenticated requests.
    Useful for endpoints that can work with or without auth.
    """
    try:
        return await get_auth_context(request, credentials)
    except HTTPException:
        return None


# =============================================================================
# CAPABILITY DECORATORS
# =============================================================================

def require_capability(cap: Capability, message: str = None):
    """
    Decorator to require a capability for an endpoint.
    Must be used with get_auth_context dependency.
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Find auth context in kwargs
            auth: AuthContext = kwargs.get("auth")
            if not auth:
                raise HTTPException(status_code=500, detail="Auth context not found")
            
            auth.require_capability(cap, message)
            return await func(*args, **kwargs)
        return wrapper
    return decorator


def require_any_capability(*caps: Capability):
    """Require at least one of the listed capabilities"""
    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            auth: AuthContext = kwargs.get("auth")
            if not auth:
                raise HTTPException(status_code=500, detail="Auth context not found")
            
            for cap in caps:
                if auth.has_capability(cap):
                    return await func(*args, **kwargs)
            
            cap_names = [c.value for c in caps]
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: one of {cap_names} required"
            )
        return wrapper
    return decorator


# =============================================================================
# CLIENT ACCESS VERIFICATION
# =============================================================================

def verify_client_access(auth: AuthContext, client_company_id: str) -> bool:
    """
    Verify user can access a specific client company.
    Returns True if access is allowed, raises HTTPException otherwise.
    """
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    # Get client's org
    try:
        client = supabase.table("client_companies")\
            .select("organization_id")\
            .eq("id", client_company_id)\
            .single()\
            .execute()
        
        if not client.data:
            raise HTTPException(status_code=404, detail="Client company not found")
        
        client_org_id = client.data.get("organization_id")
        
        # Must be in same org
        if client_org_id != auth.org_id:
            raise HTTPException(status_code=403, detail="Access denied to this client")
        
        # Full access users can access all
        if auth.has_capability(Capability.VIEW_ALL_DATA):
            return True
        
        # Contributors need specific assignment
        # Check tasks or questionnaire assignments
        has_assignment = supabase.table("tasks")\
            .select("id")\
            .eq("assigned_to", auth.user_id)\
            .eq("client_company_id", client_company_id)\
            .limit(1)\
            .execute()
        
        if has_assignment.data:
            return True
        
        raise HTTPException(
            status_code=403,
            detail="You don't have access to this client. Contact your administrator."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying client access: {e}")
        raise HTTPException(status_code=500, detail="Failed to verify access")


# =============================================================================
# RATE LIMITING
# =============================================================================

# In-memory rate limit cache (for speed, backed by DB for persistence)
_rate_limit_cache: Dict[str, Dict[str, Any]] = {}

RATE_LIMITS = {
    "ai_evaluation": {"max_requests": 10, "window_minutes": 1},
    "ai_draft": {"max_requests": 20, "window_minutes": 1},
    "import": {"max_requests": 5, "window_minutes": 1},
    "study_generate": {"max_requests": 3, "window_minutes": 1},
    "default": {"max_requests": 60, "window_minutes": 1},
}


def check_rate_limit(user_id: str, endpoint: str) -> bool:
    """
    Check if request is within rate limits.
    Returns True if allowed, raises HTTPException if rate limited.
    """
    limit_config = RATE_LIMITS.get(endpoint, RATE_LIMITS["default"])
    max_requests = limit_config["max_requests"]
    window_minutes = limit_config["window_minutes"]
    
    cache_key = f"{user_id}:{endpoint}"
    now = datetime.utcnow()
    window_start = now - timedelta(minutes=window_minutes)
    
    # Check in-memory cache first
    if cache_key in _rate_limit_cache:
        entry = _rate_limit_cache[cache_key]
        if entry["window_start"] > window_start:
            if entry["count"] >= max_requests:
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded. Max {max_requests} requests per {window_minutes} minute(s)."
                )
            entry["count"] += 1
        else:
            # Reset window
            _rate_limit_cache[cache_key] = {"window_start": now, "count": 1}
    else:
        _rate_limit_cache[cache_key] = {"window_start": now, "count": 1}
    
    return True


def rate_limit(endpoint: str):
    """Decorator to apply rate limiting to an endpoint"""
    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            auth: AuthContext = kwargs.get("auth")
            if auth:
                check_rate_limit(auth.user_id, endpoint)
            return await func(*args, **kwargs)
        return wrapper
    return decorator


# =============================================================================
# FILE UPLOAD VALIDATION
# =============================================================================

ALLOWED_FILE_TYPES = {
    "application/pdf": [".pdf"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    "application/vnd.ms-excel": [".xls"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/msword": [".doc"],
    "text/csv": [".csv"],
    "text/plain": [".txt"],
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"],
}

MAX_FILE_SIZE_MB = 50
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


def validate_file_upload(
    filename: str,
    content_type: str,
    file_size: int,
    file_content: bytes = None
) -> Dict[str, Any]:
    """
    Validate uploaded file for security.
    Returns validation result dict with success flag and any errors.
    """
    errors = []
    
    # Check file extension
    ext = os.path.splitext(filename.lower())[1]
    allowed_extensions = []
    for exts in ALLOWED_FILE_TYPES.values():
        allowed_extensions.extend(exts)
    
    if ext not in allowed_extensions:
        errors.append(f"File type '{ext}' not allowed. Allowed: {', '.join(allowed_extensions)}")
    
    # Check content type
    if content_type not in ALLOWED_FILE_TYPES:
        errors.append(f"Content type '{content_type}' not allowed")
    
    # Check extension matches content type
    if content_type in ALLOWED_FILE_TYPES and ext not in ALLOWED_FILE_TYPES[content_type]:
        errors.append(f"File extension '{ext}' does not match content type '{content_type}'")
    
    # Check file size
    if file_size > MAX_FILE_SIZE_BYTES:
        errors.append(f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB")
    
    # Basic content sniffing (magic bytes)
    if file_content:
        detected_type = _detect_file_type(file_content[:8])
        if detected_type and detected_type != content_type:
            logger.warning(
                f"Content type mismatch: declared={content_type}, detected={detected_type}, file={filename}"
            )
            # Don't block but log for review
    
    # Placeholder for virus scanning
    # In production, integrate with ClamAV or similar
    scan_result = _scan_for_malware(file_content) if file_content else {"clean": True}
    if not scan_result.get("clean", True):
        errors.append("File failed security scan")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "filename": filename,
        "content_type": content_type,
        "size": file_size,
    }


def _detect_file_type(header: bytes) -> Optional[str]:
    """Detect file type from magic bytes"""
    if header.startswith(b'%PDF'):
        return "application/pdf"
    if header.startswith(b'PK'):  # ZIP-based formats (xlsx, docx)
        return None  # Could be xlsx or docx, need more inspection
    if header.startswith(b'\xff\xd8\xff'):
        return "image/jpeg"
    if header.startswith(b'\x89PNG'):
        return "image/png"
    return None


def _scan_for_malware(content: bytes) -> Dict[str, Any]:
    """
    Placeholder for malware scanning.
    In production, integrate with ClamAV, VirusTotal, or similar.
    """
    # TODO: Implement actual scanning
    logger.debug("Malware scan placeholder - implement ClamAV integration for production")
    return {"clean": True, "scanner": "placeholder"}


# =============================================================================
# CORS CONFIGURATION
# =============================================================================

def get_cors_origins() -> List[str]:
    """Get allowed CORS origins from environment"""
    origins_str = os.getenv("CORS_ORIGINS", "")
    
    if not origins_str:
        # Default origins for production
        return [
            "https://taxscape.ai",
            "https://www.taxscape.ai",
            "https://app.taxscape.ai",
            "https://taxscape-frontend.vercel.app",
        ]
    
    return [o.strip() for o in origins_str.split(",") if o.strip()]


# =============================================================================
# LOGGING HELPERS
# =============================================================================

def log_api_call(
    auth: AuthContext,
    endpoint: str,
    method: str,
    status_code: int,
    duration_ms: float,
    extra: Dict[str, Any] = None
):
    """Log API call with structured context"""
    log_data = {
        "type": "api_call",
        "request_id": auth.request_id,
        "user_id": auth.user_id,
        "org_id": auth.org_id,
        "endpoint": endpoint,
        "method": method,
        "status_code": status_code,
        "duration_ms": round(duration_ms, 2),
        "timestamp": datetime.utcnow().isoformat(),
    }
    if extra:
        log_data.update(extra)
    
    if status_code >= 500:
        logger.error(f"API Error: {log_data}")
    elif status_code >= 400:
        logger.warning(f"API Warning: {log_data}")
    else:
        logger.info(f"API Call: {log_data}")


def log_ai_call(
    auth: AuthContext,
    model_name: str,
    prompt_version: str,
    duration_ms: float,
    success: bool,
    tokens: Optional[int] = None,
    cost: Optional[float] = None,
    error: Optional[str] = None
):
    """Log AI/LLM call with telemetry"""
    log_data = {
        "type": "ai_call",
        "request_id": auth.request_id,
        "user_id": auth.user_id,
        "org_id": auth.org_id,
        "model_name": model_name,
        "prompt_version": prompt_version,
        "duration_ms": round(duration_ms, 2),
        "success": success,
        "tokens": tokens,
        "estimated_cost": cost,
        "timestamp": datetime.utcnow().isoformat(),
    }
    if error:
        log_data["error"] = error
    
    if success:
        logger.info(f"AI Call: {log_data}")
    else:
        logger.error(f"AI Error: {log_data}")
    
    # Persist to DB for analytics
    try:
        supabase = get_supabase()
        if supabase:
            supabase.table("ai_telemetry").insert({
                "organization_id": auth.org_id,
                "user_id": auth.user_id,
                "request_id": auth.request_id,
                "endpoint": "ai_evaluation",
                "model_name": model_name,
                "model_provider": "gemini",
                "prompt_version": prompt_version,
                "total_tokens": tokens,
                "estimated_cost": cost,
                "duration_ms": int(duration_ms),
                "success": success,
                "error_message": error,
            }).execute()
    except Exception as e:
        logger.warning(f"Failed to persist AI telemetry: {e}")


def log_audit(
    auth: AuthContext,
    action: str,
    resource_type: str,
    resource_id: str = None,
    client_company_id: str = None,
    details: Dict[str, Any] = None,
    request: Request = None
):
    """Log audit event"""
    ip_address = None
    user_agent = None
    
    if request:
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("User-Agent")
    
    try:
        supabase = get_supabase()
        if supabase:
            supabase.table("audit_logs").insert({
                "organization_id": auth.org_id,
                "user_id": auth.user_id,
                "action": action,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "client_company_id": client_company_id,
                "request_id": auth.request_id,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "details": details or {},
            }).execute()
    except Exception as e:
        logger.warning(f"Failed to log audit event: {e}")

