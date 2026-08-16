export const PROMPT_ANALYZER_PROMPT_MAX_CHARS = 4000
export const PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL = 'openrouter/auto-beta'

export type SupportedProvider = 'openrouter' | 'openai' | 'anthropic' | 'google_ai'

export type PromptAnalyzerProviderSettings = {
  model?: string
  apiKeyConfigured?: boolean
}

type BaseProviderConfig = {
  model: string
  systemPrompt?: string
}

export type OpenRouterConfig = BaseProviderConfig & {
  provider: 'openrouter'
}

export type OpenAIConfig = BaseProviderConfig & {
  provider: 'openai'
  organizationId?: string
}

export type AnthropicConfig = BaseProviderConfig & {
  provider: 'anthropic'
}

export type GoogleAIConfig = BaseProviderConfig & {
  provider: 'google_ai'
}

export type PromptAnalyzerConfig =
  | OpenRouterConfig
  | OpenAIConfig
  | AnthropicConfig
  | GoogleAIConfig

export type PromptAnalyzerAnalyzeArgs = PromptAnalyzerConfig & {
  prompt: string
}

export type PromptAnalyzerAnalyzeResult = {
  suggestion: string
  improvedPrompt: string
  reasoning: string
}

export type PromptAnalyzerAnalyzeResponse =
  | { ok: true; result: PromptAnalyzerAnalyzeResult }
  | { ok: false; error: string }

export type PromptAnalyzerResultSnapshot = {
  originalPrompt: string
  improvedPrompt: string
}

export type SavedPrompt = PromptAnalyzerResultSnapshot & {
  id: string
  savedAt: number
}
