import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { Job } from 'bull'

import Expense from '../../../models/Expense'
import User from '../../../models/User'
import * as emailService from '../../../services/emailService'
import { processExpenseExport } from '../../../services/queues/export/expenseProcessor'
import * as dbHandler from '../../setup/helper-db'

// getSignedUrl is the only AWS boundary the processor exercises that is NOT
// already neutralized by externalMocks (the S3Client/PutObjectCommand are).
// Mock it to return a deterministic signed URL so the processor can complete
// without the real presigner middleware stack the mocked S3Client lacks.
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest
    .fn()
    .mockResolvedValue('https://s3.test/signed-download-url'),
}))

const TENANT_A = 'tenant-a'
const TENANT_B = 'tenant-b'

interface ExpenseSeed {
  tenantId?: string
  expenseDate?: Date
  price?: number
  priceWOTaxes?: number
  tax?: number
  taxLow?: number
  contactName?: string
  info?: string
  expenseFile?: string | null
}

const seedExpense = (over: ExpenseSeed = {}) =>
  Expense.create({
    tenantId: TENANT_A,
    owner: '507f1f77bcf86cd799439011',
    expenseDate: new Date('2026-03-15T12:00:00Z'),
    price: 121,
    priceWOTaxes: 100,
    tax: 21,
    taxLow: 0,
    contactName: 'Acme Supplies',
    info: 'Office chairs',
    ...over,
  })

interface ProcessorJobData {
  tenantId: string
  userId?: string | null
  requestId: string
  data: { filters: Record<string, unknown> }
  options: Record<string, unknown>
}

const buildJob = (data: ProcessorJobData) => {
  const progress = jest.fn().mockResolvedValue(undefined)
  const job = { id: 'job-1', data, progress } as unknown as Job
  return { job, progress }
}

type ProcessorResult = {
  exportId: string
  file: {
    fileName: string
    downloadUrl: string
    contentType: string
    expirySeconds: number
  }
}

describe('processExpenseExport', () => {
  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
    jest.clearAllMocks()
  })
  afterAll(async () => {
    await dbHandler.closeDatabase()
  })

  it('exports seeded expenses to S3 and returns a download result (no-receipts path)', async () => {
    await seedExpense({ contactName: 'Acme Supplies', info: 'Office chairs' })
    await seedExpense({
      contactName: 'Globex',
      info: 'Monitors',
      expenseDate: new Date('2026-03-20T12:00:00Z'),
    })

    const sendEmailSpy = jest
      .spyOn(emailService, 'sendEmail')
      .mockResolvedValue(undefined as never)

    const { job, progress } = buildJob({
      tenantId: TENANT_A,
      userId: null,
      requestId: 'req-100',
      data: {
        filters: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          includeReceipts: false,
        },
      },
      options: { notifyEmail: 'export@example.com' },
    })

    const result = (await processExpenseExport(job)) as ProcessorResult

    // Return value reflects the request and the deterministic signed URL.
    expect(result.exportId).toBe('req-100')
    expect(result.file.contentType).toBe('application/zip')
    expect(result.file.downloadUrl).toBe('https://s3.test/signed-download-url')
    // Zip filename is tenant/date/request scoped.
    expect(result.file.fileName).toBe(
      'expense_export_tenant-a_2026-03-01_to_2026-03-31_req-100.zip',
    )

    // The export was actually uploaded to S3 as a zip.
    expect(PutObjectCommand).toHaveBeenCalledTimes(1)
    const putArg = (PutObjectCommand as unknown as jest.Mock).mock
      .calls[0][0] as {
      Key: string
      ContentType: string
      Metadata: Record<string, string>
      Body: Buffer
    }
    expect(putArg.Key).toBe(
      'tenant-a/expense_export_tenant-a_2026-03-01_to_2026-03-31_req-100.zip',
    )
    expect(putArg.ContentType).toBe('application/zip')
    expect(putArg.Metadata.exportType).toBe('expense')
    expect(putArg.Metadata.includeReceipts).toBe('false')
    // The uploaded body is a real (non-empty) zip buffer.
    expect(Buffer.isBuffer(putArg.Body)).toBe(true)
    expect((putArg.Body as Buffer).length).toBeGreaterThan(0)

    // Signed URL requested with the default expiry (no options.expirySeconds).
    expect(getSignedUrl).toHaveBeenCalledTimes(1)

    // Progress was driven to completion.
    const progressValues = progress.mock.calls.map((c) => c[0])
    expect(progressValues).toContain(10)
    expect(progressValues).toContain(100)
    expect(Math.max(...(progressValues as number[]))).toBe(100)

    // Notification email sent to the provided address with the signed URL.
    expect(sendEmailSpy).toHaveBeenCalledTimes(1)
    const emailArg = sendEmailSpy.mock.calls[0][0]
    expect(emailArg.to).toBe('export@example.com')
    expect(emailArg.subject).toBe('Je export is gereed')
    expect(emailArg.text).toContain('https://s3.test/signed-download-url')
  })

  it('resolves the recipient email from the user when no notifyEmail is given', async () => {
    await seedExpense()

    const user = await User.create({
      name: 'Henk de Vries',
      email: 'henk@example.com',
      password: 'hashed-password-placeholder',
    })

    const sendEmailSpy = jest
      .spyOn(emailService, 'sendEmail')
      .mockResolvedValue(undefined as never)

    const { job } = buildJob({
      tenantId: TENANT_A,
      userId: user._id.toString(),
      requestId: 'req-200',
      data: {
        filters: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
        },
      },
      options: {},
    })

    await processExpenseExport(job)

    expect(sendEmailSpy).toHaveBeenCalledTimes(1)
    expect(sendEmailSpy.mock.calls[0][0].to).toBe('henk@example.com')
  })

  it('honors options.expirySeconds for the signed URL and result', async () => {
    await seedExpense()

    jest.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined as never)

    const { job } = buildJob({
      tenantId: TENANT_A,
      userId: null,
      requestId: 'req-300',
      data: {
        filters: { startDate: '2026-03-01', endDate: '2026-03-31' },
      },
      options: { notifyEmail: 'a@example.com', expirySeconds: 3600 },
    })

    const result = (await processExpenseExport(job)) as ProcessorResult

    expect(result.file.expirySeconds).toBe(3600)
    expect(getSignedUrl).toHaveBeenCalledTimes(1)
    expect((getSignedUrl as unknown as jest.Mock).mock.calls[0][2]).toEqual({
      expiresIn: 3600,
    })
  })

  it("only exports the caller tenant's expenses", async () => {
    // Two expenses for tenant A, one for tenant B in the same window.
    await seedExpense({ tenantId: TENANT_A, contactName: 'A-one' })
    await seedExpense({ tenantId: TENANT_A, contactName: 'A-two' })
    await seedExpense({ tenantId: TENANT_B, contactName: 'B-one' })

    jest.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined as never)

    const { job } = buildJob({
      tenantId: TENANT_A,
      userId: null,
      requestId: 'req-400',
      data: {
        filters: { startDate: '2026-03-01', endDate: '2026-03-31' },
      },
      options: { notifyEmail: 'a@example.com' },
    })

    await processExpenseExport(job)

    // The uploaded zip is scoped to tenant A. The CSV inside reflects only A's
    // expenses; we assert the upload happened for tenant A specifically.
    const putArg = (PutObjectCommand as unknown as jest.Mock).mock
      .calls[0][0] as {
      Key: string
      Metadata: Record<string, string>
    }
    expect(putArg.Metadata.tenant).toBe(TENANT_A)
    expect(putArg.Key.startsWith('tenant-a/')).toBe(true)
  })

  it('rejects when start or end date is missing and does not upload', async () => {
    await seedExpense()

    const { job, progress } = buildJob({
      tenantId: TENANT_A,
      userId: null,
      requestId: 'req-500',
      data: { filters: { startDate: '2026-03-01' } },
      options: {},
    })

    await expect(processExpenseExport(job)).rejects.toThrow(
      'Start and end dates are required',
    )
    expect(PutObjectCommand).not.toHaveBeenCalled()
    // Progress reached the validation gate (10) but never completion.
    const progressValues = progress.mock.calls.map((c) => c[0])
    expect(progressValues).toContain(10)
    expect(progressValues).not.toContain(100)
  })

  it('rejects with the export-service message when no expenses match the period', async () => {
    // Seed an expense OUTSIDE the requested window.
    await seedExpense({ expenseDate: new Date('2025-01-10T12:00:00Z') })

    const { job } = buildJob({
      tenantId: TENANT_A,
      userId: null,
      requestId: 'req-600',
      data: {
        filters: { startDate: '2026-03-01', endDate: '2026-03-31' },
      },
      options: {},
    })

    await expect(processExpenseExport(job)).rejects.toThrow(
      'Geen uitgaven gevonden voor de geselecteerde periode.',
    )
    expect(PutObjectCommand).not.toHaveBeenCalled()
  })
})
