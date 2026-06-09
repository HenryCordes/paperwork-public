// __tests__/integration/harness.smoke.test.ts
import request from 'supertest'

import app from '../../app'
import Subscription from '../../models/Subscription'
import { createAuthedTenant, authHeader } from '../setup/authHarness'
import * as dbHandler from '../setup/helper-db'

beforeAll(async () => {
  await dbHandler.connect()
})
afterEach(async () => {
  await dbHandler.clearDatabase()
})
afterAll(async () => {
  await dbHandler.closeDatabase()
})

describe('integration harness', () => {
  it('rejects an unauthenticated API request with 401', async () => {
    const res = await request(app).get('/api/contacts')
    expect(res.status).toBe(401)
  })

  it('allows an authenticated, subscribed tenant to reach a controller (200)', async () => {
    const { token } = await createAuthedTenant()
    const res = await request(app).get('/api/contacts').set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 402 when the tenant has no active subscription', async () => {
    const { token } = await createAuthedTenant()
    await Subscription.deleteMany({})
    const res = await request(app).get('/api/contacts').set(authHeader(token))
    expect(res.status).toBe(402)
  })
})
