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
    img { width: 100%; height: auto; background: #000; border-radius: 12px; border: 1px solid #334155; }
  </style>
</head>
<body>
  <main>
    <h1>Garage camera — LAN only</h1>
    <p>This page is served on the local network and is not passkey-gated (WebAuthn cannot run on a raw IP). Remote viewing is <code>https://wallet.percolate.one</code> after the NFT check.</p>
    <img id="cam" alt="LAN camera" />
  </main>
  <script>
    (async function () {
      const img = document.getElementById('cam')
      const res = await fetch('/lan/live', { cache: 'no-store' })
      if (!res.ok || !res.body) return
      const reader = res.body.getReader()
      let buf = new Uint8Array(0)
      let url = ''
      const concat = (a, b) => {
        const o = new Uint8Array(a.length + b.length)
        o.set(a, 0); o.set(b, a.length); return o
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf = concat(buf, value)
        let start = -1
        for (let i = 0; i < buf.length - 1; i++) if (buf[i] === 255 && buf[i+1] === 216) { start = i; break }
        if (start < 0) continue
        for (let i = start + 2; i < buf.length - 1; i++) {
          if (buf[i] === 255 && buf[i+1] === 217) {
            const blob = new Blob([buf.subarray(start, i + 2)], { type: 'image/jpeg' })
            const next = URL.createObjectURL(blob)
            img.src = next
            if (url) URL.revokeObjectURL(url)
            url = next
            buf = buf.subarray(i + 2)
            break
          }
        }
      }
    })()
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
