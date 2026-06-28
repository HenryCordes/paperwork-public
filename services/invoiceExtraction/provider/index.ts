import { AnthropicProvider } from './anthropicProvider'
import { InvoiceExtractionProvider } from './types'

export function getExtractionProvider(): InvoiceExtractionProvider {
  const providerName = process.env.LLM_PROVIDER || 'anthropic'

  switch (providerName) {
    case 'anthropic':
      return new AnthropicProvider()
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${providerName}`)
  }
}
