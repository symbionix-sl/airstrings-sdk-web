export interface StringBundle {
  readonly format_version: number
  readonly project_id: string
  readonly locale: string
  readonly revision: number
  readonly created_at: string
  readonly key_id: string
  readonly signature: string
  readonly strings: Readonly<Record<string, string>>
}

export function parseBundle(json: string): StringBundle | null {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    if (
      typeof obj['format_version'] !== 'number' ||
      typeof obj['project_id'] !== 'string' ||
      typeof obj['locale'] !== 'string' ||
      typeof obj['revision'] !== 'number' ||
      typeof obj['created_at'] !== 'string' ||
      typeof obj['key_id'] !== 'string' ||
      typeof obj['signature'] !== 'string' ||
      typeof obj['strings'] !== 'object' ||
      obj['strings'] === null
    ) {
      return null
    }
    return parsed as StringBundle
  } catch {
    return null
  }
}
