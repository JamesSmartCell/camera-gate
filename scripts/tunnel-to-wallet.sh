#!/usr/bin/env bash
# Only needed if the Pi 3 cannot reach / be reached by the wallet host on the LAN.
# Same-LAN setups should set CAMERA_GATE_UPSTREAM=http://<pi3-lan-ip>:8787 instead.
set -euo pipefail

WALLET_SSH="${WALLET_SSH:-user@wallet.percolate.one}"
LOCAL_PORT="${PORT:-8787}"

echo "Tunneling 127.0.0.1:${LOCAL_PORT} <- ${WALLET_SSH}"

if command -v autossh >/dev/null 2>&1; then
  exec autossh -M 0 -N \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -R "127.0.0.1:${LOCAL_PORT}:127.0.0.1:${LOCAL_PORT}" \
    "${WALLET_SSH}"
fi

exec ssh -N \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -R "127.0.0.1:${LOCAL_PORT}:127.0.0.1:${LOCAL_PORT}" \
  "${WALLET_SSH}"
