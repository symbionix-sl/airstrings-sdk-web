import { StringBundle } from './string-bundle'

/**
 * Produces the canonical JSON byte string used for Ed25519 signature verification.
 *
 * Canonical JSON rules (matching RFC 8785 / JCS subset):
 * - No whitespace between tokens
 * - Object keys sorted lexicographically by Unicode code point (recursive)
 * - No trailing commas
 * - Integers serialized without `.0`
 * - Strings escaped per RFC 8259 (only `"`, `\`, and control chars U+0000-U+001F)
 * - UTF-8 encoding, no BOM
 */
export function signedContent(bundle: StringBundle): Uint8Array {
  let json = '{'
  json += '"format_version":' + String(bundle.format_version)
  json += ',"project_id":' + escapeString(bundle.project_id)
  json += ',"locale":' + escapeString(bundle.locale)
  json += ',"revision":' + String(bundle.revision)
  json += ',"created_at":' + escapeString(bundle.created_at)
  json += ',"strings":{'

  const sortedKeys = Object.keys(bundle.strings).sort()
  for (let i = 0; i < sortedKeys.length; i++) {
    if (i > 0) json += ','
    const entry = bundle.strings[sortedKeys[i]!]!
    json += escapeString(sortedKeys[i]!) + ':{"format":' + escapeString(entry.format) + ',"value":' + escapeString(entry.value) + '}'
  }

  json += '}}'
  return new TextEncoder().encode(json)
}

function escapeString(s: string): string {
  let result = '"'
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    switch (code) {
      case 0x22: // "
        result += '\\"'
        break
      case 0x5c: // \
        result += '\\\\'
        break
      case 0x08: // backspace
        result += '\\b'
        break
      case 0x0c: // form feed
        result += '\\f'
        break
      case 0x0a: // newline
        result += '\\n'
        break
      case 0x0d: // carriage return
        result += '\\r'
        break
      case 0x09: // tab
        result += '\\t'
        break
      default:
        if (code < 0x20) {
          result += '\\u' + code.toString(16).padStart(4, '0')
        } else {
          result += s[i]
        }
    }
  }
  result += '"'
  return result
}
