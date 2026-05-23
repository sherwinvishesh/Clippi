"""
chat.py — AI chat router with Mistral function calling + ElevenLabs audio tools.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
import os, json, uuid, asyncio, sys
import weave
from pathlib import Path
from dotenv import load_dotenv
from app import visual_jobs

_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

router = APIRouter()

# ── Audio module imports ──────────────────────────────────────────────────────
_app_dir = Path(__file__).resolve().parent.parent
if str(_app_dir) not in sys.path:
    sys.path.insert(0, str(_app_dir))

try:
    from audio.denoise import denoise_clip as _denoise_clip
    from audio.captions import extract_audio_bytes, group_words_into_chunks
    from audio.dubbing import dub_clip as _dub_clip
    from audio.voiceover import add_voiceover as _add_voiceover
    from audio.music import add_background_music as _add_background_music
    from audio.soundfx import add_sound_effect as _add_sfx
    AUDIO_AVAILABLE = True
except ImportError as e:
    print(f"[chat] Audio modules not available: {e}")
    AUDIO_AVAILABLE = False
    _denoise_clip = _dub_clip = _add_voiceover = _add_background_music = _add_sfx = None

# ── Visual AI module imports ──────────────────────────────────────────────────
# NOTE: sys.path must include "backend/object optimizer/" so that
#       "segmentation" and "effects" sub-packages are importable.
_optimizer_dir = _app_dir.parent / "object optimizer"
if str(_optimizer_dir) not in sys.path:
    sys.path.insert(0, str(_optimizer_dir))

try:
    from segmentation.frames import extract_all_frames, extract_audio, frames_to_video
    from segmentation.object_router import get_masks_auto
    from effects.object_effects import recolor_object, spotlight_object, blur_background
    VISUAL_AI_AVAILABLE = True
    print("[chat] Visual AI modules loaded ✓")
except ImportError as e:
    print(f"[chat] Visual AI modules not available: {e}")
    VISUAL_AI_AVAILABLE = False
    extract_all_frames = extract_audio = frames_to_video = get_masks_auto = None
    recolor_object = spotlight_object = blur_background = None

CLIPS_DIR = Path("clips")

# ─── Pydantic models ──────────────────────────────────────────────────────────

class ClipInfo(BaseModel):
    id: str
    name: str
    duration: Optional[float] = 0.0
    edits: Optional[dict] = None
    colorEdits: Optional[dict] = None
    filterEdits: Optional[dict] = None
    textOverlays: Optional[list] = None

class ConvMessage(BaseModel):
    role: str
    text: str

class ChatRequest(BaseModel):
    message: str
    clip_id: Optional[str] = None
    activeClipId: Optional[str] = None
    clips: Optional[List[ClipInfo]] = []
    conversationHistory: Optional[List[ConvMessage]] = []

# ─── Tool definitions — visual editing tools ──────────────────────────────────

VISUAL_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "trim_clip",
            "description": (
                "Trim (cut) a video clip by setting in/out points. "
                "Use when user wants to shorten, cut, or trim a clip. "
                "start=0 means beginning of clip."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"},
                    "start": {"type": "number", "description": "Trim start time in seconds (0 = beginning)"},
                    "end": {"type": "number", "description": "Trim end time in seconds"}
                },
                "required": ["clip_id", "start", "end"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "crop_clip",
            "description": "Crop a video clip by specifying inset percentages from each edge (0-45).",
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"},
                    "top":    {"type": "number"},
                    "right":  {"type": "number"},
                    "bottom": {"type": "number"},
                    "left":   {"type": "number"}
                },
                "required": ["clip_id", "top", "right", "bottom", "left"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "rotate_clip",
            "description": "Rotate a video clip. Only 0, 90, 180, 270 degrees are valid.",
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"},
                    "degrees": {"type": "number", "enum": [0, 90, 180, 270]}
                },
                "required": ["clip_id", "degrees"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "flip_clip",
            "description": "Flip/mirror a video clip horizontally or vertically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"},
                    "horizontal": {"type": "boolean"},
                    "vertical": {"type": "boolean"}
                },
                "required": ["clip_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "set_speed",
            "description": "Change playback speed of a clip (0.25 = slow-mo, 1.0 = normal, 4.0 = max fast).",
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"},
                    "speed": {"type": "number"}
                },
                "required": ["clip_id", "speed"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "reset_clip_edits",
            "description": "Reset ALL geometric edits on a clip back to defaults.",
            "parameters": {
                "type": "object",
                "properties": {"clip_id": {"type": "string"}},
                "required": ["clip_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_color",
            "description": (
                "Adjust color grading on a clip. Range -100 to +100 (0 = no change). "
                "Temperature: negative=cool/blue, positive=warm/orange."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"},
                    "exposure": {"type": "number"}, "contrast": {"type": "number"},
                    "saturation": {"type": "number"}, "vibrance": {"type": "number"},
                    "highlights": {"type": "number"}, "shadows": {"type": "number"},
                    "whites": {"type": "number"}, "blacks": {"type": "number"},
                    "temperature": {"type": "number"}, "tint": {"type": "number"},
                    "sharpness": {"type": "number"}, "vignette": {"type": "number"}
                },
                "required": ["clip_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "reset_color",
            "description": "Reset all color grading on a clip.",
            "parameters": {
                "type": "object",
                "properties": {"clip_id": {"type": "string"}},
                "required": ["clip_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "apply_filter",
            "description": (
                "Apply a cinematic preset filter. Available: "
                "none, bw, noir, silver, warm, cool, golden, cold, sunset, "
                "vintage, cinema, bleach, kodak, fuji, fade, matte, dreamy, "
                "vivid, teal, cross, drama."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"},
                    "filter_id": {
                        "type": "string",
                        "enum": ["none","bw","noir","silver","warm","cool","golden","cold","sunset",
                                 "vintage","cinema","bleach","kodak","fuji","fade","matte","dreamy",
                                 "vivid","teal","cross","drama"]
                    },
                    "intensity": {"type": "number", "description": "0-100, default 100"}
                },
                "required": ["clip_id", "filter_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "reset_filter",
            "description": "Remove any applied filter from a clip.",
            "parameters": {
                "type": "object",
                "properties": {"clip_id": {"type": "string"}},
                "required": ["clip_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_text_overlay",
            "description": (
                "Add a text overlay/caption/title to a clip. "
                "Position x/y are percentages: 50,50 = center. "
                "Animations: none, fade-in, fade-in-up, slide-left, slide-right, zoom-in, bounce, typewriter."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"},
                    "text": {"type": "string"},
                    "font_family": {"type": "string"},
                    "font_size": {"type": "number"},
                    "color": {"type": "string"},
                    "x": {"type": "number"},
                    "y": {"type": "number"},
                    "bold": {"type": "boolean"},
                    "italic": {"type": "boolean"},
                    "align": {"type": "string", "enum": ["left","center","right"]},
                    "start_time": {"type": "number"},
                    "end_time": {"type": "number"},
                    "animation": {"type": "string"},
                    "has_background": {"type": "boolean"},
                    "background_color": {"type": "string"},
                    "letter_spacing": {"type": "number"},
                    "text_shadow": {"type": "boolean"}
                },
                "required": ["clip_id", "text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "navigate_to_editor",
            "description": "Switch to the Editor view. Always call when making any edit.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "select_clip",
            "description": "Select/activate a specific clip in the editor.",
            "parameters": {
                "type": "object",
                "properties": {"clip_id": {"type": "string"}},
                "required": ["clip_id"]
            }
        }
    },
    # ── Visual AI tool ────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "visual_edit_object",
            "description": (
                "Apply an AI visual effect to a specific object in the video. "
                "The engine detects the object by description and applies the effect. "
                "Processing runs in the background — the user is notified when done. "
                "blur_background: blurs everything EXCEPT the detected object. "
                "recolor_object: changes the object's color. "
                "spotlight_object: dims everything outside the object."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"},
                    "object_description": {
                        "type": "string",
                        "description": "What to detect, e.g. 'person', 'red car', 'jacket', 'dog'"
                    },
                    "effect_type": {
                        "type": "string",
                        "enum": ["blur_background", "recolor_object", "spotlight_object"],
                        "description": "Which effect to apply."
                    },
                    "effect_params": {
                        "type": "object",
                        "description": (
                            "Extra params: "
                            "recolor_object → {color: 'blue'}; "
                            "blur_background → {blur_strength: 21}; "
                            "spotlight_object → {dim_factor: 0.3}"
                        )
                    }
                },
                "required": ["clip_id", "object_description", "effect_type"]
            }
        }
    },
]

VISUAL_AI_TOOL_NAMES = {"visual_edit_object"}

# ─── Audio tools (ElevenLabs) ─────────────────────────────────────────────────

AUDIO_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "audio_add_sound_effect",
            "description": (
                "Generate an AI sound effect and MIX it into the video at a specific timestamp. "
                "The sound effect is OVERLAID on top of the original audio (original audio preserved). "
                "Use for: explosion, whoosh, crowd cheer, glass break, etc. "
                "⚠️ Processing takes ~15-30 seconds."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"},
                    "description": {
                        "type": "string",
                        "description": "Natural-language description e.g. 'dramatic cinematic boom', 'crowd cheering'"
                    },
                    "timestamp": {"type": "number", "description": "When (seconds) the SFX starts. Default 0."},
                    "duration":  {"type": "number", "description": "Duration in seconds. Default 2.0."},
                    "volume":    {"type": "number", "description": "SFX volume 0.0-1.0. Default 0.8."}
                },
                "required": ["clip_id", "description", "timestamp"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "audio_dub_video",
            "description": (
                "Dub/translate the video into another language using AI voice cloning. "
                "This REPLACES the original audio track with dubbed audio. "
                "Language codes: es=Spanish, fr=French, de=German, hi=Hindi, ja=Japanese, "
                "zh=Chinese, pt=Portuguese, it=Italian, ko=Korean, ar=Arabic. "
                "⚠️ Processing takes 1-5 minutes. Warn the user."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"},
                    "target_language": {
                        "type": "string",
                        "description": "BCP-47 language code e.g. 'es', 'fr', 'de', 'hi'"
                    },
                    "source_language": {
                        "type": "string",
                        "description": "Source language code. Default 'en'."
                    }
                },
                "required": ["clip_id", "target_language"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "audio_add_background_music",
            "description": (
                "Generate AI background music and mix it under the original audio at low volume. "
                "Music is OVERLAID (original audio preserved). "
                "Mood keywords: upbeat, calm, dramatic, fun — or any free-form description. "
                "⚠️ Processing takes ~20-40 seconds."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"},
                    "mood": {
                        "type": "string",
                        "description": "'upbeat', 'calm', 'dramatic', 'fun', or custom e.g. 'dark cinematic ambient'"
                    },
                    "volume": {
                        "type": "number",
                        "description": "Music volume 0.0-1.0. Default 0.15 (background level)."
                    }
                },
                "required": ["clip_id", "mood"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "audio_denoise",
            "description": (
                "Remove background noise using AI voice isolation. "
                "This REPLACES the audio with a cleaned version (original audio not preserved). "
                "Use when user says: 'clean audio', 'remove noise', 'isolate voice', 'remove background sound'. "
                "⚠️ Processing takes ~15-30 seconds."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"}
                },
                "required": ["clip_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "audio_add_captions",
            "description": (
                "Transcribe the video's speech and add subtitle captions displayed at the bottom. "
                "The video audio is NOT changed — only subtitles are added as an overlay. "
                "Use when user wants: captions, subtitles, auto-captions, transcription overlay. "
                "⚠️ Processing takes ~15-30 seconds."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"},
                    "language": {
                        "type": "string",
                        "description": "Output language code. 'en' = English captions. 'es','fr','de' etc = translated captions. Default 'en'."
                    }
                },
                "required": ["clip_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "audio_add_voiceover",
            "description": (
                "Generate a TTS voiceover from text and OVERLAY it on the video (original audio preserved). "
                "Voice styles: neutral (George), energetic (Callum), calm (Charlotte), dramatic (Adam). "
                "⚠️ Processing takes ~15-25 seconds."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "clip_id": {"type": "string"},
                    "text": {"type": "string", "description": "Text to speak as voiceover"},
                    "timestamp": {"type": "number", "description": "When (seconds) voiceover starts. Default 0."},
                    "voice_style": {
                        "type": "string",
                        "enum": ["neutral", "energetic", "calm", "dramatic"],
                        "description": "Voice character. Default 'neutral'."
                    }
                },
                "required": ["clip_id", "text"]
            }
        }
    },
]

AUDIO_TOOL_NAMES = {t["function"]["name"] for t in AUDIO_TOOLS}
TOOLS = VISUAL_TOOLS + AUDIO_TOOLS

# ─── System prompt ────────────────────────────────────────────────────────────

def build_system_prompt(clips: List[ClipInfo], active_clip_id: Optional[str]) -> str:
    if clips:
        clip_lines = []
        for c in clips:
            edits_summary = []
            if c.edits:
                if c.edits.get("trim"):
                    t = c.edits["trim"]
                    edits_summary.append(f"trimmed {t.get('start',0):.1f}s-{t.get('end',c.duration):.1f}s")
                if c.edits.get("rotation"):
                    edits_summary.append(f"rotated {c.edits['rotation']}°")
                if c.edits.get("speed") and c.edits["speed"] != 1:
                    edits_summary.append(f"speed {c.edits['speed']}x")
            if c.filterEdits and c.filterEdits.get("filterId") not in (None, "none"):
                edits_summary.append(f"filter:{c.filterEdits['filterId']}")
            if c.textOverlays:
                edits_summary.append(f"{len(c.textOverlays)} text overlay(s)")
            summary = f" [{', '.join(edits_summary)}]" if edits_summary else ""
            clip_lines.append(f"  • {c.name}  (id={c.id}, duration={c.duration:.1f}s){summary}")
        clip_list = "\n".join(clip_lines)
    else:
        clip_list = "  (no clips uploaded yet)"

    active = next((c for c in clips if c.id == active_clip_id), None)
    active_info = f"{active.name} (id={active.id}, duration={active.duration:.1f}s)" if active else "none selected"

    return f"""You are Clippi AI, an intelligent assistant built into a professional web-based video editor.
You control the editor through precise function calls. Be concise, helpful and technical.

━━ CURRENT EDITOR STATE ━━
Active clip : {active_info}
All clips   :
{clip_list}

━━ RULES ━━
1. DEFAULT CLIP: When the user says "the clip", "it", or gives no clip name → use active clip id={active_clip_id or 'NONE'}.
2. NO CLIP: If no clips exist, tell the user to upload a clip first.
3. NAVIGATE: Always call navigate_to_editor when making any visual edit.
4. ROTATION: Only 0/90/180/270 valid. "Rotate left"=270°, "Rotate right/clockwise"=90°.
5. FLIP: Use flip_clip for mirror/upside-down, NOT rotation.
6. SPEED: Slow-mo=0.25/0.5. Fast=2.0-4.0. Normal=1.0.
7. TRIM: "Keep only X to Y" → start=X end=Y. "Remove first N seconds" → start=N end=duration.
8. COLOR: "Warm"=temperature +40-70. "Cool"=temperature -40-70. "Bright"=exposure +20-40.
9. FILTERS: "B&W"=bw/noir. "Vintage"=vintage/kodak. "Cinematic"=cinema. "Warm golden"=golden.
10. TEXT: Default position center (x=50,y=50). Titles y=40-50, captions y=80-85.
11. AUDIO (ElevenLabs): The following audio features ARE supported via AI processing:
    - Sound Effects (audio_add_sound_effect): AI-generated SFX mixed INTO video at timestamp. OVERLAPPING.
    - Dubbing (audio_dub_video): AI voice cloning translates to another language. REPLACES audio.
    - Background Music (audio_add_background_music): AI music mixed under original audio. OVERLAPPING.
    - Denoising (audio_denoise): AI voice isolation removes background noise. REPLACES audio.
    - Captions (audio_add_captions): AI transcription adds subtitle overlays at bottom. Audio UNCHANGED.
    - Voiceover (audio_add_voiceover): TTS voice mixed over original audio at timestamp. OVERLAPPING.
12. VISUAL AI (Object Editing Engine): You can isolate and edit specific objects in the video:
    - blur_background: blurs everything except the detected object (e.g. "blur the background behind the person")
    - recolor_object: changes the object's color (e.g. "make the car blue")
    - spotlight_object: dims everything outside the object (e.g. "spotlight the laptop")
    Call visual_edit_object with object_description, effect_type, and effect_params.
    Always warn the user this processing takes several minutes and runs in the background.
13. AUDIO TIMING: Warn the user that audio and visual AI processing takes 15 seconds to several minutes.
    Do NOT call navigate_to_editor for audio or visual AI tools — it is handled automatically.
14. OUT OF SCOPE: AI background removal, export/render, multi-clip effects → "Sorry, outside current capabilities."
15. KEEP REPLIES SHORT: 1-2 sentences. No bullet lists.

━━ AVAILABLE OPERATIONS ━━
Geometric : trim, crop, rotate (0/90/180/270), flip, set speed
Color     : exposure, contrast, highlights, shadows, saturation, temperature, vignette, etc.
Filters   : 20 cinematic presets
Text      : overlays with font/size/color/position/animation
Audio     : sound effects, dubbing, music, denoising, captions, voiceover (via ElevenLabs)
Visual AI : blur_background, recolor_object, spotlight_object (via SAM2/YOLO — background job)
Navigation: switch view, select clip
Reset     : reset edits, reset color, reset filter
"""

# ─── Visual tool → frontend action ───────────────────────────────────────────

def tool_to_action(name: str, args: dict, active_clip_id: Optional[str]) -> Optional[dict]:
    clip_id = args.get("clip_id") or active_clip_id
    if not clip_id and name not in ("navigate_to_editor",):
        return None

    if name == "trim_clip":
        return {"type": "updateClipEdits", "clipId": clip_id,
                "patch": {"trim": {"start": float(args["start"]), "end": float(args["end"])}}}

    elif name == "crop_clip":
        return {"type": "updateClipEdits", "clipId": clip_id,
                "patch": {"crop": {
                    "top":    max(0, min(45, float(args.get("top", 0)))),
                    "right":  max(0, min(45, float(args.get("right", 0)))),
                    "bottom": max(0, min(45, float(args.get("bottom", 0)))),
                    "left":   max(0, min(45, float(args.get("left", 0)))),
                }}}

    elif name == "rotate_clip":
        deg = (round(int(args.get("degrees", 90)) / 90) * 90) % 360
        return {"type": "updateClipEdits", "clipId": clip_id, "patch": {"rotation": deg}}

    elif name == "flip_clip":
        patch = {}
        if "horizontal" in args: patch["flipH"] = bool(args["horizontal"])
        if "vertical"   in args: patch["flipV"] = bool(args["vertical"])
        return {"type": "updateClipEdits", "clipId": clip_id, "patch": patch} if patch else None

    elif name == "set_speed":
        speed = max(0.1, min(4.0, float(args["speed"])))
        return {"type": "updateClipEdits", "clipId": clip_id, "patch": {"speed": round(speed, 2)}}

    elif name == "reset_clip_edits":
        return {"type": "revertClipEdits", "clipId": clip_id}

    elif name == "update_color":
        color_keys = ["exposure","contrast","saturation","vibrance","highlights","shadows",
                      "whites","blacks","temperature","tint","sharpness","vignette"]
        patch = {}
        for key in color_keys:
            if key in args and args[key] is not None:
                val = float(args[key])
                val = max(0, min(100, val)) if key in ("sharpness","vignette") else max(-100, min(100, val))
                patch[key] = val
        return {"type": "updateClipColorEdits", "clipId": clip_id, "colorPatch": patch} if patch else None

    elif name == "reset_color":
        return {"type": "resetClipColorEdits", "clipId": clip_id}

    elif name == "apply_filter":
        return {"type": "updateClipFilterEdits", "clipId": clip_id,
                "filterEdits": {
                    "filterId": args.get("filter_id", "none"),
                    "intensity": max(0, min(100, int(args.get("intensity", 100)))),
                    "lutName": None,
                }}

    elif name == "reset_filter":
        return {"type": "resetClipFilterEdits", "clipId": clip_id}

    elif name == "add_text_overlay":
        font_name = args.get("font_family", "Syne")
        font_map = {
            "syne": "'Syne', sans-serif", "montserrat": "'Montserrat', sans-serif",
            "oswald": "'Oswald', sans-serif", "inter": "'Inter', sans-serif",
            "roboto": "'Roboto', sans-serif", "playfair display": "'Playfair Display', serif",
            "merriweather": "'Merriweather', serif", "dancing script": "'Dancing Script', cursive",
            "pacifico": "'Pacifico', cursive", "bebas neue": "'Bebas Neue', cursive",
            "jetbrains mono": "'JetBrains Mono', monospace",
        }
        overlay = {
            "text":           args.get("text", "Text"),
            "fontFamily":     font_map.get(font_name.lower(), f"'{font_name}', sans-serif"),
            "fontSize":       int(args.get("font_size", 14)),
            "color":          args.get("color", "#ffffff"),
            "x":              float(args.get("x", 50)),
            "y":              float(args.get("y", 50)),
            "bold":           bool(args.get("bold", False)),
            "italic":         bool(args.get("italic", False)),
            "align":          args.get("align", "center"),
            "startTime":      float(args.get("start_time", 0)),
            "endTime":        float(args.get("end_time", 5)),
            "animation":      args.get("animation", "fade-in"),
            "hasBackground":  bool(args.get("has_background", False)),
            "backgroundColor":args.get("background_color", "#000000"),
            "letterSpacing":  float(args.get("letter_spacing", 0)),
            "textShadow":     bool(args.get("text_shadow", False)),
        }
        return {"type": "addTextOverlay", "clipId": clip_id, "overlay": overlay}

    elif name == "navigate_to_editor":
        return {"type": "setView", "view": "editor"}

    elif name == "select_clip":
        return {"type": "setActiveClip", "clipId": args["clip_id"]}

    return None

# ─── Visual AI: background worker ────────────────────────────────────────────

def _effect_label(effect_type: str, params: dict) -> str:
    if effect_type == "recolor_object":
        return f"Recolored → {params.get('color', 'new color')}"
    if effect_type == "blur_background":
        return "Background Blurred"
    if effect_type == "spotlight_object":
        return "Spotlight Effect"
    return effect_type.replace("_", " ").title()


@weave.op()
def _run_visual_ai_worker(job_id: str, clip_id: str, tool_args: dict):
    """
    Runs in a background thread.

    Pipeline:
      1. Load clip metadata from the in-memory clips DB
      2. Extract all frames + fps  (extract_all_frames)
      3. Detect object → per-frame masks  (get_masks_auto)
      4. Apply effect to frames  (blur_background / recolor_object / spotlight_object)
      5. Extract original audio  (extract_audio)
      6. Reassemble frames + audio → new MP4  (frames_to_video)
      7. Clean up temp audio file
      8. Update DB with new video_path
      9. Return replaceClipVideo action for the frontend
    """
    # Guard: modules must be importable
    if not VISUAL_AI_AVAILABLE:
        raise ValueError(
            "Visual AI modules are not available on this server. "
            "Check that SAM2, YOLO, and segmentation packages are installed."
        )

    from app.routers import clips as clips_module

    # ── 1. Load clip metadata ────────────────────────────────────────────────
    visual_jobs.update_progress(job_id, "Loading clip info…")

    meta = clips_module._clips_db.get(clip_id)
    if not meta:
        raise ValueError(f"Clip '{clip_id}' not found in database")

    video_path = meta.get("video_path", "")
    if not video_path or not os.path.exists(video_path):
        raise ValueError(f"Video file not found: {video_path!r}")

    object_description = tool_args.get("object_description", "").strip()
    effect_type        = tool_args.get("effect_type", "blur_background")
    effect_params      = tool_args.get("effect_params") or {}

    if not object_description:
        raise ValueError("object_description is required")

    # ── 2. Extract all frames ────────────────────────────────────────────────
    visual_jobs.update_progress(job_id, "Extracting frames from video…")
    frames, fps = extract_all_frames(video_path)
    if not frames:
        raise ValueError("Could not extract any frames from video")
    print(f"  [Worker] Extracted {len(frames)} frames at {fps:.1f} fps")

    # ── 3. Object detection → masks ──────────────────────────────────────────
    visual_jobs.update_progress(job_id, f"Detecting '{object_description}' in video…")
    # get_masks_auto(frames, object_description, video_path) → (masks_dict, use_hue_filter)
    masks, use_hue_filter = get_masks_auto(frames, object_description, video_path)
    if not masks:
        raise ValueError(f"Could not detect '{object_description}' in the video")
    print(f"  [Worker] Got masks for {len(masks)} frames (use_hue_filter={use_hue_filter})")

    # ── 4. Apply effect ──────────────────────────────────────────────────────
    visual_jobs.update_progress(job_id, f"Applying '{effect_type}' effect…")

    if effect_type == "recolor_object":
        target_color = effect_params.get("color", "red")
        processed_frames = recolor_object(
            frames, masks, target_color,
            use_hue_filter=use_hue_filter,
        )

    elif effect_type == "blur_background":
        blur_strength = int(effect_params.get("blur_strength", 21))
        # Kernel must be a positive odd integer for GaussianBlur
        if blur_strength < 1:
            blur_strength = 1
        if blur_strength % 2 == 0:
            blur_strength += 1
        processed_frames = blur_background(frames, masks, blur_strength)

    elif effect_type == "spotlight_object":
        dim_factor = float(effect_params.get("dim_factor", 0.3))
        processed_frames = spotlight_object(frames, masks, dim_factor)

    else:
        raise ValueError(f"Unknown effect_type: '{effect_type}'")

    if not processed_frames:
        raise ValueError("Effect processing returned no frames")

    # ── 5. Extract original audio ────────────────────────────────────────────
    visual_jobs.update_progress(job_id, "Extracting audio track…")
    temp_audio_path = str(CLIPS_DIR / f"{clip_id}_temp_{uuid.uuid4().hex[:8]}.aac")
    audio_path = extract_audio(video_path, temp_audio_path)
    # audio_path is None if the video has no audio — frames_to_video handles None gracefully

    # ── 6. Reassemble video ──────────────────────────────────────────────────
    visual_jobs.update_progress(job_id, "Assembling final video…")
    base, ext = os.path.splitext(video_path)
    output_path = f"{base}_ai_{effect_type}{ext}"
    frames_to_video(processed_frames, fps, audio_path, output_path)

    # ── 7. Clean up temp audio ───────────────────────────────────────────────
    if audio_path and os.path.exists(audio_path):
        try:
            os.remove(audio_path)
        except Exception:
            pass

    # ── 8. Update database ───────────────────────────────────────────────────
    visual_jobs.update_progress(job_id, "Saving to database…")
    clips_module._clips_db[clip_id]["video_path"]  = output_path
    clips_module._clips_db[clip_id]["ai_replaced"] = True
    clips_module._clips_db[clip_id]["ai_effect"]   = effect_type
    clips_module._save_db(clips_module._clips_db)

    # ── 9. Return action for frontend ────────────────────────────────────────
    mtime = int(os.path.getmtime(output_path))
    return {
        "actions": [
            {
                "type":          "replaceClipVideo",
                "clipId":        clip_id,
                # Must match the GET /api/clips/{clip_id}/file endpoint in clips.py
                "newVideoUrl":   f"/api/clips/{clip_id}/file?v={mtime}",
                "effectApplied": effect_type,
                "label":         _effect_label(effect_type, effect_params),
            }
        ]
    }


@weave.op()
def execute_video_ai_tool(clip_id: str, tool_args: dict) -> list:
    """
    Fires a background job and returns immediately with a polling action.
    The frontend polls GET /api/jobs/{job_id} until status == 'complete'.
    """
    job_id = visual_jobs.create_job()
    visual_jobs.start_job_thread(
        job_id,
        _run_visual_ai_worker,
        clip_id,
        tool_args,
    )
    return [
        {
            "type":    "visualJobStarted",
            "jobId":   job_id,
            "clipId":  clip_id,
            "message": (
                f"Visual AI started: '{tool_args.get('effect_type', 'effect')}' "
                f"on '{tool_args.get('object_description', 'object')}'…"
            ),
        }
    ]

# ─── Audio tool execution ──────────────────────────────────────────────────────

@weave.op()
async def execute_audio_tool(fn_name: str, fn_args: dict, active_clip_id: Optional[str]) -> list:
    """Execute an ElevenLabs audio tool and return frontend actions."""
    if not AUDIO_AVAILABLE:
        return []

    clip_id = fn_args.get("clip_id") or active_clip_id
    if not clip_id:
        return []

    from app.routers import clips as clips_module
    meta = clips_module._clips_db.get(clip_id)
    if not meta or not Path(meta["video_path"]).exists():
        return []

    clip_path = meta["video_path"]
    out_path  = str(CLIPS_DIR / f"{clip_id}_{fn_name}_{uuid.uuid4().hex[:6]}.mp4")

    def _update(new_path: str):
        clips_module._clips_db[clip_id]["video_path"] = new_path
        clips_module._save_db(clips_module._clips_db)

    try:
        if fn_name == "audio_add_sound_effect":
            result = await asyncio.to_thread(
                _add_sfx,
                clip_path,
                fn_args.get("description", "sound effect"),
                float(fn_args.get("timestamp", 0.0)),
                float(fn_args.get("duration", 2.0)),
                float(fn_args.get("volume", 0.8)),
                out_path,
            )
            _update(result)
            return [
                {"type": "addAudioEffect", "clipId": clip_id, "effect": {
                    "id": str(uuid.uuid4()), "kind": "sound_effect",
                    "label": f"SFX · {fn_args.get('description', '')[:30]}",
                    "timestamp": float(fn_args.get("timestamp", 0.0)),
                }},
                {"type": "refreshClipVideo", "clipId": clip_id},
                {"type": "setView", "view": "editor"},
            ]

        elif fn_name == "audio_dub_video":
            result = await asyncio.to_thread(
                _dub_clip,
                clip_path,
                target_lang=fn_args.get("target_language", "es"),
                source_lang=fn_args.get("source_language", "en"),
                output_path=out_path,
            )
            _update(result)
            return [
                {"type": "addAudioEffect", "clipId": clip_id, "effect": {
                    "id": str(uuid.uuid4()), "kind": "dubbing",
                    "label": f"Dubbed → {fn_args.get('target_language', 'es').upper()}",
                }},
                {"type": "refreshClipVideo", "clipId": clip_id},
                {"type": "setView", "view": "editor"},
            ]

        elif fn_name == "audio_add_background_music":
            result = await asyncio.to_thread(
                _add_background_music,
                clip_path,
                mood=fn_args.get("mood", "upbeat"),
                volume=float(fn_args.get("volume", 0.15)),
                output_path=out_path,
            )
            _update(result)
            return [
                {"type": "addAudioEffect", "clipId": clip_id, "effect": {
                    "id": str(uuid.uuid4()), "kind": "music",
                    "label": f"Music · {fn_args.get('mood', 'upbeat')}",
                }},
                {"type": "refreshClipVideo", "clipId": clip_id},
                {"type": "setView", "view": "editor"},
            ]

        elif fn_name == "audio_denoise":
            result = await asyncio.to_thread(_denoise_clip, clip_path, out_path)
            _update(result)
            return [
                {"type": "addAudioEffect", "clipId": clip_id, "effect": {
                    "id": str(uuid.uuid4()), "kind": "denoising",
                    "label": "Denoised",
                }},
                {"type": "refreshClipVideo", "clipId": clip_id},
                {"type": "setView", "view": "editor"},
            ]

        elif fn_name == "audio_add_captions":
            from elevenlabs.client import ElevenLabs
            el_client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
            audio_bytes = await asyncio.to_thread(extract_audio_bytes, clip_path)

            def _transcribe():
                return el_client.speech_to_text.convert(
                    file=audio_bytes, model_id="scribe_v1",
                    language_code="en", timestamps_granularity="word",
                )
            result = await asyncio.to_thread(_transcribe)
            chunks = group_words_into_chunks(result.words)

            lang = fn_args.get("language", "en")
            if lang != "en":
                from mistralai import Mistral
                from audio.captions import translate_chunks
                mc = Mistral(api_key=os.getenv("MISTRAL_API_KEY"))
                chunks = await asyncio.to_thread(translate_chunks, chunks, lang, mc)

            return [
                {"type": "addAudioEffect", "clipId": clip_id, "effect": {
                    "id": str(uuid.uuid4()), "kind": "captions",
                    "label": f"Captions · {lang.upper()}",
                }},
                {"type": "setClipCaptions", "clipId": clip_id, "captions": chunks},
                {"type": "setView", "view": "editor"},
            ]

        elif fn_name == "audio_add_voiceover":
            result = await asyncio.to_thread(
                _add_voiceover,
                clip_path,
                fn_args.get("text", ""),
                float(fn_args.get("timestamp", 0.0)),
                fn_args.get("voice_style", "neutral"),
                out_path,
            )
            _update(result)
            text_preview = fn_args.get("text", "")[:40]
            return [
                {"type": "addAudioEffect", "clipId": clip_id, "effect": {
                    "id": str(uuid.uuid4()), "kind": "voiceover",
                    "label": f"Voiceover · {fn_args.get('voice_style', 'neutral')}",
                    "text": text_preview,
                }},
                {"type": "refreshClipVideo", "clipId": clip_id},
                {"type": "setView", "view": "editor"},
            ]

    except Exception as e:
        import traceback; traceback.print_exc()
        print(f"[chat] Audio tool '{fn_name}' failed: {e}")

    return []

# ─── Traced per-tool dispatch ────────────────────────────────────────────────

@weave.op()
async def _dispatch_tool_call(
    fn_name: str, fn_args: dict, active_clip_id: Optional[str]
) -> dict:
    """Trace and execute a single MCP tool call. Returns actions list + success flag."""
    if fn_name in AUDIO_TOOL_NAMES:
        audio_actions = await execute_audio_tool(fn_name, fn_args, active_clip_id)
        return {"actions": audio_actions, "success": len(audio_actions) > 0}

    elif fn_name in VISUAL_AI_TOOL_NAMES:
        clip_id = fn_args.get("clip_id") or active_clip_id
        if clip_id:
            visual_actions = execute_video_ai_tool(clip_id, fn_args)
            return {"actions": visual_actions, "success": len(visual_actions) > 0}
        return {"actions": [], "success": False}

    else:
        action = tool_to_action(fn_name, fn_args, active_clip_id)
        return {"actions": [action] if action else [], "success": action is not None}


# ─── Main chat endpoint ───────────────────────────────────────────────────────

@router.post("/chat")
async def chat(body: ChatRequest):
    api_key = os.getenv("MISTRAL_API_KEY", "").strip().replace('"', '').replace("'", "")
    if not api_key:
        return {"status": "error",
                "reply": "⚠️ Mistral API key is missing. Check your backend/.env file.",
                "actions": []}

    try:
        from mistralai import Mistral
        client = Mistral(api_key=api_key)

        # Prefer explicit clip_id, fall back to activeClipId
        active_clip_id = body.clip_id or body.activeClipId

        system_prompt = build_system_prompt(body.clips or [], active_clip_id)
        messages = [{"role": "system", "content": system_prompt}]

        history = (body.conversationHistory or [])[-16:]
        for msg in history:
            if msg.role in ("user", "assistant"):
                messages.append({"role": msg.role, "content": msg.text})
        messages.append({"role": "user", "content": body.message})

        # ── First Mistral call — may return tool calls ────────────────────────
        response = client.chat.complete(
            model="mistral-large-latest",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )

        choice  = response.choices[0]
        actions: list[dict] = []

        if choice.finish_reason == "tool_calls" and choice.message.tool_calls:
            tool_result_messages = []

            for tc in choice.message.tool_calls:
                fn_name = tc.function.name
                try:
                    fn_args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                except (json.JSONDecodeError, TypeError):
                    fn_args = {}

                result = await _dispatch_tool_call(fn_name, fn_args, active_clip_id)
                actions.extend(result["actions"])

                tool_result_messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps({"success": result["success"], "executed": fn_name})
                })

            assistant_msg = {
                "role": "assistant",
                "content": choice.message.content or "",
                "tool_calls": [
                    {"id": tc.id, "type": "function",
                     "function": {"name": tc.function.name, "arguments": tc.function.arguments or "{}"}}
                    for tc in choice.message.tool_calls
                ]
            }
            messages.append(assistant_msg)
            messages.extend(tool_result_messages)

            final = client.chat.complete(model="mistral-large-latest", messages=messages)
            reply = final.choices[0].message.content or "Done!"

        else:
            reply = choice.message.content or "I'm not sure how to help with that."

        # ── Auto-navigate for visual edits ────────────────────────────────────
        visual_edit_types = {
            "updateClipEdits", "updateClipColorEdits", "updateClipFilterEdits",
            "addTextOverlay", "removeTextOverlay",
            "revertClipEdits", "resetClipColorEdits", "resetClipFilterEdits",
        }
        has_visual_edits = any(a.get("type") in visual_edit_types for a in actions)
        if has_visual_edits and not any(a.get("type") == "setView" for a in actions):
            actions.insert(0, {"type": "setView", "view": "editor"})

        return {"status": "ok", "reply": reply, "actions": actions}

    except Exception as e:
        import traceback; traceback.print_exc()
        err_str = str(e)
        if "401" in err_str or "Unauthorized" in err_str:
            reply = "🔑 Invalid Mistral API key. Check backend/.env."
        elif "429" in err_str or "rate" in err_str.lower():
            reply = "⏳ Rate limit hit. Wait a few seconds and try again."
        elif "connect" in err_str.lower() or "network" in err_str.lower():
            reply = "🌐 Can't reach Mistral's servers. Check internet connection."
        else:
            reply = f"⚠️ Something went wrong.\n\nDetails: {err_str[:200]}"
        return {"status": "error", "reply": reply, "actions": []}