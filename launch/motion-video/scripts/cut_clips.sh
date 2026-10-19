#!/usr/bin/env bash
# Cuts the feature clips out of the raw screen recording (start seconds, duration).
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=$(ls ../Assets/Screen\ Recording*.mov | head -1)
cut() { ffmpeg -v error -y -ss "$2" -t "$3" -i "$SRC" -an -vf "scale=1920:-2,fps=30" -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart "public/clips/$1.mp4"; echo "cut $1"; }
cut home     0    4
cut inspect  9    6
cut clean    37   6
cut redact   63   5
cut resize   92   5
cut compress 125.6 5
cut bg       135  5
cut ai       150  5
