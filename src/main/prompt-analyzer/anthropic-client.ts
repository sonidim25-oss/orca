import type {
  PromptAnalyzerAnalyzeArgs,
  PromptAnalyzerAnalyzeResult
} from '../../shared/prompt-analyzer-types'
import { promptAnalyzerAnalyzeArgsSchema } from '../../shared/prompt-analyzer-types'
import { z } from 'zod'
import { assertPromptAnalyzerClientProvider } from './supported-provider'
import { DEFAULT_SYSTEM_PROMPT } from './constants'
import {
  isStructuredProviderError,
  redactSensitiveErrorText,
  sanitizeProviderError
} from './provider-error-sanitize'

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

async function parseResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    if (!response.ok) {
      throw new Error(sanitizeProviderError('Anthropic', response.status).message)
    }
    throw new Error('Anthropic returned a non-JSON response')
  }
}

function hasErrorField(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'error' in body
}

function validateArgs(args: PromptAnalyzerAnalyzeArgs): void {
  assertPromptAnalyzerClientProvider(args.provider, 'anthropic', 'Anthropic')
  promptAnalyzerAnalyzeArgsSchema.parse(args)
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
    const { message } = sanitizeProviderError('Anthropic', response.status, body)
    throw new Error(redactSensitiveErrorText(message, apiKey))
  }
  if (hasErrorField(body)) {
    if (!isStructuredProviderError(body)) {
      throw new Error('Anthropic returned an invalid response')
    }
    const { message } = sanitizeProviderError('Anthropic', undefined, body)
    throw new Error(redactSensitiveErrorText(message, apiKey))
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
