import './load-env.js'
import express from 'express'
import { config, publicUrl } from './config.js'
import { recoverForHashType } from './p256.js'
import { firstAuthorizedAddress } from './nft.js'
import {
  issueSession,
  getSession,
  touchSession,
  revokeSession,
  sessionPublic,
} from './sessions.js'
import { requireSession, proxyMjpeg, serveHls } from './stream.js'
import { requireLan, sendLanPage } from './lan.js'
import { ffmpegStatus } from './ffmpeg-source.js'

let currentChallenge = newChallenge()

function newChallenge() {
  const rand = Math.floor(Math.random() * 0x10000).toString(16)
  return `cam-${rand}-${Date.now().toString(16)}`
}

function rotateChallenge() {
  currentChallenge = newChallenge()
  return currentChallenge
}

const authHits = new Map()
function rateLimited(ip) {
  const now = Date.now()
  const windowMs = 60_000
  const max = 12
  const hits = (authHits.get(ip) || []).filter((t) => now - t < windowMs)
  hits.push(now)
  authHits.set(ip, hits)
  return hits.length > max
}

function applyCors(req, res) {
  const origin = req.headers.origin
  if (origin && config.walletOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }
}

function readAuthFields(req) {
  const src = { ...req.query, ...(req.body || {}) }
  return {
    sig: String(src.sig || ''),
    digest: String(src.digest || ''),
    hashType: String(src.hashType || 'keccak'),
  }
}

function streamPaths(token) {
  if (config.streamMode === 'hls') {
    return {
      mode: 'hls',
      streamUrl: publicUrl(`/hls/${token}/index.m3u8`),
    }
  }
  return {
    mode: 'mjpeg',
    streamUrl: publicUrl(`/live/${token}`),
  }
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '32kb' }))
app.use((req, res, next) => {
  applyCors(req, res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

app.get('/', requireLan, (_req, res) => {
  res.redirect(302, '/lan')
})
app.get('/lan', requireLan, sendLanPage)
app.get('/lan/live', requireLan, (req, res) => {
  req.cameraToken = 'lan'
  proxyMjpeg(req, res)
})

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    mode: config.streamMode,
    challengePrefix: 'cam-',
    ffmpeg: config.cameraSourceUrl ? 'external' : ffmpegStatus(),
  })
})

app.get('/challenge', (_req, res) => {
  res.type('text/plain').send(currentChallenge)
})

app.post('/auth', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  if (rateLimited(ip)) {
    res.status(429).type('text/plain').send('error:rate_limited')
    return
  }

  const { sig, digest, hashType } = readAuthFields(req)
  if (!sig) {
    res.status(400).type('text/plain').send('error:auth_required')
    return
  }

  const challengeUsed = currentChallenge
  let addresses = []
  try {
    addresses = recoverForHashType(sig, hashType, digest, challengeUsed)
  } catch (err) {
    console.warn('[auth] recover failed', err instanceof Error ? err.message : err)
  }

  rotateChallenge()

  const address = await firstAuthorizedAddress(addresses)
  if (!address) {
    console.log('[auth] fail recovered=', addresses.join(',') || '(none)')
    res.status(403).type('text/plain').send('error:auth_failed')
    return
  }

  const token = issueSession(address)
  const session = getSession(token)
  console.log('[auth] pass', address)
  res.json({
    ok: true,
    ...sessionPublic(token, session),
    ...streamPaths(token),
  })
})

app.post('/heartbeat', (req, res) => {
  const token = String(req.body?.token || req.query.token || '')
  const session = touchSession(token)
  if (!session) {
    res.status(401).type('text/plain').send('error:auth_failed')
    return
  }
  res.json({ ok: true, ...sessionPublic(token, session), ...streamPaths(token) })
})

app.post('/stop', (req, res) => {
  const token = String(req.body?.token || req.query.token || '')
  revokeSession(token)
  res.json({ ok: true })
})

app.get('/live/:token', requireSession, proxyMjpeg)
app.get('/hls/:token/:file', requireSession, (req, res) => {
  serveHls(req, res).catch((err) => {
    console.warn('[hls]', err instanceof Error ? err.message : err)
    if (!res.headersSent) res.status(500).type('text/plain').send('error:hls_failed')
  })
})

app.use((_req, res) => {
  res.status(404).type('text/plain').send('not found')
})

app.listen(config.port, config.host, () => {
  console.log(`camera-gate listening on ${config.host}:${config.port} mode=${config.streamMode}`)
  console.log(
    config.cameraSourceUrl
      ? `source: proxy ${config.cameraSourceUrl}`
      : `source: on-demand ffmpeg ${config.cameraDevice}`
  )
  console.log(`challenge: ${currentChallenge}`)
})
