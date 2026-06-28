import {
  scoreField,
  scoreRecord,
  GroundTruth,
} from '../../../scripts/evals/invoiceExtraction/scoring'
import { Extraction } from '../../../services/invoiceExtraction/schema'

function buildExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    vendor: 'Albert Heijn',
    invoiceDate: '2026-06-18',
    currency: 'EUR',
    subtotal: 18.45,
    vatBreakdown: [{ rate: 9, amount: 1.66 }],
    vatAmount: 1.66,
    total: 20.11,
    lineItems: [],
    ...overrides,
  }
}

function buildGroundTruth(overrides: Partial<GroundTruth> = {}): GroundTruth {
  return {
    vendor: 'Albert Heijn',
    date: '2026-06-18',
    total: 20.11,
    taxLow: 1.66,
    taxHigh: 0,
    ...overrides,
  }
}

describe('scoreField', () => {
  it('matches numeric fields within the shared amount tolerance', () => {
    expect(scoreField(20.1, 20.11, 'amount')).toBe(true)
  })

  it('rejects numeric fields outside the tolerance', () => {
    expect(scoreField(19, 20.11, 'amount')).toBe(false)
  })

  it('matches strings case-insensitively after trimming', () => {
    expect(scoreField('  Albert Heijn ', 'albert heijn', 'string')).toBe(true)
  })

  it('matches dates by calendar day only', () => {
    expect(scoreField('2026-06-18', '2026-06-18', 'date')).toBe(true)
  })

  it('returns null (not scorable) when ground truth is null or undefined', () => {
    expect(scoreField('anything', null, 'string')).toBeNull()
    expect(scoreField('anything', undefined, 'amount')).toBeNull()
  })
})

describe('scoreRecord', () => {
  it('scores vendor, date, total, taxLow, and taxHigh against ground truth', () => {
    const scores = scoreRecord(buildExtraction(), buildGroundTruth())
    const byField = Object.fromEntries(scores.map((s) => [s.field, s.correct]))

    expect(byField.vendor).toBe(true)
    expect(byField.invoiceDate).toBe(true)
    expect(byField.total).toBe(true)
    expect(byField.taxLow).toBe(true)
    expect(byField.taxHigh).toBe(true)
  })

  it('maps vatBreakdown 9%/21% buckets to taxLow/taxHigh before comparing', () => {
    const scores = scoreRecord(
      buildExtraction({
        vatBreakdown: [
          { rate: 9, amount: 1.66 },
          { rate: 21, amount: 3.5 },
        ],
      }),
      buildGroundTruth({ taxLow: 1.66, taxHigh: 3.5 }),
    )
    const byField = Object.fromEntries(scores.map((s) => [s.field, s.correct]))

    expect(byField.taxLow).toBe(true)
    expect(byField.taxHigh).toBe(true)
  })

  it('excludes a field from scoring when ground truth has no value for it', () => {
    const scores = scoreRecord(
      buildExtraction(),
      buildGroundTruth({ vendor: undefined }),
    )
    const fields = scores.map((s) => s.field)
    expect(fields).not.toContain('vendor')
  })

  it('marks total as incorrect when it does not match', () => {
    const scores = scoreRecord(
      buildExtraction({ total: 999 }),
      buildGroundTruth(),
    )
    const totalScore = scores.find((s) => s.field === 'total')
    expect(totalScore?.correct).toBe(false)
  })
})
