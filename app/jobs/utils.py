"""
Job Utilities

Shared utilities for job handlers including progress helpers, error formatting,
and common operations.
"""

import hashlib
import logging
from typing import Any, Dict, List, Optional, Callable
from functools import wraps
from datetime import datetime

logger = logging.getLogger(__name__)


def compute_hash(*args: Any) -> str:
    """Compute a hash from arbitrary arguments."""
    import json
    content = json.dumps(args, sort_keys=True, default=str)
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def safe_json_value(value: Any) -> Any:
    """Convert value to JSON-safe format."""
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [safe_json_value(v) for v in value]
    if isinstance(value, dict):
        return {k: safe_json_value(v) for k, v in value.items()}
    return str(value)


def format_duration(seconds: float) -> str:
    """Format duration in human-readable form."""
    if seconds < 60:
        return f"{seconds:.1f}s"
    if seconds < 3600:
        mins = seconds / 60
        return f"{mins:.1f}m"
    hours = seconds / 3600
    return f"{hours:.1f}h"


def chunk_list(lst: List[Any], chunk_size: int) -> List[List[Any]]:
    """Split a list into chunks."""
    return [lst[i:i + chunk_size] for i in range(0, len(lst), chunk_size)]


class ProgressTracker:
    """
    Helper for tracking progress across multiple stages.
    
    Usage:
        tracker = ProgressTracker([
            ("loading", 10),
            ("processing", 60),
            ("saving", 20),
            ("cleanup", 10)
        ])
        
        ctx.update_progress(*tracker.stage("loading"), "Loading data...")
        # ... do work ...
        ctx.update_progress(*tracker.complete("loading"), "Loaded")
        
        for i, item in enumerate(items):
            ctx.update_progress(*tracker.progress("processing", i, len(items)))
    """
    
    def __init__(self, stages: List[tuple]):
        """
        Initialize with list of (stage_name, weight) tuples.
        Weights should sum to 100.
        """
        self.stages = {}
        cumulative = 0
        
        for name, weight in stages:
            self.stages[name] = {
                "start": cumulative,
                "weight": weight,
                "end": cumulative + weight
            }
            cumulative += weight
        
        self._current_stage: Optional[str] = None
    
    def stage(self, name: str) -> tuple:
        """Get (percent, stage_name) for starting a stage."""
        if name not in self.stages:
            return (0, name)
        
        self._current_stage = name
        return (self.stages[name]["start"], name)
    
    def complete(self, name: str) -> tuple:
        """Get (percent, stage_name) for completing a stage."""
        if name not in self.stages:
            return (100, name)
        
        return (self.stages[name]["end"], name)
    
    def progress(self, name: str, current: int, total: int) -> tuple:
        """Get (percent, stage_name) for progress within a stage."""
        if name not in self.stages or total <= 0:
            return (0, name)
        
        stage = self.stages[name]
        stage_progress = min(current / total, 1.0)
        percent = stage["start"] + (stage["weight"] * stage_progress)
        
        return (percent, name)


def with_heartbeat(interval: float = 30.0):
    """
    Decorator to automatically call heartbeat during long-running sync operations.
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(ctx, *args, **kwargs):
            import threading
            import time
            
            stop_event = threading.Event()
            
            def heartbeat_loop():
                while not stop_event.wait(interval):
                    try:
                        ctx.heartbeat()
                    except Exception:
                        pass
            
            thread = threading.Thread(target=heartbeat_loop, daemon=True)
            thread.start()
            
            try:
                return func(ctx, *args, **kwargs)
            finally:
                stop_event.set()
                thread.join(timeout=1.0)
        
        return wrapper
    return decorator


class BatchProcessor:
    """
    Helper for processing items in batches with progress tracking.
    
    Usage:
        processor = BatchProcessor(items, batch_size=10)
        
        for batch, progress_info in processor:
            for item in batch:
                process(item)
            ctx.update_progress(
                progress_info["percent"],
                "processing",
                counters=progress_info["counters"]
            )
    """
    
    def __init__(
        self, 
        items: List[Any], 
        batch_size: int = 10,
        start_percent: float = 0,
        end_percent: float = 100
    ):
        self.items = items
        self.batch_size = batch_size
        self.start_percent = start_percent
        self.end_percent = end_percent
        self.total = len(items)
        self.processed = 0
    
    def __iter__(self):
        for chunk in chunk_list(self.items, self.batch_size):
            batch_end = self.processed + len(chunk)
            progress = batch_end / self.total if self.total > 0 else 1.0
            percent = self.start_percent + (self.end_percent - self.start_percent) * progress
            
            yield chunk, {
                "percent": percent,
                "counters": {
                    "done": batch_end,
                    "total": self.total
                }
            }
            
            self.processed = batch_end


def create_error_response(
    error_type: str,
    message: str,
    hint: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Create a standardized error response dictionary."""
    return {
        "error_type": error_type,
        "message": message,
        "hint": hint or get_default_hint(error_type),
        "details": details,
        "timestamp": datetime.utcnow().isoformat()
    }


def get_default_hint(error_type: str) -> str:
    """Get default user-friendly hint for an error type."""
    hints = {
        "validation_error": "Please check your input data and try again.",
        "not_found": "The requested resource could not be found.",
        "permission_denied": "You don't have permission to perform this action.",
        "rate_limit": "Too many requests. Please wait a moment and try again.",
        "quota_exceeded": "Service quota exceeded. Please try again later.",
        "timeout": "The operation timed out. Try with smaller data or try again.",
        "connection_error": "Could not connect to required services. Check your connection.",
        "worker_lost": "The job processor stopped unexpectedly. You can retry this job.",
        "lock_conflict": "Another operation is in progress. Please wait and try again.",
    }
    return hints.get(error_type, "An error occurred. Please try again or contact support.")


def format_file_size(bytes: int) -> str:
    """Format file size in human-readable form."""
    for unit in ["B", "KB", "MB", "GB"]:
        if bytes < 1024:
            return f"{bytes:.1f} {unit}"
        bytes /= 1024
    return f"{bytes:.1f} TB"
