import Bull from 'bull'

import { defaultJobOptions } from '../../../config/queue'
import {
  expenseExportQueue,
  invoiceExportQueue,
  queueExpenseExport,
  queueInvoiceExport,
  getExportJobStatus,
} from '../../../services/queues/exportQueue'

// The global bull mock (see __tests__/setup/externalMocks.ts) is a jest.fn whose
// implementation returns a fresh object per `new Bull(...)`. The service module
// constructs the expense queue first, then the invoice queue, at import time. So
// mock.results[0] is the expense queue instance and mock.results[1] is the
// invoice queue instance. The exported `expenseExportQueue` /
// `invoiceExportQueue` ARE those same instances, so we can assert against either.
const BullMock = Bull as unknown as jest.Mock

type AddMock = jest.Mock
type GetJobMock = jest.Mock

const expenseQueueInstance = BullMock.mock.results[0].value as {
  add: AddMock
  getJob: GetJobMock
}
const invoiceQueueInstance = BullMock.mock.results[1].value as {
  add: AddMock
}

const validFilters = {
  startDate: '2026-01-01',
  endDate: '2026-01-31',
}

beforeEach(() => {
  ;(expenseExportQueue.add as AddMock).mockClear()
  ;(invoiceExportQueue.add as AddMock).mockClear()
  ;(expenseExportQueue.getJob as GetJobMock).mockClear()
  // Restore default mock behaviours that individual tests may override.
  ;(expenseExportQueue.add as AddMock).mockResolvedValue({ id: 'test-job' })
  ;(invoiceExportQueue.add as AddMock).mockResolvedValue({ id: 'test-job' })
  ;(expenseExportQueue.getJob as GetJobMock).mockResolvedValue(null)
})

describe('exportQueue module wiring', () => {
  it('exports the captured expense and invoice queue instances', () => {
    expect(expenseExportQueue).toBe(expenseQueueInstance)
    expect(invoiceExportQueue).toBe(invoiceQueueInstance)
  })

  it('constructs both queues with the configured queue names', () => {
    expect(BullMock).toHaveBeenCalledWith(
      'export-expense-queue',
      expect.anything(),
    )
    expect(BullMock).toHaveBeenCalledWith(
      'export-invoice-queue',
      expect.anything(),
    )
  })
})

describe('queueExpenseExport', () => {
  it('adds a "generate" job to the expense queue and returns the job id', async () => {
    const result = await queueExpenseExport('tenant-1', 'user-1', validFilters)

    expect(expenseExportQueue.add).toHaveBeenCalledTimes(1)
    const [jobName, jobData, jobOptions] = (expenseExportQueue.add as AddMock)
      .mock.calls[0]

    expect(jobName).toBe('generate')
    // Job data carries the multi-tenant context and the filters under data.filters.
    expect(jobData.tenantId).toBe('tenant-1')
    expect(jobData.userId).toBe('user-1')
    expect(jobData.data).toEqual({ filters: validFilters })
    expect(typeof jobData.requestId).toBe('string')
    expect(jobData.requestId.length).toBeGreaterThan(0)

    // Options merge defaultJobOptions, derive priority, and pin jobId to requestId.
    expect(jobOptions.attempts).toBe(defaultJobOptions.attempts)
    expect(jobOptions.removeOnComplete).toBe(defaultJobOptions.removeOnComplete)
    expect(jobOptions.priority).toBe(0)
    expect(jobOptions.jobId).toBe(jobData.requestId)

    expect(result).toEqual({
      success: true,
      jobId: 'test-job',
      requestId: jobData.requestId,
      message: 'Export job queued successfully',
    })
  })

  it('passes a provided priority through to the queue options', async () => {
    await queueExpenseExport('tenant-1', 'user-1', validFilters, {
      priority: 5,
    })

    const [, , jobOptions] = (expenseExportQueue.add as AddMock).mock.calls[0]
    expect(jobOptions.priority).toBe(5)
  })

  it('uses a caller-supplied requestId as both the job requestId and jobId', async () => {
    const result = await queueExpenseExport(
      'tenant-1',
      'user-1',
      validFilters,
      {
        requestId: 'fixed-req-id',
      },
    )

    const [, jobData, jobOptions] = (expenseExportQueue.add as AddMock).mock
      .calls[0]
    expect(jobData.requestId).toBe('fixed-req-id')
    expect(jobOptions.jobId).toBe('fixed-req-id')
    expect(result.requestId).toBe('fixed-req-id')
  })

  it('rejects a missing tenantId without touching the queue', async () => {
    const result = await queueExpenseExport('', 'user-1', validFilters)

    expect(expenseExportQueue.add).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      message: 'Error queueing export: Tenant ID is required',
    })
  })

  it('rejects when startDate is missing without touching the queue', async () => {
    const result = await queueExpenseExport('tenant-1', 'user-1', {
      endDate: '2026-01-31',
    })

    expect(expenseExportQueue.add).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.message).toBe(
      'Error queueing export: Start date and end date filters are required',
    )
  })

  it('rejects when endDate is missing without touching the queue', async () => {
    const result = await queueExpenseExport('tenant-1', 'user-1', {
      startDate: '2026-01-01',
    })

    expect(expenseExportQueue.add).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
  })

  it('returns a failure result (does not throw) when the queue add rejects', async () => {
    ;(expenseExportQueue.add as AddMock).mockRejectedValueOnce(
      new Error('redis down'),
    )

    const result = await queueExpenseExport('tenant-1', 'user-1', validFilters)

    expect(result).toEqual({
      success: false,
      message: 'Error queueing export: redis down',
    })
  })
})

describe('queueInvoiceExport', () => {
  it('adds a "generate" job to the invoice queue (not the expense queue) and returns the job id', async () => {
    const result = await queueInvoiceExport('tenant-2', 'user-2', validFilters)

    expect(invoiceExportQueue.add).toHaveBeenCalledTimes(1)
    expect(expenseExportQueue.add).not.toHaveBeenCalled()

    const [jobName, jobData, jobOptions] = (invoiceExportQueue.add as AddMock)
      .mock.calls[0]
    expect(jobName).toBe('generate')
    expect(jobData.tenantId).toBe('tenant-2')
    expect(jobData.userId).toBe('user-2')
    expect(jobData.data).toEqual({ filters: validFilters })
    expect(jobOptions.jobId).toBe(jobData.requestId)

    expect(result).toEqual({
      success: true,
      jobId: 'test-job',
      requestId: jobData.requestId,
      message: 'Export job queued successfully',
    })
  })

  it('rejects a missing tenantId without touching the invoice queue', async () => {
    const result = await queueInvoiceExport('', 'user-2', validFilters)

    expect(invoiceExportQueue.add).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.message).toBe('Error queueing export: Tenant ID is required')
  })
})

describe('getExportJobStatus', () => {
  it('returns a not-found result when the queue has no such job', async () => {
    ;(expenseExportQueue.getJob as GetJobMock).mockResolvedValueOnce(null)

    const result = await getExportJobStatus('missing-job')

    expect(expenseExportQueue.getJob).toHaveBeenCalledWith('missing-job')
    expect(result).toEqual({
      success: false,
      message: 'Job missing-job not found',
    })
  })

  it('returns completed-job status with result, progress and timestamps', async () => {
    const job = {
      id: 'job-77',
      data: { requestId: 'r-77', tenantId: 'tenant-3', userId: 'user-3' },
      progress: 100,
      returnvalue: { url: 'https://s3.test/export.csv' },
      failedReason: undefined,
      timestamp: 1000,
      processedOn: 1100,
      finishedOn: 1200,
      getState: jest.fn().mockResolvedValue('completed'),
    }
    ;(expenseExportQueue.getJob as GetJobMock).mockResolvedValueOnce(job)

    const result = await getExportJobStatus('job-77')

    expect(result).toEqual({
      success: true,
      jobId: 'job-77',
      requestId: 'r-77',
      tenantId: 'tenant-3',
      userId: 'user-3',
      state: 'completed',
      progress: 100,
      result: { url: 'https://s3.test/export.csv' },
      failReason: null,
      createdAt: 1000,
      processedAt: 1100,
      finishedAt: 1200,
    })
  })

  it('surfaces the failure reason for a failed job and leaves result null', async () => {
    const job = {
      id: 'job-88',
      data: { requestId: 'r-88', tenantId: 'tenant-4', userId: 'user-4' },
      progress: 40,
      returnvalue: { stale: true },
      failedReason: 'export generation crashed',
      timestamp: 2000,
      processedOn: 2100,
      finishedOn: 2200,
      getState: jest.fn().mockResolvedValue('failed'),
    }
    ;(expenseExportQueue.getJob as GetJobMock).mockResolvedValueOnce(job)

    const result = await getExportJobStatus('job-88')

    expect(result.success).toBe(true)
    expect(result.state).toBe('failed')
    expect(result.failReason).toBe('export generation crashed')
    // returnvalue must NOT be surfaced for a non-completed job.
    expect(result.result).toBeNull()
    expect(result.progress).toBe(40)
  })

  it('returns active-job status with null result and null failReason', async () => {
    const job = {
      id: 'job-99',
      data: { requestId: 'r-99', tenantId: 'tenant-5', userId: 'user-5' },
      progress: 25,
      returnvalue: null,
      failedReason: undefined,
      timestamp: 3000,
      processedOn: 3100,
      finishedOn: null,
      getState: jest.fn().mockResolvedValue('active'),
    }
    ;(expenseExportQueue.getJob as GetJobMock).mockResolvedValueOnce(job)

    const result = await getExportJobStatus('job-99')

    expect(result.state).toBe('active')
    expect(result.result).toBeNull()
    expect(result.failReason).toBeNull()
    expect(result.progress).toBe(25)
    expect(result.finishedAt).toBeNull()
  })

  it('returns a failure result (does not throw) when getJob rejects', async () => {
    ;(expenseExportQueue.getJob as GetJobMock).mockRejectedValueOnce(
      new Error('redis read failed'),
    )

    const result = await getExportJobStatus('job-err')

    expect(result).toEqual({
      success: false,
      message: 'Error getting job status: redis read failed',
    })
  })
})
