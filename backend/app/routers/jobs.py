"""
app/routers/jobs.py
-------------------
REST endpoint the frontend polls to check the status of a Visual AI job.

GET /api/jobs/{job_id}
    → 200  { status, progress, result?, error? }
    → 404  job not found
"""

from fastapi import APIRouter, HTTPException
from app import visual_jobs   # adjust import path if needed

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}")
async def get_job_status(job_id: str):
    job = visual_jobs.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    response = {
        "job_id":   job_id,
        "status":   job["status"],        # pending | running | complete | failed
        "progress": job["progress"],      # human-readable progress text
    }

    if job["status"] == visual_jobs.COMPLETE:
        response["result"] = job["result"]     # { actions: [...] }

    if job["status"] == visual_jobs.FAILED:
        response["error"] = job["error"]

    return response