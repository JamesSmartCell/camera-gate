# camera-gate

Node process on the Raspberry Pi. It gates the live webcam with the same check as Remote Camera firmware (P-256 passkey recover → admin or Garage Door NFT), then the **wallet plays the stream on `<your gate site>`** so you reuse that certificate.

There is no second public hostname.

```
[webcam /dev/video0]
                 ↓  ffmpeg starts only while someone is watching
         camera-gate :8787   (Pi 3, LAN)
                 ↓  http://192.168.50.x:8787
         wallet /cam-gate/*  (Pi 5, existing HTTPS cert)
                 ↓
         Watch Live Feed (passkey + NFT)
```

On the LAN you can also open `http://192.168.50.x:8787/lan` for an HTTP preview. Passkeys cannot run on a raw IP (`rpId` is `percolate.one`), so that page is LAN-only and not NFT-gated.

## Wallet (always)

The browser only talks to same-origin paths:

```
https://<your gate site>/cam-gate/challenge
https://<your gate site>/cam-gate/auth
https://<your gate site>/cam-gate/live/<token>
```

The browser only talks to the wallet origin (HTTPS). The **Pi 5** then fetches the Pi 3 on the LAN. No SSH, no extra certificate.

On the Pi 3:

```bash
cd camera-gate
cp .env.example .env
npm install
npm start
```

On the Pi 5 (`wallet/.env`):

```bash
CAMERA_GATE_UPSTREAM=http://192.168.50.<pi3>:8787
```

Restart `server-https.js` / Next after changing that. From the Pi 5, `curl http://192.168.50.<pi3>:8787/health` should succeed.

You cannot point the **browser** at `http://192.168.50.x` from the HTTPS wallet page (mixed content). The Pi 5 proxy is what makes remote viewing work.

## LAN preview

From a phone/laptop on `192.168.50.0/24`:

```
http://192.168.50.<pi>:8787/lan
```

`/lan` and `/lan/live` refuse non-private client IPs, so they are useless if accidentally published through `/cam-gate`.

## Local camera (on demand)

Do **not** run ffmpeg yourself. Leave `CAMERA_SOURCE_URL` empty. `npm start` is enough:

- ffmpeg starts when `/live/<token>` or `/lan/live` gets a viewer
- it stops ~2s after the last viewer disconnects (`FFMPEG_IDLE_STOP_MS`)
- `/health` reports `{ ffmpeg: { running, viewers } }`

Pi 3 defaults: `/dev/video0` at `1280x720` MJPEG copy (no re-encode). Set `CAMERA_ENCODE=1` only if the camera is not already MJPEG.

Optional always-on source (not recommended): set `CAMERA_SOURCE_URL=http://127.0.0.1:8090/...` and run `scripts/ffmpeg-mjpeg.sh` yourself.

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/challenge` | — | One-time challenge |
| `POST` | `/auth` | passkey sig | NFT/admin check, issue token |
| `POST` | `/heartbeat` | token | Slide TTL |
| `POST` | `/stop` | token | Revoke |
| `GET` | `/live/:token` | token | MJPEG |
| `GET` | `/hls/:token/:file` | token | HLS |
| `GET` | `/lan` | private IP | LAN HTML preview |
| `GET` | `/health` | — | Liveness |
