import os, cv2, base64, re, json
import numpy as np
from mistralai import Mistral
from dotenv import load_dotenv
import weave

load_dotenv()

# ── Keyword sets ──────────────────────────────────────────────────────────────

# Relational: positional / comparative / gaze / action
SPATIAL_KEYWORDS  = ["closest", "nearest", "furthest", "farthest", "left", "right",
                     "center", "middle", "behind", "front", "top", "bottom", "corner",
                     "foreground", "background"]
SIZE_KEYWORDS     = ["biggest", "largest", "smallest", "tiniest", "huge", "tiny",
                     "tallest", "shortest", "widest"]
GAZE_KEYWORDS     = ["looking at", "pointing at", "facing", "staring at",
                     "watching", "aimed at"]
ACTION_KEYWORDS   = ["running", "sitting", "standing", "holding", "wearing",
                     "carrying", "walking", "jumping", "lying", "leaning",
                     "crouching", "dancing", "waving", "eating", "drinking"]

ALL_RELATIONAL_KEYWORDS = (SPATIAL_KEYWORDS + SIZE_KEYWORDS +
                            GAZE_KEYWORDS + ACTION_KEYWORDS)

# Descriptive: color / appearance attributes YOLO cannot filter on
COLOR_KEYWORDS = [
    "red", "blue", "green", "yellow", "white", "black", "pink", "orange",
    "purple", "brown", "gray", "grey", "silver", "gold", "cyan", "magenta",
    "beige", "turquoise", "maroon", "navy", "teal", "coral", "lime",
]
APPEARANCE_KEYWORDS = [
    "in a", "with a", "wearing a", "dressed in", "holding a",
    "tall", "short", "fat", "thin", "old", "young", "blonde", "dark",
    "light", "bright", "dark-haired", "curly", "bald",
]

# Person-type nouns that YOLO only knows as "person"
PERSON_NOUNS = [
    "man", "woman", "girl", "boy", "child", "kid", "guy", "lady",
    "human", "people", "crowd", "athlete", "player", "person",
    "figure", "individual", "someone", "dancer", "runner",
]


def is_relational(object_description: str) -> bool:
    """
    Detect if description uses positional / comparative / action language.
    'person closest to camera' → True
    'the one holding the bag' → True
    'shirt' → False
    """
    desc_lower = object_description.lower()
    return any(kw in desc_lower for kw in ALL_RELATIONAL_KEYWORDS)


def is_descriptive(object_description: str) -> bool:
    """
    Detect if description has color / appearance qualifiers that YOLO
    cannot resolve on its own, requiring VLM spatial reasoning.

    'girl in yellow'     → True  (color qualifier)
    'man in red shirt'   → True  (color + appearance)
    'the tall woman'     → True  (appearance)
    'man'                → False (simple person noun — YOLO alias handles it)
    'car'                → False (pure YOLO class)
    'blue car'           → True  (color qualifier on YOLO class)
    """
    desc_lower = object_description.lower()
    words = desc_lower.split()

    # Color word anywhere in description
    if any(c in desc_lower for c in COLOR_KEYWORDS):
        return True

    # Appearance qualifier phrases
    if any(a in desc_lower for a in APPEARANCE_KEYWORDS):
        return True

    # Person noun + any additional qualifier (more than one word)
    if any(p in desc_lower for p in PERSON_NOUNS) and len(words) > 1:
        return True

    return False


def needs_vlm(object_description: str) -> bool:
    """Single gate: does this description need VLM spatial reasoning?"""
    return is_relational(object_description) or is_descriptive(object_description)


def frame_to_b64(frame: np.ndarray) -> str:
    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buffer).decode()


@weave.op()
def resolve_relationship(frame: np.ndarray, object_description: str) -> dict | None:
    """
    Uses YOLO to propose bounding boxes, then Mistral VLM to select the ID.
    """
    client = Mistral(api_key=os.getenv("MISTRAL_API_KEY"))

    # 1. Run YOLO to get candidates
    try:
        from ultralytics import YOLO
        yolo_model = YOLO("yolo11n.pt")
        yolo_results = yolo_model(frame, verbose=False)
        has_boxes = len(yolo_results) > 0 and len(yolo_results[0].boxes) > 0
    except Exception as e:
        print(f"  [Relationship] YOLO warning: {e}")
        has_boxes = False

    # 2. Draw numbered boxes
    img_with_boxes = frame.copy()
    boxes_dict = {}
    
    if has_boxes:
        for i, box in enumerate(yolo_results[0].boxes):
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
            h, w = frame.shape[:2]
            class_name = yolo_model.names[int(box.cls)]
            boxes_dict[str(i)] = {"x": float(x1/w), "y": float(y1/h), "w": float((x2-x1)/w), "h": float((y2-y1)/h), "class": class_name}
            
            cv2.rectangle(img_with_boxes, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
            text = str(i)
            (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 1.2, 3)
            cv2.rectangle(img_with_boxes, (int(x1), int(y1)-th-10), (int(x1)+tw, int(y1)), (0, 0, 0), -1)
            cv2.putText(img_with_boxes, text, (int(x1), int(y1)-5), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)

    b64 = frame_to_b64(img_with_boxes if has_boxes else frame)

    # 3. Classify relationship type
    desc_lower = object_description.lower()
    if any(kw in desc_lower for kw in GAZE_KEYWORDS):
        rel_type = "gaze/pointing"
        hint = "Pay attention to eye direction, body orientation, and arm/finger pointing direction."
    elif any(kw in desc_lower for kw in ACTION_KEYWORDS):
        rel_type = "action"
        hint = "Look for the specific action or pose being performed."
    elif any(kw in desc_lower for kw in SIZE_KEYWORDS):
        rel_type = "size"
        hint = "Compare the sizes of all instances of this object type."
    elif any(c in desc_lower for c in COLOR_KEYWORDS):
        rel_type = "color/appearance"
        hint = "Focus on the specific color or visual attribute mentioned."
    elif any(a in desc_lower for a in APPEARANCE_KEYWORDS):
        rel_type = "appearance"
        hint = "Look for the specific visual appearance, clothing, or physical attribute described."
    else:
        rel_type = "spatial"
        hint = "Consider depth cues: objects closer to camera appear larger and lower in frame."

    boxes_info = ""
    if has_boxes:
        boxes_info = "Available Numbered Boxes:\\n" + "\\n".join(
            [f"- Box {idx}: {info['class']}" for idx, info in boxes_dict.items()]
        ) + "\\n"

    # 4. Prompt VLM
    prompt = f"""Analyze this image and locate: "{object_description}"

Relationship type: {rel_type}
Hint: {hint}

{boxes_info}
Instructions:
- If there are numbered green bounding boxes, pick the MOST LIKELY matching box ID with brief reasoning.
- DO NOT pick boxes belonging to accessories (like a handbag or tie) if looking for a person. Pick the person.
- If no numbered boxes match, or there are no boxes, return your own tight bounding box coordinates.
- If nothing matches at all, return found: false.

Return ONLY valid JSON:
{{
    "found": true/false,
    "reasoning": "brief explanation",
    "box_id": "the number string of the matching box if one matches (e.g. '0' or '2'), otherwise null",
    "bbox": {{"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0}} (fill this if box_id is null, otherwise null),
    "confidence": 0.0-1.0
}}

bbox values are normalized 0.0-1.0 where x,y is top-left corner."""

    response = client.chat.complete(
        model="mistral-small-latest",
        messages=[{"role": "user", "content": [
            {"type": "image_url", "image_url": f"data:image/jpeg;base64,{b64}"},
            {"type": "text", "text": prompt}
        ]}]
    )
    
    raw = response.choices[0].message.content.strip()
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if not match:
        return None
    
    data = json.loads(match.group())
    
    if not data.get("found"):
        print(f"  [Relationship] Not found: {data.get('reasoning', 'no reason given')}")
        return None
    
    bbox = None
    if data.get("box_id") is not None and str(data["box_id"]) in boxes_dict:
        selected_id = str(data["box_id"])
        selected_box = boxes_dict[selected_id]
        bbox = {"x": selected_box["x"], "y": selected_box["y"], "w": selected_box["w"], "h": selected_box["h"]}
        print(f"  [Relationship] Set-of-Mark resolved '{object_description}' to box {selected_id} ({selected_box['class']})")
    elif data.get("bbox") is not None:
        bbox = data["bbox"]
        print(f"  [Relationship] VLM estimated raw bounding box for '{object_description}'")
    else:
        print("  [Relationship] Invalid VLM response format")
        return None

    print(f"    Reasoning: {data['reasoning']}")
    print(f"    Confidence: {data['confidence']:.2f}")
    print(f"    Bbox: {bbox}")
    
    return bbox


@weave.op()
def resolve_relationship_in_video(clip_path: str, object_description: str) -> tuple[dict, int] | tuple[None, None]:
    """
    Scans keyframes to resolve relationship.
    Uses first frame where relationship is unambiguous.
    Returns (bbox, frame_idx).
    """
    from segmentation.frames import extract_keyframes
    
    keyframes = extract_keyframes(clip_path, n=8)
    
    # try middle frame first — usually most representative
    ordered = []
    mid = len(keyframes) // 2
    ordered.append(keyframes[mid])
    ordered.extend([kf for i, kf in enumerate(keyframes) if i != mid])
    
    for frame_idx, frame in ordered:
        print(f"  [Relationship] Scanning frame {frame_idx} for '{object_description}'...")
        bbox = resolve_relationship(frame, object_description)
        if bbox is not None:
            return bbox, frame_idx
    
    print(f"  [Relationship] Could not resolve '{object_description}' in any keyframe")
    return None, None
