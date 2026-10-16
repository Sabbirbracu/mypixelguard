#!/usr/bin/env python3
"""Downloads the on-device AI models into windows/models/ (needed to build the installer).

  isnet-general-use.onnx   background removal   ~179 MB   Apache-2.0   github.com/danielgatis/rembg
  face_detection_yunet_2023mar.onnx   face finder   ~0.34 MB   MIT   github.com/opencv/opencv_zoo

The app itself never touches the network; this script is a build-time step only.
"""
import hashlib, sys, urllib.request
from pathlib import Path

MODELS = {
    "isnet-general-use.onnx": ("https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx", 178648008),
    "face_detection_yunet_2023mar.onnx": ("https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx", None),
}
out = Path(__file__).resolve().parents[1] / "models"
out.mkdir(exist_ok=True)
for name, (url, size) in MODELS.items():
    dest = out / name
    if dest.exists() and (size is None or dest.stat().st_size == size):
        print(f"ok      {name}")
        continue
    print(f"fetch   {name} ...", flush=True)
    urllib.request.urlretrieve(url, dest)
    if size is not None and dest.stat().st_size != size:
        sys.exit(f"{name}: size mismatch ({dest.stat().st_size} != {size})")
    print(f"        {dest.stat().st_size} bytes, sha256 {hashlib.sha256(dest.read_bytes()).hexdigest()[:16]}…")
