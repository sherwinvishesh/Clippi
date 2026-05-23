import os
import uuid
import shutil
import asyncio
import tempfile
import subprocess
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/clips", tags=["export"])

# When run from inside backend/ (as per run.sh), outputs/ lives at backend/outputs/
OUTPUTS_DIR = Path("outputs")
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

# ─── Quality Presets ───────────────────────────────────────────────────────────
QUALITY_PRESETS = {
    "high":   {"crf": "18", "preset": "slow"},
    "medium": {"crf": "23", "preset": "medium"},
    "low":    {"crf": "28", "preset": "fast"},
}

# ─── Cinematic Filter Presets ─────────────────────────────────────────────────
FILTER_PRESETS = {
    "noir":      "colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3,eq=contrast=1.3:saturation=0",
    "vintage":   "curves=vintage,eq=brightness=0.05:contrast=0.9:saturation=0.7,vignette=PI/4",
    "cinema":    "curves=psych,eq=contrast=1.1:saturation=1.2,colorbalance=bs=-0.05",
    "warm":      "colorbalance=rs=0.1:gs=0.05:bs=-0.1:rm=0.1:gm=0.05:bm=-0.1",
    "cool":      "colorbalance=rs=-0.1:gs=0:bs=0.15:rm=-0.1:gm=0:bm=0.15",
    "dramatic":  "eq=contrast=1.4:saturation=1.3,curves=strong_contrast",
    "matte":     "curves=lighter,eq=contrast=0.85:saturation=0.9",
    "vibrant":   "eq=saturation=1.5:contrast=1.1",
    "faded":     "eq=brightness=0.05:contrast=0.8:saturation=0.7",
    "sharp":     "unsharp=5:5:1.5:5:5:0",
}

# ─── Data Models ──────────────────────────────────────────────────────────────
class ColorEdits(BaseModel):
    exposure: float = 0
    contrast: float = 0
    saturation: float = 0
    temperature: float = 0
    highlights: float = 0
    shadows: float = 0
    sharpness: float = 0
    vignette: float = 0

class FilterEdits(BaseModel):
    preset: Optional[str] = None
    intensity: float = 1.0

class TextOverlay(BaseModel):
    text: str
    x: float = 0.5
    y: float = 0.5
    fontSize: int = 24
    fontColor: str = "#ffffff"
    fontFamily: str = "Arial"
    bold: bool = False
    italic: bool = False
    background: bool = False
    bgColor: str = "#000000"
    bgOpacity: float = 0.5
    startTime: float = 0
    endTime: float = 5

class Caption(BaseModel):
    text: str
    startTime: float
    endTime: float
    fontSize: int = 20
    fontColor: str = "#ffffff"

class ExportClipData(BaseModel):
    # clip_id is a UUID string on the frontend — keep as str
    clip_id: str
    # video_path is optional; backend will resolve from DB if empty
    video_path: Optional[str] = ""
    trim_start: float = 0
    trim_end: Optional[float] = None
    crop: Optional[dict] = None       # {x, y, width, height} as percentages
    rotation: int = 0                  # 0, 90, 180, 270
    flip_h: bool = False
    flip_v: bool = False
    speed: float = 1.0
    color_edits: Optional[ColorEdits] = None
    filter_edits: Optional[FilterEdits] = None
    text_overlays: list[TextOverlay] = []
    captions: list[Caption] = []

class TransitionData(BaseModel):
    type: str = "cut"  # cut, fade, dissolve, wipe, zoom, slide
    duration: float = 0.5

class ExportRequest(BaseModel):
    clips: list[ExportClipData]
    transitions: list[TransitionData] = []
    format: str = "mp4"
    quality: str = "medium"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def escape_drawtext(text: str) -> str:
    """Escape special characters for ffmpeg drawtext filter."""
    text = text.replace("\\", "\\\\")
    text = text.replace("'", "\\'")
    text = text.replace(":", "\\:")
    text = text.replace(",", "\\,")
    return text


def hex_to_ffmpeg_color(hex_color: str, alpha: float = 1.0) -> str:
    """Convert #RRGGBB hex to ffmpeg 0xRRGGBBAA format."""
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 6:
        r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
    else:
        return "0xFFFFFFFF"
    aa = format(int(alpha * 255), "02X")
    return f"0x{r.upper()}{g.upper()}{b.upper()}{aa}"


def find_font(family: str) -> str:
    """Try to find a usable system font for drawtext."""
    candidates = {
        "arial":       ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
        "monospace":   ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"],
        "serif":       ["/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"],
    }
    family_lower = family.lower()
    for key, paths in candidates.items():
        if key in family_lower:
            for p in paths:
                if os.path.exists(p):
                    return p
    # Fallback
    fallback = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    if os.path.exists(fallback):
        return fallback
    return ""


def build_color_filter(edits: ColorEdits) -> Optional[str]:
    """Build eq + colorbalance filter string from ColorEdits."""
    parts = []
    eq_parts = []

    brightness = edits.exposure * 0.5      # -1 to 1
    contrast = 1.0 + edits.contrast * 0.01  # 0 to 2
    saturation = 1.0 + edits.saturation * 0.02  # 0 to 3

    if abs(brightness) > 0.001:
        eq_parts.append(f"brightness={brightness:.3f}")
    if abs(contrast - 1.0) > 0.01:
        eq_parts.append(f"contrast={contrast:.3f}")
    if abs(saturation - 1.0) > 0.01:
        eq_parts.append(f"saturation={saturation:.3f}")

    if eq_parts:
        parts.append("eq=" + ":".join(eq_parts))

    temp = edits.temperature * 0.001
    if abs(temp) > 0.001:
        parts.append(f"colorbalance=rs={temp:.3f}:gs=0:bs={-temp:.3f}:rm={temp:.3f}:gm=0:bm={-temp:.3f}")

    if edits.sharpness > 0:
        strength = edits.sharpness * 1.5
        parts.append(f"unsharp=5:5:{strength:.2f}:5:5:0")

    if edits.vignette > 0:
        angle = edits.vignette * (3.14159 / 5) / 100
        parts.append(f"vignette={angle:.4f}")

    return ",".join(parts) if parts else None


def build_drawtext_filter(overlay: TextOverlay, video_w: int, video_h: int,
                           trim_start: float, speed: float) -> str:
    escaped = escape_drawtext(overlay.text)
    font_path = find_font(overlay.fontFamily)
    color = hex_to_ffmpeg_color(overlay.fontColor)

    # Position: overlay x/y are 0-1 fractions of video dimensions
    x = f"(w*{overlay.x:.4f})"
    y = f"(h*{overlay.y:.4f})"

    # Timing: adjust for trim and speed
    t0 = max(0, (overlay.startTime - trim_start) / speed)
    t1 = max(0, (overlay.endTime - trim_start) / speed)

    params = [
        f"text='{escaped}'",
        f"fontsize={overlay.fontSize}",
        f"fontcolor={color}",
        f"x={x}",
        f"y={y}",
        f"enable='between(t,{t0:.3f},{t1:.3f})'",
    ]

    if font_path:
        params.append(f"fontfile={font_path}")
    if overlay.bold:
        params.append("bold=1")
    if overlay.italic:
        params.append("italic=1")
    if overlay.background:
        bg = hex_to_ffmpeg_color(overlay.bgColor, overlay.bgOpacity)
        params.append(f"box=1:boxcolor={bg}:boxborderw=5")

    return "drawtext=" + ":".join(params)


def build_caption_filter(cap: Caption, trim_start: float, speed: float) -> str:
    escaped = escape_drawtext(cap.text)
    font_path = find_font("arial")
    color = hex_to_ffmpeg_color(cap.fontColor)
    t0 = max(0, (cap.startTime - trim_start) / speed)
    t1 = max(0, (cap.endTime - trim_start) / speed)

    params = [
        f"text='{escaped}'",
        f"fontsize={cap.fontSize}",
        f"fontcolor={color}",
        "x=(w-text_w)/2",
        "y=h-text_h-20",
        f"enable='between(t,{t0:.3f},{t1:.3f})'",
        "box=1:boxcolor=0x000000AA:boxborderw=8",
    ]
    if font_path:
        params.append(f"fontfile={font_path}")
    return "drawtext=" + ":".join(params)


def build_filter_chain(clip: ExportClipData) -> Optional[str]:
    filters = []
    speed = clip.speed or 1.0
    trim_start = clip.trim_start or 0.0

    # ── FIXED: safe trim filter — no string formatting on "end" literal
    has_trim_start = trim_start > 0.001
    has_trim_end = clip.trim_end is not None

    if has_trim_start or has_trim_end:
        if has_trim_start and has_trim_end:
            filters.append(f"trim={trim_start:.3f}:{clip.trim_end:.3f},setpts=PTS-STARTPTS")
        elif has_trim_start:
            filters.append(f"trim=start={trim_start:.3f},setpts=PTS-STARTPTS")
        else:
            filters.append(f"trim=end={clip.trim_end:.3f},setpts=PTS-STARTPTS")

    # Speed
    if abs(speed - 1.0) > 0.001:
        filters.append(f"setpts={1.0/speed:.4f}*PTS")

    # Crop
    if clip.crop:
        c = clip.crop
        filters.append(
            f"crop=iw*{c['width']:.4f}:ih*{c['height']:.4f}:iw*{c['x']:.4f}:ih*{c['y']:.4f}"
        )

    # Rotation
    rot = clip.rotation % 360
    if rot == 90:
        filters.append("transpose=1")
    elif rot == 180:
        filters.append("transpose=1,transpose=1")
    elif rot == 270:
        filters.append("transpose=2")

    # Flip
    if clip.flip_h:
        filters.append("hflip")
    if clip.flip_v:
        filters.append("vflip")

    # Color grading
    if clip.color_edits:
        color_f = build_color_filter(clip.color_edits)
        if color_f:
            filters.append(color_f)

    # Cinematic filter preset
    if clip.filter_edits and clip.filter_edits.preset:
        preset_str = FILTER_PRESETS.get(clip.filter_edits.preset)
        if preset_str:
            filters.append(preset_str)

    # Text overlays
    for overlay in clip.text_overlays:
        filters.append(build_drawtext_filter(overlay, 1920, 1080, trim_start, speed))

    # Captions
    for cap in clip.captions:
        filters.append(build_caption_filter(cap, trim_start, speed))

    return ",".join(filters) if filters else None


def build_audio_filter(clip: ExportClipData) -> Optional[str]:
    filters = []
    speed = clip.speed or 1.0
    trim_start = clip.trim_start or 0.0

    # ── FIXED: safe audio trim — no string formatting on "end" literal
    has_trim_start = trim_start > 0.001
    has_trim_end = clip.trim_end is not None

    if has_trim_start or has_trim_end:
        if has_trim_start and has_trim_end:
            filters.append(f"atrim={trim_start:.3f}:{clip.trim_end:.3f},asetpts=PTS-STARTPTS")
        elif has_trim_start:
            filters.append(f"atrim=start={trim_start:.3f},asetpts=PTS-STARTPTS")
        else:
            filters.append(f"atrim=end={clip.trim_end:.3f},asetpts=PTS-STARTPTS")

    if abs(speed - 1.0) > 0.001:
        # atempo only supports 0.5 – 2.0; chain multiple for extreme values
        remaining = speed
        while remaining > 2.0:
            filters.append("atempo=2.0")
            remaining /= 2.0
        while remaining < 0.5:
            filters.append("atempo=0.5")
            remaining /= 0.5
        filters.append(f"atempo={remaining:.4f}")

    return ",".join(filters) if filters else None


async def render_clip(clip: ExportClipData, output_path: str, quality: str) -> None:
    """Render a single clip with all edits applied via ffmpeg."""
    if not os.path.exists(clip.video_path):
        raise HTTPException(status_code=404, detail=f"Video file not found: {clip.video_path}")

    preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS["medium"])
    vf = build_filter_chain(clip)
    af = build_audio_filter(clip)

    cmd = ["ffmpeg", "-y", "-i", clip.video_path]
    if vf:
        cmd += ["-vf", vf]
    if af:
        cmd += ["-af", af]
    cmd += [
        "-c:v", "libx264",
        "-crf", preset["crf"],
        "-preset", preset["preset"],
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        output_path,
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"FFmpeg error: {stderr.decode()[-1000:]}"
        )


async def get_video_duration(path: str) -> float:
    """Get video duration in seconds using ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        path,
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    import json
    data = json.loads(stdout.decode())
    return float(data.get("format", {}).get("duration", 0))


async def render_multi_clip(
    clips: list[ExportClipData],
    transitions: list[TransitionData],
    output_path: str,
    quality: str,
) -> None:
    """Render multiple clips with transitions."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="export_"))
    try:
        # Step 1: Render each clip individually
        clip_files = []
        for i, clip in enumerate(clips):
            tmp_path = str(tmp_dir / f"clip_{i}.mp4")
            await render_clip(clip, tmp_path, quality)
            clip_files.append(tmp_path)

        if len(clip_files) == 1:
            shutil.copy(clip_files[0], output_path)
            return

        # Determine if any non-cut transition exists
        has_transitions = any(
            t.type != "cut" for t in transitions
        )

        if not has_transitions:
            # Simple concat via demuxer
            list_file = str(tmp_dir / "concat.txt")
            with open(list_file, "w") as f:
                for cf in clip_files:
                    f.write(f"file '{cf}'\n")
            preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS["medium"])
            cmd = [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", list_file,
                "-c:v", "libx264", "-crf", preset["crf"], "-preset", preset["preset"],
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                output_path,
            ]
        else:
            # Build filter_complex with xfade transitions
            n = len(clip_files)
            trans = transitions[:n-1]  # max n-1 transitions

            # Pad transitions list
            while len(trans) < n - 1:
                trans.append(TransitionData(type="fade", duration=0.5))

            cmd = ["ffmpeg", "-y"]
            for cf in clip_files:
                cmd += ["-i", cf]

            # Get durations for offset calculation
            durations = []
            for cf in clip_files:
                d = await get_video_duration(cf)
                durations.append(d)

            filter_parts = []
            video_labels = [f"[{i}:v]" for i in range(n)]
            audio_labels = [f"[{i}:a]" for i in range(n)]

            # Chain video xfades
            offset = durations[0]
            prev_v = video_labels[0]
            for i, t in enumerate(trans):
                next_v = video_labels[i + 1]
                out_v = f"[vx{i}]"
                transition_type = {
                    "fade": "fade", "dissolve": "dissolve",
                    "wipe": "wipeleft", "slide": "slideleft", "zoom": "fadeblack",
                }.get(t.type, "fade")
                td = t.duration
                offset -= td
                filter_parts.append(
                    f"{prev_v}{next_v}xfade=transition={transition_type}:duration={td:.3f}:offset={offset:.3f}{out_v}"
                )
                offset += durations[i + 1]
                prev_v = out_v
            filter_parts[-1] = filter_parts[-1].rstrip("]" + prev_v.lstrip("[")) + "[vout]" if n > 2 else filter_parts[0].replace(f"[vx0]", "[vout]")

            # Chain audio crossfades
            prev_a = audio_labels[0]
            for i, t in enumerate(trans):
                next_a = audio_labels[i + 1]
                out_a = f"[ax{i}]"
                td = t.duration
                filter_parts.append(
                    f"{prev_a}{next_a}acrossfade=d={td:.3f}{out_a}"
                )
                prev_a = out_a
            filter_parts[-1] = filter_parts[-1].replace(f"[ax{n-2}]", "[aout]")

            filter_complex = ";".join(filter_parts)
            preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS["medium"])
            cmd += [
                "-filter_complex", filter_complex,
                "-map", "[vout]", "-map", "[aout]",
                "-c:v", "libx264", "-crf", preset["crf"], "-preset", preset["preset"],
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                output_path,
            ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"FFmpeg concat error: {stderr.decode()[-1000:]}"
            )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/export")
async def export_video(req: ExportRequest):
    if not req.clips:
        raise HTTPException(status_code=400, detail="No clips provided")

    # ── Resolve video_path from the clips DB if not sent by the frontend ──────
    try:
        from app.routers.clips import _clips_db
    except ImportError:
        _clips_db = {}

    resolved_clips = []
    for clip in req.clips:
        video_path = clip.video_path or ""
        if not video_path or not os.path.exists(video_path):
            meta = _clips_db.get(str(clip.clip_id))
            if meta and os.path.exists(meta.get("video_path", "")):
                video_path = meta["video_path"]
            else:
                raise HTTPException(
                    status_code=404,
                    detail=f"Video file not found for clip '{clip.clip_id}'. "
                           f"Make sure the clip was uploaded in this server session."
                )
        # Return a new model instance with resolved path
        resolved_clips.append(clip.model_copy(update={"video_path": video_path}))

    ext = req.format if req.format in ("mp4", "mov", "webm") else "mp4"
    output_filename = f"export_{uuid.uuid4().hex}.{ext}"
    output_path = str(OUTPUTS_DIR / output_filename)

    if len(resolved_clips) == 1:
        await render_clip(resolved_clips[0], output_path, req.quality)
    else:
        await render_multi_clip(resolved_clips, req.transitions, output_path, req.quality)

    return FileResponse(
        output_path,
        media_type=f"video/{ext}",
        filename=output_filename,
        background=None,
    )