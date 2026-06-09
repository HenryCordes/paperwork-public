/**
 * Email Service
 *
 * Provides email sending functionality with provider abstraction.
 * Currently uses mailjet, but can be easily switched to another provider.
 */
import Mailjet from 'node-mailjet'

type EmailAddress = string | { email: string; name?: string }

interface EmailOptions {
  to: EmailAddress
  from: EmailAddress
  subject: string
  text?: string
  html: string
  attachments?: unknown[]
}

interface MailjetAddress {
  Email: string
  Name: string
}

/**
 * Configure the email service with API keys and settings
 */
const configureMailjet = () => {
  return new Mailjet({
    apiKey: process.env.MJ_APIKEY_PUBLIC,
    apiSecret: process.env.MJ_APIKEY_PRIVATE,
  })
}

/**
 * Send an email with optional attachments
 */
export const sendEmail = async (
  options: EmailOptions,
): Promise<{ success: boolean }> => {
  const mailjet = configureMailjet()

  const msg: {
    to: EmailAddress
    from: EmailAddress
    subject: string
    text?: string
    html: string
    attachments?: unknown[]
  } = {
    to: options.to,
    from: options.from,
    subject: options.subject,
    text: options.text,
    html: options.html,
  }

  if (options.attachments && options.attachments.length > 0) {
    msg.attachments = options.attachments
  }
  console.log('[Email] mail msg', msg)

  // Helper to normalize email address to required format
  const formatEmailAddress = (
    input: EmailAddress | undefined,
  ): MailjetAddress | null => {
    if (!input) return null

    // If already in object format with email property
    if (typeof input === 'object' && input.email) {
      return {
        Email: input.email,
        Name: input.name || '',
      }
    }

    // If string format
    if (typeof input === 'string') {
      return {
        Email: input,
        Name: '',
      }
    }

    return null
  }
  try {
    const request = await mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: formatEmailAddress(msg.from),
          To: [formatEmailAddress(msg.to)],
          Subject: msg.subject,
          TextPart: msg.text,
          HTMLPart: msg.html,
          Attachments: msg.attachments,
        },
      ],
    })

    console.log('[Email] mailjet result', request)
    console.log('Email sent successfully')
    return { success: !!request.body }
  } catch (error) {
    console.error('Email sending failed:', error)
    const response = (error as { response?: { body?: unknown } }).response
    if (response) {
      console.error(response.body)
    }
    throw error
  }
}
