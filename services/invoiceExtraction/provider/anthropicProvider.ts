import Anthropic from '@anthropic-ai/sdk'

import {
  ExtractionImageInput,
  getProviderErrorStatus,
  InvoiceExtractionProvider,
  ProviderExtractOptions,
  ProviderResponse,
} from './types'

const EXTRACTION_PROMPT = `You are an invoice and receipt data extraction assistant for a Dutch bookkeeping application.
Extract the following fields from the attached image and return ONLY a single JSON object, with no markdown
fences and no commentary, matching this exact shape:

{
  "extraction": {
    "vendor": string | null,
    "invoiceDate": string | null,
    "currency": string,
    "subtotal": number | null,
    "vatBreakdown": [{ "rate": number, "amount": number }],
    "vatAmount": number | null,
    "total": number,
    "lineItems": [
      { "description": string, "quantity": number | null, "unitPrice": number | null, "taxRate": number | null, "lineTotal": number }
    ]
  },
  "confidence": {
    "overall": number,
    "fields": { [fieldName: string]: number }
  }
}

invoiceDate must be formatted as YYYY-MM-DD. If a field cannot be determined, use null (or an empty array for
vatBreakdown/lineItems). "total" is required and must be a number. Confidence values are between 0 and 1.`

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 1000

function isRetryableError(error: unknown): boolean {
  const status = getProviderErrorStatus(error)
  if (status !== undefined) {
    return status === 429 || status >= 500
  }
  // No status property means a network/connection-level failure (timeout, DNS, etc).
  return true
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class AnthropicProvider implements InvoiceExtractionProvider {
  readonly name = 'anthropic'

  private client: Anthropic
  private model: string

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    this.model = process.env.ANTHROPIC_EXTRACTION_MODEL || 'claude-sonnet-4-6'
  }

  async extract(
    image: ExtractionImageInput,
    options: ProviderExtractOptions = {},
  ): Promise<ProviderResponse> {
    const promptText = options.repairContext
      ? `Your previous response was:\n<previous_response>\n${options.repairContext.previousResponseText}\n</previous_response>\n\nThat response failed validation with this error:\n${options.repairContext.validationError}\n\n${EXTRACTION_PROMPT}`
      : EXTRACTION_PROMPT

    const content = [
      {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: image.mimeType,
          data: image.buffer.toString('base64'),
        },
      },
      { type: 'text' as const, text: promptText },
    ]

    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const startedAt = Date.now()
      try {
        const message = await this.client.messages.create({
          model: this.model,
          max_tokens: 1024,
          messages: [{ role: 'user', content }],
        })

        const textBlock = message.content.find(
          (block) => block.type === 'text',
        ) as { type: 'text'; text: string } | undefined

        return {
          responseText: textBlock?.text ?? '',
          model: this.model,
          latencyMs: Date.now() - startedAt,
          tokensUsed: {
            input: message.usage.input_tokens,
            output: message.usage.output_tokens,
          },
        }
      } catch (error) {
        lastError = error
        if (attempt === MAX_ATTEMPTS || !isRetryableError(error)) {
          throw error
        }
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1))
      }
    }

    throw lastError
  }
}
