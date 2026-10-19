#!/usr/bin/env python3
"""Polishes the voice-over takes and lays them on the video timeline.

Reads ../voice-over/vo-XX.mp3, runs each through a broadcast voice chain
(low-cut, de-ess, warmth/presence EQ, gentle compression), matches every take
to -16 LUFS, and writes:
  public/vo/vo-XX.wav   processed takes
  src/vo.json          take start frames + per-frame music duck curve

Run:  python3 scripts/make_vo.py
"""
import json
import os
import re
import subprocess
import wave

import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "..", "voice-over")
OUT = os.path.join(ROOT, "public", "vo")
FPS = 30
SR = 44100
TOTAL_FRAMES = 2640
TARGET_LUFS = -16.0

# Start time (seconds) of each take, chosen so key words land on their visuals.
STARTS = {
    1: 0.50, 2: 4.05, 3: 10.00, 4: 16.15, 5: 24.12, 6: 26.80, 7: 32.35,
    8: 38.30, 9: 43.25, 10: 48.25, 11: 52.25, 12: 56.25, 13: 60.25, 14: 64.25,
    15: 68.35, 16: 74.30, 17: 81.20, 18: 85.00,
}

CHAIN = ",".join([
    "highpass=f=75",
    "deesser=i=0.35:m=0.5:f=0.5",
    "equalizer=f=180:t=q:w=1.0:g=1.5",      # warmth
    "equalizer=f=450:t=q:w=1.2:g=-1.5",     # less boxiness
    "equalizer=f=3800:t=q:w=1.0:g=2.0",     # presence
    "highshelf=f=10000:g=1.5",              # air
    "acompressor=threshold=-22dB:ratio=3:attack=6:release=90:makeup=2",
    "afade=t=in:d=0.01",
])


def lufs(path):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-af", "ebur128", "-f", "null", "-"],
                       capture_output=True, text=True)
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    return float(m[-1])


def read_wav(path):
    with wave.open(path) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), "<i2").reshape(-1, w.getnchannels())
    return x.astype(np.float32) / 32768


def main():
    os.makedirs(OUT, exist_ok=True)
    timeline = np.zeros(int(TOTAL_FRAMES / FPS * SR) + SR, dtype=np.float32)
    takes = []
    for n, start in STARTS.items():
        src = os.path.join(SRC, f"vo-{n:02d}.mp3")
        tmp = os.path.join(OUT, f"_tmp{n:02d}.wav")
        dst = os.path.join(OUT, f"vo-{n:02d}.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", CHAIN, "-ar", str(SR), "-ac", "1", tmp], check=True)
        gain = TARGET_LUFS - lufs(tmp)
        # gain, then fade the tail so ElevenLabs' trailing breath never clicks
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", tmp],
                                   capture_output=True, text=True).stdout)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-af",
                        f"volume={gain:.2f}dB,alimiter=limit=0.89:level=false,afade=t=out:st={max(0, dur - 0.08):.3f}:d=0.08",
                        "-ar", str(SR), "-ac", "2", dst], check=True)
        os.remove(tmp)
        x = read_wav(dst)[:, 0]
        i = int(start * SR)
        timeline[i:i + len(x)] += x
        takes.append({"file": f"vo/vo-{n:02d}.wav", "from": round(start * FPS)})
        print(f"vo-{n:02d}  start {start:6.2f}s  gain {gain:+.1f} dB  len {len(x) / SR:.2f}s")

    # music duck curve: -9 dB under speech, fast attack, slow release, small look-ahead
    hop = SR // FPS
    rms = np.array([np.sqrt(np.mean(timeline[f * hop:(f + 1) * hop] ** 2) + 1e-12) for f in range(TOTAL_FRAMES)])
    active = 20 * np.log10(rms) > -42
    # bridge tiny gaps between words so the music doesn't pump
    for f in range(TOTAL_FRAMES):
        if not active[f] and active[max(0, f - 12):f].any() and active[f:f + 12].any():
            active[f] = True
    target = np.where(active, 0.35, 1.0)
    target = np.minimum(target, np.roll(target, -3))  # look-ahead
    duck = np.ones(TOTAL_FRAMES)
    g = 1.0
    for f in range(TOTAL_FRAMES):
        coef = 0.45 if target[f] < g else 0.08  # attack / release
        g += (target[f] - g) * coef
        duck[f] = round(g, 3)

    with open(os.path.join(ROOT, "src", "vo.json"), "w") as fh:
        json.dump({"takes": takes, "duck": duck.tolist()}, fh)
    print("wrote src/vo.json")


if __name__ == "__main__":
    main()
