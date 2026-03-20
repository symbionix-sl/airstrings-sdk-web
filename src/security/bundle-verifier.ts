import { verifyAsync } from '@noble/ed25519'
import { StringBundle } from '../models/string-bundle'
import { signedContent } from '../models/canonical-json'
import { decode as base64urlDecode } from './base64url'
import { AirStringsError, airStringsError } from '../airstrings-error'

/**
 * Verifies a bundle's Ed25519 signature per the AirStrings contract.
 *
 * [publicKeys] is an array of base64-encoded Ed25519 public keys (standard encoding, 44 chars each).
 * The bundle's `key_id` is the base64 encoding of the signing key. Verification checks that
 * `key_id` is in the configured array, then base64-decodes it to obtain the raw key bytes.
 *
 * Verification order (per contract):
 * 1. Check key_id ∈ publicKeys -> unknown key = hard error
 * 2. Base64-decode key_id -> invalid encoding = hard error
 * 3. Build canonical signed content
 * 4. Base64url-decode signature -> must be exactly 64 bytes
 * 5. Verify Ed25519 signature -> failure = hard error
 * 6. Check format_version -> unknown version = hard error
 */
export async function verifyBundle(
  bundle: StringBundle,
  publicKeys: readonly string[],
): Promise<AirStringsError | null> {
  if (!publicKeys.includes(bundle.key_id)) {
    return airStringsError('UNKNOWN_KEY_ID', `Unknown key_id: ${bundle.key_id}`)
  }

  let keyData: Uint8Array
  try {
    const binary = atob(bundle.key_id)
    keyData = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      keyData[i] = binary.charCodeAt(i)
    }
  } catch {
    return airStringsError('INVALID_KEY_ID_ENCODING', `key_id is not valid base64: ${bundle.key_id}`)
  }

  if (keyData.length !== 32) {
    return airStringsError('INVALID_KEY_ID_ENCODING', `key_id must decode to 32 bytes, got ${keyData.length}: ${bundle.key_id}`)
  }

  const signatureBytes = base64urlDecode(bundle.signature)
  if (!signatureBytes || signatureBytes.length !== 64) {
    return airStringsError('INVALID_SIGNATURE_ENCODING', 'Signature must decode to exactly 64 bytes')
  }

  const canonicalBytes = signedContent(bundle)
  const valid = await verifyAsync(signatureBytes, canonicalBytes, keyData)
  if (!valid) {
    return airStringsError('SIGNATURE_VERIFICATION_FAILED', 'Ed25519 signature verification failed')
  }

  if (bundle.format_version !== 1) {
    return airStringsError('UNSUPPORTED_FORMAT_VERSION', `Unsupported format_version: ${bundle.format_version}`)
  }

  return null
}
