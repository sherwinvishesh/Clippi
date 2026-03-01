"""
Clips router — upload, thumbnail, metadata, video serving, processing stubs.
Metadata is persisted to clips/clips_db.json so it survives server restarts.
"""
import os
import uuid
import json
import cv2
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter()

CLIPS_DIR      = Path("clips")
THUMBNAILS_DIR = Path("thumbnails")
CLIPS_DIR.mkdir(exist_ok=True)
THUMBNAILS_DIR.mkdir(exist_ok=True)

# ── Persistent metadata store ────────────────────────────────────────
DB_PATH = CLIPS_DIR / "clips_db.json"

def _load_db() -> dict:
    """Load clip metadata from disk. Returns {} if file missing or corrupt."""
    if not DB_PATH.exists():
        return {}
    try:
        with open(DB_PATH, "r") as f:
            data = json.load(f)
        # Drop any entries whose video file no longer exists on disk
        valid = {k: v for k, v in data.items() if Path(v["video_path"]).exists()}
        if len(valid) != len(data):
            _save_db(valid)   # prune stale entries immediately
        return valid
    except Exception:
        return {}

def _save_db(db: dict) -> None:
    """Write clip metadata to disk atomically."""
    tmp = DB_PATH.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(db, f, indent=2)
    tmp.replace(DB_PATH)   # atomic rename

# In-memory cache — loaded once at import time, kept in sync with disk
_clips_db: dict = _load_db()


# ── background: extract frames for future search ─────────────────────
def _extract_frames_bg(clip_id: str, video_path: str):
    """Runs in a thread — extracts one frame every 2 s for search/AI."""
    frame_dir = CLIPS_DIR / clip_id / "frames"
    frame_dir.mkdir(parents=True, exist_ok=True)

    cap   = cv2.VideoCapture(video_path)
    fps   = cap.get(cv2.CAP_PROP_FPS) or 30
    step  = max(1, int(fps * 2))
    idx   = 0
    total = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if total % step == 0:
            cv2.imwrite(str(frame_dir / f"frame_{idx:05d}.jpg"), frame)
            idx += 1
        total += 1

    cap.release()


# ── POST /api/clips/upload ───────────────────────────────────────────
@router.post("/clips/upload")
async def upload_clip(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    clip_id    = str(uuid.uuid4())
    safe_name  = Path(file.filename).name
    video_path = str(CLIPS_DIR / f"{clip_id}_{safe_name}")

    # 1 — save file to disk
    contents = await file.read()
    with open(video_path, "wb") as f:
        f.write(contents)

    # 2 — open with OpenCV to extract thumbnail + duration
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise HTTPException(status_code=422, detail="Could not open video file")

    fps         = cap.get(cv2.CAP_PROP_FPS) or 30
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    duration    = round(frame_count / fps, 2) if fps > 0 else 0

    ret, frame = cap.read()
    cap.release()

    thumbnail_url = None
    if ret:
        thumb_path = str(THUMBNAILS_DIR / f"{clip_id}.jpg")
        h, w       = frame.shape[:2]
        aspect     = w / h if h > 0 else 16 / 9
        th, tw     = 180, int(180 * aspect)
        resized    = cv2.resize(frame, (tw, th))
        cv2.imwrite(thumb_path, resized, [cv2.IMWRITE_JPEG_QUALITY, 80])
        thumbnail_url = f"/api/clips/{clip_id}/thumbnail"

    # 3 — persist metadata to memory + disk
    entry = {
        "clip_id":       clip_id,
        "name":          safe_name,
        "duration":      duration,
        "video_path":    video_path,
        "thumbnail_url": thumbnail_url,
    }
    _clips_db[clip_id] = entry
    _save_db(_clips_db)

    # 4 — background frame extraction (non-blocking)
    background_tasks.add_task(_extract_frames_bg, clip_id, video_path)

    return {
        "status":        "ok",
        "clip_id":       clip_id,
        "name":          safe_name,
        "duration":      duration,
        "thumbnail_url": thumbnail_url,
    }


# ── GET /api/clips ───────────────────────────────────────────────────
@router.get("/clips")
def list_clips():
    """Return all persisted clips — used by the frontend on startup."""
    return list(_clips_db.values())


# ── GET /api/clips/{clip_id}/thumbnail ──────────────────────────────
@router.get("/clips/{clip_id}/thumbnail")
def serve_thumbnail(clip_id: str):
    thumb_path = THUMBNAILS_DIR / f"{clip_id}.jpg"
    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(str(thumb_path), media_type="image/jpeg")


# ── GET /api/clips/{clip_id}/file ───────────────────────────────────
@router.get("/clips/{clip_id}/file")
def serve_clip_file(clip_id: str):
    meta = _clips_db.get(clip_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Clip not found")

    video_path = meta["video_path"]
    if not Path(video_path).exists():
        raise HTTPException(status_code=404, detail="Video file missing from disk")

    ext = Path(video_path).suffix.lower()
    media_types = {
        ".mp4":  "video/mp4",
        ".mov":  "video/quicktime",
        ".webm": "video/webm",
        ".avi":  "video/x-msvideo",
        ".mkv":  "video/x-matroska",
    }
    media_type = media_types.get(ext, "video/mp4")
    return FileResponse(
        video_path,
        media_type=media_type,
        headers={"Accept-Ranges": "bytes"},
    )


# ── GET /api/clips/{clip_id}/meta ───────────────────────────────────
@router.get("/clips/{clip_id}/meta")
def get_clip_meta(clip_id: str):
    meta = _clips_db.get(clip_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Clip not found")
    return meta


# ── DELETE /api/clips/{clip_id} ──────────────────────────────────────
@router.delete("/clips/{clip_id}")
def delete_clip(clip_id: str):
    """Remove a clip's metadata, video file, and thumbnail from disk."""
    meta = _clips_db.pop(clip_id, None)
    if not meta:
        raise HTTPException(status_code=404, detail="Clip not found")

    # Delete video file
    vp = Path(meta["video_path"])
    if vp.exists():
        vp.unlink()

    # Delete thumbnail
    tp = THUMBNAILS_DIR / f"{clip_id}.jpg"
    if tp.exists():
        tp.unlink()

    # Delete extracted frames folder if present
    ff = CLIPS_DIR / clip_id
    if ff.exists():
        import shutil
        shutil.rmtree(ff, ignore_errors=True)

    _save_db(_clips_db)
    return {"status": "deleted", "clip_id": clip_id}


# ── POST /api/clips/{clip_id}/process ───────────────────────────────
class EditCommand(BaseModel):
    command: str

@router.post("/clips/{clip_id}/process")
async def process_clip(clip_id: str, body: EditCommand):
    return {
        "status":  "ok",
        "clip_id": clip_id,
        "command": body.command,
        "message": "AI processing coming soon.",
    }


# ── POST /api/clips/{clip_id}/search ────────────────────────────────
class SearchQuery(BaseModel):
    query: str

@router.post("/clips/{clip_id}/search")
async def search_clip(clip_id: str, body: SearchQuery):
    return {
        "status":  "ok",
        "clip_id": clip_id,
        "query":   body.query,
        "results": [],
    }


# ── POST /api/clips/render ───────────────────────────────────────────
class RenderRequest(BaseModel):
    clip_ids: list[str]
    options:  dict = {}

@router.post("/clips/render")
async def render_video(body: RenderRequest):
    return {
        "status":   "ok",
        "clip_ids": body.clip_ids,
        "output":   "output_placeholder.mp4",
        "message":  "FFmpeg stitching coming soon.",
    }