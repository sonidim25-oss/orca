import type {
  PromptAnalyzerAnalyzeArgs,
  PromptAnalyzerAnalyzeResult
} from '../../shared/prompt-analyzer-types'
import { PROMPT_ANALYZER_PROMPT_MAX_CHARS } from '../../shared/prompt-analyzer-types'
import { z } from 'zod'
import { assertPromptAnalyzerClientProvider } from './supported-provider'
import { DEFAULT_SYSTEM_PROMPT } from './constants'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_API_VERSION = '2023-06-01'
const ANTHROPIC_OUTPUT_TOKEN_LIMIT = 2048

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

function extractErrorDetail(value: unknown, depth = 0): string | undefined {
  if (depth > 5) {
    return undefined
  }
  if (typeof value === 'string') {
    return value.trim() || undefined
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const detail = extractErrorDetail(item, depth + 1)
      if (detail) {
        return detail
      }
    }
    return undefined
  }
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const error = value as Record<string, unknown>
  const metadata = error.metadata
  if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) {
    const detail = extractErrorDetail((metadata as Record<string, unknown>).raw, depth + 1)
    if (detail) {
      return detail
    }
  }
  for (const key of ['raw', 'message', 'error', 'details', 'detail']) {
    const detail = extractErrorDetail(error[key], depth + 1)
    if (detail) {
      return detail
    }
  }
  return undefined
}

function getAnthropicErrorMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return undefined
  }
  const error = (body as Record<string, unknown>).error
  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return undefined
  }
  return extractErrorDetail(error)
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
      max_tokens: ANTHROPIC_OUTPUT_TOKEN_LIMIT,
      system: args.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: args.prompt }]
    })
  })

  const body = await parseResponseBody(response)
  if (!response.ok) {
    const message = getAnthropicErrorMessage(body) ?? `Anthropic API error: ${response.status}`
    throw new Error(redactApiKey(message, apiKey))
  }
  if (hasErrorField(body)) {
    const message = getAnthropicErrorMessage(body)
    if (!message) {
      throw new Error('Anthropic returned an invalid response')
    }
    throw new Error(redactApiKey(message, apiKey))
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
