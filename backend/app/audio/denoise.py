import os
import tempfile
import weave
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
import ffmpeg

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

@weave.op()
def denoise_clip(clip_path: str, output_path: str) -> str:
    client = ElevenLabs(api_key=ELEVENLABS_API_KEY)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as raw_audio_tmp:
        raw_audio_path = raw_audio_tmp.name

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as clean_audio_tmp:
        clean_audio_path = clean_audio_tmp.name

    try:
        # Step 1: Extract audio from clip to temp WAV
        try:
            ffmpeg.input(clip_path).output(raw_audio_path, acodec='pcm_s16le', vn=None).run(
                overwrite_output=True, quiet=True
            )
        except ffmpeg.Error as e:
            print("FFmpeg audio extraction failed:", e.stderr.decode() if e.stderr else str(e))
            raise

        # Step 2: Read WAV bytes
        with open(raw_audio_path, "rb") as f:
            audio_bytes = f.read()

        # Step 3: Send to ElevenLabs Voice Isolator and consume generator into bytes
        result_generator = client.audio_isolation.stream(audio=audio_bytes)
        clean_audio_bytes = b"".join(result_generator)

        # Step 4: Write clean audio bytes to temp file
        with open(clean_audio_path, "wb") as f:
            f.write(clean_audio_bytes)

        # Step 5: Merge clean audio back into original video
        try:
            video_stream = ffmpeg.input(clip_path).video
            audio_stream = ffmpeg.input(clean_audio_path).audio
            ffmpeg.output(
                video_stream, audio_stream, output_path,
                vcodec="copy",
                acodec="aac"
            ).run(overwrite_output=True, quiet=True)
        except ffmpeg.Error as e:
            print("FFmpeg muxing failed:", e.stderr.decode() if e.stderr else str(e))
            raise

    finally:
        # Step 6: Clean up temp files
        if os.path.exists(raw_audio_path):
            os.remove(raw_audio_path)
        if os.path.exists(clean_audio_path):
            os.remove(clean_audio_path)

    # Step 7: Return output path
    return output_path

if __name__ == "__main__":
    result = denoise_clip("test_clips/sample.mp4", "outputs/denoised.mp4")
    print("Done:", result)
