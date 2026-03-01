import os
import time
import tempfile
import weave
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
import ffmpeg

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")


def _get_atempo_filters(tempo: float) -> str:
    """Build a chained atempo filter string, keeping each step within [0.5, 2.0]."""
    filters = []
    t = tempo
    while t < 0.5:
        filters.append("atempo=0.5")
        t /= 0.5
    while t > 2.0:
        filters.append("atempo=2.0")
        t /= 2.0
    filters.append(f"atempo={t:.4f}")
    return ",".join(filters)


@weave.op()
def dub_clip(
    clip_path: str,
    target_lang: str = "es",
    source_lang: str = "en",
    output_path: str = None,
    match_duration: bool = True,
    num_speakers: int = 0,
) -> str:
    """
    Dub a video clip into a target language using the ElevenLabs dubbing API.

    Args:
        clip_path:      Path to the source .mp4 file.
        target_lang:    BCP-47 language code for the target language (e.g. "es").
        source_lang:    BCP-47 language code for the source language (e.g. "en").
        output_path:    Where to write the dubbed .mp4. Defaults to
                        clip_path with _{target_lang} suffix.
        match_duration: If True (default), apply atempo correction when the dubbed
                        audio duration differs from the original by more than 5%%.

    Returns:
        output_path of the final dubbed video.
    """
    if output_path is None:
        output_path = clip_path.replace(".mp4", f"_{target_lang}.mp4")

    client = ElevenLabs(api_key=ELEVENLABS_API_KEY)

    # ── 1. Submit dubbing job ──────────────────────────────────────────────
    print(f"[dubbing] Submitting dubbing job: {clip_path} → {target_lang}")
    with open(clip_path, "rb") as f:
        dub_response = client.dubbing.create(
            file=f,
            target_lang=target_lang,
            source_lang=source_lang,
            num_speakers=num_speakers,  # 0 = auto-detect
            watermark=True,   # required for non-Creator+ plans
        )
    dubbing_id = dub_response.dubbing_id
    print(f"[dubbing] Auto-detecting speakers, job ID: {dubbing_id}")

    # ── 2. Poll until done (timeout 5 min) ────────────────────────────────
    timeout_seconds = 300
    poll_interval = 5
    elapsed = 0

    print("[dubbing] Waiting for dubbed result", end="", flush=True)
    while elapsed < timeout_seconds:
        time.sleep(poll_interval)
        elapsed += poll_interval
        metadata = client.dubbing.get(dubbing_id)
        status = metadata.status
        print(".", end="", flush=True)

        if status == "dubbed":
            print(" done!")
            break
        elif status in ("error", "failed"):
            raise RuntimeError(
                f"ElevenLabs dubbing job failed with status '{status}' "
                f"(dubbing_id={dubbing_id})"
            )
    else:
        raise TimeoutError(
            f"Dubbing job {dubbing_id} did not complete within {timeout_seconds}s"
        )

    # ── 3. Download dubbed audio ──────────────────────────────────────────
    print(f"[dubbing] Downloading dubbed audio for lang={target_lang} …")
    audio_stream = client.dubbing.audio.get(dubbing_id, target_lang)

    # Consume the generator / iterator into bytes
    if hasattr(audio_stream, "read"):
        dubbed_bytes = audio_stream.read()
    else:
        dubbed_bytes = b"".join(audio_stream)

    # Write to a temp audio file
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_audio:
        tmp_audio.write(dubbed_bytes)
        tmp_audio_path = tmp_audio.name

    # ── 4. Duration-match: stretch/compress dubbed audio to fit original video ──
    import subprocess
    tmp_adjusted_path = None
    try:
        if match_duration:
            orig_duration = float(ffmpeg.probe(clip_path)["format"]["duration"])
            dubbed_duration = float(ffmpeg.probe(tmp_audio_path)["format"]["duration"])
            tempo = dubbed_duration / orig_duration

            if abs(tempo - 1.0) > 0.05:
                print(
                    f"[dubbing] Speed adjusted: {tempo:.3f}x "
                    f"→ audio stretched to match video"
                )
                atempo_filter = _get_atempo_filters(tempo)
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_adj:
                    tmp_adjusted_path = tmp_adj.name
                result_proc = subprocess.run(
                    [
                        "ffmpeg", "-y", "-i", tmp_audio_path,
                        "-af", atempo_filter,
                        "-vn", tmp_adjusted_path,
                    ],
                    capture_output=True,
                )
                if result_proc.returncode != 0:
                    raise RuntimeError(
                        "ffmpeg atempo failed: "
                        + result_proc.stderr.decode(errors="replace")
                    )
                # Swap: use adjusted file for muxing
                os.remove(tmp_audio_path)
                tmp_audio_path = tmp_adjusted_path
                tmp_adjusted_path = None  # ownership transferred
            else:
                print(f"[dubbing] Duration within 5% (tempo={tempo:.3f}x) — no adjustment needed.")



        # ── 5. Replace audio track with ffmpeg-python ──────────────────────────
        print(f"[dubbing] Muxing original video with dubbed audio → {output_path}")
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

        try:
            video_stream = ffmpeg.input(clip_path).video
            audio_in = ffmpeg.input(tmp_audio_path).audio
            ffmpeg.output(
                video_stream,
                audio_in,
                output_path,
                vcodec="copy",
                acodec="aac",
                shortest=None,
            ).run(overwrite_output=True, quiet=True)
        except ffmpeg.Error as e:
            print("FFmpeg mux failed:", e.stderr.decode() if e.stderr else str(e))
            raise
    finally:
        for p in [tmp_audio_path, tmp_adjusted_path]:
            if p and os.path.exists(p):
                os.remove(p)

    # ── 5. Return output path ─────────────────────────────────────────────
    print(f"[dubbing] Done → {output_path}")
    return output_path


if __name__ == "__main__":
    result = dub_clip(
        "test_clips/sample.mp4",
        target_lang="es",
        output_path="outputs/dubbed_es.mp4",
    )
    print("Done:", result)
