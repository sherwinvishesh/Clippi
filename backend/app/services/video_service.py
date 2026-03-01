import cv2, os
from pathlib import Path
from app.services.mistral_service import MistralService


class VideoService:
    def __init__(self):
        self.mistral   = MistralService()
        self._clips_db = {}   # in-memory store; swap for a real DB later

    # ── metadata ────────────────────────────────────────────────────
    def extract_metadata(self, path: str) -> dict:
        cap      = cv2.VideoCapture(path)
        fps      = cap.get(cv2.CAP_PROP_FPS)
        frames   = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        width    = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = frames / fps if fps > 0 else 0
        cap.release()
        return {
            "fps":      fps,
            "duration": round(duration, 2),
            "width":    width,
            "height":   height,
        }

    # ── frame extraction ─────────────────────────────────────────────
    def extract_frames(self, path: str, interval_sec: float = 2.0) -> list[str]:
        """Pull one frame every `interval_sec` seconds and save as JPEG."""
        cap       = cv2.VideoCapture(path)
        fps       = cap.get(cv2.CAP_PROP_FPS)
        step      = max(1, int(fps * interval_sec))
        frame_dir = Path("uploads") / Path(path).stem / "frames"
        frame_dir.mkdir(parents=True, exist_ok=True)

        saved, frame_idx, total = [], 0, 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if total % step == 0:
                fpath = str(frame_dir / f"frame_{frame_idx:05d}.jpg")
                cv2.imwrite(fpath, frame)
                saved.append(fpath)
                frame_idx += 1
            total += 1
        cap.release()
        return saved

    # ── AI analysis ──────────────────────────────────────────────────
    async def analyze(self, video_id: str, path: str) -> dict:
        frames = self.extract_frames(path)
        clips  = await self.mistral.suggest_clips(frames, path)
        self._clips_db[video_id] = clips
        return {
            "video_id":    video_id,
            "clips_found": len(clips),
            "clips":       clips,
        }

    def get_clips(self, video_id: str) -> list:
        return self._clips_db.get(video_id, [])