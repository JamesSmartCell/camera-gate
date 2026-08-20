/**
 * P256 recover + Tempo/Coinbase address derivation.
 * Matches Remote Camera / GarageDoor P256Crypto.cpp:
 *   address = keccak256(pub_x || pub_y)[12:32]
 *   try recids 0..3
 */
import { p256 } from '@noble/curves/p256'
import { keccak_256 } from '@noble/hashes/sha3'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'

const PERSONAL_PREFIX = '\x19Ethereum Signed Message:\n'

function strip0x(hex) {
  const s = String(hex || '').trim()
  return s.startsWith('0x') || s.startsWith('0X') ? s.slice(2) : s
}

function toAddress(uncompressed65) {
  if (!uncompressed65 || uncompressed65[0] !== 0x04 || uncompressed65.length !== 65) {
    return ''
  }
  const hash = keccak_256(uncompressed65.subarray(1))
  return `0x${bytesToHex(hash.subarray(12))}`
}

function recoverWithRecid(digest, sigBytes, recid) {
  const compact = sigBytes.subarray(0, 64)
  const signature = p256.Signature.fromCompact(compact)
  let point
  if (typeof signature.addRecoveryBit === 'function') {
    point = signature.addRecoveryBit(recid).recoverPublicKey(digest)
  } else if (typeof p256.Signature.fromCompact(compact).recoverPublicKey === 'function') {
    point = signature.recoverPublicKey(digest)
  } else {
    throw new Error('noble p256 recover API not available')
  }
  const bytes =
    typeof point.toRawBytes === 'function'
      ? point.toRawBytes(false)
      : point.toBytes(false)
  return toAddress(bytes)
}

export function recoverAddressesFromDigest(sigHex, digestHex) {
  const sig = hexToBytes(strip0x(sigHex))
  const digest = hexToBytes(strip0x(digestHex))
  if (sig.length < 64 || digest.length !== 32) return []

  const addresses = []
  const seen = new Set()
  for (let recid = 0; recid <= 3; recid++) {
    try {
      const addr = recoverWithRecid(digest, sig, recid)
      if (addr && !seen.has(addr.toLowerCase())) {
        seen.add(addr.toLowerCase())
        addresses.push(addr)
      }
    } catch {
      // wrong recid
    }
  }
  return addresses
}

export function recoverAddressesWebAuthn(sigHex, digestHex) {
  return recoverAddressesFromDigest(sigHex, digestHex)
}

export function recoverAddressesPersonal(sigHex, message) {
  const prefixed = `${PERSONAL_PREFIX}${message.length}${message}`
  const digest = keccak_256(new TextEncoder().encode(prefixed))
  return recoverAddressesFromDigest(sigHex, bytesToHex(digest))
}

export function recoverAddressesSha256(sigHex, message) {
  const digest = sha256(new TextEncoder().encode(message))
  return recoverAddressesFromDigest(sigHex, bytesToHex(digest))
}

export function recoverForHashType(sig, hashType, digest, challenge) {
  if (hashType === 'webauthn' && digest) {
    return recoverAddressesWebAuthn(sig, digest)
  }
  if (hashType === 'sha256') {
    return recoverAddressesSha256(sig, challenge)
  }
  return recoverAddressesPersonal(sig, challenge)
}
