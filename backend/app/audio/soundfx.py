import os
import tempfile
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
import ffmpeg

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")


def add_sound_effect(
    clip_path: str,
    description: str,
    timestamp: float,
    duration: float = 2.0,
    volume: float = 0.8,
    output_path: str = None,
) -> str:
    """
    Generate a sound effect and mix it into a video at a given timestamp.

    Args:
        clip_path:   Path to the source .mp4 file.
        description: Natural-language description of the sound effect.
        timestamp:   When (seconds) the sound effect should start.
        duration:    Desired duration of the generated sound effect in seconds.
        volume:      SFX volume relative to original audio (0.8 = slightly quieter).
        output_path: Output .mp4 path. Defaults to clip_path with _sfx suffix.

    Returns:
        output_path of the final video with the sound effect mixed in.
    """
    if output_path is None:
        output_path = clip_path.replace(".mp4", "_sfx.mp4")

    return add_multiple_sound_effects(
        clip_path,
        effects=[{"description": description, "timestamp": timestamp,
                  "duration": duration, "volume": volume}],
        output_path=output_path,
    )


def add_multiple_sound_effects(
    clip_path: str,
    effects: list[dict],
    output_path: str = None,
) -> str:
    """
    Generate multiple sound effects and mix them all into a video in a single
    FFmpeg pass (faster than running FFmpeg once per effect).

    Each element of `effects` is a dict with keys:
        description (str)  – what the sound should be
        timestamp   (float) – when it starts (seconds)
        duration    (float, optional) – length of clip to generate (default 2.0)
        volume      (float, optional) – mix volume (default 0.8)

    Args:
        clip_path:   Path to the source .mp4 file.
        effects:     List of effect dicts (see above).
        output_path: Output .mp4 path. Defaults to clip_path with _sfx suffix.

    Returns:
        output_path of the final video with all sound effects mixed in.
    """
    if output_path is None:
        output_path = clip_path.replace(".mp4", "_sfx.mp4")

    client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    tmp_paths = []  # track temp files for cleanup
    try:
        # ── 1. Generate all SFX and write to temp MP3s ─────────────────────
        sfx_files = []
        for i, fx in enumerate(effects):
            desc     = fx["description"]
            ts       = float(fx.get("timestamp", 0.0))
            dur      = float(fx.get("duration", 2.0))
            vol      = float(fx.get("volume", 0.8))

            print(f"[soundfx] [{i+1}/{len(effects)}] Generating: '{desc}' "
                  f"(t={ts}s, dur={dur}s)")

            sfx_iter = client.text_to_sound_effects.convert(
                text=desc,
                duration_seconds=dur,
                prompt_influence=0.3,
            )
            sfx_bytes = b"".join(sfx_iter)

            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
                f.write(sfx_bytes)
                tmp_paths.append(f.name)
                sfx_files.append({"path": f.name, "timestamp": ts, "volume": vol})

            print(f"[soundfx]   → {len(sfx_bytes) / 1024:.0f} KB written")

        # ── 2. Build single FFmpeg command mixing all SFX at once ──────────
        # Strategy: start from the original video audio, then for each SFX:
        #   - delay it using adelay
        #   - amix into the running stream
        # This produces a single decode+encode pass regardless of SFX count.

        print(f"[soundfx] Mixing {len(sfx_files)} effect(s) into {output_path}")

        # Collect all inputs
        inputs = [ffmpeg.input(clip_path)]
        for sfx in sfx_files:
            inputs.append(ffmpeg.input(sfx["path"]))

        video_stream = inputs[0].video
        # running audio starts as original clip audio
        running_audio = inputs[0].audio

        for idx, sfx in enumerate(sfx_files):
            delay_ms = int(sfx["timestamp"] * 1000)
            vol      = sfx["volume"]

            delayed_sfx = (
                inputs[idx + 1].audio
                .filter("adelay", f"{delay_ms}|{delay_ms}")
            )

            running_audio = ffmpeg.filter(
                [running_audio, delayed_sfx],
                "amix",
                inputs=2,
                duration="first",
                dropout_transition=0,
                weights=f"1 {vol}",
            )

        try:
            ffmpeg.output(
                video_stream,
                running_audio,
                output_path,
                vcodec="copy",
                acodec="aac",
                shortest=None,
            ).run(overwrite_output=True, quiet=True)
        except ffmpeg.Error as e:
            print("FFmpeg mix failed:", e.stderr.decode() if e.stderr else str(e))
            raise

    finally:
        for p in tmp_paths:
            if os.path.exists(p):
                os.remove(p)

    print(f"[soundfx] Done → {output_path}")
    return output_path


if __name__ == "__main__":
    result = add_sound_effect(
        "test_clips/sample.mp4",
        "dramatic cinematic whoosh",
        timestamp=2.0,
        output_path="outputs/sfx_test.mp4",
    )
    print("Done:", result)
