import type {
  PromptAnalyzerAnalyzeArgs,
  PromptAnalyzerAnalyzeResponse,
  SupportedProvider
} from '../../shared/prompt-analyzer-types'

export type PromptAnalyzerApi = {
  getApiKeyStatus: (provider?: SupportedProvider) => Promise<{ configured: boolean }>
  analyze: (args: PromptAnalyzerAnalyzeArgs) => Promise<PromptAnalyzerAnalyzeResponse>
  cancel: () => Promise<void>
  saveApiKey: (apiKey: string, provider?: SupportedProvider) => Promise<{ configured: boolean }>
  clearApiKey: (provider?: SupportedProvider) => Promise<{ configured: boolean }>
}
