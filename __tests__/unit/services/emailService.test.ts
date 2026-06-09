import Mailjet from 'node-mailjet'

import { sendEmail } from '../../../services/emailService'

// node-mailjet is globally mocked in __tests__/setup/externalMocks.ts. Here we
// re-shape that mock so we can (a) inspect the post/request call arguments and
// (b) control the resolved/rejected value per test. We do NOT mock our own code.
const mockedMailjet = Mailjet as unknown as jest.Mock

// Shared spies, re-pointed in beforeEach so each test sees a clean call log.
let postSpy: jest.Mock
let requestSpy: jest.Mock

beforeEach(() => {
  requestSpy = jest.fn().mockResolvedValue({ body: { Messages: [] } })
  postSpy = jest.fn(() => ({ request: requestSpy }))
  mockedMailjet.mockImplementation(() => ({ post: postSpy }))
})

afterEach(() => {
  jest.clearAllMocks()
})

describe('sendEmail', () => {
  it('posts to the mailjet v3.1 send endpoint with recipient, subject and HTML body', async () => {
    await sendEmail({
      to: 'recipient@example.com',
      from: 'sender@example.com',
      subject: 'Your invoice',
      html: '<p>Hello</p>',
      text: 'Hello',
    })

    expect(postSpy).toHaveBeenCalledWith('send', { version: 'v3.1' })

    expect(requestSpy).toHaveBeenCalledTimes(1)
    const payload = requestSpy.mock.calls[0][0] as {
      Messages: Array<{
        From: { Email: string; Name: string }
        To: Array<{ Email: string; Name: string }>
        Subject: string
        TextPart?: string
        HTMLPart: string
        Attachments?: unknown[]
      }>
    }
    const [message] = payload.Messages
    expect(message.From).toEqual({ Email: 'sender@example.com', Name: '' })
    expect(message.To).toEqual([{ Email: 'recipient@example.com', Name: '' }])
    expect(message.Subject).toBe('Your invoice')
    expect(message.HTMLPart).toBe('<p>Hello</p>')
    expect(message.TextPart).toBe('Hello')
  })

  it('returns { success: true } when mailjet responds with a body', async () => {
    requestSpy.mockResolvedValue({
      body: { Messages: [{ Status: 'success' }] },
    })

    const result = await sendEmail({
      to: 'recipient@example.com',
      from: 'sender@example.com',
      subject: 'Subject',
      html: '<p>Body</p>',
    })

    expect(result).toEqual({ success: true })
  })

  it('returns { success: false } when mailjet responds without a body', async () => {
    // success is computed as !!request.body, so a falsy body yields false.
    requestSpy.mockResolvedValue({ body: undefined })

    const result = await sendEmail({
      to: 'recipient@example.com',
      from: 'sender@example.com',
      subject: 'Subject',
      html: '<p>Body</p>',
    })

    expect(result).toEqual({ success: false })
  })

  it('normalizes object-form to/from addresses into mailjet Email/Name shape', async () => {
    await sendEmail({
      to: { email: 'client@example.com', name: 'Client Co' },
      from: { email: 'billing@example.com', name: 'Billing Dept' },
      subject: 'Statement',
      html: '<p>Statement</p>',
    })

    const payload = requestSpy.mock.calls[0][0] as {
      Messages: Array<{
        From: { Email: string; Name: string }
        To: Array<{ Email: string; Name: string }>
      }>
    }
    const [message] = payload.Messages
    expect(message.From).toEqual({
      Email: 'billing@example.com',
      Name: 'Billing Dept',
    })
    expect(message.To).toEqual([
      { Email: 'client@example.com', Name: 'Client Co' },
    ])
  })

  it('includes attachments in the payload only when a non-empty array is provided', async () => {
    const attachments = [
      {
        ContentType: 'application/pdf',
        Filename: 'invoice.pdf',
        Base64Content: 'AAAA',
      },
    ]

    await sendEmail({
      to: 'recipient@example.com',
      from: 'sender@example.com',
      subject: 'With attachment',
      html: '<p>See attached</p>',
      attachments,
    })

    const payload = requestSpy.mock.calls[0][0] as {
      Messages: Array<{ Attachments?: unknown[] }>
    }
    expect(payload.Messages[0].Attachments).toEqual(attachments)
  })

  it('sends undefined Attachments when the attachments array is empty', async () => {
    await sendEmail({
      to: 'recipient@example.com',
      from: 'sender@example.com',
      subject: 'No attachment',
      html: '<p>Plain</p>',
      attachments: [],
    })

    const payload = requestSpy.mock.calls[0][0] as {
      Messages: Array<{ Attachments?: unknown[] }>
    }
    // Empty array is not copied onto msg, so Attachments is left undefined.
    expect(payload.Messages[0].Attachments).toBeUndefined()
  })

  it('propagates the error when mailjet rejects', async () => {
    const failure = Object.assign(new Error('Mailjet 401'), {
      response: { body: { ErrorMessage: 'Unauthorized' } },
    })
    requestSpy.mockRejectedValue(failure)

    await expect(
      sendEmail({
        to: 'recipient@example.com',
        from: 'sender@example.com',
        subject: 'Will fail',
        html: '<p>Body</p>',
      }),
    ).rejects.toThrow('Mailjet 401')
  })
})
