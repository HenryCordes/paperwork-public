import { Extraction } from '../../../../services/invoiceExtraction/schema'
import {
  validateExtraction,
  needsReview,
} from '../../../../services/invoiceExtraction/validate'

function buildExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    vendor: 'Albert Heijn',
    invoiceDate: '2026-06-18',
    currency: 'EUR',
    subtotal: 18.45,
    vatBreakdown: [{ rate: 9, amount: 1.66 }],
    vatAmount: 1.66,
    total: 20.11,
    lineItems: [
      {
        description: 'Melk',
        quantity: 2,
        unitPrice: 1.39,
        taxRate: 9,
        lineTotal: 2.78,
      },
      {
        description: 'Brood',
        quantity: 1,
        unitPrice: 15.67,
        taxRate: 9,
        lineTotal: 15.67,
      },
    ],
    ...overrides,
  }
}

describe('validateExtraction', () => {
  it('produces no warnings for a fully consistent extraction', () => {
    const result = validateExtraction(buildExtraction())
    expect(result.warnings).toEqual([])
  })

  it('warns when line items do not sum to subtotal', () => {
    const result = validateExtraction(buildExtraction({ subtotal: 100 }))
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'LINE_ITEMS_SUBTOTAL_MISMATCH' }),
    )
  })

  it('does not check line-item sum when there are no line items', () => {
    const result = validateExtraction(
      buildExtraction({ lineItems: [], subtotal: 100 }),
    )
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'LINE_ITEMS_SUBTOTAL_MISMATCH' }),
    )
  })

  it('warns when vatBreakdown does not sum to vatAmount', () => {
    const result = validateExtraction(buildExtraction({ vatAmount: 5 }))
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'VAT_BREAKDOWN_MISMATCH' }),
    )
  })

  it('warns when subtotal + vatAmount does not match total', () => {
    const result = validateExtraction(buildExtraction({ total: 999 }))
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'SUBTOTAL_VAT_TOTAL_MISMATCH' }),
    )
  })

  it('warns on a VAT breakdown rate outside {0, 9, 21}', () => {
    const result = validateExtraction(
      buildExtraction({ vatBreakdown: [{ rate: 19, amount: 1.66 }] }),
    )
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'VAT_RATE_UNUSUAL',
        field: 'vatBreakdown[0].rate',
      }),
    )
  })

  it('warns on a line item tax rate outside {0, 9, 21}, never rejects', () => {
    const result = validateExtraction(
      buildExtraction({
        lineItems: [
          {
            description: 'Import duty',
            quantity: 1,
            unitPrice: 10,
            taxRate: 19,
            lineTotal: 10,
          },
        ],
      }),
    )
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'VAT_RATE_UNUSUAL',
        field: 'lineItems[0].taxRate',
      }),
    )
  })

  it('warns when invoiceDate is more than 1 day in the future', () => {
    const future = new Date()
    future.setDate(future.getDate() + 5)
    const result = validateExtraction(
      buildExtraction({ invoiceDate: future.toISOString().split('T')[0] }),
    )
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'DATE_OUT_OF_RANGE' }),
    )
  })

  it('warns when invoiceDate is more than 6 years in the past', () => {
    const past = new Date()
    past.setFullYear(past.getFullYear() - 7)
    const result = validateExtraction(
      buildExtraction({ invoiceDate: past.toISOString().split('T')[0] }),
    )
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'DATE_OUT_OF_RANGE' }),
    )
  })

  it('does not check date range when invoiceDate is null', () => {
    const result = validateExtraction(buildExtraction({ invoiceDate: null }))
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'DATE_OUT_OF_RANGE' }),
    )
  })
})

describe('needsReview', () => {
  it('is true when there are warnings, regardless of confidence', () => {
    expect(needsReview([{ code: 'X', message: 'x' }], 0.99)).toBe(true)
  })

  it('is true when confidence is below the default threshold', () => {
    expect(needsReview([], 0.5)).toBe(true)
  })

  it('is false when there are no warnings and confidence meets the default threshold', () => {
    expect(needsReview([], 0.75)).toBe(false)
  })

  it('respects a custom threshold', () => {
    expect(needsReview([], 0.8, 0.9)).toBe(true)
  })
})
