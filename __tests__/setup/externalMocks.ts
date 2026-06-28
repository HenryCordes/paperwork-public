// __tests__/setup/externalMocks.ts
// Neutralize import-time external clients so the app graph loads without
// opening real Redis / Firebase / Mollie / S3 / Mailjet connections.

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'test-job' }),
    process: jest.fn(),
    on: jest.fn(),
    getJob: jest.fn().mockResolvedValue(null),
    close: jest.fn().mockResolvedValue(undefined),
    // Queue inspection methods used by getQueueStats() — empty queues by default
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    getDelayed: jest.fn().mockResolvedValue([]),
  }))
})

jest.mock('firebase-admin', () => ({
  __esModule: true,
  default: {
    apps: [],
    initializeApp: jest.fn(),
    credential: { cert: jest.fn() },
    messaging: jest.fn(() => ({
      send: jest.fn().mockResolvedValue('test-message-id'),
      sendEachForMulticast: jest
        .fn()
        .mockResolvedValue({ successCount: 0, responses: [] }),
    })),
  },
}))

jest.mock('@mollie/api-client', () => ({
  createMollieClient: jest.fn(() => ({
    payments: { create: jest.fn(), get: jest.fn() },
    customers: { create: jest.fn(), get: jest.fn() },
    subscriptions: { create: jest.fn(), get: jest.fn() },
  })),
}))

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  GetObjectCommand: jest.fn(),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}))

// multer-s3 returns a multer StorageEngine. A bare `{}` has no `_handleFile`,
// so multer never completes the upload -- it errored fast locally but HUNG on
// CI (30s timeout). Provide a minimal engine that drains the upload stream and
// reports a deterministic, tenant-scoped S3 key so the upload pipeline
// completes without real S3.
jest.mock('multer-s3', () =>
  jest.fn(() => ({
    _handleFile(
      req: { organizationId?: string },
      file: { stream: NodeJS.ReadableStream; originalname: string },
      cb: (
        error: Error | null,
        info?: { key: string; location: string; bucket: string; size: number },
      ) => void,
    ) {
      let size = 0
      file.stream.on('data', (chunk: Buffer) => {
        size += chunk.length
      })
      file.stream.on('end', () => {
        const org = req.organizationId || 'unknown-org'
        const key = `${org}/${file.originalname}`
        cb(null, {
          key,
          location: `https://s3.test/${key}`,
          bucket: 'test-bucket',
          size,
        })
      })
      file.stream.on('error', (err: Error) => cb(err))
    },
    _removeFile(
      _req: unknown,
      _file: unknown,
      cb: (error: Error | null) => void,
    ) {
      cb(null)
    },
  })),
)

jest.mock('node-mailjet', () =>
  jest.fn().mockImplementation(() => ({
    post: jest.fn(() => ({
      request: jest.fn().mockResolvedValue({ body: {} }),
    })),
  })),
)

// AnthropicProvider is only constructed when extractInvoice() actually runs
// (lazy via getExtractionProvider()), so this mock mostly matters for any
// future test that loads the full app graph without overriding the provider
// — same defensive convention as every other external SDK in this file.
jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '{"extraction":{"vendor":null,"invoiceDate":null,"currency":"EUR","subtotal":null,"vatBreakdown":[],"vatAmount":null,"total":1,"lineItems":[]},"confidence":{"overall":1,"fields":{}}}',
          },
        ],
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    },
  })),
)

// string-strip-html is ESM-only; mock it so the email controller graph loads
// under Jest's CommonJS transform without needing transformIgnorePatterns.
jest.mock('string-strip-html', () => ({
  stripHtml: jest.fn((str: string) => ({ result: str })),
}))
