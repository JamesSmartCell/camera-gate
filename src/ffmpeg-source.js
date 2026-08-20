import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.js'

const viewers = new Set()
let ffmpeg = null
let ffmpegKind = null
let idleTimer = null
let hlsLastAccess = 0

export function ffmpegStatus() {
  return {
    running: Boolean(ffmpeg),
    kind: ffmpegKind,
    viewers: viewers.size,
    device: config.cameraDevice,
    hlsDir: config.hlsDir,
  }
}

function ensureHlsDir() {
  mkdirSync(config.hlsDir, { recursive: true })
}

function videoFilters() {
  const filters = []
  if (config.cameraVflip) filters.push('vflip')
  if (config.cameraHflip) filters.push('hflip')
  return filters
}

function v4l2InputArgs() {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-fflags',
    'nobuffer',
    '-flags',
    'low_delay',
    '-f',
    'v4l2',
    '-input_format',
    config.cameraInputFormat,
    '-video_size',
    config.cameraSize,
    '-framerate',
    String(config.cameraFps),
    '-i',
    config.cameraDevice,
  ]
}

function stopFfmpeg() {
  clearTimeout(idleTimer)
  idleTimer = null
  if (!ffmpeg) return
  const child = ffmpeg
  ffmpeg = null
  ffmpegKind = null
  child.stdout?.removeAllListeners('data')
  try {
    child.kill('SIGTERM')
  } catch {
    // already gone
  }
  setTimeout(() => {
    if (!child.killed) {
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
    }
  }, 1500).unref()
  console.log('[ffmpeg] stopped')
}

function attachChild(child, kind) {
  ffmpeg = child
  ffmpegKind = kind
  child.stderr.on('data', (buf) => {
    const line = buf.toString().trim()
    if (line) console.warn('[ffmpeg]', line)
  })
  child.on('error', (err) => {
    console.warn('[ffmpeg] spawn failed', err.message)
    if (ffmpeg === child) {
      ffmpeg = null
      ffmpegKind = null
    }
    for (const res of viewers) {
      if (!res.headersSent) {
        res.status(502).type('text/plain').send('error:camera_unavailable')
      } else {
        res.end()
      }
    }
    viewers.clear()
  })
  child.on('exit', (code, signal) => {
    if (ffmpeg === child) {
      ffmpeg = null
      ffmpegKind = null
    }
    console.log('[ffmpeg] exit', kind, code, signal || '')
    for (const res of viewers) {
      res.end()
    }
    viewers.clear()
  })
}

function startMjpegFfmpeg() {
  if (ffmpeg && ffmpegKind === 'mjpeg') return
  if (ffmpeg) stopFfmpeg()

  const filters = videoFilters()
  const mustEncode = config.cameraEncode || filters.length > 0
  const args = [
    ...v4l2InputArgs(),
    ...(filters.length ? ['-vf', filters.join(',')] : []),
    ...(mustEncode
      ? ['-c:v', 'mjpeg', '-q:v', String(config.cameraQuality)]
      : ['-c:v', 'copy']),
    '-f',
    'image2pipe',
    '-vcodec',
    'mjpeg',
    'pipe:1',
  ]

  console.log('[ffmpeg] start mjpeg', config.cameraDevice, config.cameraSize)
  const child = spawn(config.ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  attachChild(child, 'mjpeg')

  let jpegBuf = Buffer.alloc(0)
  child.stdout.on('data', (chunk) => {
    jpegBuf = Buffer.concat([jpegBuf, chunk])
    while (true) {
      const start = jpegBuf.indexOf(Buffer.from([0xff, 0xd8]))
      if (start < 0) {
        jpegBuf = Buffer.alloc(0)
        break
      }
      if (start > 0) jpegBuf = jpegBuf.subarray(start)
      const end = jpegBuf.indexOf(Buffer.from([0xff, 0xd9]), 2)
      if (end < 0) break
      const frame = jpegBuf.subarray(0, end + 2)
      jpegBuf = jpegBuf.subarray(end + 2)
      for (const res of viewers) {
        try {
          res.write(frame)
          if (typeof res.flush === 'function') res.flush()
        } catch {
          viewers.delete(res)
        }
      }
    }
    if (jpegBuf.length > 4 * 1024 * 1024) {
      jpegBuf = jpegBuf.subarray(-1024 * 1024)
    }
  })
}

export function startHlsFfmpeg() {
  if (ffmpeg && ffmpegKind === 'hls') return
  if (ffmpeg) stopFfmpeg()

  ensureHlsDir()
  try {
    rmSync(path.join(config.hlsDir, 'index.m3u8'), { force: true })
  } catch {
    // ignore
  }

  const filters = videoFilters()
  const gop = Math.max(2, Number(config.cameraFps) || 15)
  const args = [
    ...v4l2InputArgs(),
    ...(filters.length ? ['-vf', filters.join(',')] : []),
    '-c:v',
    config.hlsEncoder,
    '-preset',
    config.hlsPreset,
    '-tune',
    'zerolatency',
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'baseline',
    '-level',
    '3.1',
    '-g',
    String(gop),
    '-keyint_min',
    String(gop),
    '-b:v',
    config.hlsBitrate,
    '-maxrate',
    config.hlsBitrate,
    '-bufsize',
    '1600k',
    '-an',
    '-f',
    'hls',
    '-hls_time',
    '1',
    '-hls_list_size',
    '6',
    '-hls_flags',
    'delete_segments+append_list+independent_segments',
    '-hls_segment_filename',
    path.join(config.hlsDir, 'seg%03d.ts'),
    path.join(config.hlsDir, 'index.m3u8'),
  ]

  console.log('[ffmpeg] start hls', config.cameraDevice, config.cameraSize, config.hlsEncoder)
  const child = spawn(config.ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  attachChild(child, 'hls')
}

export function touchHls() {
  hlsLastAccess = Date.now()
  startHlsFfmpeg()
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (viewers.size > 0) return
    if (Date.now() - hlsLastAccess < config.ffmpegIdleStopMs) return
    stopFfmpeg()
  }, config.ffmpegIdleStopMs)
  idleTimer.unref()
}

export async function waitForHlsPlaylist(timeoutMs = 15000) {
  touchHls()
  const file = path.join(config.hlsDir, 'index.m3u8')
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (existsSync(file)) {
      try {
        const text = await readFile(file, 'utf8')
        if (text.includes('.ts') || text.includes('#EXTINF')) return true
      } catch {
        // still writing
      }
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return existsSync(file)
}

function releaseViewer(res) {
  if (!viewers.delete(res)) return
  if (viewers.size > 0) return
  clearTimeout(idleTimer)
  idleTimer = setTimeout(stopFfmpeg, config.ffmpegIdleStopMs)
  idleTimer.unref()
}

export function attachOnDemandMjpeg(req, res) {
  clearTimeout(idleTimer)
  idleTimer = null
  startMjpegFfmpeg()

  res.status(200)
  res.set({
    'Content-Type': 'multipart/x-mixed-replace;boundary=ffmpeg',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    'X-Accel-Buffering': 'no',
  })
  res.socket?.setNoDelay(true)
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  viewers.add(res)

  const onClose = () => {
    req.off('close', onClose)
    res.off('close', onClose)
    res.off('finish', onClose)
    releaseViewer(res)
  }
  req.on('close', onClose)
  res.on('close', onClose)
  res.on('finish', onClose)
}
