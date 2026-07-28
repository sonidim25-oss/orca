export const PROMPT_ANALYZER_PROMPT_MAX_CHARS = 4000
export const PROMPT_ANALYZER_MAX_TOKENS_MAX = 32768
export const PROMPT_ANALYZER_MAX_TOKENS_MIN = 1
export const PROMPT_ANALYZER_TEMPERATURE_MAX = 2
export const PROMPT_ANALYZER_TEMPERATURE_MIN = 0

export type SupportedProvider = 'openrouter' | 'openai' | 'anthropic' | 'google_ai'

export type PromptAnalyzerProviderSettings = {
  model?: string
  temperature?: number
  maxTokens?: number
  apiKeyConfigured?: boolean
}

interface BaseProviderConfig {
  provider: SupportedProvider
  model: string
  temperature: number
  maxTokens: number
  systemPrompt?: string
}

export interface OpenRouterConfig extends BaseProviderConfig {
  provider: 'openrouter'
}

export interface OpenAIConfig extends BaseProviderConfig {
  provider: 'openai'
  organizationId?: string
}

export interface AnthropicConfig extends BaseProviderConfig {
  provider: 'anthropic'
}

export interface GoogleAIConfig extends BaseProviderConfig {
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
