"""
Org Settings Loader

Provides cached access to organization settings for use across modules.
All modules (review rules, escalations, evidence, estimates, finalization) should use this.
"""

import logging
from typing import Any, Dict, Optional
from functools import lru_cache
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# In-memory cache with TTL
_settings_cache: Dict[str, Dict[str, Any]] = {}
_cache_timestamps: Dict[str, datetime] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes


# Default settings (conservative fallbacks)
DEFAULT_SETTINGS = {
    "defaults": {
        "wage_outlier_threshold": 500000,
        "large_tx_threshold": 50000,
        "allocation_upper_bound": 0.95,
        "allocation_lower_bound": 0.01,
        "senior_required_credit_at_risk": 25000,
        "senior_required_qre_at_risk": 100000,
        "block_finalize_with_open_high_findings": True,
        "allow_preliminary_credit_export": False,
        "evidence_token_expiration_days": 14,
    },
    "feature_flags": {
        "enable_client_upload_portal": True,
        "enable_section_174_module": False,
        "enable_ai_narratives": True,
        "enable_auto_reprocessing": True,
        "enable_study_locking": True,
        "enable_credit_range_module": True,
    },
    "purchased_sections": ["41"],
}


def get_org_settings(supabase, org_id: str, force_refresh: bool = False) -> Dict[str, Any]:
    """
    Get organization settings with caching.
    
    Args:
        supabase: Supabase client
        org_id: Organization ID
        force_refresh: If True, bypass cache
        
    Returns:
        Dict with keys: defaults, feature_flags, purchased_sections
    """
    global _settings_cache, _cache_timestamps
    
    now = datetime.utcnow()
    cache_key = org_id
    
    # Check cache
    if not force_refresh and cache_key in _settings_cache:
        cache_time = _cache_timestamps.get(cache_key)
        if cache_time and (now - cache_time).total_seconds() < CACHE_TTL_SECONDS:
            return _settings_cache[cache_key]
    
    # Fetch from database
    try:
        result = supabase.table("org_settings").select("*").eq("organization_id", org_id).single().execute()
        if result.data:
            settings = {
                "defaults": result.data.get("defaults") or DEFAULT_SETTINGS["defaults"],
                "feature_flags": result.data.get("feature_flags") or DEFAULT_SETTINGS["feature_flags"],
                "purchased_sections": result.data.get("purchased_sections") or DEFAULT_SETTINGS["purchased_sections"],
            }
            _settings_cache[cache_key] = settings
            _cache_timestamps[cache_key] = now
            return settings
    except Exception as e:
        logger.warning(f"Failed to fetch org_settings for {org_id}: {e}")
    
    # Auto-create with defaults if not exists
    try:
        created = supabase.table("org_settings").insert({
            "organization_id": org_id,
            "defaults": DEFAULT_SETTINGS["defaults"],
            "feature_flags": DEFAULT_SETTINGS["feature_flags"],
            "purchased_sections": DEFAULT_SETTINGS["purchased_sections"],
        }).execute()
        
        if created.data:
            settings = {
                "defaults": DEFAULT_SETTINGS["defaults"],
                "feature_flags": DEFAULT_SETTINGS["feature_flags"],
                "purchased_sections": DEFAULT_SETTINGS["purchased_sections"],
            }
            _settings_cache[cache_key] = settings
            _cache_timestamps[cache_key] = now
            
            # Log initialization
            try:
                supabase.table("audit_logs").insert({
                    "user_id": None,
                    "action": "org_settings_initialized",
                    "resource_type": "org_settings",
                    "resource_id": org_id,
                    "details": {"reason": "auto_created_on_first_access"},
                    "created_at": now.isoformat(),
                }).execute()
            except Exception:
                pass
            
            return settings
    except Exception as e:
        logger.warning(f"Failed to auto-create org_settings for {org_id}: {e}")
    
    # Return in-memory defaults as last resort
    return DEFAULT_SETTINGS.copy()


def get_default(supabase, org_id: str, key: str, fallback: Any = None) -> Any:
    """
    Get a specific default value from org settings.
    
    Args:
        supabase: Supabase client
        org_id: Organization ID
        key: Key in the defaults dict (e.g., "wage_outlier_threshold")
        fallback: Value to return if key not found
        
    Returns:
        The setting value or fallback
    """
    settings = get_org_settings(supabase, org_id)
    defaults = settings.get("defaults", {})
    
    if key in defaults:
        return defaults[key]
    
    # Check hardcoded defaults
    if key in DEFAULT_SETTINGS["defaults"]:
        return DEFAULT_SETTINGS["defaults"][key]
    
    return fallback


def get_feature_flag(supabase, org_id: str, flag: str, fallback: bool = False) -> bool:
    """
    Get a feature flag value.
    
    Args:
        supabase: Supabase client
        org_id: Organization ID
        flag: Flag name (e.g., "enable_ai_narratives")
        fallback: Value if flag not found
        
    Returns:
        Boolean flag value
    """
    settings = get_org_settings(supabase, org_id)
    flags = settings.get("feature_flags", {})
    
    if flag in flags:
        return bool(flags[flag])
    
    if flag in DEFAULT_SETTINGS["feature_flags"]:
        return bool(DEFAULT_SETTINGS["feature_flags"][flag])
    
    return fallback


def has_purchased_section(supabase, org_id: str, section: str) -> bool:
    """
    Check if organization has purchased a specific section.
    
    Args:
        supabase: Supabase client
        org_id: Organization ID
        section: Section code (e.g., "41", "174")
        
    Returns:
        True if section is purchased
    """
    settings = get_org_settings(supabase, org_id)
    sections = settings.get("purchased_sections", ["41"])
    return section in sections


def invalidate_cache(org_id: Optional[str] = None):
    """
    Invalidate settings cache.
    
    Args:
        org_id: Specific org to invalidate, or None for all
    """
    global _settings_cache, _cache_timestamps
    
    if org_id:
        _settings_cache.pop(org_id, None)
        _cache_timestamps.pop(org_id, None)
    else:
        _settings_cache.clear()
        _cache_timestamps.clear()


# Convenience functions for common checks

def requires_senior_for_credit(supabase, org_id: str, credit_at_risk: float) -> bool:
    """Check if credit amount requires senior review."""
    threshold = get_default(supabase, org_id, "senior_required_credit_at_risk", 25000)
    return credit_at_risk >= threshold


def requires_senior_for_qre(supabase, org_id: str, qre_at_risk: float) -> bool:
    """Check if QRE amount requires senior review."""
    threshold = get_default(supabase, org_id, "senior_required_qre_at_risk", 100000)
    return qre_at_risk >= threshold


def is_wage_outlier(supabase, org_id: str, wage: float) -> bool:
    """Check if wage is an outlier."""
    threshold = get_default(supabase, org_id, "wage_outlier_threshold", 500000)
    return wage > threshold


def is_large_transaction(supabase, org_id: str, amount: float) -> bool:
    """Check if transaction is considered large."""
    threshold = get_default(supabase, org_id, "large_tx_threshold", 50000)
    return amount > threshold


def is_allocation_outlier(supabase, org_id: str, allocation: float) -> bool:
    """Check if allocation percentage is an outlier (too high or too low)."""
    upper = get_default(supabase, org_id, "allocation_upper_bound", 0.95)
    lower = get_default(supabase, org_id, "allocation_lower_bound", 0.01)
    return allocation > upper or (allocation > 0 and allocation < lower)


def should_block_finalize_with_open_findings(supabase, org_id: str) -> bool:
    """Check if finalization should be blocked with open high findings."""
    return get_default(supabase, org_id, "block_finalize_with_open_high_findings", True)


def get_evidence_token_expiration_days(supabase, org_id: str) -> int:
    """Get evidence token expiration in days."""
    return get_default(supabase, org_id, "evidence_token_expiration_days", 14)
