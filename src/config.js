function resolveCameraSourceUrl(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''
  const lower = value.toLowerCase()
  if (lower === '0' || lower === 'off' || lower === 'false') return ''
  // leftover from the old always-on listen command — that process exits on disconnect
  if (lower.includes('127.0.0.1:8090') || lower.includes('localhost:8090')) return ''
  return value
}

function csv(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function csvLower(value) {
  return csv(value).map((s) => s.toLowerCase())
}

function envFlag(raw, defaultOn) {
  if (raw === undefined || raw === '') return defaultOn
  const v = String(raw).trim().toLowerCase()
  if (v === '0' || v === 'off' || v === 'false' || v === 'no') return false
  return true
}

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  publicBaseUrl: String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  walletOrigins: csv(
    process.env.WALLET_ORIGINS || 'https://wallet.percolate.one,http://localhost:8089'
  ),
  nftContract: process.env.NFT_CONTRACT || '0x3158e836ec0e85A46f7a7208d91EA9837A0C6ccC',
  chainId: Number(process.env.CHAIN_ID || 84532),
  rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
  adminAddrs: csvLower(
    process.env.ADMIN_ADDRS ||
      '0xC067A53c91258ba513059919E03B81CF93f57Ac7,0x7e4b1da13c4a2a73fd05e928a6ed81b0a5d3007b'
  ),
  streamMode: (process.env.STREAM_MODE || 'mjpeg').toLowerCase() === 'hls' ? 'hls' : 'mjpeg',
  // If set, proxy an already-running local source. Empty / leftover :8090 URLs use on-demand ffmpeg.
  cameraSourceUrl: resolveCameraSourceUrl(process.env.CAMERA_SOURCE_URL),
  cameraDevice: process.env.CAMERA_DEVICE || '/dev/video0',
  cameraInputFormat: process.env.CAMERA_INPUT_FORMAT || 'mjpeg',
  cameraSize: process.env.CAMERA_SIZE || '1280x720',
  cameraFps: Number(process.env.CAMERA_FPS || 15),
  cameraQuality: Number(process.env.CAMERA_QUALITY || 5),
  cameraEncode: process.env.CAMERA_ENCODE === '1',
  cameraVflip: envFlag(process.env.CAMERA_VFLIP, true),
  cameraHflip: envFlag(process.env.CAMERA_HFLIP, false),
  ffmpegBin: process.env.FFMPEG_BIN || 'ffmpeg',
  ffmpegIdleStopMs: Number(process.env.FFMPEG_IDLE_STOP_MS || 2000),
  hlsDir: process.env.HLS_DIR || '',
  streamTtlMs: Number(process.env.STREAM_TTL_SEC || 90) * 1000,
  maxSessionMs: Number(process.env.MAX_SESSION_SEC || 600) * 1000,
}

export function publicUrl(path) {
  if (!config.publicBaseUrl) return path
  return `${config.publicBaseUrl}${path}`
}
