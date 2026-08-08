import type {
  PromptAnalyzerAnalyzeArgs,
  PromptAnalyzerAnalyzeResult
} from '../../shared/prompt-analyzer-types'
import { PROMPT_ANALYZER_PROMPT_MAX_CHARS } from '../../shared/prompt-analyzer-types'
import { z } from 'zod'
import { assertPromptAnalyzerClientProvider } from './supported-provider'
import { DEFAULT_SYSTEM_PROMPT } from './constants'

const GOOGLE_AI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

const googleAISuccessResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string().nullable().optional(),
        content: z.object({
          parts: z.array(z.object({ text: z.string() })).min(1)
        })
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

function getGoogleAIErrorMessage(body: unknown): string | undefined {
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
      throw new Error(`Google AI API error: ${response.status}`)
    }
    throw new Error('Google AI returned a non-JSON response')
  }
}

function hasErrorField(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'error' in body
}

function validateArgs(args: PromptAnalyzerAnalyzeArgs): void {
  assertPromptAnalyzerClientProvider(args.provider, 'google_ai', 'Google AI')
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

export async function analyzeWithGoogleAI(
  args: PromptAnalyzerAnalyzeArgs,
  apiKey: string,
  signal: AbortSignal
): Promise<PromptAnalyzerAnalyzeResult> {
  validateArgs(args)

  const url = `${GOOGLE_AI_API_URL}/${encodeURIComponent(args.model.trim())}:generateContent`

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: args.systemPrompt ?? DEFAULT_SYSTEM_PROMPT }]
      },
      contents: [{ role: 'user', parts: [{ text: args.prompt }] }]
    })
  })

  const body = await parseResponseBody(response)
  if (!response.ok) {
    const message = getGoogleAIErrorMessage(body) ?? `Google AI API error: ${response.status}`
    throw new Error(redactApiKey(message, apiKey))
  }
  if (hasErrorField(body)) {
    const message = getGoogleAIErrorMessage(body)
    if (!message) {
      throw new Error('Google AI returned an invalid response')
    }
    throw new Error(redactApiKey(message, apiKey))
  }

  const successResponse = googleAISuccessResponseSchema.safeParse(body)
  if (!successResponse.success) {
    throw new Error('Google AI returned an invalid response')
  }
  const candidate = successResponse.data.candidates[0]
  const content = candidate.content.parts[0].text
  if (!content.trim()) {
    throw new Error('Google AI returned an empty response')
  }
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new Error('Google AI response was truncated because the token limit was reached')
  }

  return { suggestion: content, improvedPrompt: content, reasoning: '' }
}
