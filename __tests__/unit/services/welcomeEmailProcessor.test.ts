import type { Job } from 'bull'
import mongoose from 'mongoose'

import Subscription from '../../../models/Subscription'
import User from '../../../models/User'
import * as emailService from '../../../services/emailService'
import { processWelcomeEmail } from '../../../services/queues/email/welcomeEmailProcessor'
import * as dbHandler from '../../setup/helper-db'

// sendEmail is our own code, but we spy on it to (a) observe the payload the
// processor builds and (b) keep the real Mailjet path out of the test. The
// processor imports the binding directly; jest.spyOn on the module namespace
// intercepts that binding (verified empirically).
const sendEmailSpy = jest
  .spyOn(emailService, 'sendEmail')
  .mockResolvedValue({ success: true })

const TENANT = new mongoose.Types.ObjectId().toString()

interface SeedUserOptions {
  name?: string
  email?: string
}

interface SeedSubscriptionOptions {
  plan?: string
  subscriptionDate?: Date
  welcomeEmailSent?: boolean
  userId?: string
}

const seedUser = (over: SeedUserOptions = {}) =>
  User.create({
    name: over.name ?? 'Test User',
    email: over.email ?? 'test@example.com',
    password: 'secret123',
    organization: new mongoose.Types.ObjectId(),
  })

const seedSubscription = (
  userId: string,
  ownerId: mongoose.Types.ObjectId,
  over: SeedSubscriptionOptions = {},
) =>
  Subscription.create({
    owner: ownerId,
    userId: over.userId ?? userId,
    plan: over.plan ?? 'Premium',
    subscriptionDate: over.subscriptionDate ?? new Date('2026-01-15'),
    welcomeEmailSent: over.welcomeEmailSent ?? false,
    tenantId: TENANT,
  })

const buildJob = (subscriptionId: string, userId: string): Job =>
  ({
    id: 'job-1',
    data: {
      tenantId: TENANT,
      userId,
      data: { subscriptionId },
    },
    progress: jest.fn(),
  }) as unknown as Job

// The processor runs its real work inside `session.withTransaction(...)` WITHOUT
// awaiting it (welcomeEmailProcessor.ts line 32), so the DB write and email send
// happen on a detached promise that settles AFTER the processor returns. Every
// test stubs mongoose.startSession via stubDetachedSession() and awaits the
// captured callback promise, making the work deterministic (no real transaction
// is needed -- mongodb-memory-server is standalone -- and no flaky polling).
const reloadSubscription = (id: mongoose.Types.ObjectId) =>
  Subscription.byTenant(TENANT).findById(id)

describe('processWelcomeEmail', () => {
  beforeAll(async () => {
    await dbHandler.connect()
  })
  afterEach(async () => {
    await dbHandler.clearDatabase()
    sendEmailSpy.mockClear()
    // Some tests stub mongoose.startSession; restore it so it cannot leak into
    // the next test. sendEmailSpy is preserved (cleared above, restored in
    // afterAll).
    const startSession = mongoose.startSession as unknown as {
      mockRestore?: () => void
    }
    startSession.mockRestore?.()
  })
  afterAll(async () => {
    await dbHandler.closeDatabase()
    sendEmailSpy.mockRestore()
  })

  it('sends the welcome email with the user name, plan and a Dutch-formatted date', async () => {
    const user = await seedUser({ name: 'Alice', email: 'alice@example.com' })
    const sub = await seedSubscription(user._id.toString(), user._id, {
      plan: 'Premium',
      subscriptionDate: new Date('2026-01-15'),
    })

    const { callbackError } = stubDetachedSession()
    await processWelcomeEmail(buildJob(sub._id.toString(), user._id.toString()))
    await callbackError()

    expect(sendEmailSpy).toHaveBeenCalledTimes(1)
    const payload = sendEmailSpy.mock.calls[0][0]
    expect(payload.to).toBe('alice@example.com')
    expect(payload.subject).toBe('Welkom bij Paperwork!')
    expect(payload.from).toEqual({
      email: 'paperworkdevelopment@gmail.com',
      name: 'Paperwork',
    })
    // The HTML body is rendered from welcomeEmailTemplate with the user's data.
    expect(payload.html).toContain('Hallo Alice,')
    expect(payload.html).toContain('Premium')
    // 2026-01-15 rendered in nl-NL long format.
    expect(payload.html).toContain('15 januari 2026')
    // A plain-text alternative is always provided.
    expect(payload.text).toContain('Bedankt voor je inschrijving')
  })

  it('honors EMAIL_FROM when set for the sender address', async () => {
    const original = process.env.EMAIL_FROM
    process.env.EMAIL_FROM = 'sender@paperwork.test'
    try {
      const user = await seedUser({ email: 'bob@example.com' })
      const sub = await seedSubscription(user._id.toString(), user._id)

      const { callbackError } = stubDetachedSession()
      await processWelcomeEmail(
        buildJob(sub._id.toString(), user._id.toString()),
      )
      await callbackError()

      expect(sendEmailSpy.mock.calls[0][0].from).toEqual({
        email: 'sender@paperwork.test',
        name: 'Paperwork',
      })
    } finally {
      if (original === undefined) {
        delete process.env.EMAIL_FROM
      } else {
        process.env.EMAIL_FROM = original
      }
    }
  })

  it('marks the subscription as welcomeEmailSent after sending', async () => {
    const user = await seedUser({ email: 'carol@example.com' })
    const sub = await seedSubscription(user._id.toString(), user._id, {
      welcomeEmailSent: false,
    })

    const { callbackError } = stubDetachedSession()
    await processWelcomeEmail(buildJob(sub._id.toString(), user._id.toString()))
    await callbackError()

    const reloaded = await reloadSubscription(sub._id)
    expect(reloaded?.welcomeEmailSent).toBe(true)
  })

  it('does not resend (no email, flag unchanged) when welcomeEmailSent is already true', async () => {
    const user = await seedUser({ email: 'dan@example.com' })
    const sub = await seedSubscription(user._id.toString(), user._id, {
      welcomeEmailSent: true,
    })

    const { callbackError } = stubDetachedSession()
    await processWelcomeEmail(buildJob(sub._id.toString(), user._id.toString()))
    await callbackError()

    expect(sendEmailSpy).not.toHaveBeenCalled()
    const reloaded = await reloadSubscription(sub._id)
    expect(reloaded?.welcomeEmailSent).toBe(true)
  })

  it('resolves to { success: true } on the happy path', async () => {
    const user = await seedUser({ email: 'erin@example.com' })
    const sub = await seedSubscription(user._id.toString(), user._id)

    const { callbackError } = stubDetachedSession()
    const result = await processWelcomeEmail(
      buildJob(sub._id.toString(), user._id.toString()),
    )
    await callbackError()

    expect(result).toEqual({ success: true })
  })

  // FIXME(detached-transaction): welcomeEmailProcessor.ts line 32 calls
  // `session.withTransaction(...)` WITHOUT awaiting it. As a result the work
  // (and any error thrown inside it) happens on a detached promise. When the
  // subscription or user is missing the callback throws, but because the outer
  // try/catch never sees that rejection the processor STILL resolves to
  // { success: true } and never re-throws for Bull to retry -- the thrown error
  // would instead surface as an unhandled promise rejection in production.
  //
  // To characterize this deterministically (and without poisoning other tests
  // with an unhandled rejection), the two tests below stub mongoose.startSession
  // so withTransaction simply invokes the processor's callback and exposes the
  // resulting promise. That mirrors production (the processor never passes the
  // session to its queries, so no real transaction is in play) while letting the
  // test await the callback and assert what it threw. The assertion on the
  // processor's own return value (`{ success: true }`) proves the bug: the error
  // does not propagate to the caller.
  type SessionStub = {
    withTransaction: (cb: () => Promise<unknown>) => void
    endSession: () => void
  }

  const stubDetachedSession = (): { callbackError: () => Promise<unknown> } => {
    let captured: Promise<unknown> = Promise.resolve()
    const sessionStub: SessionStub = {
      withTransaction: (cb) => {
        // Capture but intentionally do NOT return the promise, matching the
        // production code path where the result is discarded.
        captured = cb().catch((err) => err)
      },
      endSession: () => {},
    }
    jest
      .spyOn(mongoose, 'startSession')
      .mockResolvedValue(sessionStub as unknown as mongoose.ClientSession)
    return { callbackError: () => captured }
  }

  it('CURRENT BEHAVIOR: resolves { success: true } (does not re-throw) and sends no email when the subscription is missing', async () => {
    const { callbackError } = stubDetachedSession()
    const missingId = new mongoose.Types.ObjectId().toString()

    const result = await processWelcomeEmail(buildJob(missingId, 'user-x'))

    // The un-awaited transaction means the processor resolves successfully and
    // does NOT re-throw, even though the work inside it failed.
    expect(result).toEqual({ success: true })

    const thrown = await callbackError()
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe(
      `Subscription not found: ${missingId}`,
    )
    expect(sendEmailSpy).not.toHaveBeenCalled()
  })

  it('CURRENT BEHAVIOR: resolves { success: true } (does not re-throw), sends no email and leaves the flag false when the user is missing', async () => {
    const { callbackError } = stubDetachedSession()

    const orphanUserId = new mongoose.Types.ObjectId()
    const sub = await Subscription.create({
      owner: new mongoose.Types.ObjectId(),
      userId: orphanUserId.toString(),
      plan: 'Premium',
      subscriptionDate: new Date('2026-01-15'),
      welcomeEmailSent: false,
      tenantId: TENANT,
    })

    const result = await processWelcomeEmail(
      buildJob(sub._id.toString(), orphanUserId.toString()),
    )

    expect(result).toEqual({ success: true })

    const thrown = await callbackError()
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe(
      `User not found for subscription: ${orphanUserId.toString()}`,
    )
    expect(sendEmailSpy).not.toHaveBeenCalled()

    const reloaded = await reloadSubscription(sub._id)
    expect(reloaded?.welcomeEmailSent).toBe(false)
  })
})
