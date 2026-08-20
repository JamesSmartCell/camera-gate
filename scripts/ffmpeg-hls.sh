#!/usr/bin/env bash
# Local-only low-latency HLS for camera-gate (higher quality H.264 than MJPEG).
set -euo pipefail

DEVICE="${CAMERA_DEVICE:-/dev/video0}"
SIZE="${CAMERA_SIZE:-1920x1080}"
FPS="${CAMERA_FPS:-15}"
DIR="${HLS_DIR:-/tmp/garage-hls}"

mkdir -p "${DIR}"
echo "Publishing ${DEVICE} ${SIZE}@${FPS} HLS to ${DIR}"

exec ffmpeg -hide_banner -loglevel warning \
  -f v4l2 -input_format mjpeg -video_size "${SIZE}" -framerate "${FPS}" -i "${DEVICE}" \
  -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p \
  -g $((FPS * 1)) -keyint_min "${FPS}" \
  -f hls -hls_time 1 -hls_list_size 4 -hls_flags delete_segments+append_list+independent_segments \
  "${DIR}/index.m3u8"
