import os
import tempfile
import subprocess
import weave
import urllib.request
from PIL import Image, ImageDraw, ImageFont
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from mistralai import Mistral
import ffmpeg
import cv2
import numpy as np

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

# Style presets: (font_scale, thickness, with_shadow)
STYLES = {
    "tiktok":  {"font_scale": 1.4, "thickness": 3, "color": (255, 255, 255), "shadow": True,  "bold": True},
    "youtube": {"font_scale": 1.0, "thickness": 2, "color": (255, 255, 255), "shadow": True,  "bold": False},
    "minimal": {"font_scale": 0.8, "thickness": 1, "color": (220, 220, 220), "shadow": False, "bold": False},
}


def _seconds_to_srt_time(seconds: float) -> str:
    """Convert float seconds to SRT timestamp HH:MM:SS,mmm."""
    ms = int((seconds % 1) * 1000)
    s = int(seconds) % 60
    m = int(seconds // 60) % 60
    h = int(seconds // 3600)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _build_srt(words: list, chunk_size: int = 5) -> str:
    """Group words into subtitle chunks and format as SRT string."""
    chunks = [words[i:i + chunk_size] for i in range(0, len(words), chunk_size)]
    lines = []
    for i, chunk in enumerate(chunks, start=1):
        start = _seconds_to_srt_time(chunk[0].start)
        end = _seconds_to_srt_time(chunk[-1].end)
        text = " ".join(w.text for w in chunk).strip()
        lines.append(f"{i}\n{start} --> {end}\n{text}\n")
    return "\n".join(lines)


def _parse_srt_to_events(srt_path: str) -> list[dict]:
    """Parse SRT file into list of {start, end, text} events (seconds)."""
    events = []
    with open(srt_path, encoding="utf-8") as f:
        content = f.read().strip()
    blocks = content.split("\n\n")
    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        time_line = lines[1]
        start_str, end_str = time_line.split(" --> ")
        def to_sec(t):
            h, m, rest = t.strip().split(":")
            s, ms = rest.replace(",", ".").split(".")
            return int(h) * 3600 + int(m) * 60 + int(s) + float(f"0.{ms}")
        events.append({
            "start": to_sec(start_str),
            "end": to_sec(end_str),
            "text": " ".join(lines[2:]).strip()
        })
    return events

@weave.op()
def transcribe_to_srt(clip_path: str, srt_path: str, language: str = "en") -> str:
    """
    Transcribe original English audio → translate if needed → save as SRT.
    Always transcribes in English first, then translates text if needed.
    Preserves original timestamps regardless of target language.
    """
    load_dotenv()
    client_el = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
    client_mistral = Mistral(api_key=os.getenv("MISTRAL_API_KEY"))
    
    # Step 1: extract audio from clip
    print(f"[captions] Transcribing audio in English...")
    audio_bytes = extract_audio_bytes(clip_path)  # returns bytes
    
    # Step 2: ElevenLabs Scribe — always English
    result = client_el.speech_to_text.convert(
        file=audio_bytes,
        model_id="scribe_v1",
        language_code="en",  # always transcribe English source
        timestamps_granularity="word"
    )
    
    # Step 3: group words into subtitle chunks
    chunks = group_words_into_chunks(result.words, max_words=6, max_duration=3.0)
    print(f"[captions] Got {len(chunks)} subtitle chunks in English")
    
    # Step 4: translate if needed
    if language != "en":
        print(f"[captions] Translating {len(chunks)} chunks to '{language}' via Mistral...")
        chunks = translate_chunks(chunks, target_language=language, client=client_mistral)
    
    # Step 5: write SRT
    write_srt(chunks, srt_path)
    print(f"[captions] SRT saved → {srt_path}")
    return srt_path


def group_words_into_chunks(words, max_words=6, max_duration=3.0):
    chunks = []
    current_words = []
    chunk_start = None
    
    for word in words:
        if not hasattr(word, 'start') or word.start is None:
            continue
        if chunk_start is None:
            chunk_start = word.start
        current_words.append(word.text)
        duration = word.end - chunk_start
        
        if len(current_words) >= max_words or duration >= max_duration:
            chunks.append({
                "start": chunk_start,
                "end": word.end,
                "text": " ".join(current_words).strip()
            })
            current_words = []
            chunk_start = None
    
    if current_words and chunk_start is not None:
        chunks.append({
            "start": chunk_start,
            "end": words[-1].end,
            "text": " ".join(current_words).strip()
        })
    
    return chunks


def translate_chunks(chunks, target_language, client):
    """
    Batch translate all chunks in one Mistral call to save API calls.
    Sends all English text at once, gets back translated lines.
    """
    # build numbered list for batch translation
    numbered = "\n".join([f"{i+1}. {c['text']}" for i, c in enumerate(chunks)])
    
    LANGUAGE_NAMES = {
        "es": "Spanish", "fr": "French", "de": "German",
        "hi": "Hindi", "ja": "Japanese", "zh": "Chinese",
        "ar": "Arabic", "pt": "Portuguese", "it": "Italian",
        "ko": "Korean", "ru": "Russian"
    }
    lang_name = LANGUAGE_NAMES.get(target_language, target_language)
    
    response = client.chat.complete(
        model="devstral-latest",
        messages=[{
            "role": "system",
            "content": f"""You are a subtitle translator. 
Translate each numbered line to {lang_name}.
Keep translations concise — subtitles must be short.
Return ONLY the numbered translations, same format as input.
Do not add explanations or change the numbering."""
        },
        {
            "role": "user",
            "content": numbered
        }]
    )
    
    # parse response back into chunks
    lines = response.choices[0].message.content.strip().split("\n")
    translated_chunks = []
    
    for i, chunk in enumerate(chunks):
        # find matching translated line
        translated_text = chunk["text"]  # fallback to original
        for line in lines:
            if line.strip().startswith(f"{i+1}."):
                translated_text = line.split(".", 1)[1].strip()
                break
        
        translated_chunks.append({
            "start": chunk["start"],
            "end": chunk["end"],
            "text": translated_text
        })
    
    return translated_chunks


def write_srt(chunks, srt_path):
    with open(srt_path, "w", encoding="utf-8") as f:
        for i, chunk in enumerate(chunks, 1):
            start = format_srt_time(chunk["start"])
            end = format_srt_time(chunk["end"])
            f.write(f"{i}\n{start} --> {end}\n{chunk['text']}\n\n")


def format_srt_time(seconds: float) -> str:
    if seconds is None:
        seconds = 0.0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def extract_audio_bytes(clip_path: str) -> bytes:
    """Extract audio from video and return as bytes for ElevenLabs API"""
    import tempfile, subprocess
    tmp = tempfile.mktemp(suffix=".mp3")
    subprocess.run([
        "ffmpeg", "-y", "-i", clip_path,
        "-vn", "-acodec", "libmp3lame", "-ar", "44100", tmp
    ], capture_output=True)
    with open(tmp, "rb") as f:
        data = f.read()
    os.remove(tmp)
    return data



# Font downloading logic
FONTS_DIR = os.path.join(os.path.dirname(__file__), "fonts")
NOTO_SANS_URL = "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf"
NOTO_DEVANAGARI_URL = "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf"

NOTO_SANS_PATH = os.path.join(FONTS_DIR, "NotoSans-Regular.ttf")
NOTO_DEVANAGARI_PATH = os.path.join(FONTS_DIR, "NotoSansDevanagari-Regular.ttf")

def _ensure_fonts():
    os.makedirs(FONTS_DIR, exist_ok=True)
    if not os.path.exists(NOTO_SANS_PATH):
        try:
            urllib.request.urlretrieve(NOTO_SANS_URL, NOTO_SANS_PATH)
        except Exception as e:
            print(f"Failed to download NotoSans: {e}")
    if not os.path.exists(NOTO_DEVANAGARI_PATH):
        try:
            urllib.request.urlretrieve(NOTO_DEVANAGARI_URL, NOTO_DEVANAGARI_PATH)
        except Exception as e:
            print(f"Failed to download NotoSansDevanagari: {e}")

def _is_devanagari(text: str) -> bool:
    return any('\u0900' <= c <= '\u097F' for c in text)

def _draw_subtitle_on_frame(frame: np.ndarray, text: str, style: dict) -> np.ndarray:
    """Draw subtitle text centered at bottom of frame using Pillow for Unicode support."""
    _ensure_fonts()
    font_path = NOTO_DEVANAGARI_PATH if _is_devanagari(text) else NOTO_SANS_PATH
    
    # Convert BGR (OpenCV) to RGB (Pillow)
    pil_img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(pil_img)
    
    font_size = int(style["font_scale"] * 40)
    try:
        font = ImageFont.truetype(font_path, font_size)
    except IOError:
        font = ImageFont.load_default()
        
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
    except AttributeError:
        # Fallback for very old Pillow
        text_w, text_h = draw.textsize(text, font=font)
        
    w, h = pil_img.size
    x = (w - text_w) // 2
    y = h - text_h - 40  # 40px from bottom

    thickness = style["thickness"]
    shadow = style["shadow"]
    
    color_bgr = style["color"]
    # cv2 color is (B, G, R)
    color_rgb = (color_bgr[2], color_bgr[1], color_bgr[0])

    if shadow:
        draw.text((x + 2, y + 2), text, font=font, fill=(0, 0, 0), stroke_width=thickness + 2, stroke_fill=(0, 0, 0))
    # Draw main text with outline
    draw.text((x, y), text, font=font, fill=color_rgb, stroke_width=thickness, stroke_fill=(0, 0, 0))

    # Convert back to BGR
    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)


@weave.op()
def add_captions(clip_path: str, style: str = "tiktok", output_path: str = None, language: str = "en") -> dict:
    if output_path is None:
        output_path = clip_path.replace(".mp4", "_captioned.mp4")
    srt_path = output_path.replace(".mp4", ".srt")

    if style not in STYLES:
        raise ValueError(f"Unknown style '{style}'. Available: {list(STYLES.keys())}")

    client = ElevenLabs(api_key=ELEVENLABS_API_KEY)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
        tmp_wav_path = tmp_wav.name
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_vid:
        tmp_vid_path = tmp_vid.name

    try:
        # Step 1: Extract audio to temp WAV
        try:
            ffmpeg.input(clip_path).output(
                tmp_wav_path, acodec="pcm_s16le", vn=None
            ).run(overwrite_output=True, quiet=True)
        except ffmpeg.Error as e:
            print("FFmpeg audio extraction failed:", e.stderr.decode() if e.stderr else str(e))
            raise

        # Step 2: Transcribe with ElevenLabs Scribe v1
        with open(tmp_wav_path, "rb") as f:
            result = client.speech_to_text.convert(
                file=f,
                model_id="scribe_v1",
                language_code=language,
                timestamps_granularity="word"
            )

        # Step 3: Build and save SRT file
        srt_content = _build_srt(result.words)
        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)

        # Step 4: Render subtitles using OpenCV frame-by-frame
        events = _parse_srt_to_events(srt_path)
        cap = cv2.VideoCapture(clip_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        writer = cv2.VideoWriter(tmp_vid_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))

        frame_idx = 0
        style_cfg = STYLES[style]
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            t = frame_idx / fps
            active = [e for e in events if e["start"] <= t < e["end"]]
            if active:
                frame = _draw_subtitle_on_frame(frame, active[0]["text"], style_cfg)
            writer.write(frame)
            frame_idx += 1
        cap.release()
        writer.release()

        # Step 5: Mux rendered video with original audio
        try:
            video_stream = ffmpeg.input(tmp_vid_path).video
            audio_stream = ffmpeg.input(clip_path).audio
            ffmpeg.output(
                video_stream, audio_stream, output_path,
                vcodec="libx264", acodec="aac"
            ).run(overwrite_output=True, quiet=True)
        except ffmpeg.Error as e:
            print("FFmpeg mux failed:", e.stderr.decode() if e.stderr else str(e))
            raise

    finally:
        for p in [tmp_wav_path, tmp_vid_path]:
            if os.path.exists(p):
                os.remove(p)

    return {
        "video": output_path,
        "srt": srt_path,
        "word_count": len(result.words)
    }


if __name__ == "__main__":
    import pprint
    result = add_captions(
        "test_clips/sample.mp4",
        style="tiktok",
        output_path="outputs/captioned.mp4"
    )
    pprint.pprint(result)
    import subprocess
    subprocess.run(["open", result["video"]])
