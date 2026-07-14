import { sha256 } from '@noble/hashes/sha256'
import { StringEntry } from '../models/string-bundle'

export interface VariantSelection {
  readonly variant: string
  readonly value: string
}

export function bucketFor(experimentId: string, assignmentId: string): number {
  const digest = sha256(new TextEncoder().encode(experimentId + ':' + assignmentId))
  const uint32 =
    ((digest[0]! << 24) | (digest[1]! << 16) | (digest[2]! << 8) | digest[3]!) >>> 0
  return uint32 % 100
}

export function selectVariant(
  entry: StringEntry,
  assignmentId: string | null | undefined,
): VariantSelection | null {
  const experiment = entry.experiment
  if (!experiment) return null
  if (assignmentId === null || assignmentId === undefined) return null
  if (experiment.id === '') return null

  const allocation = experiment.allocation
  const names = Object.keys(allocation)
  let sum = 0
  for (const name of names) {
    const weight = allocation[name]!
    if (!Number.isInteger(weight) || weight < 0) return null
    sum += weight
  }
  if (sum !== 100) return null

  const bucket = bucketFor(experiment.id, assignmentId)
  const sorted = names.sort()
  let acc = 0
  for (const name of sorted) {
    acc += allocation[name]!
    if (bucket < acc) {
      if (name === 'control') return { variant: 'control', value: entry.value }
      const value = experiment.variants[name]
      if (typeof value !== 'string') return null
      return { variant: name, value }
    }
  }
  return null
}
