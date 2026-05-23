"""
audio.py — Standalone audio processing endpoints.
Also used internally by the chat router.
"""
import os
import uuid
import sys
import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()
router = APIRouter()

# ── Make audio module importable ─────────────────────────────────────────────
_app_dir = Path(__file__).resolve().parent.parent
if str(_app_dir) not in sys.path:
    sys.path.insert(0, str(_app_dir))

CLIPS_DIR = Path("clips")

try:
    from audio.denoise import denoise_clip as _denoise_clip
    from audio.captions import extract_audio_bytes, group_words_into_chunks
    from audio.dubbing import dub_clip as _dub_clip
    from audio.voiceover import add_voiceover as _add_voiceover
    from audio.music import add_background_music as _add_background_music
    from audio.soundfx import add_sound_effect as _add_sfx
    AUDIO_AVAILABLE = True
except ImportError as e:
    print(f"[audio router] Audio modules unavailable: {e}")
    AUDIO_AVAILABLE = False


def _check_audio():
    if not AUDIO_AVAILABLE:
        raise HTTPException(503, "Audio modules not available — check ElevenLabs install")


def _get_meta(clip_id: str) -> dict:
    from app.routers import clips as clips_module
    meta = clips_module._clips_db.get(clip_id)
    if not meta or not Path(meta["video_path"]).exists():
        raise HTTPException(404, "Clip not found")
    return meta


def _update_clip(clip_id: str, new_path: str):
    from app.routers import clips as clips_module
    clips_module._clips_db[clip_id]["video_path"] = new_path
    clips_module._save_db(clips_module._clips_db)


def _out(clip_id: str, tag: str) -> str:
    return str(CLIPS_DIR / f"{clip_id}_{tag}_{uuid.uuid4().hex[:6]}.mp4")


# ── Request models ────────────────────────────────────────────────────────────

class SoundEffectReq(BaseModel):
    description: str
    timestamp: float = 0.0
    duration: float = 2.0
    volume: float = 0.8

class DubReq(BaseModel):
    target_lang: str = "es"
    source_lang: str = "en"

class MusicReq(BaseModel):
    mood: str = "upbeat"
    volume: float = 0.15

class VoiceoverReq(BaseModel):
    text: str
    timestamp: float = 0.0
    voice_style: str = "neutral"

class CaptionsReq(BaseModel):
    language: str = "en"


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/clips/{clip_id}/sound-effect")
async def sound_effect(clip_id: str, body: SoundEffectReq):
    _check_audio()
    meta = _get_meta(clip_id)
    out = _out(clip_id, "sfx")
    try:
        r = await asyncio.to_thread(
            _add_sfx, meta["video_path"],
            body.description, body.timestamp,
            body.duration, body.volume, out,
        )
        _update_clip(clip_id, r)
        return {"status": "ok", "clip_id": clip_id}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/clips/{clip_id}/dub")
async def dub(clip_id: str, body: DubReq):
    _check_audio()
    meta = _get_meta(clip_id)
    out = _out(clip_id, f"dub_{body.target_lang}")
    try:
        r = await asyncio.to_thread(
            _dub_clip, meta["video_path"],
            target_lang=body.target_lang,
            source_lang=body.source_lang,
            output_path=out,
        )
        _update_clip(clip_id, r)
        return {"status": "ok", "clip_id": clip_id}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/clips/{clip_id}/music")
async def music(clip_id: str, body: MusicReq):
    _check_audio()
    meta = _get_meta(clip_id)
    out = _out(clip_id, "music")
    try:
        r = await asyncio.to_thread(
            _add_background_music, meta["video_path"],
            mood=body.mood, volume=body.volume, output_path=out,
        )
        _update_clip(clip_id, r)
        return {"status": "ok", "clip_id": clip_id}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/clips/{clip_id}/denoise")
async def denoise(clip_id: str):
    _check_audio()
    meta = _get_meta(clip_id)
    out = _out(clip_id, "denoised")
    try:
        r = await asyncio.to_thread(_denoise_clip, meta["video_path"], out)
        _update_clip(clip_id, r)
        return {"status": "ok", "clip_id": clip_id}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/clips/{clip_id}/captions")
async def captions(clip_id: str, body: CaptionsReq):
    _check_audio()
    meta = _get_meta(clip_id)
    try:
        from elevenlabs.client import ElevenLabs
        client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
        audio_bytes = await asyncio.to_thread(extract_audio_bytes, meta["video_path"])
        result = await asyncio.to_thread(
            client.speech_to_text.convert,
            file=audio_bytes, model_id="scribe_v1",
            language_code="en", timestamps_granularity="word",
        )
        chunks = group_words_into_chunks(result.words)
        if body.language != "en":
            from mistralai import Mistral
            from audio.captions import translate_chunks
            mc = Mistral(api_key=os.getenv("MISTRAL_API_KEY"))
            chunks = await asyncio.to_thread(translate_chunks, chunks, body.language, mc)
        return {"status": "ok", "clip_id": clip_id, "captions": chunks}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/clips/{clip_id}/voiceover")
async def voiceover(clip_id: str, body: VoiceoverReq):
    _check_audio()
    meta = _get_meta(clip_id)
    out = _out(clip_id, "vo")
    try:
        r = await asyncio.to_thread(
            _add_voiceover, meta["video_path"], body.text,
            body.timestamp, body.voice_style, out,
        )
        _update_clip(clip_id, r)
        return {"status": "ok", "clip_id": clip_id}
    except Exception as e:
        raise HTTPException(500, str(e))