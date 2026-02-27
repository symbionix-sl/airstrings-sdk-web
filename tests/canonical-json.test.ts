import { describe, it, expect } from 'vitest'
import { signedContent } from '../src/models/canonical-json'
import { StringBundle } from '../src/models/string-bundle'

function toUTF8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

describe('CanonicalJSON', () => {
  it('matches contract example byte-for-byte', () => {
    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_a1b2c3d4e5f6',
      locale: 'en-US',
      revision: 42,
      created_at: '2026-02-25T14:30:00Z',
      key_id: 'key_prod_01',
      signature: 'dummy',
      strings: {
        'onboarding.welcome_title': 'Welcome to Acme',
        'onboarding.welcome_body': 'Get started in minutes.',
        'settings.language': 'Language',
        'error.network': 'Something went wrong. Please try again.',
      },
    }

    const result = toUTF8(signedContent(bundle))
    const expected =
      '{"format_version":1,"project_id":"proj_a1b2c3d4e5f6","locale":"en-US","revision":42,"created_at":"2026-02-25T14:30:00Z","strings":{"error.network":"Something went wrong. Please try again.","onboarding.welcome_body":"Get started in minutes.","onboarding.welcome_title":"Welcome to Acme","settings.language":"Language"}}'

    expect(result).toBe(expected)
  })

  it('sorts keys alphabetically', () => {
    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'en',
      revision: 1,
      created_at: '2026-01-01T00:00:00Z',
      key_id: 'key_test_01',
      signature: 'dummy',
      strings: { 'z.last': 'Z', 'a.first': 'A', 'm.middle': 'M' },
    }

    const result = toUTF8(signedContent(bundle))
    expect(result).toContain('"a.first":"A","m.middle":"M","z.last":"Z"')
  })

  it('produces no whitespace', () => {
    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'en',
      revision: 1,
      created_at: '2026-01-01T00:00:00Z',
      key_id: 'key_test_01',
      signature: 'dummy',
      strings: { key: 'value' },
    }

    const result = toUTF8(signedContent(bundle))
    expect(result).not.toContain(' ')
    expect(result).not.toContain('\n')
  })

  it('serializes integers without decimal point', () => {
    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'en',
      revision: 100,
      created_at: '2026-01-01T00:00:00Z',
      key_id: 'key_test_01',
      signature: 'dummy',
      strings: {},
    }

    const result = toUTF8(signedContent(bundle))
    expect(result).toContain('"format_version":1,')
    expect(result).toContain('"revision":100,"created_at"')
    expect(result).not.toContain('1.0')
    expect(result).not.toContain('100.0')
  })

  it('escapes special characters in strings', () => {
    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'en',
      revision: 1,
      created_at: '2026-01-01T00:00:00Z',
      key_id: 'key_test_01',
      signature: 'dummy',
      strings: { key: 'line1\nline2\ttab "quoted" back\\slash' },
    }

    const result = toUTF8(signedContent(bundle))
    expect(result).toContain('line1\\nline2\\ttab \\"quoted\\" back\\\\slash')
  })

  it('escapes control characters with \\uXXXX', () => {
    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'en',
      revision: 1,
      created_at: '2026-01-01T00:00:00Z',
      key_id: 'key_test_01',
      signature: 'dummy',
      strings: { key: 'before\x01after' },
    }

    const result = toUTF8(signedContent(bundle))
    expect(result).toContain('before\\u0001after')
  })

  it('handles empty strings object', () => {
    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'en',
      revision: 1,
      created_at: '2026-01-01T00:00:00Z',
      key_id: 'key_test_01',
      signature: 'dummy',
      strings: {},
    }

    const result = toUTF8(signedContent(bundle))
    expect(result).toMatch(/"strings":\{\}}"?$/)
  })

  it('handles Unicode characters without escaping', () => {
    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'ja',
      revision: 1,
      created_at: '2026-01-01T00:00:00Z',
      key_id: 'key_test_01',
      signature: 'dummy',
      strings: { greeting: 'こんにちは' },
    }

    const result = toUTF8(signedContent(bundle))
    expect(result).toContain('"greeting":"こんにちは"')
  })
})
