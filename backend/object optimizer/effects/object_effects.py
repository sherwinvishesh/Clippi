import cv2
import numpy as np
import sys
import os
import weave

COLOR_HUE_MAP = {
    "red": 0, "orange": 15, "yellow": 30,
    "green": 60, "blue": 120, "purple": 150, "pink": 170
}

@weave.op()
def blur_background(frames: list, masks: dict, blur_strength: int = 51) -> list:
    result = []
    for i, frame in enumerate(frames):
        mask = masks.get(i, np.zeros(frame.shape[:2], dtype=bool))
        if not mask.any():
            result.append(frame)
            continue
        blurred = cv2.GaussianBlur(frame, (blur_strength, blur_strength), 0)
        mask_3ch = np.stack([mask]*3, axis=-1)
        result.append(np.where(mask_3ch, frame, blurred))
    return result

@weave.op()
def spotlight_object(frames: list, masks: dict, dim_factor: float = 0.25) -> list:
    result = []
    kernel = np.ones((5, 5), np.uint8)  # tightened from (20,20)
    for i, frame in enumerate(frames):
        mask = masks.get(i, np.zeros(frame.shape[:2], dtype=bool)).astype(np.uint8)
        if not mask.any():
            result.append(frame)
            continue
        dilated = cv2.dilate(mask, kernel, iterations=1)
        soft = cv2.GaussianBlur(dilated.astype(np.float32), (11, 11), 0)  # tightened from (21,21)
        soft = np.clip(soft, 0, 1)[:, :, None]
        dimmed = (frame * dim_factor).astype(np.uint8)
        blended = (frame * soft + dimmed * (1 - soft)).astype(np.uint8)
        result.append(blended)
    return result

@weave.op()
def recolor_object(frames: list, masks: dict, target_color: str, source_hue: int = None, hue_tolerance: int = 32, use_hue_filter: bool = True) -> list:
    target_color = target_color.lower()
    target_hue = COLOR_HUE_MAP.get(target_color, 0)
    is_black = target_color == "black"
    is_white = target_color == "white"
    is_gray = target_color in ["gray", "grey"]
    
    result = []
    locked_source_hue = source_hue
    
    if not use_hue_filter:
        locked_source_hue = None

    for i, frame in enumerate(frames):
        mask = masks.get(i, np.zeros(frame.shape[:2], dtype=bool))
        if not mask.any():
            result.append(frame)
            continue
            
        if not use_hue_filter:
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV).copy()
            
            # Fill holes in the mask to prevent white patches inside the clothing
            mask_uint8 = mask.astype(np.uint8) * 255
            
            # 1. Close small holes inside the mask
            kernel_close = np.ones((11, 11), np.uint8)
            mask_closed = cv2.morphologyEx(mask_uint8, cv2.MORPH_CLOSE, kernel_close)
            
            # 2. Fill any larger holes using contours
            contours, _ = cv2.findContours(mask_closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            mask_filled = np.zeros_like(mask_closed)
            cv2.drawContours(mask_filled, contours, -1, 255, -1)
            
            # Also apply a slight blur to the contour edges so they aren't jagged
            mask_smoothed = cv2.GaussianBlur(mask_filled, (5, 5), 0)
            
            mask = mask_smoothed > 127
            
            # To fix the uncolored white border (halo effect), we extend the mask SLIGHTLY
            # before we apply our feather blur. This ensures the edge of our color blend
            # covers the physical edge of the shirt.
            mask_uint8_hard = mask.astype(np.uint8) * 255
            kernel_dilate = np.ones((5, 5), np.uint8)
            mask_dilated = cv2.dilate(mask_uint8_hard, kernel_dilate, iterations=1)
            
            # Feather the edge of the *expanded* mask
            soft_mask = cv2.GaussianBlur(mask_dilated, (9, 9), 0).astype(np.float32) / 255.0
            
            # recolor: set hue, boost saturation for highlights
            hsv_recolored = hsv.copy()
            
            # We apply the math globally and let `soft_mask` do the blending,
            # which eliminates any abrupt "cutoff" seams at the edge of the active mask region.
            if is_black:
                hsv_recolored[:, :, 1] = np.clip(hsv[:, :, 1] * 0.2, 0, 255).astype(np.uint8)
                hsv_recolored[:, :, 2] = np.clip(hsv[:, :, 2] * 0.3, 0, 255).astype(np.uint8)
            elif is_white:
                hsv_recolored[:, :, 1] = np.clip(hsv[:, :, 1] * 0.2, 0, 255).astype(np.uint8)
                hsv_recolored[:, :, 2] = np.clip(hsv[:, :, 2] * 0.5 + 150, 0, 255).astype(np.uint8)
            elif is_gray:
                hsv_recolored[:, :, 1] = np.clip(hsv[:, :, 1] * 0.2, 0, 255).astype(np.uint8)
                hsv_recolored[:, :, 2] = np.clip(hsv[:, :, 2] * 0.5 + 60, 0, 255).astype(np.uint8)
            else:
                hsv_recolored[:,:,0] = target_hue
                hsv_recolored[:,:,1] = np.maximum(hsv[:,:,1], 120)
            
            recolored = cv2.cvtColor(hsv_recolored, cv2.COLOR_HSV2BGR)
            soft_3ch = soft_mask[:,:,None]
            blended = (recolored * soft_3ch + frame * (1 - soft_3ch)).astype(np.uint8)
            result.append(blended)
            continue
            
        # Fill holes in the base mask (since SAM post-processing might be skipped)
        mask_uint8 = mask.astype(np.uint8) * 255
        kernel = np.ones((5, 5), np.uint8)
        mask_uint8 = cv2.morphologyEx(mask_uint8, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        mask_filled = np.zeros_like(mask_uint8)
        cv2.drawContours(mask_filled, contours, -1, 255, -1)
        mask = mask_filled > 0
            
        # feather mask edges for smooth blending
        mask_uint8 = mask.astype(np.uint8) * 255
        mask_blurred = cv2.GaussianBlur(mask_uint8, (3, 3), 0)
        soft_mask = mask_blurred.astype(np.float32) / 255.0  # 0.0 to 1.0
        
        # create recolored version of full frame
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV).copy()
        
        collar_highlights = mask & (hsv[:,:,2] > 200) & (hsv[:,:,1] < 20)
        
        if locked_source_hue is None:
            # lower the saturation threshold to catch more pixels when detecting object hue
            sat_match = hsv[:, :, 1] > 4
            saturated = hsv[mask & sat_match]
            if len(saturated) > 0:
                locked_source_hue = int(np.median(saturated[:, 0]))
                print(f"  [Frame {i}] Locked source hue: {locked_source_hue}")
                print(f"  Masked pixel count: {len(saturated)}, median hue: {locked_source_hue}")
                
                y_indices, x_indices = np.where(mask)
                if len(y_indices) > 0:
                    x_min, x_max = x_indices.min(), x_indices.max()
                    y_min, y_max = y_indices.min(), y_indices.max()
                    print(f"  Mask bbox: x={x_min}, y={y_min}, w={x_max-x_min}, h={y_max-y_min}")
        
        if locked_source_hue is not None:
            hue_channel = hsv[:, :, 0].astype(int)
            sat_channel = hsv[:, :, 1]
            
            # OpenCV hue is 0-179, so we calculate the circular distance
            hue_diff = np.abs(hue_channel - locked_source_hue)
            hue_diff = np.minimum(hue_diff, 180 - hue_diff)
            
            # Match if circular hue diff is small OR if pixel is low saturation (highlights)
            color_match = (hue_diff < hue_tolerance) | (sat_channel < 50)
            combined_mask = mask & color_match
            
            combined_mask = combined_mask | collar_highlights
            
            # Fill holes in the combined mask (handles dark folds or shadows that failed hue match)
            cmb_uint8 = combined_mask.astype(np.uint8) * 255
            cmb_uint8 = cv2.morphologyEx(cmb_uint8, cv2.MORPH_CLOSE, kernel)
            contours, _ = cv2.findContours(cmb_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cmb_filled = np.zeros_like(cmb_uint8)
            cv2.drawContours(cmb_filled, contours, -1, 255, -1)
            
            # feather the combined mask too
            soft_mask = cv2.GaussianBlur(cmb_filled, (3, 3), 0).astype(np.float32) / 255.0
            
        # We still use the hard mask for the actual recoloring math to avoid bleeding
        if is_black:
            hsv[:, :, 1][mask] = np.clip(hsv[:, :, 1][mask] * 0.2, 0, 255).astype(np.uint8)
            hsv[:, :, 2][mask] = np.clip(hsv[:, :, 2][mask] * 0.3, 0, 255).astype(np.uint8)
        elif is_white:
            hsv[:, :, 1][mask] = np.clip(hsv[:, :, 1][mask] * 0.2, 0, 255).astype(np.uint8)
            hsv[:, :, 2][mask] = np.clip(hsv[:, :, 2][mask] * 0.5 + 150, 0, 255).astype(np.uint8)
        elif is_gray:
            hsv[:, :, 1][mask] = np.clip(hsv[:, :, 1][mask] * 0.2, 0, 255).astype(np.uint8)
            hsv[:, :, 2][mask] = np.clip(hsv[:, :, 2][mask] * 0.5 + 60, 0, 255).astype(np.uint8)
        else:
            hsv[:, :, 0] = target_hue
            
            # boost saturation within mask — bright/highlight pixels have low saturation
            # which is why they appear white instead of colored
            # set a minimum saturation of 120 (out of 255) within the masked region
            current_sat = hsv[:, :, 1]
            hsv[:, :, 1] = np.where(
                collar_highlights,
                80,   # give collar pixels moderate saturation so color shows
                np.where(
                    soft_mask > 0.3,  # within the mask region
                    np.maximum(current_sat, 120),  # ensure minimum saturation of 120
                    current_sat  # leave background untouched
                )
            )

        recolored_frame = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
        
        # blend recolored and original using soft mask instead of hard cutoff
        soft_3ch = soft_mask[:, :, None]
        blended = (recolored_frame * soft_3ch + frame * (1 - soft_3ch)).astype(np.uint8)
        result.append(blended)
        
    return result

if __name__ == "__main__":
    import subprocess
    
    # Add project root to path so we can import from segmentation module
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    from segmentation.frames import extract_all_frames, extract_keyframes, extract_audio, frames_to_video
    from segmentation.sam2_predictor import locate_object_in_video, get_masks_for_video

    if len(sys.argv) < 4:
        print("Usage: python object_effects.py <video_path> <effect> <object_desc> [target_color]")
        sys.exit(1)

    video_path = sys.argv[1]
    effect = sys.argv[2]
    object_desc = sys.argv[3]
    target_color = sys.argv[4] if len(sys.argv) > 4 else None

    bbox, found_frame = locate_object_in_video(video_path, object_desc)
    
    if bbox is None:
        print("Object not found in any frame")
        sys.exit(1)
    
    print(f"bbox: {bbox}")
    masks = get_masks_for_video(video_path, bbox, start_frame_idx=found_frame)
    frames, fps = extract_all_frames(video_path)
    audio_path = extract_audio(video_path, "./outputs/temp_audio.aac")

    if effect == "blur":
        processed = blur_background(frames, masks)
    elif effect == "spotlight":
        processed = spotlight_object(frames, masks)
    elif effect == "recolor":
        processed = recolor_object(frames, masks, target_color)
    else:
        print(f"Unknown effect: {effect}")
        sys.exit(1)

    out = frames_to_video(processed, fps, audio_path, f"./outputs/effect_{effect}.mp4")
    print(f"Done → {out}")
    if sys.platform == "darwin":
        subprocess.run(["open", out])
