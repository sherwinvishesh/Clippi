import os
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"
import torch
import time
import sys
import json
import re
import base64
import cv2
import weave
import numpy as np
import subprocess
import threading
from dotenv import load_dotenv
from mistralai import Mistral

# Lazy import — resolved inside get_masks_for_video so a missing SAM2
# package or bad CUDA init doesn't crash the whole module at import time.
_build_sam2_video_predictor = None

# --- Rate limiter for Mistral vision API ---
_rate_lock = threading.Lock()
_last_request_time = 0.0
_MIN_INTERVAL = 5.0  # seconds between requests (~12 RPM, conservative for pixtral)

def _mistral_call(client, **kwargs):
    """Make a Mistral API call with proactive pacing and exponential backoff on 429."""
    global _last_request_time
    with _rate_lock:
        gap = _MIN_INTERVAL - (time.time() - _last_request_time)
        if gap > 0:
            time.sleep(gap)
        _last_request_time = time.time()

    for backoff in [15, 30, 60]:
        try:
            return client.chat.complete(**kwargs)
        except Exception as e:
            if "429" in str(e):
                print(f"Rate limited — waiting {backoff}s...")
                time.sleep(backoff)
                with _rate_lock:
                    _last_request_time = time.time()
            else:
                raise
    raise RuntimeError("Exceeded rate limit retries")

from pathlib import Path
_BASE_DIR = Path(__file__).resolve().parent.parent
CHECKPOINT = str(_BASE_DIR / "checkpoints/sam2.1_hiera_large.pt")
CONFIG = "configs/sam2.1/sam2.1_hiera_l.yaml"

@weave.op()
def locate_object_in_frame(frame: np.ndarray, object_description: str) -> dict | None:
    load_dotenv()
    client = Mistral(api_key=os.getenv("MISTRAL_API_KEY"))
    
    _, buffer = cv2.imencode('.jpg', frame)
    b64_string = base64.b64encode(buffer).decode('utf-8')
    
    prompt = f"""Analyze this image to locate: {object_description}
Step 1: Look closely at the image. Is there definitively a {object_description} visible?
Step 2: If the object is NOT present, you must return present: false. Do not mistake other objects for it.
Step 3: If it IS present, locate the most visually dominant one.

Return ONLY a valid JSON object. No markdown formatting, no backticks, no extra text.
Format:
{{
  "reasoning": "brief explanation of what you see and why it matches or doesn't match the description",
  "present": true/false,
  "x": 0.0,
  "y": 0.0,
  "w": 0.0,
  "h": 0.0
}}
x and y are the top-left corner. All values must be normalized between 0.0 and 1.0.
The bounding box must be tight around the {object_description} ONLY."""

    for attempt in range(3):
        try:
            response = _mistral_call(
                client,
                model="mistral-small-2506",
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": f"data:image/jpeg;base64,{b64_string}"}
                    ]
                }]
            )
            raw = response.choices[0].message.content.strip()
            print(f"Mistral raw response: {raw}")
            
            if raw.lower() == "null" or raw.lower() == "none":
                return None
            
            # strip markdown backticks if present
            cleaned = re.sub(r'```json|```', '', raw).strip()
            
            # extract JSON object if there's surrounding text
            match = re.search(r'\{.*?\}', cleaned, re.DOTALL)
            if not match:
                print(f"Attempt {attempt+1}: no JSON found, retrying")
                continue
            
            bbox = json.loads(match.group())
            
            # Handle explicit "not present" flag
            if not bbox.get("present", True):
                return None
                
            # validate all keys exist and values are 0-1
            if all(k in bbox for k in ['x','y','w','h']) and \
               all(0.0 <= float(bbox[k]) <= 1.0 for k in ['x','y','w','h']):
                
                # Validation Pass: Crop the image and ask Mistral if it's correct
                h_img, w_img = frame.shape[:2]
                x1 = int(bbox['x'] * w_img)
                y1 = int(bbox['y'] * h_img)
                x2 = int((bbox['x'] + bbox['w']) * w_img)
                y2 = int((bbox['y'] + bbox['h']) * h_img)
                
                # Ensure crop bounds are valid
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w_img, x2), min(h_img, y2)
                
                if x2 > x1 and y2 > y1:
                    crop = frame[y1:y2, x1:x2]
                    _, crop_buffer = cv2.imencode('.jpg', crop)
                    crop_b64 = base64.b64encode(crop_buffer).decode('utf-8')
                    
                    validation_prompt = f"Does this image clearly show a {object_description}? Reply strictly with the word 'true' or 'false', nothing else."
                    
                    val_response = _mistral_call(
                        client,
                        model="mistral-small-2506",
                        messages=[{
                            "role": "user",
                            "content": [
                                {"type": "text", "text": validation_prompt},
                                {"type": "image_url", "image_url": f"data:image/jpeg;base64,{crop_b64}"}
                            ]
                        }]
                    )
                    
                    val_result = val_response.choices[0].message.content.strip().lower()
                    print(f"Validation pass for {object_description}: {val_result}")
                    if "true" in val_result and "false" not in val_result:
                        return bbox
                    else:
                        print(f"Mistral hallucinated the bounding box. Rejecting.")
                        return None
                        
                return bbox
            else:
                print(f"Attempt {attempt+1}: invalid bbox values {bbox}, retrying")
                
        except Exception as e:
            print(f"Attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(2)
    
    return None

def get_object_points(frame: np.ndarray, bbox: dict, object_description: str) -> tuple[list, list]:
    """
    Given a bbox, asks Pixtral for:
    - 3 positive points clearly INSIDE the object
    - 3 negative points clearly OUTSIDE the object (face, hands, background)
    Returns positive_points, negative_points as normalized coords
    """
    client = Mistral(api_key=os.getenv("MISTRAL_API_KEY"))
    _, buffer = cv2.imencode('.jpg', frame)
    b64 = base64.b64encode(buffer).decode('utf-8')
    
    prompt = f"""The bounding box for the {object_description} is:
x={bbox['x']:.2f}, y={bbox['y']:.2f}, w={bbox['w']:.2f}, h={bbox['h']:.2f}

Give me 3 points INSIDE the {object_description} and 3 points OUTSIDE it.
Points inside should be clearly on the {object_description} fabric/surface.
Points outside should be on skin, face, background — NOT on the {object_description}.

Return ONLY valid JSON:
{{
    "inside": [[x1,y1], [x2,y2], [x3,y3]],
    "outside": [[x1,y1], [x2,y2], [x3,y3]]
}}
All values normalized 0.0-1.0."""

    response = _mistral_call(
        client,
        model="mistral-small-2506",
        messages=[{"role": "user", "content": [
            {"type": "image_url", "image_url": f"data:image/jpeg;base64,{b64}"},
            {"type": "text", "text": prompt}
        ]}]
    )
    
    raw = response.choices[0].message.content.strip()
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if not match:
        return None, None
    try:
        data = json.loads(match.group())
        return data.get("inside"), data.get("outside")
    except Exception as e:
        print(f"Failed to parse object points JSON: {e}")
        return None, None

@weave.op()
def get_masks_for_video(video_path: str, bbox: dict, start_frame_idx: int = 0,
                        object_description: str = "object") -> dict[int, np.ndarray]:
    # Lazy import so a missing sam2 package or bad CUDA init doesn't crash the module
    global _build_sam2_video_predictor
    if _build_sam2_video_predictor is None:
        from sam2.build_sam import build_sam2_video_predictor as _fn
        _build_sam2_video_predictor = _fn

    if torch.cuda.is_available():
        device = torch.device("cuda")
    else:
        device = torch.device("cpu")
    print(f"Using device: {device}")

    predictor = _build_sam2_video_predictor(CONFIG, CHECKPOINT, device=device)

    autocast_dtype = torch.bfloat16 if device.type == "cuda" else torch.float32
    with torch.inference_mode(), torch.autocast(str(device), dtype=autocast_dtype):
        state = predictor.init_state(video_path=video_path)

        H = state["video_height"]
        W = state["video_width"]
        print(f"Video dimensions: {W}x{H}, total frames: {state['num_frames']}")

        # denormalize bbox from 0-1 to pixels
        x1 = bbox["x"] * W
        y1 = bbox["y"] * H
        x2 = (bbox["x"] + bbox["w"]) * W
        y2 = (bbox["y"] + bbox["h"]) * H
        box = np.array([x1, y1, x2, y2], dtype=np.float32)

        # Optionally get positive/negative points from VLM to improve mask quality.
        # Wrapped in try/except so a VLM timeout or rate-limit never blocks SAM2.
        all_points = []
        all_labels = []
        try:
            cap = cv2.VideoCapture(video_path)
            cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame_idx)
            ret, frame = cap.read()
            cap.release()

            if ret:
                inside_pts, outside_pts = get_object_points(frame, bbox, object_description)
                if inside_pts:
                    for p in inside_pts:
                        all_points.append([p[0] * W, p[1] * H])
                        all_labels.append(1)
                if outside_pts:
                    for p in outside_pts:
                        all_points.append([p[0] * W, p[1] * H])
                        all_labels.append(0)
        except Exception as e:
            print(f"  [SAM2] get_object_points failed ({e}) — using bbox only")
            all_points = []
            all_labels = []

        # Send box and (optionally) VLM points to SAM2
        if all_points:
            print(f"  [SAM2] Adding bbox + {len([l for l in all_labels if l==1])} pos / {len([l for l in all_labels if l==0])} neg points...")
            predictor.add_new_points_or_box(
                inference_state=state,
                frame_idx=start_frame_idx,
                obj_id=1,
                box=box,
                points=np.array(all_points, dtype=np.float32),
                labels=np.array(all_labels, dtype=np.int32)
            )
        else:
            print(f"  [SAM2] Adding bbox ONLY to SAM2...")
            predictor.add_new_points_or_box(
                inference_state=state,
                frame_idx=start_frame_idx,
                obj_id=1,
                box=box
            )

        masks = {}

        def process_mask_logits(frame_idx, mask_logits):
            logit = mask_logits[0]  # shape [1, H, W]
            # SAM2 logits are raw scores — a pixel is foreground when logit > 0.
            # We use the mask directly without a confidence threshold, because
            # even moderate logit values (e.g. 0.1) produce valid masks.
            # Only produce an empty mask when nothing is above the decision boundary.
            mask = (logit > 0.0).cpu().numpy().squeeze().astype(bool)
            masks[frame_idx] = mask
            if frame_idx % 50 == 0:
                pixel_count = mask.sum()
                print(f"  [SAM2] Frame {frame_idx}/{state['num_frames']}: {pixel_count} masked pixels "
                      f"(max logit: {logit.max().item():.2f})")

        # Propagate backward then forward from the anchor frame
        print("  [SAM2] Propagating backwards...")
        for frame_idx, obj_ids, mask_logits in predictor.propagate_in_video(
                state, start_frame_idx=start_frame_idx, reverse=True):
            process_mask_logits(frame_idx, mask_logits)

        print("  [SAM2] Propagating forwards...")
        for frame_idx, obj_ids, mask_logits in predictor.propagate_in_video(
                state, start_frame_idx=start_frame_idx, reverse=False):
            process_mask_logits(frame_idx, mask_logits)

        print(f"  [SAM2] Generated masks for {len(masks)} frames")
        return masks

@weave.op()
def locate_object_in_video(clip_path: str, object_description: str) -> tuple[dict, int] | tuple[None, None]:
    from segmentation.frames import extract_keyframes
    
    keyframes = extract_keyframes(clip_path, n=10)
    for frame_idx, frame in keyframes:
        print(f"Scanning frame {frame_idx} for '{object_description}'...")
        bbox = locate_object_in_frame(frame, object_description)
        if bbox is not None:
            bbox["object_description"] = object_description
            print(f"Found '{object_description}' at frame {frame_idx}: {bbox}")
            return bbox, frame_idx
    
    print(f"'{object_description}' not found in any keyframe")
    return None, None

def fallback_propagate_mask(frames: list[np.ndarray], initial_mask: np.ndarray) -> dict[int, np.ndarray]:
    pass

if __name__ == "__main__":
    import subprocess
    load_dotenv()
    if len(sys.argv) < 3:
        print("Usage: python sam2_predictor.py <image_or_video_path> <object_description>")
        sys.exit(1)

    input_path = sys.argv[1]
    object_description = sys.argv[2]

    if input_path.endswith('.mp4'):
        video_path = input_path
        bbox, found_frame = locate_object_in_video(video_path, object_description)
        if bbox is None:
            print("Object not found in any frame")
            sys.exit(1)
            
        cap = cv2.VideoCapture(input_path)
        cap.set(cv2.CAP_PROP_POS_FRAMES, found_frame)
        ret, frame = cap.read()
        cap.release()
        
        frames = []
        cap = cv2.VideoCapture(input_path)
        while True:
            ret, f = cap.read()
            if not ret: break
            frames.append(f)
        cap.release()
    else:
        frame = cv2.imread(input_path)
        if frame is None:
            print(f"Failed to load {input_path}")
            sys.exit(1)
        frames = [frame]
        bbox = locate_object_in_frame(frame, object_description)

    print(f"Result: {bbox}")

    if bbox:
        h, w = frame.shape[:2]
        x1 = int(bbox['x'] * w)
        y1 = int(bbox['y'] * h)
        x2 = int((bbox['x'] + bbox['w']) * w)
        y2 = int((bbox['y'] + bbox['h']) * h)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 3)
        os.makedirs('./outputs', exist_ok=True)
        cv2.imwrite('./outputs/bbox_test.jpg', frame)
        print("Saved → ./outputs/bbox_test.jpg")
        if sys.platform == "darwin":
            subprocess.run(["open", "./outputs/bbox_test.jpg"])

        if video_path:
            masks = get_masks_for_video(video_path, bbox, start_frame_idx=found_frame)
            
            # Write the full video out to outputs/masked_video.mp4 using ffmpeg for h264 encoding
            out_file = "./outputs/masked_video.mp4"
            print(f"Writing final video to {out_file} (h264)...")
            
            # Use original Video capture to get FPS
            cap = cv2.VideoCapture(video_path)
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            cap.release()
            
            # Start ffmpeg subprocess to write raw frames exactly as OpenCV format (BGR)
            ffmpeg_cmd = [
                'ffmpeg', '-y',
                '-f', 'rawvideo',
                '-vcodec', 'rawvideo',
                '-s', f'{w}x{h}',
                '-pix_fmt', 'bgr24',
                '-r', str(fps),
                '-i', '-',
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-preset', 'fast',
                '-crf', '23',
                out_file
            ]
            
            process = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

            for frame_idx, frame_data in enumerate(frames):
                if frame_idx in masks:
                    mask = masks[frame_idx]
                    # Create green overlay
                    overlay = frame_data.copy()
                    overlay[mask] = (overlay[mask] * 0.5 + np.array([0, 255, 0]) * 0.5).astype(np.uint8)
                    process.stdin.write(overlay.tobytes())
                else:
                    process.stdin.write(frame_data.tobytes())
                    
            process.stdin.close()
            process.wait()
            print("Done generating masked video!")
            
            if sys.platform == "darwin":
                subprocess.run(["open", out_file])
    else:
        print("Object not found")
