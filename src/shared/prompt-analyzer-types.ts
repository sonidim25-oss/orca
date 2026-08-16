import { z } from 'zod'

export const PROMPT_ANALYZER_PROMPT_MAX_CHARS = 4000
export const PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL = 'openrouter/auto-beta'

const PROMPT_ANALYZER_MODEL_MAX_CHARS = 200
const PROMPT_ANALYZER_SYSTEM_PROMPT_MAX_CHARS = 8000
const PROMPT_ANALYZER_ORGANIZATION_ID_MAX_CHARS = 128
const basePromptAnalyzerAnalyzeArgsShape = {
  model: z
    .string({ message: 'Prompt analyzer model is not configured. Set a model in Settings.' })
    .max(PROMPT_ANALYZER_MODEL_MAX_CHARS)
    .refine((value) => value.trim().length > 0, {
      message: 'Prompt analyzer model is not configured. Set a model in Settings.'
    }),
  prompt: z
    .string({ message: 'Prompt is required' })
    .max(PROMPT_ANALYZER_PROMPT_MAX_CHARS, {
      message: `Prompt must not exceed ${PROMPT_ANALYZER_PROMPT_MAX_CHARS.toString()} characters`
    })
    .refine((value) => value.trim().length > 0, { message: 'Prompt is required' }),
  systemPrompt: z.string().max(PROMPT_ANALYZER_SYSTEM_PROMPT_MAX_CHARS).optional()
}

export const promptAnalyzerAnalyzeArgsSchema = z.discriminatedUnion('provider', [
  z.strictObject({
    ...basePromptAnalyzerAnalyzeArgsShape,
    provider: z.literal('openrouter')
  }),
  z.strictObject({
    ...basePromptAnalyzerAnalyzeArgsShape,
    provider: z.literal('openai'),
    organizationId: z
      .string()
      .max(PROMPT_ANALYZER_ORGANIZATION_ID_MAX_CHARS)
      .trim()
      .regex(/^[A-Za-z0-9_-]*$/)
      .optional()
  }),
  z.strictObject({
    ...basePromptAnalyzerAnalyzeArgsShape,
    provider: z.literal('anthropic')
  }),
  z.strictObject({
    ...basePromptAnalyzerAnalyzeArgsShape,
    provider: z.literal('google_ai')
  })
])

export type SupportedProvider = 'openrouter' | 'openai' | 'anthropic' | 'google_ai'

export type PromptAnalyzerProviderSettings = {
  model?: string
  apiKeyConfigured?: boolean
}

export type PromptAnalyzerAnalyzeArgs = z.infer<typeof promptAnalyzerAnalyzeArgsSchema>

export type OpenRouterConfig = Omit<
  Extract<PromptAnalyzerAnalyzeArgs, { provider: 'openrouter' }>,
  'prompt'
>

export type OpenAIConfig = Omit<
  Extract<PromptAnalyzerAnalyzeArgs, { provider: 'openai' }>,
  'prompt'
>

export type AnthropicConfig = Omit<
  Extract<PromptAnalyzerAnalyzeArgs, { provider: 'anthropic' }>,
  'prompt'
>

export type GoogleAIConfig = Omit<
  Extract<PromptAnalyzerAnalyzeArgs, { provider: 'google_ai' }>,
  'prompt'
>

export type PromptAnalyzerConfig =
  | OpenRouterConfig
  | OpenAIConfig
  | AnthropicConfig
  | GoogleAIConfig

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
