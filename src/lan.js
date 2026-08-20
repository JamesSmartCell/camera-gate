const LAN_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Garage camera (LAN)</title>
  <style>
    body { margin: 0; background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; }
    main { max-width: 960px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    p { color: #94a3b8; font-size: 0.9rem; }
    video { width: 100%; height: auto; background: #000; border-radius: 12px; border: 1px solid #334155; }
  </style>
</head>
<body>
  <main>
    <h1>Garage camera — LAN only</h1>
    <p>H.264 / HLS preview on the local network. Remote viewing is <code>https://wallet.percolate.one</code> after the NFT check.</p>
    <video id="cam" autoplay muted playsinline controls></video>
  </main>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.6.13/dist/hls.min.js"></script>
  <script>
    const video = document.getElementById('cam')
    const src = '/lan/index.m3u8'
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
    } else if (window.Hls && Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true })
      hls.loadSource(src)
      hls.attachMedia(video)
    } else {
      document.querySelector('p').textContent = 'This browser cannot play HLS.'
    }
  </script>
</body>
</html>`

export function isPrivateAddress(ip) {
  const v = String(ip || '').replace('::ffff:', '')
  if (v === '127.0.0.1' || v === '::1' || v === 'localhost') return true
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

export function clientIp(req) {
  return req.socket?.remoteAddress || req.ip || ''
}

export function requireLan(req, res, next) {
  if (!isPrivateAddress(clientIp(req))) {
    res.status(403).type('text/plain').send('LAN only')
    return
  }
  next()
}

export function sendLanPage(_req, res) {
  res.type('html').send(LAN_PAGE)
}
