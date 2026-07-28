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

const GOOGLE_AI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_SYSTEM_PROMPT =
  "You are a prompt engineering expert. Your task is to analyze the user's prompt and improve it. Do NOT respond to the prompt content itself. Instead, provide an improved version of the prompt that is clearer, more specific, and better structured. Output only the improved prompt without explanations."

const googleAIErrorResponseSchema = z.object({
  error: z.object({ message: z.string().trim().min(1) })
})

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

export async function analyzeWithGoogleAI(
  args: PromptAnalyzerAnalyzeArgs,
  apiKey: string,
  signal: AbortSignal
): Promise<PromptAnalyzerAnalyzeResult> {
  validateArgs(args)

  const url = `${GOOGLE_AI_API_URL}/${encodeURIComponent(args.model.trim())}:generateContent?key=${encodeURIComponent(apiKey)}`

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: args.systemPrompt ?? DEFAULT_SYSTEM_PROMPT }]
      },
      contents: [{ role: 'user', parts: [{ text: args.prompt }] }],
      generationConfig: {
        maxOutputTokens: args.maxTokens,
        temperature: args.temperature
      }
    })
  })

  const body = await parseResponseBody(response)
  if (!response.ok) {
    const errorResponse = googleAIErrorResponseSchema.safeParse(body)
    const message = errorResponse.success
      ? errorResponse.data.error.message
      : `Google AI API error: ${response.status}`
    throw new Error(redactApiKey(message, apiKey))
  }
  if (hasErrorField(body)) {
    const errorResponse = googleAIErrorResponseSchema.safeParse(body)
    if (!errorResponse.success) {
      throw new Error('Google AI returned an invalid response')
    }
    throw new Error(redactApiKey(errorResponse.data.error.message, apiKey))
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
