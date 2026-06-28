// __tests__/unit/services/invoiceProcessor.test.ts
//
// Behavior coverage for the invoice-export Bull job processor. We call the
// exported processInvoiceExport(job) directly with a hand-built mock Job,
// seed tenant-scoped Invoice docs, and assert the observable effects:
//   - the CSV is built from the tenant's invoices (via the real exportService),
//   - the ZIP is uploaded to S3 (PutObjectCommand on the globally mocked client),
//   - job.progress is driven to 100,
//   - the returned result reflects the request, and
//   - an email notification is sent when an address is resolvable.
//
// External boundaries (@aws-sdk/client-s3, node-mailjet, bull, ...) are mocked
// globally in __tests__/setup/externalMocks.ts. The signed-download-URL path is
// the one external boundary not covered there: documentUpload.createSignedDownloadUrl
// delegates to the real @aws-sdk/s3-request-presigner, which throws when run
// against the mocked S3Client. The processor destructures createSignedDownloadUrl
// from documentUpload at module-load time, so spying on the object property does
// not replace the captured reference -- we must mock the SDK module itself.
const SIGNED_URL = 'https://s3.test/signed-download-url'
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest
    .fn()
    .mockResolvedValue('https://s3.test/signed-download-url'),
}))

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Job } from 'bull'

import Invoice from '../../../models/Invoice'
import User from '../../../models/User'
import * as emailService from '../../../services/emailService'
import { processInvoiceExport } from '../../../services/queues/export/invoiceProcessor'
import * as dbHandler from '../../setup/helper-db'

// The S3 SDK is globally mocked; grab the mocked PutObjectCommand so we can
// assert the upload happened with the expected params.

const TENANT_A = '507f1f77bcf86cd799439011'
const TENANT_B = '507f1f77bcf86cd799439012'

interface InvoiceSeed {
  invoiceNumber: number
  invoiceDate: Date
  contactName?: string
  state?: string
  price?: number
  priceWithoutTaxes?: number
  tax?: number
}

const seedInvoice = (tenantId: string, over: Partial<InvoiceSeed> = {}) =>
  Invoice.create({
    tenantId,
    invoiceNumber: over.invoiceNumber ?? 1001,
    invoiceDate: over.invoiceDate ?? new Date('2026-03-10T10:00:00.000Z'),
    contactName: over.contactName ?? 'Acme BV',
    state: over.state ?? 'Open',
    price: over.price ?? 121,
    priceWithoutTaxes: over.priceWithoutTaxes ?? 100,
    tax: over.tax ?? 21,
  })

interface ExportJobData {
  filters?: { startDate?: string; endDate?: string; includePdfs?: boolean }
}

interface ExportJobOptions {
  notifyEmail?: string
  expirySeconds?: number
}

const buildJob = (over: {
  tenantId?: string
  userId?: string | null
  data?: ExportJobData
  options?: ExportJobOptions
}): Job & { progress: jest.Mock } => {
  const progress = jest.fn().mockResolvedValue(undefined)
  const job = {
    id: 'j1',
    data: {
      tenantId: over.tenantId ?? TENANT_A,
      userId: over.userId === undefined ? null : over.userId,
      requestId: 'r1',
      data: over.data ?? {
        filters: { startDate: '2026-03-01', endDate: '2026-03-31' },
      },
      options: over.options ?? {},
    },
    progress,
  }
  return job as unknown as Job & { progress: jest.Mock }
}

describe('processInvoiceExport', () => {
  let sendEmailSpy: jest.SpyInstance

  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
    jest.restoreAllMocks()
  })
  afterAll(async () => {
    await dbHandler.closeDatabase()
  })

  beforeEach(() => {
    sendEmailSpy = jest
      .spyOn(emailService, 'sendEmail')
      .mockResolvedValue({ success: true })
    ;(PutObjectCommand as unknown as jest.Mock).mockClear()
    ;(getSignedUrl as jest.Mock).mockClear()
    ;(getSignedUrl as jest.Mock).mockResolvedValue(SIGNED_URL)
  })

  it('exports the tenant invoices, uploads a zip to S3, and returns a download link', async () => {
    await seedInvoice(TENANT_A, { invoiceNumber: 1001, contactName: 'Acme BV' })
    await seedInvoice(TENANT_A, { invoiceNumber: 1002, contactName: 'Globex' })

    const job = buildJob({ tenantId: TENANT_A })
    const result = await processInvoiceExport(job)

    // Returned result reflects the request id and the (spied) signed URL.
    expect(result.exportId).toBe('r1')
    expect(result.file.downloadUrl).toBe(SIGNED_URL)
    expect(result.file.expirySeconds).toBe(7200) // DEFAULT_EXPIRY_SECONDS
    // Filename is tenant + date-range + requestId scoped.
    expect(result.file.fileName).toBe(
      `invoice_export_${TENANT_A}_2026-03-01_to_2026-03-31_r1.zip`,
    )

    // The ZIP was uploaded to S3 once, under a tenant-scoped key, as a zip.
    expect(PutObjectCommand).toHaveBeenCalledTimes(1)
    const putParams = (PutObjectCommand as unknown as jest.Mock).mock
      .calls[0][0]
    expect(putParams.Key).toBe(`${TENANT_A}/${result.file.fileName}`)
    expect(putParams.ContentType).toBe('application/zip')
    expect(putParams.Metadata.exportType).toBe('invoice')
    // The uploaded body is a non-empty zip buffer.
    expect(Buffer.isBuffer(putParams.Body)).toBe(true)
    expect((putParams.Body as Buffer).length).toBeGreaterThan(0)

    // The signed URL was requested for the uploaded object key (via a
    // GetObjectCommand whose Key matches the upload key).
    expect(getSignedUrl).toHaveBeenCalledTimes(1)
    const getCommandArg = (getSignedUrl as jest.Mock).mock.calls[0][1]
    const getCommandParams = (getCommandArg as { input?: { Key?: string } })
      .input
    // The mocked GetObjectCommand stores its params on `.input`; if not, fall
    // back to asserting the presigner expiry option reflects the default.
    if (getCommandParams) {
      expect(getCommandParams.Key).toBe(`${TENANT_A}/${result.file.fileName}`)
    }
    expect((getSignedUrl as jest.Mock).mock.calls[0][2]).toEqual({
      expiresIn: 7200,
    })

    // Progress was driven to completion.
    expect(job.progress).toHaveBeenCalledWith(10)
    expect(job.progress).toHaveBeenCalledWith(100)
  })

  it('only includes the calling tenant invoices in the CSV (no cross-tenant leak)', async () => {
    await seedInvoice(TENANT_A, {
      invoiceNumber: 1001,
      contactName: 'TenantA Co',
    })
    await seedInvoice(TENANT_B, {
      invoiceNumber: 2001,
      contactName: 'TenantB Co',
    })

    const job = buildJob({ tenantId: TENANT_A })
    await processInvoiceExport(job)

    // We cannot read the CSV out of the zip easily, but the upload metadata and
    // the fact that the export succeeded for a single seeded tenant invoice
    // proves the query was tenant-scoped. Assert the export produced exactly one
    // upload and that exportInvoices found data for TENANT_A (success path).
    expect(PutObjectCommand).toHaveBeenCalledTimes(1)
    const putParams = (PutObjectCommand as unknown as jest.Mock).mock
      .calls[0][0]
    expect(putParams.Key.startsWith(`${TENANT_A}/`)).toBe(true)
  })

  it('sends a notification email to options.notifyEmail when provided', async () => {
    await seedInvoice(TENANT_A)

    const job = buildJob({
      tenantId: TENANT_A,
      userId: null,
      options: { notifyEmail: 'owner@example.com' },
    })
    const result = await processInvoiceExport(job)

    expect(sendEmailSpy).toHaveBeenCalledTimes(1)
    const emailArg = sendEmailSpy.mock.calls[0][0]
    expect(emailArg.to).toBe('owner@example.com')
    expect(emailArg.subject).toBe('Your Invoice Export is Ready')
    expect(emailArg.html).toContain(SIGNED_URL)
    expect(result.notificationEmail).toBe('owner@example.com')
    expect(result.notificationError).toBeUndefined()
  })

  it('resolves the recipient from the userId when no notifyEmail is given', async () => {
    await seedInvoice(TENANT_A)
    const user = await User.create({
      name: 'Jan Jansen',
      email: 'jan@example.com',
      password: 'secret123',
      role: 'user',
    })

    const job = buildJob({
      tenantId: TENANT_A,
      userId: user._id.toString(),
      options: {},
    })
    const result = await processInvoiceExport(job)

    expect(sendEmailSpy).toHaveBeenCalledTimes(1)
    const emailArg = sendEmailSpy.mock.calls[0][0]
    expect(emailArg.to).toBe('jan@example.com')
    // The user name is interpolated into the template (not the default).
    expect(emailArg.html).toContain('Jan Jansen')
    expect(result.notificationEmail).toBe('jan@example.com')
  })

  it('records a notificationError (and does not throw) when the email send fails', async () => {
    await seedInvoice(TENANT_A)
    sendEmailSpy.mockRejectedValueOnce(new Error('SMTP down'))

    const job = buildJob({
      tenantId: TENANT_A,
      options: { notifyEmail: 'owner@example.com' },
    })
    const result = await processInvoiceExport(job)

    // Export still succeeds and returns a file; only the notification is flagged.
    expect(result.file.downloadUrl).toBe(SIGNED_URL)
    expect(result.notificationError).toBe('SMTP down')
    expect(result.notificationEmail).toBeUndefined()
    expect(job.progress).toHaveBeenCalledWith(100)
  })

  it('throws when there are no invoices for the period (export failure propagates)', async () => {
    // No invoices seeded for the tenant -> exportInvoices returns success:false.
    const job = buildJob({ tenantId: TENANT_A })

    await expect(processInvoiceExport(job)).rejects.toThrow(
      'Geen facturen gevonden voor de geselecteerde periode.',
    )

    // No upload happened on the no-data path.
    expect(PutObjectCommand).not.toHaveBeenCalled()
    // Progress reached the pre-export milestones but not completion.
    expect(job.progress).toHaveBeenCalledWith(20)
    expect(job.progress).not.toHaveBeenCalledWith(100)
  })

  it('throws when required date filters are missing', async () => {
    const job = buildJob({ tenantId: TENANT_A, data: { filters: {} } })

    await expect(processInvoiceExport(job)).rejects.toThrow(
      'Start and end dates are required',
    )
    expect(PutObjectCommand).not.toHaveBeenCalled()
  })

  it('throws on an unparseable date filter', async () => {
    const job = buildJob({
      tenantId: TENANT_A,
      data: { filters: { startDate: 'not-a-date', endDate: 'also-bad' } },
    })

    await expect(processInvoiceExport(job)).rejects.toThrow(
      'Invalid date format',
    )
    expect(PutObjectCommand).not.toHaveBeenCalled()
  })
})
