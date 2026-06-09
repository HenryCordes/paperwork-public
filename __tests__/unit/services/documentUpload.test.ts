import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import documentUpload from '../../../services/documentUpload'

// @aws-sdk/client-s3 is globally mocked in externalMocks.ts (S3Client.send ->
// {}, Put/GetObjectCommand are jest.fns). @aws-sdk/s3-request-presigner is NOT
// globally mocked, so control its return value here.
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.test/x'),
}))

const mockPutObjectCommand = PutObjectCommand as unknown as jest.Mock
const mockGetObjectCommand = GetObjectCommand as unknown as jest.Mock
const mockGetSignedUrl = getSignedUrl as unknown as jest.Mock

describe('documentUpload.uploadFileNonHttp', () => {
  let sendSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    sendSpy = jest
      .spyOn(documentUpload.s3Client, 'send')
      .mockResolvedValue({} as never)
  })

  afterEach(() => {
    sendSpy.mockRestore()
  })

  it('constructs a PutObjectCommand with a tenant-scoped key, body and metadata, and sends it', async () => {
    const body = Buffer.from('hello world')

    const result = await documentUpload.uploadFileNonHttp(
      body,
      'export.pdf',
      'tenant-123',
      { contentType: 'application/pdf' },
    )

    expect(mockPutObjectCommand).toHaveBeenCalledTimes(1)
    const params = mockPutObjectCommand.mock.calls[0][0]
    expect(params.Key).toBe('tenant-123/export.pdf')
    expect(params.Body).toBe(body)
    expect(params.ContentType).toBe('application/pdf')
    expect(params.Metadata).toMatchObject({
      tenant: 'tenant-123',
      originalFileName: 'export.pdf',
    })

    // The command instance produced by the mock is what gets sent.
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(mockPutObjectCommand.mock.instances[0])

    expect(result).toEqual({
      key: 'tenant-123/export.pdf',
      bucket: undefined, // AWS_EXPORT_BUCKET_NAME unset in test env -> exportBucketName is undefined
      success: true,
    })
  })

  it('defaults contentType to application/octet-stream and merges caller metadata', async () => {
    await documentUpload.uploadFileNonHttp(
      'raw text',
      'notes.txt',
      'tenant-9',
      {
        metadata: { source: 'unit-test' },
      },
    )

    const params = mockPutObjectCommand.mock.calls[0][0]
    expect(params.ContentType).toBe('application/octet-stream')
    expect(params.Metadata).toEqual({
      tenant: 'tenant-9',
      originalFileName: 'notes.txt',
      source: 'unit-test',
    })
  })

  it('translates a numeric expires (days) into an Expires Date roughly that many days out', async () => {
    const before = Date.now()
    await documentUpload.uploadFileNonHttp('x', 'f.txt', 't', { expires: 2 })
    const after = Date.now()

    const params = mockPutObjectCommand.mock.calls[0][0]
    expect(params.Expires).toBeInstanceOf(Date)
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000
    expect((params.Expires as Date).getTime()).toBeGreaterThanOrEqual(
      before + twoDaysMs,
    )
    expect((params.Expires as Date).getTime()).toBeLessThanOrEqual(
      after + twoDaysMs,
    )
  })

  it('passes a Date expires through unchanged', async () => {
    const expiry = new Date('2030-01-01T00:00:00.000Z')
    await documentUpload.uploadFileNonHttp('x', 'f.txt', 't', {
      expires: expiry,
    })

    const params = mockPutObjectCommand.mock.calls[0][0]
    expect(params.Expires).toBe(expiry)
  })

  it('omits Expires when none is provided', async () => {
    await documentUpload.uploadFileNonHttp('x', 'f.txt', 't')

    const params = mockPutObjectCommand.mock.calls[0][0]
    expect(params.Expires).toBeUndefined()
  })

  it('throws and does not call S3 when file content is missing', async () => {
    await expect(
      documentUpload.uploadFileNonHttp('', 'f.txt', 't'),
    ).rejects.toThrow('File content is required')
    expect(sendSpy).not.toHaveBeenCalled()
    expect(mockPutObjectCommand).not.toHaveBeenCalled()
  })

  it('throws and does not call S3 when file name is missing', async () => {
    await expect(
      documentUpload.uploadFileNonHttp('content', '', 't'),
    ).rejects.toThrow('File name is required')
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('throws and does not call S3 when tenant ID is missing', async () => {
    await expect(
      documentUpload.uploadFileNonHttp('content', 'f.txt', ''),
    ).rejects.toThrow('Tenant ID is required')
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('propagates an S3 send failure to the caller', async () => {
    sendSpy.mockRejectedValueOnce(new Error('S3 unavailable'))

    await expect(
      documentUpload.uploadFileNonHttp('content', 'f.txt', 'tenant-x'),
    ).rejects.toThrow('S3 unavailable')
  })
})

describe('documentUpload.createSignedDownloadUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSignedUrl.mockResolvedValue('https://signed.test/x')
  })

  it('builds a GetObjectCommand for the requested key and returns the signed URL', async () => {
    const url = await documentUpload.createSignedDownloadUrl(
      'tenant-7/report.pdf',
    )

    expect(url).toBe('https://signed.test/x')

    expect(mockGetObjectCommand).toHaveBeenCalledTimes(1)
    const cmdParams = mockGetObjectCommand.mock.calls[0][0]
    expect(cmdParams.Key).toBe('tenant-7/report.pdf')

    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1)
    const [client, command, opts] = mockGetSignedUrl.mock.calls[0]
    expect(client).toBe(documentUpload.s3Client)
    expect(command).toBe(mockGetObjectCommand.mock.instances[0])
    expect(opts).toEqual({ expiresIn: 7200 })
  })

  it('forwards a custom expiresIn to getSignedUrl', async () => {
    await documentUpload.createSignedDownloadUrl('k/obj.png', 600)

    const [, , opts] = mockGetSignedUrl.mock.calls[0]
    expect(opts).toEqual({ expiresIn: 600 })
  })

  it('propagates a presigner failure to the caller', async () => {
    mockGetSignedUrl.mockRejectedValueOnce(new Error('presign failed'))

    await expect(
      documentUpload.createSignedDownloadUrl('k/obj.png'),
    ).rejects.toThrow('presign failed')
  })
})
