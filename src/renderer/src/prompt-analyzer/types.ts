import type {
  PromptAnalyzerAnalyzeResult,
  SupportedProvider
} from '../../../shared/prompt-analyzer-types'

export type AnalyzeResult = PromptAnalyzerAnalyzeResult

export type { SupportedProvider } from '../../../shared/prompt-analyzer-types'

export type PromptAnalyzerState = 'idle' | 'processing' | 'success' | 'error'

export type PromptAnalyzerResultSnapshot = {
  originalPrompt: string
  improvedPrompt: string
}

export type SavedPrompt = PromptAnalyzerResultSnapshot & {
  id: string
  savedAt: number
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
  savedPrompts: SavedPrompt[]
  activePromptAnalyzerModel: string | null
  error: string | null
  requestId: number

  setPanelOpen: (open: boolean) => void
  setHasWarned: (hasWarned: boolean) => void
  updatePrompt: (prompt: string) => void
  reportMissingApiKey: (provider: SupportedProvider) => void
  dismissResult: () => void
  savePromptLocally: () => void
  analyzePrompt: (prompt: string, options?: AnalyzeOptions) => Promise<AnalyzeResult | null>
  togglePanel: () => void
  reset: () => void
}
