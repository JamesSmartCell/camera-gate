import { randomBytes } from 'node:crypto'
import { config } from './config.js'

const sessions = new Map()

export function issueSession(address) {
  const token = randomBytes(32).toString('hex')
  const now = Date.now()
  sessions.set(token, {
    address,
    createdAt: now,
    expiresAt: now + config.streamTtlMs,
  })
  return token
}

export function getSession(token) {
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null
  if (Date.now() > session.expiresAt) {
    sessions.delete(token)
    return null
  }
  return session
}

export function touchSession(token) {
  const session = getSession(token)
  if (!session) return null
  const now = Date.now()
  const hardCap = session.createdAt + config.maxSessionMs
  session.expiresAt = Math.min(now + config.streamTtlMs, hardCap)
  if (now >= hardCap) {
    sessions.delete(token)
    return null
  }
  return session
}

export function revokeSession(token) {
  sessions.delete(token)
}

export function sessionPublic(token, session) {
  return {
    token,
    address: session.address,
    expiresAt: session.expiresAt,
    ttlSec: Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000)),
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [token, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(token)
  }
}, 30_000).unref()
