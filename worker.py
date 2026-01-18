#!/usr/bin/env python3
"""
TaxScape Background Job Worker

A dedicated worker process that claims and executes queued background jobs.
Can be run as a separate service or process for reliable job execution.

Usage:
    python worker.py [--concurrency=N] [--poll-interval=S] [--job-types=TYPE1,TYPE2]

Features:
- Claims jobs from the queue using database-level locking
- Executes jobs with heartbeat updates
- Handles stuck job recovery
- Graceful shutdown on signals
"""

import asyncio
import logging
import os
import signal
import sys
from datetime import datetime
from typing import List, Optional
import argparse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("taxscape.worker")

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.supabase_client import get_supabase
from app.jobs.job_types import JobType, JobStatus
from app.jobs.job_manager import JobManager
from app.jobs.runner import JobRunner
# Import handlers to register them
import app.jobs.handlers


class BackgroundJobWorker:
    """
    Worker that polls for and executes background jobs.
    """
    
    def __init__(
        self,
        worker_id: str = None,
        concurrency: int = 3,
        poll_interval: float = 5.0,
        job_types: List[JobType] = None,
        heartbeat_interval: int = 30,
        stuck_job_threshold: int = 300
    ):
        self.worker_id = worker_id or f"worker-{os.getpid()}-{datetime.utcnow().strftime('%H%M%S')}"
        self.concurrency = concurrency
        self.poll_interval = poll_interval
        self.job_types = job_types  # None = all types
        self.heartbeat_interval = heartbeat_interval
        self.stuck_job_threshold = stuck_job_threshold
        
        self.supabase = get_supabase()
        self.manager = JobManager(self.supabase)
        self.runner = JobRunner(heartbeat_interval=heartbeat_interval)
        
        self._running = False
        self._active_tasks: dict = {}
        self._shutdown_event = asyncio.Event()
        
        logger.info(f"Worker {self.worker_id} initialized with concurrency={concurrency}")
    
    async def start(self):
        """Start the worker and begin processing jobs."""
        self._running = True
        logger.info(f"Worker {self.worker_id} starting...")
        
        # Set up signal handlers
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, self._handle_shutdown)
            except NotImplementedError:
                # Windows doesn't support add_signal_handler
                pass
        
        # Run main loop
        try:
            await asyncio.gather(
                self._job_poll_loop(),
                self._stuck_job_recovery_loop()
            )
        except asyncio.CancelledError:
            logger.info("Worker cancelled")
        finally:
            await self._cleanup()
    
    def _handle_shutdown(self):
        """Handle shutdown signal."""
        logger.info(f"Worker {self.worker_id} received shutdown signal")
        self._running = False
        self._shutdown_event.set()
    
    async def _job_poll_loop(self):
        """Main loop that polls for and processes jobs."""
        logger.info("Starting job poll loop")
        
        while self._running:
            try:
                # Check if we have capacity for more jobs
                active_count = len(self._active_tasks)
                available_slots = self.concurrency - active_count
                
                if available_slots > 0:
                    # Try to claim a job
                    job_id = await self._claim_next_job()
                    
                    if job_id:
                        logger.info(f"Claimed job {job_id}")
                        
                        # Start job execution
                        task = asyncio.create_task(self._execute_job(job_id))
                        self._active_tasks[job_id] = task
                        
                        # Clean up when done
                        task.add_done_callback(lambda t, jid=job_id: self._task_done(jid))
                
                # Wait before next poll
                try:
                    await asyncio.wait_for(
                        self._shutdown_event.wait(),
                        timeout=self.poll_interval
                    )
                    # If we get here, shutdown was requested
                    break
                except asyncio.TimeoutError:
                    # Normal timeout, continue polling
                    pass
                    
            except Exception as e:
                logger.error(f"Error in poll loop: {e}")
                await asyncio.sleep(self.poll_interval)
        
        logger.info("Job poll loop stopped")
    
    async def _claim_next_job(self) -> Optional[str]:
        """Try to claim the next available job from the queue."""
        try:
            # Use database function to atomically claim a job
            job_types_filter = None
            if self.job_types:
                job_types_filter = [jt.value for jt in self.job_types]
            
            result = self.supabase.rpc(
                "claim_next_job",
                {
                    "p_worker_id": self.worker_id,
                    "p_job_types": job_types_filter
                }
            ).execute()
            
            return result.data if result.data else None
            
        except Exception as e:
            logger.error(f"Error claiming job: {e}")
            return None
    
    async def _execute_job(self, job_id: str):
        """Execute a claimed job."""
        try:
            logger.info(f"Executing job {job_id}")
            
            # Update worker info
            self.supabase.table("background_jobs")\
                .update({"worker_id": self.worker_id})\
                .eq("id", job_id)\
                .execute()
            
            # Run the job
            success = await self.runner.execute_job(job_id)
            
            if success:
                logger.info(f"Job {job_id} completed successfully")
            else:
                logger.warning(f"Job {job_id} did not complete successfully")
                
        except Exception as e:
            logger.error(f"Error executing job {job_id}: {e}")
            
            # Mark as failed
            self.manager.mark_failed(
                job_id,
                error_type="worker_exception",
                message=str(e),
                hint="An unexpected error occurred in the worker. You can retry this job.",
                failing_stage="worker_execution"
            )
    
    def _task_done(self, job_id: str):
        """Called when a job task completes."""
        self._active_tasks.pop(job_id, None)
        logger.debug(f"Task for job {job_id} cleaned up")
    
    async def _stuck_job_recovery_loop(self):
        """Periodically check for and recover stuck jobs."""
        check_interval = 60  # Check every minute
        
        while self._running:
            try:
                # Use database function to mark stuck jobs as failed
                result = self.supabase.rpc("mark_stuck_jobs_failed").execute()
                stuck_count = result.data if result.data else 0
                
                if stuck_count > 0:
                    logger.warning(f"Recovered {stuck_count} stuck job(s)")
                
            except Exception as e:
                logger.error(f"Error in stuck job recovery: {e}")
            
            # Wait before next check
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(),
                    timeout=check_interval
                )
                break
            except asyncio.TimeoutError:
                pass
    
    async def _cleanup(self):
        """Clean up on shutdown."""
        logger.info("Worker cleaning up...")
        
        # Cancel active tasks
        for job_id, task in list(self._active_tasks.items()):
            if not task.done():
                logger.info(f"Cancelling active job {job_id}")
                task.cancel()
                
                # Mark job as cancelled in DB
                try:
                    self.supabase.table("background_jobs")\
                        .update({
                            "status": "cancelled",
                            "completed_at": datetime.utcnow().isoformat(),
                            "error": {
                                "error_type": "worker_shutdown",
                                "message": "Worker shutdown during execution",
                                "hint": "The worker was shut down while processing this job. You can retry it."
                            }
                        })\
                        .eq("id", job_id)\
                        .execute()
                except Exception as e:
                    logger.error(f"Error marking job {job_id} as cancelled: {e}")
        
        # Wait for tasks to complete
        if self._active_tasks:
            await asyncio.gather(*self._active_tasks.values(), return_exceptions=True)
        
        logger.info("Worker cleanup complete")


def main():
    """Main entry point for the worker."""
    parser = argparse.ArgumentParser(description="TaxScape Background Job Worker")
    parser.add_argument(
        "--concurrency", "-c",
        type=int,
        default=int(os.environ.get("WORKER_CONCURRENCY", "3")),
        help="Number of jobs to process concurrently (default: 3)"
    )
    parser.add_argument(
        "--poll-interval", "-p",
        type=float,
        default=float(os.environ.get("WORKER_POLL_INTERVAL", "5.0")),
        help="Seconds between queue polls (default: 5.0)"
    )
    parser.add_argument(
        "--job-types", "-t",
        type=str,
        default=os.environ.get("WORKER_JOB_TYPES", ""),
        help="Comma-separated list of job types to process (default: all)"
    )
    parser.add_argument(
        "--worker-id",
        type=str,
        default=os.environ.get("WORKER_ID"),
        help="Unique worker identifier (default: auto-generated)"
    )
    
    args = parser.parse_args()
    
    # Parse job types
    job_types = None
    if args.job_types:
        try:
            job_types = [JobType(t.strip()) for t in args.job_types.split(",") if t.strip()]
        except ValueError as e:
            logger.error(f"Invalid job type: {e}")
            sys.exit(1)
    
    # Create and run worker
    worker = BackgroundJobWorker(
        worker_id=args.worker_id,
        concurrency=args.concurrency,
        poll_interval=args.poll_interval,
        job_types=job_types
    )
    
    try:
        asyncio.run(worker.start())
    except KeyboardInterrupt:
        logger.info("Worker interrupted")
    
    logger.info("Worker stopped")


if __name__ == "__main__":
    main()
