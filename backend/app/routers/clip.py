from fastapi import APIRouter, HTTPException
from app.services.clip_service import ClipService
from pydantic import BaseModel

router  = APIRouter()
service = ClipService()


class ExportOptions(BaseModel):
    format:   str  = "mp4"
    quality:  str  = "high"
    captions: bool = False


@router.post("/{clip_id}/export")
async def export_clip(clip_id: str, options: ExportOptions):
    """Export a clip to a video file with the given options."""
    result = await service.export(clip_id, options.model_dump())
    return result