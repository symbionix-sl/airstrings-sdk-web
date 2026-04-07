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
        'onboarding.welcome_title': { value: 'Welcome to Acme', format: 'text' },
        'onboarding.welcome_body': { value: 'Get started in minutes.', format: 'text' },
        'settings.language': { value: 'Language', format: 'text' },
        'items.count': { value: '{count, plural, one {# item} other {# items}}', format: 'icu' },
        'error.network': { value: 'Something went wrong. Please try again.', format: 'text' },
      },
    }

    const result = toUTF8(signedContent(bundle))
    const expected =
      '{"format_version":1,"project_id":"proj_a1b2c3d4e5f6","locale":"en-US","revision":42,"created_at":"2026-02-25T14:30:00Z","strings":{"error.network":{"format":"text","value":"Something went wrong. Please try again."},"items.count":{"format":"icu","value":"{count, plural, one {# item} other {# items}}"},"onboarding.welcome_body":{"format":"text","value":"Get started in minutes."},"onboarding.welcome_title":{"format":"text","value":"Welcome to Acme"},"settings.language":{"format":"text","value":"Language"}}}'

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
      strings: {
        'z.last': { value: 'Z', format: 'text' },
        'a.first': { value: 'A', format: 'text' },
        'm.middle': { value: 'M', format: 'text' },
      },
    }

    const result = toUTF8(signedContent(bundle))
    expect(result).toContain('"a.first":{"format":"text","value":"A"},"m.middle":{"format":"text","value":"M"},"z.last":{"format":"text","value":"Z"}')
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
      strings: { key: { value: 'value', format: 'text' } },
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

  it('escapes special characters in string values', () => {
    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'en',
      revision: 1,
      created_at: '2026-01-01T00:00:00Z',
      key_id: 'key_test_01',
      signature: 'dummy',
      strings: { key: { value: 'line1\nline2\ttab "quoted" back\\slash', format: 'text' } },
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
      strings: { key: { value: 'before\x01after', format: 'text' } },
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
      strings: { greeting: { value: 'こんにちは', format: 'text' } },
    }

    const result = toUTF8(signedContent(bundle))
    expect(result).toContain('"greeting":{"format":"text","value":"こんにちは"}')
  })

  it('serializes string entries with format before value (lexicographic)', () => {
    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'en',
      revision: 1,
      created_at: '2026-01-01T00:00:00Z',
      key_id: 'key_test_01',
      signature: 'dummy',
      strings: {
        hello: { value: 'Hello', format: 'text' },
        count: { value: '{n, plural, one {# item} other {# items}}', format: 'icu' },
      },
    }

    const result = toUTF8(signedContent(bundle))
    expect(result).toContain('"count":{"format":"icu","value":"{n, plural, one {# item} other {# items}}"}')
    expect(result).toContain('"hello":{"format":"text","value":"Hello"}')
  })
})
