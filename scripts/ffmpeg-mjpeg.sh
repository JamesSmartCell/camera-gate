#!/usr/bin/env bash
# Optional always-on source. Not used by default — camera-gate spawns ffmpeg
# only while a viewer is connected. Set CAMERA_SOURCE_URL if you run this.
set -euo pipefail

DEVICE="${CAMERA_DEVICE:-/dev/video0}"
SIZE="${CAMERA_SIZE:-1920x1080}"
FPS="${CAMERA_FPS:-15}"
PORT="${CAMERA_SOURCE_PORT:-8090}"

echo "Publishing ${DEVICE} ${SIZE}@${FPS} on 127.0.0.1:${PORT}/live.mjpg"

exec ffmpeg -hide_banner -loglevel warning \
  -f v4l2 -input_format mjpeg -video_size "${SIZE}" -framerate "${FPS}" -i "${DEVICE}" \
  -c:v mjpeg -q:v 4 \
  -f mpjpeg -listen 1 "http://127.0.0.1:${PORT}/live.mjpg"
