#!/usr/bin/env bash
# Convert each recorded video to videos/<script name>.mp4
set -euo pipefail
cd "$(dirname "$0")/.."
for webm in test-results/run-scripts-*/video.webm; do
  name=$(basename "$(dirname "$webm")")
  name=${name#run-scripts-}
  ffmpeg -y -loglevel error -i "$webm" -c:v libx264 -pix_fmt yuv420p "videos/$name.mp4"
  echo "videos/$name.mp4"
done
