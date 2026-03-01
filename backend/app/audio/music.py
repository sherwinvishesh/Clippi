import os
import tempfile
import weave
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
import ffmpeg

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

# Map short mood keywords to richer prompts
MOOD_PROMPTS = {
    "upbeat":   "upbeat energetic lo-fi hip hop, positive vibes",
    "calm":     "calm ambient piano, relaxing, study music",
    "dramatic": "cinematic orchestral tension building",
    "fun":      "playful ukulele pop, bright and cheerful",
}


@weave.op()
def add_background_music(
    clip_path: str,
    mood: str = "upbeat lo-fi",
    volume: float = 0.15,
    output_path: str = None,
) -> str:
    """
    Mix AI-generated background music into a video clip.

    Args:
        clip_path:   Path to the source .mp4 file.
        mood:        Mood keyword (upbeat/calm/dramatic/fun) or a free-form prompt.
        volume:      Music volume relative to original audio (0.15 ≈ −16 dB).
        output_path: Output .mp4 path. Defaults to clip_path with _music suffix.

    Returns:
        output_path of the final video with background music.
    """
    if output_path is None:
        output_path = clip_path.replace(".mp4", "_music.mp4")

    client = ElevenLabs(api_key=ELEVENLABS_API_KEY)

    # ── 1. Get clip duration ───────────────────────────────────────────────
    probe = ffmpeg.probe(clip_path)
    duration = float(probe["format"]["duration"])
    print(f"[music] Clip duration: {duration:.1f}s")

    # ── 2. Build music prompt ──────────────────────────────────────────────
    prompt = MOOD_PROMPTS.get(mood, mood)
    music_prompt = f"{prompt}, instrumental, no vocals"

    # ElevenLabs music.compose uses music_length_ms; cap at 60 s (60 000 ms)
    music_length_ms = min(int(duration * 1000) + 2000, 60_000)
    print(f"[music] Generating music: '{music_prompt}' ({music_length_ms / 1000:.0f}s)")

    music_stream = client.music.compose(
        prompt=music_prompt,
        music_length_ms=music_length_ms,
        force_instrumental=True,
    )
    music_bytes = b"".join(music_stream)

    # Write raw music to a temp MP3
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_music:
        tmp_music.write(music_bytes)
        tmp_music_path = tmp_music.name
    print(f"[music] Music written to temp file ({len(music_bytes) / 1024:.0f} KB)")

    tmp_looped_path = None
    try:
        # ── 3. Loop music if clip is longer than 60 s ──────────────────────
        music_path_to_mix = tmp_music_path
        if duration > 60:
            loops_needed = int(duration / 60) + 1
            print(f"[music] Clip >60s — looping music {loops_needed}x with aloop filter")
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_loop:
                tmp_looped_path = tmp_loop.name

            (
                ffmpeg
                .input(tmp_music_path)
                .audio
                .filter("aloop", loop=loops_needed, size=2**31 - 1)
                .filter("atrim", duration=duration)
                .output(tmp_looped_path, acodec="libmp3lame", q=2)
                .run(overwrite_output=True, quiet=True)
            )
            music_path_to_mix = tmp_looped_path

        # ── 4. Mix music into video with amix ──────────────────────────────
        # amix weights: original=1.0, music=volume
        # dropout_transition=0 prevents fade-out when shorter stream ends
        print(f"[music] Mixing at volume={volume} → {output_path}")
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

        video_in   = ffmpeg.input(clip_path)
        music_in   = ffmpeg.input(music_path_to_mix)

        mixed_audio = ffmpeg.filter(
            [video_in.audio, music_in.audio],
            "amix",
            inputs=2,
            duration="first",          # output length = original clip length
            dropout_transition=0,
            weights=f"1 {volume}",     # original full, music at `volume`
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
        for p in [tmp_music_path, tmp_looped_path]:
            if p and os.path.exists(p):
                os.remove(p)

    # ── 5. Return output path ─────────────────────────────────────────────
    print(f"[music] Done → {output_path}")
    return output_path


if __name__ == "__main__":
    result = add_background_music(
        "test_clips/sample.mp4",
        mood="upbeat",
        volume=0.15,
        output_path="outputs/music.mp4",
    )
    print("Done:", result)
