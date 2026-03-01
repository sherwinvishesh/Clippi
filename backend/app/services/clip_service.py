import os, uuid, ffmpeg
from pathlib import Path

OUTPUT_DIR = "outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)


class ClipService:
    # In-memory registry: clip_id → {source_path, start_sec, end_sec}
    _registry: dict = {}

    @classmethod
    def register(cls, clip_id: str, source_path: str, start_sec: float, end_sec: float):
        """Call this after analysis so the service knows where each clip lives."""
        cls._registry[clip_id] = {
            "source":    source_path,
            "start_sec": start_sec,
            "end_sec":   end_sec,
        }

    async def export(self, clip_id: str, options: dict) -> dict:
        info = self._registry.get(clip_id)

        if not info:
            # Graceful fallback — return a stub so the UI doesn't break
            out_path = os.path.join(OUTPUT_DIR, f"{clip_id}_{uuid.uuid4().hex[:6]}.{options['format']}")
            return {
                "clip_id":     clip_id,
                "output_path": out_path,
                "status":      "stub — clip not registered yet",
                "options":     options,
            }

        out_path = os.path.join(
            OUTPUT_DIR,
            f"{clip_id}_{uuid.uuid4().hex[:6]}.{options['format']}",
        )
        duration = info["end_sec"] - info["start_sec"]

        (
            ffmpeg
            .input(info["source"], ss=info["start_sec"], t=duration)
            .output(out_path, vcodec="libx264", acodec="aac")
            .overwrite_output()
            .run(quiet=True)
        )

        return {
            "clip_id":     clip_id,
            "output_path": out_path,
            "status":      "exported",
            "options":     options,
        }