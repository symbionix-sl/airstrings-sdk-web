export type AirStringsErrorCode =
  | 'UNKNOWN_KEY_ID'
  | 'SIGNATURE_VERIFICATION_FAILED'
  | 'UNSUPPORTED_FORMAT_VERSION'
  | 'INVALID_SIGNATURE_ENCODING'
  | 'INVALID_KEY_ID_ENCODING'
  | 'BUNDLE_DECODE_FAILED'
  | 'NETWORK_ERROR'

export interface AirStringsError {
  readonly code: AirStringsErrorCode
  readonly message: string
}

export function airStringsError(code: AirStringsErrorCode, message: string): AirStringsError {
  return { code, message }
}
