// __tests__/integration/invoiceExtraction.test.ts
jest.mock('../../services/invoiceExtraction/provider', () => ({
  getExtractionProvider: jest.fn(),
}))

import request from 'supertest'

import app from '../../app'
import User from '../../models/User'
import { getExtractionProvider } from '../../services/invoiceExtraction/provider'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

const mockGetExtractionProvider = getExtractionProvider as jest.Mock

const cleanExtractionResponse = JSON.stringify({
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

// Minimal valid JPEG magic-byte prefix - enough to pass the content-sniffing
// check without needing a real image; extraction itself is mocked.
const fakeJpegBuffer = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('fake-image-body'),
])

function fakeProvider(responseText: string) {
  return {
    name: 'anthropic',
    extract: jest.fn().mockResolvedValue({
      responseText,
      model: 'claude-sonnet-4-6',
      latencyMs: 1200,
      tokensUsed: { input: 1000, output: 100 },
    }),
  }
}

describe('invoice extraction API', () => {
  let a: AuthedTenant
  const originalFlag = process.env.LLM_INVOICE_EXTRACTION_ENABLED

  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = originalFlag
  })
  afterAll(async () => {
    await dbHandler.closeDatabase()
  })
  beforeEach(async () => {
    a = await createAuthedTenant()
    mockGetExtractionProvider.mockReset()
  })

  it('POST /api/invoices/scan requires authentication (401)', async () => {
    const res = await request(app)
      .post('/api/invoices/scan')
      .attach('file', Buffer.from('fake-image'), {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })
    expect(res.status).toBe(401)
  })

  it('returns 401 when the request has no resolvable tenant context', async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'true'

    // `protect` (middleware/auth.ts) only requires a validly-signed JWT whose
    // `id` resolves to a User document — it never validates the user's
    // `organization` field. It sets req.organizationId only `if (user &&
    // user.organization)`. So a User created with no `organization` field
    // (the schema's `require: true` is a typo, not the real Mongoose
    // `required` key, so this is not rejected at creation) passes `protect`
    // but leaves req.organizationId — and therefore
    // getCurrentTenantId(req.organizationId) — falsy.
    const orphanUser = await User.create({
      name: 'Orphan User',
      email: 'orphan@example.com',
      password: 'password123',
    })
    const orphanToken = orphanUser.getSignedJwtToken()

    const res = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(orphanToken))
      .attach('file', fakeJpegBuffer, {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({
      success: false,
      message: 'Unauthorized: Tenant information not available',
    })
  })

  it('returns 503 when the feature flag is disabled', async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'false'

    const res = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))
      .attach('file', Buffer.from('fake-image'), {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })

    expect(res.status).toBe(503)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 for an unsupported mime type', async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'true'

    const res = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))
      .attach('file', Buffer.from('%PDF-1.4'), {
        filename: 'receipt.pdf',
        contentType: 'application/pdf',
      })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when the file content does not match its declared image mimetype', async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'true'

    const res = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))
      .attach('file', Buffer.from('this is not actually a jpeg'), {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when no file is attached', async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'true'

    const res = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))

    expect(res.status).toBe(400)
  })

  it('returns 200 with the extraction, confidence, validation, and fileLocation for a clean scan', async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'true'
    mockGetExtractionProvider.mockReturnValue(
      fakeProvider(cleanExtractionResponse),
    )

    const res = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))
      .attach('file', fakeJpegBuffer, {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.fileLocation).toBe(`${a.organizationId}/receipt.jpg`)
    expect(res.body.data.extraction.vendor).toBe('Albert Heijn')
    expect(res.body.data.validation.warnings).toEqual([])
    expect(res.body.data.needsReview).toBe(false)
  })

  it('returns 422 EXTRACTION_FAILED when the provider never returns parseable JSON', async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'true'
    mockGetExtractionProvider.mockReturnValue(fakeProvider('not json'))

    const res = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))
      .attach('file', fakeJpegBuffer, {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('EXTRACTION_FAILED')
  })

  it('returns 502 when the provider throws a provider-level error', async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'true'
    mockGetExtractionProvider.mockReturnValue({
      name: 'anthropic',
      extract: jest
        .fn()
        .mockRejectedValue({ status: 500, message: 'Overloaded' }),
    })

    const res = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))
      .attach('file', fakeJpegBuffer, {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })

    expect(res.status).toBe(502)
  })

  it("keys the upload under each tenant's own organizationId (tenant isolation)", async () => {
    process.env.LLM_INVOICE_EXTRACTION_ENABLED = 'true'
    mockGetExtractionProvider.mockReturnValue(
      fakeProvider(cleanExtractionResponse),
    )
    const b = await createAuthedTenant()

    const resA = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(a.token))
      .attach('file', fakeJpegBuffer, {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })
    const resB = await request(app)
      .post('/api/invoices/scan')
      .set(authHeader(b.token))
      .attach('file', fakeJpegBuffer, {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })

    expect(resA.body.data.fileLocation).toBe(`${a.organizationId}/receipt.jpg`)
    expect(resB.body.data.fileLocation).toBe(`${b.organizationId}/receipt.jpg`)
    expect(a.organizationId).not.toBe(b.organizationId)
  })
})
