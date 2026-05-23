import os
import cv2
import numpy as np

# clothing/body items → use SegFormer
CLOTHING_ITEMS = {
    "shirt", "top", "upper", "jacket", "coat", "dress", "pants",
    "trousers", "skirt", "hat", "scarf", "shoes", "hair", "face",
    "arms", "hands", "clothing", "outfit"
}

# YOLO class names (COCO dataset — 80 classes) + common aliases
# These are SIMPLE, unqualified names that YOLO can match directly.
# Descriptive queries ("blue car", "girl in yellow") go through VLM instead.
YOLO_OBJECTS = {
    "truck", "car", "bus", "motorcycle", "bicycle", "boat",
    "dog", "cat", "bird", "horse", "cow", "elephant",
    "chair", "couch", "table", "tv", "laptop", "phone",
    "bottle", "cup", "book", "clock", "vase", "umbrella",
    "backpack", "handbag", "tie", "suitcase", "ball",
    "person",
    # person-type nouns — all alias to YOLO "person" class in yolo_sam2.py
    "man", "woman", "girl", "boy", "child", "kid", "guy", "lady",
    "human", "athlete", "player",
    # vehicle aliases
    "taxi", "cab", "sedan", "suv", "jeep", "van", "minivan",
    "pickup", "lorry", "semi", "tram", "streetcar",
    "motorbike", "moped",
    # animal aliases
    "puppy", "kitten",
    # furniture/electronics aliases
    "sofa", "settee", "television", "monitor", "cellphone", "mobile",
}


def classify_object_type(object_description: str) -> str:
    desc_lower = object_description.lower()
    for item in CLOTHING_ITEMS:
        if item in desc_lower:
            return "clothing"
    for item in YOLO_OBJECTS:
        if item in desc_lower:
            return "yolo"
    return "yolo"  # default to YOLO for unknown objects


def get_masks_auto(frames: list, object_description: str,
                   video_path: str = None) -> tuple[dict[int, np.ndarray], bool]:
    """
    Automatically picks the best segmentation method.

    Routing priority:
      1. Clothing keywords → SegFormer (pixel-accurate fabric segmentation)
      2. Descriptive / relational queries → Mistral VLM spatial reasoning → SAM2
         This covers: colors ("girl in yellow"), spatial ("person on the left"),
         appearance ("tall man"), action ("person holding the cup"), etc.
      3. Simple YOLO class names → YOLO detection → SAM2 tracking

    Returns (masks_dict, use_hue_filter).
    """
    from segmentation.relationship_resolver import needs_vlm, resolve_relationship_in_video

    desc_lower = object_description.lower()

    # ── Step 1: clothing → SegFormer ─────────────────────────────────────────
    for item in CLOTHING_ITEMS:
        if item in desc_lower:
            print(f"  [Router] Clothing item detected: '{object_description}' → SegFormer")
            from segmentation.clothing_segmenter import get_masks_for_video
            return get_masks_for_video(frames, object_description)

    # ── Step 2: descriptive / relational → VLM spatial reasoning ─────────────
    if needs_vlm(object_description):
        print(f"  [Router] Descriptive/relational query: '{object_description}'")
        print(f"  [Router] Using Mistral VLM spatial reasoning layer...")

        bbox, found_frame = resolve_relationship_in_video(video_path, object_description)

        if bbox is None:
            print(f"  [Router] VLM could not resolve — falling back to YOLO on core noun...")
            core_object = extract_core_object(object_description)
            from segmentation.yolo_sam2 import get_masks_yolo_sam2
            masks = get_masks_yolo_sam2(frames, video_path, core_object)
            return masks, True

        # VLM resolved a bbox — check if the core object is clothing (SegFormer)
        # or a general object (SAM2)
        core_object = extract_core_object(object_description)
        print(f"  [Router] Core object extracted: '{core_object}'")

        if classify_object_type(core_object) == "clothing":
            from segmentation.clothing_segmenter import get_masks_for_video
            masks, use_hue = get_masks_for_video(frames, core_object)
            masks = constrain_masks_to_bbox(masks, bbox, frames[0].shape, padding=0.05)
            return masks, use_hue
        else:
            # Hand VLM bbox directly to SAM2 for precise pixel tracking
            try:
                from segmentation.sam2_predictor import get_masks_for_video
                print(f"  [Router] Handing VLM bbox to SAM2 for tracking...")
                return get_masks_for_video(video_path, bbox, start_frame_idx=found_frame,
                                           object_description=object_description), True
            except (ImportError, Exception) as e:
                print(f"  [Router] SAM2 unavailable ({e}), using VLM-anchored YOLO fallback...")
                from segmentation.yolo_sam2 import get_masks_yolo_sam2
                # Pass VLM bbox as anchor so YOLO picks the right person per frame
                masks = get_masks_yolo_sam2(frames, video_path, core_object, anchor_bbox=bbox)
                return masks, True

    # ── Step 3: simple YOLO class name → YOLO + SAM2 ─────────────────────────
    print(f"  [Router] Simple object: '{object_description}' → YOLO + SAM2")
    from segmentation.yolo_sam2 import get_masks_yolo_sam2
    masks = get_masks_yolo_sam2(frames, video_path, object_description)
    return masks, True


def extract_core_object(description: str) -> str:
    """
    Extract the core noun from any description.
    'person closest to camera' → 'person'
    'biggest truck on the left' → 'truck'
    'girl in yellow'            → 'person'
    'shirt worn by the man'     → 'shirt'
    """
    from mistralai import Mistral

    client = Mistral(api_key=os.getenv("MISTRAL_API_KEY"))
    response = client.chat.complete(
        model="mistral-small-latest",
        messages=[{
            "role": "user",
            "content": (
                f"Extract just the core object category noun from this description: \"{description}\"\n"
                "Return ONLY the single noun, nothing else.\n"
                "Examples:\n"
                "\"person closest to camera\" → person\n"
                "\"biggest truck on the left\" → truck\n"
                "\"the one holding the bag\" → person\n"
                "\"shirt worn by the sitting man\" → shirt\n"
                "\"girl in yellow\" → person\n"
                "\"blue car on the right\" → car\n"
                "\"man in red shirt\" → person\n\n"
                f"Description: \"{description}\"\n"
                "Core noun:"
            )
        }]
    )
    return response.choices[0].message.content.strip().lower()


def constrain_masks_to_bbox(masks: dict, bbox: dict, frame_shape: tuple, padding: float = 0.05) -> dict:
    """
    Zero out mask pixels outside the resolved bbox region.
    Used when SegFormer finds all shirts but we only want the one
    matching the relational/descriptive query.
    """
    H, W = frame_shape[:2]
    x1 = max(0, int((bbox["x"] - padding) * W))
    y1 = max(0, int((bbox["y"] - padding) * H))
    x2 = min(W, int((bbox["x"] + bbox["w"] + padding) * W))
    y2 = min(H, int((bbox["y"] + bbox["h"] + padding) * H))

    region = np.zeros((H, W), dtype=bool)
    region[y1:y2, x1:x2] = True

    constrained = {}
    for i, mask in masks.items():
        constrained[i] = mask & region

    return constrained
