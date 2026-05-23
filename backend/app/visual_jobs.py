"""
visual_jobs.py
--------------
In-memory job queue for long-running Visual AI tasks (SAM2 / SegFormer).
Keeps job state so the frontend can poll for completion instead of waiting
on a single blocking HTTP request that would time-out after 60 s.
"""

import uuid
import threading
import traceback
import contextvars
from datetime import datetime
from typing import Callable, Optional

# ── job store ────────────────────────────────────────────────────────────────
# { job_id: { status, created_at, updated_at, result, error } }
_jobs: dict = {}
_lock = threading.Lock()


# ── status constants ──────────────────────────────────────────────────────────
PENDING   = "pending"
RUNNING   = "running"
COMPLETE  = "complete"
FAILED    = "failed"


# ── public API ────────────────────────────────────────────────────────────────

def create_job() -> str:
    """Create a new job entry and return its ID."""
    job_id = str(uuid.uuid4())
    with _lock:
        _jobs[job_id] = {
            "status":     PENDING,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "result":     None,
            "error":      None,
            "progress":   "Queued…",
        }
    return job_id


def start_job_thread(job_id: str, fn: Callable, *args, **kwargs):
    """
    Run *fn* in a daemon thread, automatically updating the job record when
    it finishes (or crashes).  *fn* receives *job_id* as its first argument
    so it can call update_progress() during processing.

    contextvars.copy_context() snapshots the current context (including the
    active weave call stack) so @weave.op() traces created inside the thread
    appear as children of the dispatching tool call rather than as orphaned roots.
    """
    ctx = contextvars.copy_context()

    def _run():
        _set(job_id, status=RUNNING, progress="Starting Visual AI pipeline…")
        try:
            result = ctx.run(fn, job_id, *args, **kwargs)
            _set(job_id, status=COMPLETE, result=result, progress="Done ✓")
        except Exception as exc:
            _set(job_id, status=FAILED, error=str(exc),
                 progress=f"Failed: {exc}")
            traceback.print_exc()

    t = threading.Thread(target=_run, daemon=True)
    t.start()


def update_progress(job_id: str, message: str):
    """Called from inside the worker to give the user live progress text."""
    _set(job_id, progress=message)


def get_job(job_id: str) -> Optional[dict]:
    with _lock:
        return _jobs.get(job_id)


def cleanup_old_jobs(max_age_seconds: int = 3600):
    """Prune jobs older than *max_age_seconds* to avoid unbounded memory growth."""
    import time
    now = datetime.utcnow()
    with _lock:
        to_delete = []
        for jid, job in _jobs.items():
            created = datetime.fromisoformat(job["created_at"])
            age = (now - created).total_seconds()
            if age > max_age_seconds and job["status"] in (COMPLETE, FAILED):
                to_delete.append(jid)
        for jid in to_delete:
            del _jobs[jid]


# ── internal helper ──────────────────────────────────────────────────────────

def _set(job_id: str, **fields):
    with _lock:
        if job_id in _jobs:
            _jobs[job_id].update(fields)
            _jobs[job_id]["updated_at"] = datetime.utcnow().isoformat()