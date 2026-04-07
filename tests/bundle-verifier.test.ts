import { describe, it, expect } from 'vitest'
import * as ed from '@noble/ed25519'
import { verifyBundle } from '../src/security/bundle-verifier'
import { signedContent } from '../src/models/canonical-json'
import { encode as base64urlEncode } from '../src/security/base64url'
import { StringBundle } from '../src/models/string-bundle'

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

async function makeSignedBundle(
  overrides: Partial<StringBundle> & { privateKey: Uint8Array; publicKey?: Uint8Array },
): Promise<StringBundle> {
  const publicKey = overrides.publicKey ?? await ed.getPublicKeyAsync(overrides.privateKey)
  const keyId = overrides.key_id ?? toBase64(publicKey)

  const unsigned: StringBundle = {
    format_version: overrides.format_version ?? 1,
    project_id: overrides.project_id ?? 'proj_test12345678',
    locale: overrides.locale ?? 'en',
    revision: overrides.revision ?? 1,
    created_at: overrides.created_at ?? '2026-02-25T14:30:00Z',
    key_id: keyId,
    signature: '',
    strings: overrides.strings ?? { hello: { value: 'Hello World', format: 'text' } },
  }

  const canonicalBytes = signedContent(unsigned)
  const signatureBytes = await ed.signAsync(canonicalBytes, overrides.privateKey)
  const signatureBase64url = base64urlEncode(signatureBytes)

  return { ...unsigned, signature: signatureBase64url }
}

describe('BundleVerifier', () => {
  it('accepts a valid signature', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const publicKeyBase64 = toBase64(publicKey)

    const bundle = await makeSignedBundle({ privateKey, publicKey })
    const error = await verifyBundle(bundle, [publicKeyBase64])
    expect(error).toBeNull()
  })

  it('rejects wrong key', async () => {
    const signingKey = ed.utils.randomPrivateKey()
    const wrongKey = ed.utils.randomPrivateKey()
    const wrongPublic = await ed.getPublicKeyAsync(wrongKey)
    const wrongPublicBase64 = toBase64(wrongPublic)

    const bundle = await makeSignedBundle({
      privateKey: signingKey,
      key_id: wrongPublicBase64,
    })
    const error = await verifyBundle(bundle, [wrongPublicBase64])
    expect(error).not.toBeNull()
    expect(error!.code).toBe('SIGNATURE_VERIFICATION_FAILED')
  })

  it('rejects unknown key_id', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const otherKey = ed.utils.randomPrivateKey()
    const otherPublic = await ed.getPublicKeyAsync(otherKey)

    const bundle = await makeSignedBundle({ privateKey, publicKey })
    const error = await verifyBundle(bundle, [toBase64(otherPublic)])
    expect(error).not.toBeNull()
    expect(error!.code).toBe('UNKNOWN_KEY_ID')
  })

  it('rejects unsupported format_version', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)

    const bundle = await makeSignedBundle({ privateKey, publicKey, format_version: 99 })
    const error = await verifyBundle(bundle, [toBase64(publicKey)])
    expect(error).not.toBeNull()
    expect(error!.code).toBe('UNSUPPORTED_FORMAT_VERSION')
  })

  it('rejects invalid signature encoding', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const publicKeyBase64 = toBase64(publicKey)

    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'en',
      revision: 1,
      created_at: '2026-02-25T14:30:00Z',
      key_id: publicKeyBase64,
      signature: 'not-valid-base64url-!!@@##',
      strings: { hello: { value: 'Hello', format: 'text' } },
    }

    const error = await verifyBundle(bundle, [publicKeyBase64])
    expect(error).not.toBeNull()
    expect(error!.code).toBe('INVALID_SIGNATURE_ENCODING')
  })

  it('verifies with multiple strings (key ordering matters)', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)

    const bundle = await makeSignedBundle({
      privateKey,
      publicKey,
      strings: {
        'z.last': { value: 'Last', format: 'text' },
        'a.first': { value: 'First', format: 'text' },
        'm.middle': { value: 'Middle', format: 'text' },
      },
    })

    const error = await verifyBundle(bundle, [toBase64(publicKey)])
    expect(error).toBeNull()
  })

  it('rejects tampered strings', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)

    const original = await makeSignedBundle({
      privateKey,
      publicKey,
      strings: { key: { value: 'original', format: 'text' } },
    })

    const tampered: StringBundle = {
      ...original,
      strings: { key: { value: 'tampered', format: 'text' } },
    }

    const error = await verifyBundle(tampered, [toBase64(publicKey)])
    expect(error).not.toBeNull()
    expect(error!.code).toBe('SIGNATURE_VERIFICATION_FAILED')
  })

  it('rejects signature with wrong byte count', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const publicKeyBase64 = toBase64(publicKey)

    const shortSig = base64urlEncode(new Uint8Array(32))
    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'en',
      revision: 1,
      created_at: '2026-02-25T14:30:00Z',
      key_id: publicKeyBase64,
      signature: shortSig,
      strings: { hello: { value: 'Hello', format: 'text' } },
    }

    const error = await verifyBundle(bundle, [publicKeyBase64])
    expect(error).not.toBeNull()
    expect(error!.code).toBe('INVALID_SIGNATURE_ENCODING')
  })

  it('verifies bundle with ICU format strings', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)

    const bundle = await makeSignedBundle({
      privateKey,
      publicKey,
      strings: {
        greeting: { value: 'Hello!', format: 'text' },
        'items.count': { value: '{count, plural, one {# item} other {# items}}', format: 'icu' },
      },
    })

    const error = await verifyBundle(bundle, [toBase64(publicKey)])
    expect(error).toBeNull()
  })

  it('rejects key_id that decodes to wrong size', async () => {
    const shortKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(16)))

    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'en',
      revision: 1,
      created_at: '2026-02-25T14:30:00Z',
      key_id: shortKeyBase64,
      signature: '',
      strings: { hello: { value: 'Hello', format: 'text' } },
    }

    const error = await verifyBundle(bundle, [shortKeyBase64])
    expect(error).not.toBeNull()
    expect(error!.code).toBe('INVALID_KEY_ID_ENCODING')
  })
})
