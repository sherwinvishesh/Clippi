import os
import tempfile
import weave
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from elevenlabs import VoiceSettings
import ffmpeg

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

# voice_style → ElevenLabs voice_id
VOICE_IDS = {
    "neutral":   "JBFqnCBsd6RMkjVDRZzb",  # George
    "energetic": "N2lVS1w4EtoT3dr4eOWO",  # Callum
    "calm":      "XB0fDUnXU5powFXDhCwa",  # Charlotte
    "dramatic":  "pNInz6obpgDQGcFmaJgB",  # Adam
}


@weave.op()
def add_voiceover(
    clip_path: str,
    text: str,
    timestamp: float = 0.0,
    voice_style: str = "neutral",
    output_path: str = None,
) -> str:
    """
    Overlay a TTS voiceover onto a video clip at a given timestamp.

    Args:
        clip_path:   Path to the source .mp4 file.
        text:        Text to synthesise as the voiceover.
        timestamp:   When (in seconds) the voiceover should start.
        voice_style: One of "neutral", "energetic", "calm". Falls back to "neutral".
        output_path: Output .mp4 path. Defaults to clip_path with _voiceover suffix.

    Returns:
        output_path of the final video with voiceover mixed in.
    """
    if output_path is None:
        output_path = clip_path.replace(".mp4", "_voiceover.mp4")

    voice_id = VOICE_IDS.get(voice_style, VOICE_IDS["neutral"])
    client = ElevenLabs(api_key=ELEVENLABS_API_KEY)

    # ── 1. Generate TTS audio ──────────────────────────────────────────────
    print(f"[voiceover] Generating TTS: style={voice_style!r}, voice={voice_id}")
    audio_generator = client.text_to_speech.convert(
        voice_id,
        text=text,
        model_id="eleven_multilingual_v2",
        voice_settings=VoiceSettings(stability=0.5, similarity_boost=0.75),
    )
    audio_bytes = b"".join(audio_generator)
    print(f"[voiceover] Generated {len(audio_bytes) / 1024:.0f} KB of audio")

    # Write to temp MP3
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_vo:
        tmp_vo.write(audio_bytes)
        tmp_vo_path = tmp_vo.name

    try:
        # ── 2. Mix voiceover into video ────────────────────────────────────
        delay_ms = int(timestamp * 1000)
        print(
            f"[voiceover] Mixing voiceover at t={timestamp}s "
            f"(delay={delay_ms}ms) → {output_path}"
        )
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

        video_in = ffmpeg.input(clip_path)
        vo_in    = ffmpeg.input(tmp_vo_path)

        # Delay the voiceover by `timestamp` seconds
        delayed_vo = vo_in.audio.filter("adelay", f"{delay_ms}|{delay_ms}")

        # Mix delayed voiceover with original audio at equal volume
        mixed_audio = ffmpeg.filter(
            [video_in.audio, delayed_vo],
            "amix",
            inputs=2,
            duration="first",       # clamp to original clip length
            dropout_transition=0,
        )

        try:
            ffmpeg.output(
                video_in.video,
                mixed_audio,
                output_path,
                vcodec="copy",
                acodec="aac",
            ).run(overwrite_output=True, quiet=True)
        except ffmpeg.Error as e:
            print("FFmpeg mix failed:", e.stderr.decode() if e.stderr else str(e))
            raise

    finally:
        if os.path.exists(tmp_vo_path):
            os.remove(tmp_vo_path)

    # ── 3. Return output path ─────────────────────────────────────────────
    print(f"[voiceover] Done → {output_path}")
    return output_path


if __name__ == "__main__":
    result = add_voiceover(
        "test_clips/sample.mp4",
        "This is an amazing clip!",
        timestamp=2.0,
        voice_style="energetic",
        output_path="outputs/voiceover.mp4",
    )
    print("Done:", result)
