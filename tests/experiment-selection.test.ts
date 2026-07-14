import { describe, it, expect } from 'vitest'
import { bucketFor, selectVariant } from '../src/security/experiment-selection'
import { parseBundle, StringEntry, ExperimentConfig } from '../src/models/string-bundle'

function makeEntry(experiment: ExperimentConfig, value = 'BASE'): StringEntry {
  return { value, format: 'text', experiment }
}

const vectors = [
  {
    experimentId: 'exp_checkout_cta',
    assignmentId: 'user_1',
    allocation: { control: 50, variant_a: 50 },
    variants: { variant_a: 'Variant A copy' },
    bucket: 78,
    variant: 'variant_a',
  },
  {
    experimentId: 'exp_checkout_cta',
    assignmentId: 'user_2',
    allocation: { control: 50, variant_a: 50 },
    variants: { variant_a: 'Variant A copy' },
    bucket: 19,
    variant: 'control',
  },
  {
    experimentId: 'exp_paywall_title',
    assignmentId: 'user_2',
    allocation: { control: 34, variant_a: 33, variant_b: 33 },
    variants: { variant_a: 'A title', variant_b: 'B title' },
    bucket: 50,
    variant: 'variant_a',
  },
  {
    experimentId: 'exp_paywall_title',
    assignmentId: 'device-9f8e7d',
    allocation: { control: 34, variant_a: 33, variant_b: 33 },
    variants: { variant_a: 'A title', variant_b: 'B title' },
    bucket: 78,
    variant: 'variant_b',
  },
  {
    experimentId: 'exp_unicode',
    assignmentId: 'ユーザー_1',
    allocation: { control: 50, variant_a: 50 },
    variants: { variant_a: 'A copy' },
    bucket: 97,
    variant: 'variant_a',
  },
  {
    experimentId: 'exp_edge',
    assignmentId: 'u',
    allocation: { a_variant: 10, control: 90 },
    variants: { a_variant: 'AV copy' },
    bucket: 15,
    variant: 'control',
  },
]

describe('bucketFor', () => {
  for (const v of vectors) {
    it(`buckets ${v.experimentId}/${v.assignmentId} to ${v.bucket}`, () => {
      expect(bucketFor(v.experimentId, v.assignmentId)).toBe(v.bucket)
    })
  }

  it('returns a value in [0, 99]', () => {
    const b = bucketFor('exp_range', 'anyone')
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThan(100)
  })
})

describe('selectVariant', () => {
  for (const v of vectors) {
    it(`selects ${v.variant} for ${v.experimentId}/${v.assignmentId}`, () => {
      const entry = makeEntry({
        id: v.experimentId,
        allocation: v.allocation,
        variants: v.variants,
      })
      const result = selectVariant(entry, v.assignmentId)
      expect(result).not.toBeNull()
      expect(result!.variant).toBe(v.variant)
      if (v.variant === 'control') {
        expect(result!.value).toBe('BASE')
      } else {
        expect(result!.value).toBe(v.variants[v.variant as keyof typeof v.variants])
      }
    })
  }

  it('resolves a control selection to the base value and stays distinguishable from null', () => {
    const entry = makeEntry(
      {
        id: 'exp_checkout_cta',
        allocation: { control: 50, variant_a: 50 },
        variants: { variant_a: 'A copy' },
      },
      'Base checkout copy',
    )
    const result = selectVariant(entry, 'user_2')
    expect(result).not.toBeNull()
    expect(result).toEqual({ variant: 'control', value: 'Base checkout copy' })
  })

  it('returns null when allocation sum is not 100', () => {
    const entry = makeEntry({
      id: 'exp_bad_sum',
      allocation: { control: 40, variant_a: 40 },
      variants: { variant_a: 'A copy' },
    })
    expect(selectVariant(entry, 'user_1')).toBeNull()
  })

  it('returns null when an allocation value is not an integer', () => {
    const entry = makeEntry({
      id: 'exp_fraction',
      allocation: { control: 50.5, variant_a: 49.5 },
      variants: { variant_a: 'A copy' },
    })
    expect(selectVariant(entry, 'user_1')).toBeNull()
  })

  it('returns null when an allocation value is negative', () => {
    const entry = makeEntry({
      id: 'exp_negative',
      allocation: { control: 110, variant_a: -10 },
      variants: { variant_a: 'A copy' },
    })
    expect(selectVariant(entry, 'user_1')).toBeNull()
  })

  it('returns null when the selected non-control variant value is missing', () => {
    const entry = makeEntry({
      id: 'exp_checkout_cta',
      allocation: { control: 50, variant_a: 50 },
      variants: {},
    })
    expect(selectVariant(entry, 'user_1')).toBeNull()
  })

  it('returns null when the experiment id is empty', () => {
    const entry = makeEntry({
      id: '',
      allocation: { control: 50, variant_a: 50 },
      variants: { variant_a: 'A copy' },
    })
    expect(selectVariant(entry, 'user_1')).toBeNull()
  })

  it('returns null when assignmentId is null', () => {
    const entry = makeEntry({
      id: 'exp_checkout_cta',
      allocation: { control: 50, variant_a: 50 },
      variants: { variant_a: 'A copy' },
    })
    expect(selectVariant(entry, null)).toBeNull()
  })

  it('returns null when assignmentId is undefined', () => {
    const entry = makeEntry({
      id: 'exp_checkout_cta',
      allocation: { control: 50, variant_a: 50 },
      variants: { variant_a: 'A copy' },
    })
    expect(selectVariant(entry, undefined)).toBeNull()
  })

  it('returns null when the entry has no experiment', () => {
    const entry: StringEntry = { value: 'BASE', format: 'text' }
    expect(selectVariant(entry, 'user_1')).toBeNull()
  })
})

describe('parseBundle experiment tolerance', () => {
  function bundleWith(strings: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
    return JSON.stringify({
      format_version: 1,
      project_id: 'proj_test12345678',
      locale: 'en',
      revision: 1,
      created_at: '2026-02-25T14:30:00Z',
      key_id: 'k1',
      signature: 'sig',
      strings,
      ...extra,
    })
  }

  it('parses an old bundle with no experiment fields; entries have experiment undefined', () => {
    const bundle = parseBundle(
      bundleWith({ greeting: { value: 'Hello!', format: 'text' } }),
    )
    expect(bundle).not.toBeNull()
    expect(bundle!.strings['greeting']!.experiment).toBeUndefined()
    expect(bundle!.experiments_signature).toBeUndefined()
  })

  it('keeps a well-formed experiment on the entry', () => {
    const bundle = parseBundle(
      bundleWith(
        {
          cta: {
            value: 'Base',
            format: 'text',
            experiment: {
              id: 'exp_checkout_cta',
              allocation: { control: 50, variant_a: 50 },
              variants: { variant_a: 'A copy' },
            },
          },
        },
        { experiments_signature: 'exp_sig' },
      ),
    )
    expect(bundle).not.toBeNull()
    expect(bundle!.strings['cta']!.experiment!.id).toBe('exp_checkout_cta')
    expect(bundle!.experiments_signature).toBe('exp_sig')
  })

  it('treats a malformed experiment as absent without rejecting the bundle', () => {
    const bundle = parseBundle(
      bundleWith({
        cta: { value: 'Base', format: 'text', experiment: 'not-an-object' },
        other: {
          value: 'Base2',
          format: 'text',
          experiment: { id: 'exp_partial', allocation: { control: 50 } },
        },
      }),
    )
    expect(bundle).not.toBeNull()
    expect(bundle!.strings['cta']!.value).toBe('Base')
    expect(bundle!.strings['cta']!.experiment).toBeUndefined()
    expect(bundle!.strings['other']!.experiment).toBeUndefined()
  })

  it('treats a non-string experiments_signature as absent without rejecting the bundle', () => {
    const bundle = parseBundle(
      bundleWith(
        { greeting: { value: 'Hello!', format: 'text' } },
        { experiments_signature: 12345 },
      ),
    )
    expect(bundle).not.toBeNull()
    expect(bundle!.experiments_signature).toBeUndefined()
  })
})
