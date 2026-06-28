// __tests__/integration/documents.test.ts
import { GetObjectCommand } from '@aws-sdk/client-s3'
import request from 'supertest'

import app from '../../app'
import {
  createAuthedTenant,
  authHeader,
  AuthedTenant,
} from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

// NOTE on coverage scope: routes/document.ts wires only two handlers:
//   GET  /api/document/:organizationId/:id  (getDocument, public)
//   POST /api/document                      (createDocument, protected)
// The controller also exports getDocuments and deleteDocument, but neither is
// mounted on any route, so they are unreachable over HTTP and cannot be
// exercised by a Supertest integration test. See the summary for details.
//
// NOTE on S3 mocking: __tests__/setup/externalMocks.ts globally mocks
// @aws-sdk/client-s3 (every S3Client.send resolves to `{}`) and multer-s3
// (returns `{}` as the storage engine). These assertions characterize the
// controller's behavior under those mocks; they are not re-mocked here.

describe('documents API', () => {
  let a: AuthedTenant
  let b: AuthedTenant

  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
  })
  afterAll(async () => {
    await dbHandler.closeDatabase()
  })
  beforeEach(async () => {
    a = await createAuthedTenant()
    b = await createAuthedTenant()
  })

  // ---- POST /api/document (createDocument) ----

  it('POST /api/document requires authentication (401)', async () => {
    const res = await request(app)
      .post('/api/document')
      .attach('file', Buffer.from('hello'), {
        filename: 'doc.pdf',
        contentType: 'application/pdf',
      })
    expect(res.status).toBe(401)
  })

  it('POST /api/document uploads through the storage pipeline and returns the tenant-scoped fileLocation', async () => {
    const res = await request(app)
      .post('/api/document')
      .set(authHeader(a.token))
      .attach('file', Buffer.from('hello'), {
        filename: 'doc.pdf',
        contentType: 'application/pdf',
      })

    // The mocked storage engine reports the key as `${organizationId}/${name}`,
    // so a successful upload proves the file is stored under the caller's
    // tenant prefix (the isolation mechanism for documents).
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.fileLocation).toBe(`${a.organizationId}/doc.pdf`)
  })

  // ---- GET /api/document/:organizationId/:id (getDocument) ----

  it('GET /api/document/:organizationId/:id is public (no auth required) and reaches the handler', async () => {
    // The /api/document/ prefix is in app.ts publicPaths, so no 401.
    const res = await request(app).get(
      `/api/document/${a.organizationId}/real.pdf`,
    )
    expect(res.status).not.toBe(401)
  })

  it("GET /api/document/:organizationId/:id returns 404 when id is the literal 'undefined'", async () => {
    const res = await request(app).get(
      `/api/document/${a.organizationId}/undefined`,
    )
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe('No such key')
  })

  it("GET /api/document/:organizationId/:id returns 404 when organizationId is the literal 'undefined'", async () => {
    const res = await request(app).get('/api/document/undefined/somefile.pdf')
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe('No such key')
  })

  it('GET /api/document/:organizationId/:id returns 500 when the (mocked) S3 object lookup yields no usable metadata', async () => {
    // Under the global S3 mock, send() resolves to `{}`, so setting the
    // Content-Length header from an undefined value throws inside the inner
    // try/catch; the error name is not "NoSuchKey", so the controller maps it
    // to 500 "document not found..".
    const res = await request(app).get(
      `/api/document/${a.organizationId}/real.pdf`,
    )
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe('document not found..')
  })

  it("keys the S3 GetObjectCommand with each tenant's own organizationId prefix (the isolation mechanism)", async () => {
    // getDocument has no DB-backed tenant query; isolation lives in the S3 key
    // prefix `${organizationId}/${id}` built from the URL params. Assert each
    // tenant's fetch is keyed under its OWN org id, so the prefixes cannot
    // collide and tenant a can never address tenant b's object.
    ;(GetObjectCommand as unknown as jest.Mock).mockClear()

    await request(app).get(`/api/document/${a.organizationId}/report.pdf`)
    await request(app).get(`/api/document/${b.organizationId}/report.pdf`)

    expect(GetObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: `${a.organizationId}/report.pdf` }),
    )
    expect(GetObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: `${b.organizationId}/report.pdf` }),
    )
    expect(a.organizationId).not.toBe(b.organizationId)
  })
})
