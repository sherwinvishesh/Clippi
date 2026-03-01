import os
import base64
import re
import json
import cv2
import numpy as np
import torch
from ultralytics import YOLO

# ── SAM2 availability check (lazy — only imported when actually needed) ────────
try:
    from segmentation.sam2_predictor import get_masks_for_video as _sam2_get_masks
    SAM2_AVAILABLE = True
    print("  [yolo_sam2] SAM2 available ✓")
except (ImportError, Exception) as _e:
    SAM2_AVAILABLE = False
    _sam2_get_masks = None
    print(f"  [yolo_sam2] SAM2 not available ({_e}) — will use YOLO-only fallback")

# Maps common user terms to their YOLO/COCO class equivalents
OBJECT_ALIASES = {
    # Person-type nouns — all map to YOLO "person" class
    "man":       ["person"],
    "woman":     ["person"],
    "girl":      ["person"],
    "boy":       ["person"],
    "child":     ["person"],
    "kid":       ["person"],
    "guy":       ["person"],
    "lady":      ["person"],
    "human":     ["person"],
    "athlete":   ["person"],
    "player":    ["person"],
    "dancer":    ["person"],
    "runner":    ["person"],
    # Vehicle aliases
    "taxi":      ["car"],
    "cab":       ["car"],
    "sedan":     ["car"],
    "suv":       ["car"],
    "jeep":      ["car"],
    "van":       ["car", "truck"],
    "minivan":   ["car"],
    "pickup":    ["truck"],
    "lorry":     ["truck"],
    "semi":      ["truck"],
    "tram":      ["bus"],
    "streetcar": ["bus"],
    "motorbike": ["motorcycle"],
    "moped":     ["motorcycle"],
    # Animal aliases
    "puppy":     ["dog"],
    "kitten":    ["cat"],
    "canine":    ["dog"],
    "feline":    ["cat"],
    # Furniture/electronics aliases
    "sofa":      ["couch"],
    "settee":    ["couch"],
    "television":["tv"],
    "monitor":   ["tv"],
    "cellphone": ["cell phone"],
    "mobile":    ["cell phone"],
}

def _matches(class_name: str, description: str) -> bool:
    """
    Check if a YOLO class name matches the user's object description,
    accounting for aliases (e.g. 'taxi' → 'car').
    """
    desc = description.lower()
    cls = class_name.lower()

    # direct: YOLO class word appears in description
    if any(word in desc for word in cls.split()):
        return True

    # alias: a user term in the description maps to this YOLO class
    for alias, yolo_classes in OBJECT_ALIASES.items():
        if alias in desc and cls in yolo_classes:
            return True

    return False


def _bbox_to_mask(frame: np.ndarray, bbox: dict) -> np.ndarray:
    """Convert a normalized bbox dict to a rectangular binary mask."""
    h, w = frame.shape[:2]
    mask = np.zeros((h, w), dtype=bool)
    x1 = max(0, int(bbox["x"] * w))
    y1 = max(0, int(bbox["y"] * h))
    x2 = min(w, int((bbox["x"] + bbox["w"]) * w))
    y2 = min(h, int((bbox["y"] + bbox["h"]) * h))
    mask[y1:y2, x1:x2] = True
    return mask


def _bbox_center(bbox: dict) -> tuple[float, float]:
    """Return the (cx, cy) centre of a normalised bbox dict."""
    return bbox["x"] + bbox["w"] / 2, bbox["y"] + bbox["h"] / 2


def _center_dist(a: dict, b: dict) -> float:
    ax, ay = _bbox_center(a)
    bx, by = _bbox_center(b)
    return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5


def _verify_yolo_pick(frame: np.ndarray, bbox: dict, object_description: str) -> bool:
    """
    Crops the YOLO-detected bbox region from the frame (with padding for context)
    and asks Mistral VLM whether it actually matches object_description.

    Returns True if confirmed, False if it's the wrong target.
    Only called when multiple YOLO candidates exist and an anchor is available,
    to prevent picking an adjacent person/object over the intended one.
    """
    from mistralai import Mistral

    h, w = frame.shape[:2]
    x1 = max(0, int(bbox["x"] * w))
    y1 = max(0, int(bbox["y"] * h))
    x2 = min(w, int((bbox["x"] + bbox["w"]) * w))
    y2 = min(h, int((bbox["y"] + bbox["h"]) * h))

    # 20% padding so VLM has visual context (color, clothing, etc.)
    pad_x = max(10, int((x2 - x1) * 0.2))
    pad_y = max(10, int((y2 - y1) * 0.2))
    cx1, cy1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
    cx2, cy2 = min(w, x2 + pad_x), min(h, y2 + pad_y)
    crop = frame[cy1:cy2, cx1:cx2]

    if crop.size == 0:
        return True  # can't crop, give benefit of the doubt

    _, buffer = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
    b64 = base64.b64encode(buffer).decode()

    client = Mistral(api_key=os.getenv("MISTRAL_API_KEY"))
    prompt = (
        f'Does this cropped image clearly show "{object_description}"?\n'
        'Return ONLY valid JSON: {"match": true/false, "confidence": 0.0-1.0, "reason": "brief"}'
    )

    try:
        response = client.chat.complete(
            model="mistral-small-latest",
            messages=[{"role": "user", "content": [
                {"type": "image_url", "image_url": f"data:image/jpeg;base64,{b64}"},
                {"type": "text", "text": prompt}
            ]}]
        )
        raw = response.choices[0].message.content.strip()
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if not m:
            return True  # parse failure — don't block
        data = json.loads(m.group())
        match = bool(data.get("match", True))
        confidence = float(data.get("confidence", 0.5))
        reason = data.get("reason", "")
        print(f"  [VLM-verify] match={match} conf={confidence:.2f} — {reason}")
        return match and confidence >= 0.4
    except Exception as e:
        print(f"  [VLM-verify] Error ({e}), assuming match")
        return True  # don't block on API errors


def _yolo_only_masks(frames: list, yolo: YOLO, object_description: str,
                     anchor_bbox: dict | None = None) -> dict[int, np.ndarray]:
    """
    Fallback when SAM2 is unavailable.
    Runs YOLO on every frame and converts the detected bbox to a mask.

    anchor_bbox (optional): a VLM-resolved bbox that anchors which detection to
    use when multiple candidates exist (e.g. multiple people detected). We pick
    the YOLO detection whose centre is closest to the anchor, rather than always
    taking the first match. Falls back to the last-known bbox for missed frames.
    """
    print(f"  [YOLO-only] Generating masks for '{object_description}' across {len(frames)} frames...")
    if anchor_bbox:
        cx, cy = _bbox_center(anchor_bbox)
        print(f"  [YOLO-only] Anchor bbox from VLM: centre=({cx:.2f}, {cy:.2f})")

    masks = {}
    last_bbox = anchor_bbox  # seed with VLM bbox so first frame already has a position
    vlm_verified = False      # True once VLM has confirmed the correct candidate

    for i, frame in enumerate(frames):
        results = yolo(frame, verbose=False)
        candidates = []

        for result in results:
            for box in result.boxes:
                class_name = yolo.names[int(box.cls)].lower()
                if _matches(class_name, object_description):
                    h, w = frame.shape[:2]
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    det = {"x": float(x1/w), "y": float(y1/h),
                           "w": float((x2-x1)/w), "h": float((y2-y1)/h)}
                    candidates.append(det)

        frame_bbox = None
        if candidates:
            if last_bbox:
                # Sort by proximity to last known position
                sorted_cands = sorted(candidates, key=lambda d: _center_dist(d, last_bbox))

                # VLM verification: on the FIRST frame with multiple candidates
                # and a VLM anchor, check that YOLO picked the right person/object
                if anchor_bbox and not vlm_verified and len(candidates) > 1:
                    print(f"  [VLM-verify] {len(candidates)} candidates on frame {i} — verifying YOLO pick...")
                    for cand in sorted_cands:
                        cx, cy = _bbox_center(cand)
                        print(f"  [VLM-verify] Checking candidate at centre=({cx:.2f}, {cy:.2f})...")
                        if _verify_yolo_pick(frame, cand, object_description):
                            frame_bbox = cand
                            vlm_verified = True
                            print(f"  [VLM-verify] ✓ Correct target confirmed at centre=({cx:.2f}, {cy:.2f})")
                            break
                    if frame_bbox is None:
                        # All candidates rejected — use VLM anchor bbox directly
                        print(f"  [VLM-verify] All candidates rejected — using VLM anchor bbox directly")
                        frame_bbox = anchor_bbox
                        vlm_verified = True
                else:
                    frame_bbox = sorted_cands[0]
            else:
                frame_bbox = candidates[0]
            last_bbox = frame_bbox

        use_bbox = frame_bbox or last_bbox
        if use_bbox:
            masks[i] = _bbox_to_mask(frame, use_bbox)
        else:
            masks[i] = np.zeros(frame.shape[:2], dtype=bool)

        if i % 30 == 0 or i == len(frames) - 1:
            status = "detected" if frame_bbox else ("propagated" if last_bbox else "not found")
            print(f"  [YOLO-only] Frame {i+1}/{len(frames)} — {status}")

    return masks


def get_masks_yolo_sam2(frames: list, video_path: str,
                         object_description: str,
                         anchor_bbox: dict | None = None) -> dict[int, np.ndarray]:
    """
    Use YOLO to find the object bbox, then:
      - SAM2 (preferred): precise pixel-level tracking across all frames
      - YOLO-only (fallback): bbox-based mask per frame when SAM2 is absent

    anchor_bbox: optional VLM-resolved bbox to anchor YOLO candidate selection.
    When provided, YOLO picks the detection closest to this location per frame,
    preventing it from latching onto the wrong person/object in crowded scenes.
    """
    print(f"  Loading YOLO...")
    yolo = YOLO("yolo11n.pt")  # nano — fastest, downloads automatically

    # Find the object in keyframes using YOLO
    # When anchor_bbox is provided (from VLM), pick the candidate closest to it
    # rather than blindly taking the first detection (avoids wrong adjacent person).
    keyframe_indices = np.linspace(0, len(frames)-1, 10, dtype=int)
    bbox = None
    found_frame_idx = 0

    for idx in keyframe_indices:
        frame = frames[idx]
        results = yolo(frame, verbose=False)
        candidates = []

        for result in results:
            for box in result.boxes:
                class_name = yolo.names[int(box.cls)].lower()
                if _matches(class_name, object_description):
                    h, w = frame.shape[:2]
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    det = {
                        "x": float(x1/w), "y": float(y1/h),
                        "w": float((x2-x1)/w), "h": float((y2-y1)/h)
                    }
                    candidates.append((class_name, det))

        if candidates:
            if anchor_bbox and len(candidates) > 1:
                # Pick candidate closest to VLM-resolved anchor
                class_name, bbox = min(candidates, key=lambda c: _center_dist(c[1], anchor_bbox))
            else:
                class_name, bbox = candidates[0]
            found_frame_idx = int(idx)
            print(f"  YOLO found '{class_name}' at frame {idx}: {bbox}")
            break

    if bbox is None:
        print(f"  YOLO could not find '{object_description}' in any keyframe")
        if anchor_bbox:
            # VLM already found it — use that bbox as a static anchor for all frames
            print(f"  Using VLM anchor bbox as static fallback mask")
            return _yolo_only_masks(frames, yolo, object_description, anchor_bbox=anchor_bbox)
        return {i: np.zeros(frames[0].shape[:2], dtype=bool) for i in range(len(frames))}

    # Use anchor_bbox (from VLM) if provided, else use the YOLO-found bbox as anchor
    effective_anchor = anchor_bbox or bbox

    # ── SAM2 path (precise) ────────────────────────────────────────────────────
    if SAM2_AVAILABLE:
        print(f"  Handing off to SAM2 for precise per-pixel tracking...")
        try:
            return _sam2_get_masks(video_path, bbox, start_frame_idx=found_frame_idx,
                                   object_description=object_description)
        except Exception as e:
            print(f"  [WARN] SAM2 failed ({e}), falling back to YOLO-only masks...")

    # ── YOLO-only fallback ─────────────────────────────────────────────────────
    print(f"  Using YOLO-only mask fallback (SAM2 not available or failed)")
    return _yolo_only_masks(frames, yolo, object_description, anchor_bbox=effective_anchor)
