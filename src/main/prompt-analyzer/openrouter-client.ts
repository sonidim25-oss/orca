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

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

const openRouterErrorResponseSchema = z.object({
  error: z.object({ message: z.string().trim().min(1) })
})

const openRouterSuccessResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({ content: z.string() })
      })
    )
    .min(1)
})

function redactApiKey(message: string, apiKey: string): string {
  return apiKey ? message.replaceAll(apiKey, '[REDACTED]') : message
}

async function parseResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }
    throw new Error('OpenRouter returned a non-JSON response')
  }
}

function hasErrorField(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'error' in body
}

function validateArgs(args: PromptAnalyzerAnalyzeArgs): void {
  assertPromptAnalyzerClientProvider(args.provider, 'openrouter', 'OpenRouter')
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

export async function analyzeWithOpenRouter(
  args: PromptAnalyzerAnalyzeArgs,
  apiKey: string,
  signal: AbortSignal
): Promise<PromptAnalyzerAnalyzeResult> {
  validateArgs(args)

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: args.model.trim(),
      messages: [
        { role: 'system', content: args.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
        { role: 'user', content: args.prompt }
      ],
      max_tokens: args.maxTokens,
      temperature: args.temperature
    })
  })

  const body = await parseResponseBody(response)
  if (!response.ok) {
    const errorResponse = openRouterErrorResponseSchema.safeParse(body)
    const message = errorResponse.success
      ? errorResponse.data.error.message
      : `OpenRouter API error: ${response.status}`
    throw new Error(redactApiKey(message, apiKey))
  }
  if (hasErrorField(body)) {
    const errorResponse = openRouterErrorResponseSchema.safeParse(body)
    if (!errorResponse.success) {
      throw new Error('OpenRouter returned an invalid response')
    }
    throw new Error(redactApiKey(errorResponse.data.error.message, apiKey))
  }

  const successResponse = openRouterSuccessResponseSchema.safeParse(body)
  if (!successResponse.success) {
    throw new Error('OpenRouter returned an invalid response')
  }
  const choice = successResponse.data.choices[0]
  const content = choice.message.content
  if (!content.trim()) {
    throw new Error('OpenRouter returned an empty response')
  }
  if (choice.finish_reason === 'length') {
    throw new Error('OpenRouter response was truncated because the token limit was reached')
  }

  return { suggestion: content, improvedPrompt: content, reasoning: '' }
}
