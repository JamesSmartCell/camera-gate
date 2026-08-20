import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { config } from './config.js'
import { getSession, touchSession } from './sessions.js'
import { attachOnDemandMjpeg } from './ffmpeg-source.js'

function deny(res, status, message) {
  res.status(status).type('text/plain').send(message)
}

export function requireSession(req, res, next) {
  const token = req.params.token || req.query.token
  const session = touchSession(token) || getSession(token)
  if (!session) {
    deny(res, 401, 'error:auth_failed')
    return
  }
  req.cameraSession = session
  req.cameraToken = token
  next()
}

export function proxyMjpeg(req, res) {
  if (!config.cameraSourceUrl) {
    attachOnDemandMjpeg(req, res)
    const expiryTimer = setInterval(() => {
      if (req.cameraToken !== 'lan' && !getSession(req.cameraToken)) {
        res.end()
      }
    }, 5000)
    expiryTimer.unref()
    req.on('close', () => clearInterval(expiryTimer))
    return
  }

  const source = new URL(config.cameraSourceUrl)
  const headers = { connection: 'close' }
  if (source.hostname !== '127.0.0.1' && source.hostname !== 'localhost') {
    deny(res, 500, 'error:source_must_be_localhost')
    return
  }

  const upstream = http.request(
    {
      hostname: source.hostname,
      port: source.port || 80,
      path: `${source.pathname}${source.search}`,
      method: 'GET',
      headers,
    },
    (incoming) => {
      if (incoming.statusCode && incoming.statusCode >= 400) {
        incoming.resume()
        deny(res, 502, 'error:camera_unavailable')
        return
      }
      res.status(200)
      res.set({
        'Content-Type': incoming.headers['content-type'] || 'multipart/x-mixed-replace; boundary=ffmpeg',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        'X-Accel-Buffering': 'no',
      })
      incoming.pipe(res)

      const expiryTimer = setInterval(() => {
        if (req.cameraToken !== 'lan' && !getSession(req.cameraToken)) {
          incoming.destroy()
          res.end()
        }
      }, 5000)
      expiryTimer.unref()

      const cleanup = () => {
        clearInterval(expiryTimer)
        incoming.destroy()
      }
      req.on('close', cleanup)
      incoming.on('error', cleanup)
    }
  )

  upstream.on('error', () => {
    if (!res.headersSent) deny(res, 502, 'error:camera_unavailable')
    else res.end()
  })
  req.on('close', () => upstream.destroy())
  upstream.end()
}

function safeHlsFile(name) {
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) return null
  if (!/^[\w.-]+\.(m3u8|ts|m4s|mp4)$/i.test(name)) return null
  return path.join(config.hlsDir, name)
}

function rewritePlaylist(text, token) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (!line || line.startsWith('#')) return line
      const file = path.posix.basename(line.split('?')[0])
      return `/hls/${token}/${file}`
    })
    .join('\n')
}

export async function serveHls(req, res) {
  if (!config.hlsDir) {
    deny(res, 500, 'error:hls_not_configured')
    return
  }
  const fileName = req.params.file || 'index.m3u8'
  const full = safeHlsFile(fileName)
  if (!full || !existsSync(full)) {
    deny(res, 404, 'error:segment_missing')
    return
  }

  if (fileName.endsWith('.m3u8')) {
    const { readFile } = await import('node:fs/promises')
    const text = await readFile(full, 'utf8')
    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-store',
    })
    res.send(rewritePlaylist(text, req.cameraToken))
    return
  }

  const info = await stat(full)
  res.set({
    'Content-Type': fileName.endsWith('.mp4') ? 'video/mp4' : 'video/mp2t',
    'Content-Length': info.size,
    'Cache-Control': 'no-store',
  })
  createReadStream(full).pipe(res)
}
