import os, base64, json, re
from dotenv import load_dotenv

load_dotenv()


class MistralService:
    def __init__(self):
        api_key    = os.getenv("MISTRAL_API_KEY", "")
        self.client = None

        if api_key:
            from mistralai import Mistral
            self.client = Mistral(api_key=api_key)

        wb_key = os.getenv("WANDB_API_KEY", "")
        if wb_key:
            import weave
            weave.init("clippi")

    async def suggest_clips(self, frame_paths: list[str], video_path: str) -> list[dict]:
        """
        Send sampled frames to Mistral Pixtral and get clip suggestions.
        Falls back to a placeholder list when no API key is configured.
        """
        if not self.client:
            # Placeholder so the app works before you add a key
            return [
                {
                    "id":        "clip_0",
                    "start_sec": 0,
                    "end_sec":   10,
                    "label":     "Sample Clip",
                    "reason":    "No API key set – this is a placeholder",
                    "score":     0.9,
                }
            ]

        # Use up to 10 frames to stay within token limits
        sample = frame_paths[:10]
        content: list = [
            {
                "type": "text",
                "text": (
                    "You are a professional video editor. "
                    "Analyze these frames and identify the most engaging or shareable segments. "
                    "For each segment return a JSON object with keys: "
                    "start_sec, end_sec, label, reason, score (0-1). "
                    "Return a JSON array only — no markdown, no extra text."
                ),
            }
        ]

        for fp in sample:
            with open(fp, "rb") as f:
                b64 = base64.b64encode(f.read()).decode()
            content.append({
                "type":      "image_url",
                "image_url": f"data:image/jpeg;base64,{b64}",
            })

        resp = self.client.chat.complete(
            model="pixtral-12b-2409",
            messages=[{"role": "user", "content": content}],
        )
        raw      = resp.choices[0].message.content
        json_str = re.search(r'\[.*\]', raw, re.DOTALL)

        if json_str:
            clips = json.loads(json_str.group())
            return [{"id": f"clip_{i}", **c} for i, c in enumerate(clips)]

        return []