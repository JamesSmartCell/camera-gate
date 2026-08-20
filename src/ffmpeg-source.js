import { spawn } from 'node:child_process'
import { config } from './config.js'

const viewers = new Set()
let ffmpeg = null
let idleTimer = null

export function ffmpegStatus() {
  return {
    running: Boolean(ffmpeg),
    viewers: viewers.size,
    device: config.cameraDevice,
  }
}

function stopFfmpeg() {
  clearTimeout(idleTimer)
  idleTimer = null
  if (!ffmpeg) return
  const child = ffmpeg
  ffmpeg = null
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

function startFfmpeg() {
  if (ffmpeg) return

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
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
    ...(config.cameraEncode
      ? ['-c:v', 'mjpeg', '-q:v', String(config.cameraQuality)]
      : ['-c:v', 'copy']),
    '-f',
    'mpjpeg',
    'pipe:1',
  ]

  console.log('[ffmpeg] start', config.cameraDevice, config.cameraSize)
  const child = spawn(config.ffmpegBin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  ffmpeg = child

  child.stderr.on('data', (buf) => {
    const line = buf.toString().trim()
    if (line) console.warn('[ffmpeg]', line)
  })

  child.stdout.on('data', (chunk) => {
    for (const res of viewers) {
      try {
        res.write(chunk)
      } catch {
        viewers.delete(res)
      }
    }
  })

  child.on('error', (err) => {
    console.warn('[ffmpeg] spawn failed', err.message)
    if (ffmpeg === child) ffmpeg = null
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
    if (ffmpeg === child) ffmpeg = null
    console.log('[ffmpeg] exit', code, signal || '')
    for (const res of viewers) {
      res.end()
    }
    viewers.clear()
  })
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
  startFfmpeg()

  res.status(200)
  res.set({
    'Content-Type': 'multipart/x-mixed-replace;boundary=ffmpeg',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    'X-Accel-Buffering': 'no',
  })

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
