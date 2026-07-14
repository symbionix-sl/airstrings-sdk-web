export type StringFormat = 'text' | 'icu'

export interface ExperimentConfig {
  readonly id: string
  readonly allocation: Readonly<Record<string, number>>
  readonly variants: Readonly<Record<string, string>>
}

export interface StringEntry {
  readonly value: string
  readonly format: StringFormat
  readonly experiment?: ExperimentConfig
}

export interface StringBundle {
  readonly format_version: number
  readonly project_id: string
  readonly locale: string
  readonly revision: number
  readonly created_at: string
  readonly key_id: string
  readonly signature: string
  readonly experiments_signature?: string
  readonly strings: Readonly<Record<string, StringEntry>>
}

function isStringEntry(v: unknown): v is StringEntry {
  if (typeof v !== 'object' || v === null) return false
  const obj = v as Record<string, unknown>
  return (
    typeof obj['value'] === 'string' &&
    (obj['format'] === 'text' || obj['format'] === 'icu')
  )
}

function isExperimentConfig(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false
  const obj = v as Record<string, unknown>
  if (typeof obj['id'] !== 'string') return false
  if (typeof obj['allocation'] !== 'object' || obj['allocation'] === null) return false
  if (typeof obj['variants'] !== 'object' || obj['variants'] === null) return false
  const allocation = obj['allocation'] as Record<string, unknown>
  for (const key of Object.keys(allocation)) {
    if (typeof allocation[key] !== 'number') return false
  }
  const variants = obj['variants'] as Record<string, unknown>
  for (const key of Object.keys(variants)) {
    if (typeof variants[key] !== 'string') return false
  }
  return true
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
    const strings = obj['strings'] as Record<string, unknown>
    for (const key of Object.keys(strings)) {
      const entry = strings[key]
      if (!isStringEntry(entry)) return null
      const record = entry as unknown as Record<string, unknown>
      if ('experiment' in record && !isExperimentConfig(record['experiment'])) {
        delete record['experiment']
      }
    }
    if (typeof obj['experiments_signature'] !== 'string') {
      delete obj['experiments_signature']
    }
    return parsed as StringBundle
  } catch {
    return null
  }
}
