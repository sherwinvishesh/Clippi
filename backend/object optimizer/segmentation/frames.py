import os
import sys
import weave
import cv2
import ffmpeg
import numpy as np

@weave.op()
def extract_all_frames(clip_path: str) -> tuple[list[np.ndarray], float]:
    cap = cv2.VideoCapture(clip_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frames = []
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frames.append(frame)
        
    cap.release()
    print(f"Extracted {len(frames)} frames at {fps}fps")
    return frames, fps

def extract_keyframes(clip_path: str, n: int = 5) -> list[tuple[int, np.ndarray]]:
    cap = cv2.VideoCapture(clip_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    indices = np.linspace(0, total_frames - 1, n, dtype=int)
    keyframes = []
    
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ret, frame = cap.read()
        if ret:
            keyframes.append((int(idx), frame))
            
    cap.release()
    return keyframes

@weave.op()
def extract_audio(clip_path: str, output_path: str) -> str | None:
    try:
        ffmpeg.input(clip_path).output(output_path, acodec='copy', vn=None).run(overwrite_output=True, quiet=True)
        return output_path
    except Exception:
        return None

@weave.op()
def frames_to_video(frames: list[np.ndarray], fps: float, audio_path: str | None, output_path: str) -> str:
    h, w = frames[0].shape[:2]
    temp_path = output_path.replace('.mp4', '_temp_noaudio.mp4')
    
    writer = cv2.VideoWriter(temp_path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h))
    for frame in frames:
        frame_resized = cv2.resize(frame, (w, h))
        writer.write(frame_resized)
    writer.release()
    
    if audio_path is not None:
        ffmpeg.output(ffmpeg.input(temp_path), ffmpeg.input(audio_path), output_path, vcodec='libx264', acodec='aac', strict='experimental').run(overwrite_output=True, quiet=True)
    else:
        ffmpeg.input(temp_path).output(output_path, vcodec='libx264').run(overwrite_output=True, quiet=True)
        
    if os.path.exists(temp_path):
        os.remove(temp_path)
        
    return output_path

if __name__ == "__main__":
    if len(sys.argv) > 1:
        clip_path = sys.argv[1]
        frames, fps = extract_all_frames(clip_path)
        print(f"Extracted {len(frames)} frames at {fps}fps")
        audio = extract_audio(clip_path, "./outputs/test_audio.aac")
        out = frames_to_video(frames, fps, audio, "./outputs/roundtrip_test.mp4")
        print(f"Roundtrip done → {out}")
        import subprocess
        subprocess.run(["open", out])
    else:
        print("Usage: python frames.py <path_to_video>")
