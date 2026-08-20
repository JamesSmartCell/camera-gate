#!/usr/bin/env bash
# Reverse-tunnel camera-gate to the wallet VPS loopback.
# wallet.percolate.one/cam-gate then reuses the existing Let's Encrypt cert.
#
# On the wallet host, server-https.js proxies /cam-gate -> http://127.0.0.1:8787
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
