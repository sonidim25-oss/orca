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

async function parseResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    if (!response.ok) {
      throw new Error(sanitizeProviderError('Google AI', response.status).message)
    }
    throw new Error('Google AI returned a non-JSON response')
  }
}

function hasErrorField(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'error' in body
}

function validateArgs(args: PromptAnalyzerAnalyzeArgs): void {
  assertPromptAnalyzerClientProvider(args.provider, 'google_ai', 'Google AI')
  promptAnalyzerAnalyzeArgsSchema.parse(args)
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
    const { message } = sanitizeProviderError('Google AI', response.status, body)
    throw new Error(redactSensitiveErrorText(message, apiKey))
  }
  if (hasErrorField(body)) {
    if (!isStructuredProviderError(body)) {
      throw new Error('Google AI returned an invalid response')
    }
    const { message } = sanitizeProviderError('Google AI', undefined, body)
    throw new Error(redactSensitiveErrorText(message, apiKey))
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
