import {
  extractionSchema,
  confidenceSchema,
} from '../../../../services/invoiceExtraction/schema'

describe('extractionSchema', () => {
  const validExtraction = {
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
    ],
  }

  it('parses a valid extraction payload', () => {
    const result = extractionSchema.safeParse(validExtraction)
    expect(result.success).toBe(true)
  })

  it('defaults currency to EUR when omitted', () => {
    const { currency, ...rest } = validExtraction
    const result = extractionSchema.safeParse(rest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.currency).toBe('EUR')
    }
  })

  it('allows null vendor, invoiceDate, subtotal, and vatAmount', () => {
    const result = extractionSchema.safeParse({
      ...validExtraction,
      vendor: null,
      invoiceDate: null,
      subtotal: null,
      vatAmount: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a missing total', () => {
    const { total, ...rest } = validExtraction
    const result = extractionSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects a non-numeric total', () => {
    const result = extractionSchema.safeParse({
      ...validExtraction,
      total: 'twenty',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invoiceDate that is not YYYY-MM-DD', () => {
    const result = extractionSchema.safeParse({
      ...validExtraction,
      invoiceDate: '18-06-2026',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a line item missing lineTotal', () => {
    const result = extractionSchema.safeParse({
      ...validExtraction,
      lineItems: [
        { description: 'Melk', quantity: 2, unitPrice: 1.39, taxRate: 9 },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe('extractionSchema.invoiceDate', () => {
  const baseExtraction = {
    vendor: 'Albert Heijn',
    currency: 'EUR',
    subtotal: 18.45,
    vatBreakdown: [{ rate: 9, amount: 1.66 }],
    vatAmount: 1.66,
    total: 20.11,
    lineItems: [],
  }

  it('accepts a real calendar date', () => {
    const result = extractionSchema.safeParse({
      ...baseExtraction,
      invoiceDate: '2026-06-18',
    })
    expect(result.success).toBe(true)
  })

  it('accepts a leap-year Feb 29', () => {
    const result = extractionSchema.safeParse({
      ...baseExtraction,
      invoiceDate: '2024-02-29',
    })
    expect(result.success).toBe(true)
  })

  it('accepts null', () => {
    const result = extractionSchema.safeParse({
      ...baseExtraction,
      invoiceDate: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a day that does not exist in that month (rollover)', () => {
    const result = extractionSchema.safeParse({
      ...baseExtraction,
      invoiceDate: '2026-02-30',
    })
    expect(result.success).toBe(false)
  })

  it('rejects Feb 29 in a non-leap year', () => {
    const result = extractionSchema.safeParse({
      ...baseExtraction,
      invoiceDate: '2026-02-29',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a month outside 01-12', () => {
    const result = extractionSchema.safeParse({
      ...baseExtraction,
      invoiceDate: '2026-13-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a value that is only nonsense digits', () => {
    const result = extractionSchema.safeParse({
      ...baseExtraction,
      invoiceDate: '2026-99-99',
    })
    expect(result.success).toBe(false)
  })
})

describe('confidenceSchema', () => {
  it('parses a valid confidence payload', () => {
    const result = confidenceSchema.safeParse({
      overall: 0.91,
      fields: { vendor: 0.95, total: 0.99 },
    })
    expect(result.success).toBe(true)
  })

  it('rejects an overall confidence above 1', () => {
    const result = confidenceSchema.safeParse({ overall: 1.5, fields: {} })
    expect(result.success).toBe(false)
  })

  it('rejects a negative field confidence', () => {
    const result = confidenceSchema.safeParse({
      overall: 0.5,
      fields: { total: -0.1 },
    })
    expect(result.success).toBe(false)
  })
})
