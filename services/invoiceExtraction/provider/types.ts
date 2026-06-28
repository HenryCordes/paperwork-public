export interface ExtractionImageInput {
  buffer: Buffer
  mimeType: 'image/jpeg' | 'image/png'
}

export interface RepairContext {
  previousResponseText: string
  validationError: string
}

export interface ProviderExtractOptions {
  repairContext?: RepairContext
}

export interface ProviderResponse {
  responseText: string
  model: string
  latencyMs: number
  tokensUsed: { input: number; output: number }
}

export interface InvoiceExtractionProvider {
  readonly name: string
  extract(
    image: ExtractionImageInput,
    options?: ProviderExtractOptions,
  ): Promise<ProviderResponse>
}

export function getProviderErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}
