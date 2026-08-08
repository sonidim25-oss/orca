import type {
  PromptAnalyzerAnalyzeResult,
  PromptAnalyzerConfig,
  SupportedProvider
} from '../../../shared/prompt-analyzer-types'

export type AnalyzeResult = PromptAnalyzerAnalyzeResult

export type ProviderConfig = {
  apiKey: string
  model: string
}

export type OpenRouterConfig = ProviderConfig & {
  siteUrl?: string
  siteName?: string
}

export type AnalyzeRequest = {
  prompt: string
  systemPrompt?: string
  signal?: AbortSignal
}

export type AnalyzerProvider = {
  analyze(request: AnalyzeRequest): Promise<AnalyzeResult>
  config: ProviderConfig
}

export type { SupportedProvider, PromptAnalyzerConfig } from '../../../shared/prompt-analyzer-types'
export type PromptAnalyzerProvider = SupportedProvider

export type PromptAnalyzerState = 'idle' | 'processing' | 'success' | 'error'

export type PromptAnalyzerResultSnapshot = {
  originalPrompt: string
  improvedPrompt: string
}

export type AnalyzeOptions = {
  provider?: SupportedProvider
  model?: string
  systemPrompt?: string
}

export type PromptAnalyzerSlice = {
  isPanelOpen: boolean
  hasWarned: boolean
  state: PromptAnalyzerState
  originalPrompt: string
  improvedPrompt: string
  lastSuccessfulResult: PromptAnalyzerResultSnapshot | null
  error: string | null
  config: PromptAnalyzerConfig | null
  requestId: number

  setPanelOpen: (open: boolean) => void
  setHasWarned: (hasWarned: boolean) => void
  updatePrompt: (prompt: string) => void
  reportMissingApiKey: () => void
  dismissResult: () => void
  analyzePrompt: (prompt: string, options?: AnalyzeOptions) => Promise<AnalyzeResult | null>
  setConfig: (config: Partial<PromptAnalyzerConfig> | null) => void
  setModel: (model: string) => void
  togglePanel: () => void
  reset: () => void
}
