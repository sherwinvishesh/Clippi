from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.video_service import VideoService
import uuid, os, aiofiles

router  = APIRouter()
service = VideoService()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """Accept a video file and save it to disk."""
    if not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")

    video_id  = str(uuid.uuid4())
    save_path = os.path.join(UPLOAD_DIR, f"{video_id}_{file.filename}")

    async with aiofiles.open(save_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    metadata = service.extract_metadata(save_path)
    return {"video_id": video_id, "path": save_path, "metadata": metadata}


@router.post("/{video_id}/analyze")
async def analyze_video(video_id: str):
    """Run AI analysis on an uploaded video to find clip suggestions."""
    matches = [f for f in os.listdir(UPLOAD_DIR) if f.startswith(video_id)]
    if not matches:
        raise HTTPException(status_code=404, detail="Video not found")

    video_path = os.path.join(UPLOAD_DIR, matches[0])
    result     = await service.analyze(video_id, video_path)
    return result


@router.get("/{video_id}/clips")
async def get_clips(video_id: str):
    """Return the previously computed clip suggestions for a video."""
    clips = service.get_clips(video_id)
    return {"video_id": video_id, "clips": clips}