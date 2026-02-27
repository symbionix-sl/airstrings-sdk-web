import { describe, it, expect } from 'vitest'
import * as ed from '@noble/ed25519'
import { verifyBundle } from '../src/security/bundle-verifier'
import { signedContent } from '../src/models/canonical-json'
import { encode as base64urlEncode } from '../src/security/base64url'
import { StringBundle } from '../src/models/string-bundle'

async function makeSignedBundle(
  overrides: Partial<StringBundle> & { privateKey: Uint8Array },
): Promise<StringBundle> {
  const unsigned: StringBundle = {
    format_version: overrides.format_version ?? 1,
    project_id: overrides.project_id ?? 'proj_test12345678',
    locale: overrides.locale ?? 'en',
    revision: overrides.revision ?? 1,
    created_at: overrides.created_at ?? '2026-02-25T14:30:00Z',
    key_id: overrides.key_id ?? 'key_test_01',
    signature: '',
    strings: overrides.strings ?? { hello: 'Hello World' },
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

    const bundle = await makeSignedBundle({ privateKey })
    const error = await verifyBundle(bundle, { key_test_01: publicKey })
    expect(error).toBeNull()
  })

  it('rejects wrong key', async () => {
    const signingKey = ed.utils.randomPrivateKey()
    const wrongKey = ed.utils.randomPrivateKey()
    const wrongPublic = await ed.getPublicKeyAsync(wrongKey)

    const bundle = await makeSignedBundle({ privateKey: signingKey })
    const error = await verifyBundle(bundle, { key_test_01: wrongPublic })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('SIGNATURE_VERIFICATION_FAILED')
  })

  it('rejects unknown key_id', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)

    const bundle = await makeSignedBundle({ privateKey, key_id: 'key_unknown_99' })
    const error = await verifyBundle(bundle, { key_test_01: publicKey })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('UNKNOWN_KEY_ID')
  })

  it('rejects unsupported format_version', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)

    const bundle = await makeSignedBundle({ privateKey, format_version: 99 })
    const error = await verifyBundle(bundle, { key_test_01: publicKey })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('UNSUPPORTED_FORMAT_VERSION')
  })

  it('rejects invalid signature encoding', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)

    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'en',
      revision: 1,
      created_at: '2026-02-25T14:30:00Z',
      key_id: 'key_test_01',
      signature: 'not-valid-base64url-!!@@##',
      strings: { hello: 'Hello' },
    }

    const error = await verifyBundle(bundle, { key_test_01: publicKey })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('INVALID_SIGNATURE_ENCODING')
  })

  it('verifies with multiple strings (key ordering matters)', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)

    const bundle = await makeSignedBundle({
      privateKey,
      strings: {
        'z.last': 'Last',
        'a.first': 'First',
        'm.middle': 'Middle',
      },
    })

    const error = await verifyBundle(bundle, { key_test_01: publicKey })
    expect(error).toBeNull()
  })

  it('rejects tampered strings', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)

    const original = await makeSignedBundle({
      privateKey,
      strings: { key: 'original' },
    })

    const tampered: StringBundle = {
      ...original,
      strings: { key: 'tampered' },
    }

    const error = await verifyBundle(tampered, { key_test_01: publicKey })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('SIGNATURE_VERIFICATION_FAILED')
  })

  it('rejects signature with wrong byte count', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)

    const shortSig = base64urlEncode(new Uint8Array(32))
    const bundle: StringBundle = {
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'en',
      revision: 1,
      created_at: '2026-02-25T14:30:00Z',
      key_id: 'key_test_01',
      signature: shortSig,
      strings: { hello: 'Hello' },
    }

    const error = await verifyBundle(bundle, { key_test_01: publicKey })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('INVALID_SIGNATURE_ENCODING')
  })
})
