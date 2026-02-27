import { describe, it, expect } from 'vitest'
import { encode, decode } from '../src/security/base64url'

describe('Base64URL', () => {
  it('decodes valid base64url', () => {
    const decoded = decode('SGVsbG8')
    expect(decoded).not.toBeNull()
    expect(new TextDecoder().decode(decoded!)).toBe('Hello')
  })

  it('decodes URL-safe characters correctly', () => {
    // Standard base64 "a+b/cw==" -> base64url "a-b_cw"
    const decoded = decode('a-b_cw')
    expect(decoded).not.toBeNull()
    // Compare with standard base64 decode
    const standard = Uint8Array.from(atob('a+b/cw=='), c => c.charCodeAt(0))
    expect(decoded).toEqual(standard)
  })

  it('handles missing padding', () => {
    const decoded = decode('YWI')
    expect(decoded).not.toBeNull()
    expect(new TextDecoder().decode(decoded!)).toBe('ab')
  })

  it('round-trips encode then decode', () => {
    const original = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd])
    const encoded = encode(original)
    const decoded = decode(encoded)
    expect(decoded).toEqual(original)
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(encoded).not.toContain('=')
  })

  it('64-byte signature encodes to exactly 86 characters', () => {
    const signatureBytes = new Uint8Array(64).fill(0xab)
    const encoded = encode(signatureBytes)
    expect(encoded.length).toBe(86)
    const decoded = decode(encoded)
    expect(decoded).not.toBeNull()
    expect(decoded!.length).toBe(64)
    expect(decoded).toEqual(signatureBytes)
  })

  it('decodes empty string', () => {
    const decoded = decode('')
    expect(decoded).not.toBeNull()
    expect(decoded!.length).toBe(0)
  })

  it('returns null for invalid input', () => {
    const decoded = decode('!!!invalid!!!')
    expect(decoded).toBeNull()
  })
})
