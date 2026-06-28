const mockExtract = jest.fn()

jest.mock('../../../../services/invoiceExtraction/provider', () => ({
  getExtractionProvider: () => ({ name: 'anthropic', extract: mockExtract }),
}))

import {
  extractInvoice,
  ExtractionFailedError,
} from '../../../../services/invoiceExtraction/extract'

const validJson = JSON.stringify({
  extraction: {
    vendor: 'Albert Heijn',
    invoiceDate: '2026-06-18',
    currency: 'EUR',
    subtotal: 18.45,
    vatBreakdown: [{ rate: 9, amount: 1.66 }],
    vatAmount: 1.66,
    total: 20.11,
    lineItems: [],
  },
  confidence: { overall: 0.91, fields: { total: 0.99 } },
})

function fakeResponse(
  responseText: string,
  overrides: Partial<{
    model: string
    latencyMs: number
    tokensUsed: { input: number; output: number }
  }> = {},
) {
  return {
    responseText,
    model: 'claude-sonnet-4-6',
    latencyMs: 1200,
    tokensUsed: { input: 1000, output: 100 },
    ...overrides,
  }
}

describe('extractInvoice', () => {
  beforeEach(() => {
    mockExtract.mockReset()
  })

  it('returns the parsed extraction, confidence, validation, and meta on a clean first response', async () => {
    mockExtract.mockResolvedValueOnce(fakeResponse(validJson))

    const result = await extractInvoice({
      buffer: Buffer.from('img'),
      mimeType: 'image/jpeg',
    })

    expect(result.extraction.vendor).toBe('Albert Heijn')
    expect(result.confidence.overall).toBe(0.91)
    expect(result.validation.warnings).toEqual([])
    expect(result.needsReview).toBe(false)
    expect(result.meta).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      latencyMs: 1200,
      tokensUsed: { input: 1000, output: 100 },
    })
    expect(mockExtract).toHaveBeenCalledTimes(1)
  })

  it('strips markdown code fences before parsing', async () => {
    mockExtract.mockResolvedValueOnce(
      fakeResponse('```json\n' + validJson + '\n```'),
    )

    const result = await extractInvoice({
      buffer: Buffer.from('img'),
      mimeType: 'image/jpeg',
    })
    expect(result.extraction.total).toBe(20.11)
  })

  it('retries once with a repair prompt when the first response is invalid JSON, then succeeds', async () => {
    mockExtract
      .mockResolvedValueOnce(fakeResponse('not json at all'))
      .mockResolvedValueOnce(fakeResponse(validJson))

    const result = await extractInvoice({
      buffer: Buffer.from('img'),
      mimeType: 'image/jpeg',
    })

    expect(result.extraction.total).toBe(20.11)
    expect(mockExtract).toHaveBeenCalledTimes(2)
    const secondCallOptions = mockExtract.mock.calls[1][1]
    expect(secondCallOptions.repairContext.previousResponseText).toBe(
      'not json at all',
    )
  })

  it('throws ExtractionFailedError when both the original and repair attempts fail to parse', async () => {
    mockExtract
      .mockResolvedValueOnce(fakeResponse('not json'))
      .mockResolvedValueOnce(fakeResponse('still not json'))

    await expect(
      extractInvoice({ buffer: Buffer.from('img'), mimeType: 'image/jpeg' }),
    ).rejects.toThrow(ExtractionFailedError)
    expect(mockExtract).toHaveBeenCalledTimes(2)
  })

  it('throws ExtractionFailedError when total is missing, without a repair attempt', async () => {
    const noTotal = JSON.stringify({
      extraction: {
        vendor: null,
        invoiceDate: null,
        currency: 'EUR',
        subtotal: null,
        vatBreakdown: [],
        vatAmount: null,
        total: 0,
        lineItems: [],
      },
      confidence: { overall: 0.5, fields: {} },
    })
    mockExtract.mockResolvedValueOnce(fakeResponse(noTotal))

    await expect(
      extractInvoice({ buffer: Buffer.from('img'), mimeType: 'image/jpeg' }),
    ).rejects.toThrow(ExtractionFailedError)
    expect(mockExtract).toHaveBeenCalledTimes(1)
  })

  it('sets needsReview true when validation produces a warning, even with high confidence', async () => {
    const unusualRate = JSON.stringify({
      extraction: {
        vendor: 'Foreign Co',
        invoiceDate: '2026-06-18',
        currency: 'EUR',
        subtotal: 100,
        vatBreakdown: [{ rate: 19, amount: 19 }],
        vatAmount: 19,
        total: 119,
        lineItems: [],
      },
      confidence: { overall: 0.95, fields: {} },
    })
    mockExtract.mockResolvedValueOnce(fakeResponse(unusualRate))

    const result = await extractInvoice({
      buffer: Buffer.from('img'),
      mimeType: 'image/jpeg',
    })
    expect(result.needsReview).toBe(true)
    expect(result.validation.warnings).toContainEqual(
      expect.objectContaining({ code: 'VAT_RATE_UNUSUAL' }),
    )
  })

  it('sets needsReview true when confidence is below threshold, even with no warnings', async () => {
    const lowConfidence = JSON.stringify({
      extraction: {
        vendor: null,
        invoiceDate: null,
        currency: 'EUR',
        subtotal: null,
        vatBreakdown: [],
        vatAmount: null,
        total: 10,
        lineItems: [],
      },
      confidence: { overall: 0.4, fields: {} },
    })
    mockExtract.mockResolvedValueOnce(fakeResponse(lowConfidence))

    const result = await extractInvoice({
      buffer: Buffer.from('img'),
      mimeType: 'image/jpeg',
    })
    expect(result.needsReview).toBe(true)
  })

  it('retries with a repair prompt when the first response has an arithmetic validation mismatch, then succeeds', async () => {
    const mismatched = JSON.stringify({
      extraction: {
        vendor: 'Albert Heijn',
        invoiceDate: '2026-06-18',
        currency: 'EUR',
        subtotal: 18.45,
        vatBreakdown: [{ rate: 9, amount: 1.66 }],
        vatAmount: 1.66,
        total: 999, // does not equal subtotal + vatAmount
        lineItems: [],
      },
      confidence: { overall: 0.91, fields: {} },
    })
    mockExtract
      .mockResolvedValueOnce(fakeResponse(mismatched))
      .mockResolvedValueOnce(fakeResponse(validJson))

    const result = await extractInvoice({
      buffer: Buffer.from('img'),
      mimeType: 'image/jpeg',
    })

    expect(result.extraction.total).toBe(20.11)
    expect(result.validation.warnings).toEqual([])
    expect(mockExtract).toHaveBeenCalledTimes(2)
    const secondCallOptions = mockExtract.mock.calls[1][1]
    expect(secondCallOptions.repairContext.validationError).toContain(
      'subtotal + vatAmount does not match total',
    )
  })

  it('does not retry for an informational warning like an unusual VAT rate', async () => {
    const unusualRate = JSON.stringify({
      extraction: {
        vendor: 'Foreign Co',
        invoiceDate: '2026-06-18',
        currency: 'EUR',
        subtotal: 100,
        vatBreakdown: [{ rate: 19, amount: 19 }],
        vatAmount: 19,
        total: 119,
        lineItems: [],
      },
      confidence: { overall: 0.95, fields: {} },
    })
    mockExtract.mockResolvedValueOnce(fakeResponse(unusualRate))

    const result = await extractInvoice({
      buffer: Buffer.from('img'),
      mimeType: 'image/jpeg',
    })

    expect(mockExtract).toHaveBeenCalledTimes(1)
    expect(result.needsReview).toBe(true)
  })

  it('keeps the original parseable result if the repair attempt itself is unparseable', async () => {
    const mismatched = JSON.stringify({
      extraction: {
        vendor: 'Albert Heijn',
        invoiceDate: '2026-06-18',
        currency: 'EUR',
        subtotal: 18.45,
        vatBreakdown: [{ rate: 9, amount: 1.66 }],
        vatAmount: 1.66,
        total: 999,
        lineItems: [],
      },
      confidence: { overall: 0.91, fields: {} },
    })
    mockExtract
      .mockResolvedValueOnce(fakeResponse(mismatched))
      .mockResolvedValueOnce(fakeResponse('not json'))

    const result = await extractInvoice({
      buffer: Buffer.from('img'),
      mimeType: 'image/jpeg',
    })

    expect(result.extraction.total).toBe(999)
    expect(result.validation.warnings).toContainEqual(
      expect.objectContaining({ code: 'SUBTOTAL_VAT_TOTAL_MISMATCH' }),
    )
    expect(mockExtract).toHaveBeenCalledTimes(2)
  })
})
