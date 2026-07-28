import type { SupportedProvider } from '../../shared/prompt-analyzer-types'

export const SUPPORTED_PROMPT_ANALYZER_PROVIDERS = [
  'openrouter',
  'openai',
  'anthropic',
  'google_ai'
] as const satisfies readonly SupportedProvider[]

export function assertSupportedPromptAnalyzerProvider(
  provider: unknown
): asserts provider is SupportedProvider {
  if (!SUPPORTED_PROMPT_ANALYZER_PROVIDERS.some((candidate) => candidate === provider)) {
    throw new Error(`Unsupported Prompt Analyzer provider: ${String(provider)}`)
  }
}

export function assertPromptAnalyzerClientProvider(
  provider: SupportedProvider,
  expected: SupportedProvider,
  clientName: string
): void {
  if (provider !== expected) {
    throw new Error(`${clientName} client requires provider ${expected}`)
  }
}
