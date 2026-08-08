import type {
  PromptAnalyzerAnalyzeArgs,
  PromptAnalyzerAnalyzeResult
} from '../../shared/prompt-analyzer-types'
import { PROMPT_ANALYZER_PROMPT_MAX_CHARS } from '../../shared/prompt-analyzer-types'
import { z } from 'zod'
import { assertPromptAnalyzerClientProvider } from './supported-provider'
import { DEFAULT_SYSTEM_PROMPT } from './constants'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

const openAISuccessResponseSchema = z.object({
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

function getOpenAIErrorMessage(body: unknown): string | undefined {
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
      throw new Error(`OpenAI API error: ${response.status}`)
    }
    throw new Error('OpenAI returned a non-JSON response')
  }
}

function hasErrorField(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'error' in body
}

function validateArgs(args: PromptAnalyzerAnalyzeArgs): void {
  assertPromptAnalyzerClientProvider(args.provider, 'openai', 'OpenAI')
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

export async function analyzeWithOpenAI(
  args: PromptAnalyzerAnalyzeArgs,
  apiKey: string,
  signal: AbortSignal
): Promise<PromptAnalyzerAnalyzeResult> {
  validateArgs(args)

  const headers = new Headers({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  })
  if (args.provider === 'openai' && args.organizationId?.trim()) {
    headers.set('OpenAI-Organization', args.organizationId.trim())
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify({
      model: args.model.trim(),
      messages: [
        { role: 'system', content: args.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
        { role: 'user', content: args.prompt }
      ]
    })
  })

  const body = await parseResponseBody(response)
  if (!response.ok) {
    const message = getOpenAIErrorMessage(body) ?? `OpenAI API error: ${response.status}`
    throw new Error(redactApiKey(message, apiKey))
  }
  if (hasErrorField(body)) {
    const message = getOpenAIErrorMessage(body)
    if (!message) {
      throw new Error('OpenAI returned an invalid response')
    }
    throw new Error(redactApiKey(message, apiKey))
  }

  const successResponse = openAISuccessResponseSchema.safeParse(body)
  if (!successResponse.success) {
    throw new Error('OpenAI returned an invalid response')
  }
  const choice = successResponse.data.choices[0]
  const content = choice.message.content
  if (!content.trim()) {
    throw new Error('OpenAI returned an empty response')
  }
  if (choice.finish_reason === 'length') {
    throw new Error('OpenAI response was truncated because the token limit was reached')
  }

  return { suggestion: content, improvedPrompt: content, reasoning: '' }
}
