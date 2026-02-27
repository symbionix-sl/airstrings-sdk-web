/**
 * Base64url encoding/decoding per RFC 4648 section 5.
 * Uses `-` instead of `+`, `_` instead of `/`, no padding.
 */

export function decode(input: string): Uint8Array | null {
  try {
    let base64 = input
      .replace(/-/g, '+')
      .replace(/_/g, '/')
    const remainder = base64.length % 4
    if (remainder > 0) {
      base64 += '='.repeat(4 - remainder)
    }
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}

export function encode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
