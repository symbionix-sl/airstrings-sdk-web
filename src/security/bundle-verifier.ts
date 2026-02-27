import { verifyAsync } from '@noble/ed25519'
import { StringBundle } from '../models/string-bundle'
import { signedContent } from '../models/canonical-json'
import { decode as base64urlDecode } from './base64url'
import { AirStringsError, airStringsError } from '../airstrings-error'

export type VerifierKeys = Readonly<Record<string, Uint8Array>>

/**
 * Verifies a bundle's Ed25519 signature per the AirStrings contract.
 *
 * Verification order (per contract):
 * 1. Look up key_id -> unknown key = hard error
 * 2. Build canonical signed content
 * 3. Base64url-decode signature -> must be exactly 64 bytes
 * 4. Verify Ed25519 signature -> failure = hard error
 * 5. Check format_version -> unknown version = hard error
 */
export async function verifyBundle(
  bundle: StringBundle,
  publicKeys: VerifierKeys,
): Promise<AirStringsError | null> {
  const keyData = publicKeys[bundle.key_id]
  if (!keyData) {
    return airStringsError('UNKNOWN_KEY_ID', `Unknown key_id: ${bundle.key_id}`)
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
