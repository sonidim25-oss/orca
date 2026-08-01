import type {
  PromptAnalyzerAnalyzeArgs,
  PromptAnalyzerAnalyzeResult
} from '../../shared/prompt-analyzer-types'
import {
  PROMPT_ANALYZER_PROMPT_MAX_CHARS,
  PROMPT_ANALYZER_MAX_TOKENS_MAX,
  PROMPT_ANALYZER_MAX_TOKENS_MIN,
  PROMPT_ANALYZER_TEMPERATURE_MAX,
  PROMPT_ANALYZER_TEMPERATURE_MIN
} from '../../shared/prompt-analyzer-types'
import { z } from 'zod'
import { assertPromptAnalyzerClientProvider } from './supported-provider'
import { DEFAULT_SYSTEM_PROMPT } from './constants'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_API_VERSION = '2023-06-01'

const anthropicErrorResponseSchema = z.object({
  error: z.object({ message: z.string().trim().min(1) })
})

const anthropicContentBlockSchema = z.object({
  text: z.string()
})

const anthropicSuccessResponseSchema = z.object({
  content: z.array(anthropicContentBlockSchema).min(1),
  stop_reason: z.string().nullable().optional()
})

function redactApiKey(message: string, apiKey: string): string {
  return apiKey ? message.replaceAll(apiKey, '[REDACTED]') : message
}

async function parseResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`)
    }
    throw new Error('Anthropic returned a non-JSON response')
  }
}

function hasErrorField(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'error' in body
}

function validateArgs(args: PromptAnalyzerAnalyzeArgs): void {
  assertPromptAnalyzerClientProvider(args.provider, 'anthropic', 'Anthropic')
  if (!args.prompt?.trim()) {
    throw new Error('Prompt is required')
  }
  if (args.prompt.length > PROMPT_ANALYZER_PROMPT_MAX_CHARS) {
    throw new Error(
      `Prompt must not exceed ${PROMPT_ANALYZER_PROMPT_MAX_CHARS.toString()} characters`
    )
  }
  if (!args.model?.trim()) {
    throw new Error('Prompt analyzer model is not configured. Set a model in Settings.')
  }
  if (
    !Number.isInteger(args.maxTokens) ||
    args.maxTokens < PROMPT_ANALYZER_MAX_TOKENS_MIN ||
    args.maxTokens > PROMPT_ANALYZER_MAX_TOKENS_MAX
  ) {
    throw new Error('Prompt analyzer max tokens must be between 1 and 32768')
  }
  if (
    !Number.isFinite(args.temperature) ||
    args.temperature < PROMPT_ANALYZER_TEMPERATURE_MIN ||
    args.temperature > PROMPT_ANALYZER_TEMPERATURE_MAX
  ) {
    throw new Error('Prompt analyzer temperature must be between 0 and 2')
  }
}

export async function analyzeWithAnthropic(
  args: PromptAnalyzerAnalyzeArgs,
  apiKey: string,
  signal: AbortSignal
): Promise<PromptAnalyzerAnalyzeResult> {
  validateArgs(args)

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION
    },
    body: JSON.stringify({
      model: args.model.trim(),
      max_tokens: args.maxTokens,
      system: args.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: args.prompt }]
    })
  })

  const body = await parseResponseBody(response)
  if (!response.ok) {
    const errorResponse = anthropicErrorResponseSchema.safeParse(body)
    const message = errorResponse.success
      ? errorResponse.data.error.message
      : `Anthropic API error: ${response.status}`
    throw new Error(redactApiKey(message, apiKey))
  }
  if (hasErrorField(body)) {
    const errorResponse = anthropicErrorResponseSchema.safeParse(body)
    if (!errorResponse.success) {
      throw new Error('Anthropic returned an invalid response')
    }
    throw new Error(redactApiKey(errorResponse.data.error.message, apiKey))
  }

  const successResponse = anthropicSuccessResponseSchema.safeParse(body)
  if (!successResponse.success) {
    throw new Error('Anthropic returned an invalid response')
  }
  const content = successResponse.data.content.map((b) => b.text).join('')
  if (!content.trim()) {
    throw new Error('Anthropic returned an empty response')
  }
  if (successResponse.data.stop_reason === 'max_tokens') {
    throw new Error('Anthropic response was truncated because the token limit was reached')
  }

  return { suggestion: content, improvedPrompt: content, reasoning: '' }
}
