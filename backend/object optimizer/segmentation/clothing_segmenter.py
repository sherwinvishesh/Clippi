import cv2
import numpy as np
import torch
from transformers import SegformerImageProcessor, AutoModelForSemanticSegmentation
from PIL import Image

# Mapping user descriptions to model labels
# The mattmdjaga/segformer_b2_clothes model has 18 classes:
# 0: Background, 1: Hat, 2: Hair, 3: Sunglasses, 4: Upper-clothes, 5: Skirt, 6: Pants, 
# 7: Dress, 8: Belt, 9: Left-shoe, 10: Right-shoe, 11: Face, 12: Left-leg, 13: Right-leg, 
# 14: Left-arm, 15: Right-arm, 16: Bag, 17: Scarf
LABEL_MAPPING = {
    "hat": [1],
    "hair": [2],
    "sunglasses": [3],
    "upper": [4], "shirt": [4], "top": [4], "jacket": [4], "coat": [4],
    "skirt": [5],
    "pants": [6], "trousers": [6],
    "dress": [7],
    "belt": [8],
    "shoe": [9, 10], "shoes": [9, 10],
    "face": [11],
    "leg": [12, 13], "legs": [12, 13],
    "arm": [14, 15], "arms": [14, 15],
    "bag": [16],
    "scarf": [17],
    "person": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17],
    "clothing": [1,3,4,5,6,7,8,9,10,16,17],
    "body": [2,11,12,13,14,15]
}

def get_target_labels(object_description: str) -> list[int]:
    desc_lower = object_description.lower()
    target_labels = set()
    
    for key, labels in LABEL_MAPPING.items():
        if key in desc_lower:
            target_labels.update(labels)
            
    if not target_labels:
        print(f"  Warning: Could not map '{object_description}' to specific Segformer label. Defaulting to upper-clothes.")
        return [4]  # Default to upper-clothes
        
    return list(target_labels)

def get_masks_for_video(frames: list, object_description: str) -> tuple[dict[int, np.ndarray], bool]:
    """
    Segment clothing items across all frames using SegFormer.
    Returns a dictionary mapping frame indices to boolean masks.
    """
    target_labels = get_target_labels(object_description)
    print(f"  SegFormer targeting labels: {target_labels} for '{object_description}'")
    
    print("  Loading SegFormer model...")
    processor = SegformerImageProcessor.from_pretrained("mattmdjaga/segformer_b2_clothes")
    model = AutoModelForSemanticSegmentation.from_pretrained("mattmdjaga/segformer_b2_clothes")
    
    if torch.cuda.is_available():
        device = "cuda"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
        
    model.to(device)
    
    masks_dict = {}
    print(f"  Segmenting {len(frames)} frames with SegFormer on {device}...")
    
    BATCH_SIZE = 8
    
    for i in range(0, len(frames), BATCH_SIZE):
        batch_frames = frames[i:i+BATCH_SIZE]
        images = [Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB)) for f in batch_frames]
        
        inputs = processor(images=images, return_tensors="pt").to(device)
        
        with torch.no_grad():
            outputs = model(**inputs)
            
        logits = outputs.logits.cpu()
        target_size = images[0].size[::-1] # (height, width)
        
        upsampled_logits = torch.nn.functional.interpolate(
            logits,
            size=target_size,
            mode="bilinear",
            align_corners=False,
        )
        
        pred_segs = upsampled_logits.argmax(dim=1).numpy()
        
        for j, pred_seg in enumerate(pred_segs):
            mask = np.isin(pred_seg, target_labels)
            masks_dict[i + j] = mask
            
        print(f"    Processed {min(i + BATCH_SIZE, len(frames))}/{len(frames)} frames...")

    # Apply temporal majority voting (median filter) to fix random frame dropouts
    print("  Applying temporal smoothing to masks...")
    smoothed_masks = {}
    num_frames = len(frames)
    window_size = 5
    
    for i in range(num_frames):
        start_idx = max(0, i - window_size // 2)
        end_idx = min(num_frames - 1, i + window_size // 2)
        
        window_masks = [masks_dict[j] for j in range(start_idx, end_idx + 1)]
        
        if len(window_masks) >= 3:
            stacked = np.stack(window_masks, axis=0)
            majority_threshold = len(window_masks) // 2
            smoothed_masks[i] = (np.sum(stacked, axis=0) > majority_threshold)
        else:
            smoothed_masks[i] = masks_dict[i]
            
    return smoothed_masks, False
