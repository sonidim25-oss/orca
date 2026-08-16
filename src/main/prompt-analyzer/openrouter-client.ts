import type {
  PromptAnalyzerAnalyzeArgs,
  PromptAnalyzerAnalyzeResult
} from '../../shared/prompt-analyzer-types'
import { promptAnalyzerAnalyzeArgsSchema } from '../../shared/prompt-analyzer-types'
import { z } from 'zod'
import { assertPromptAnalyzerClientProvider } from './supported-provider'
import {
  isStructuredProviderError,
  redactSensitiveErrorText,
  sanitizeProviderError
} from './provider-error-sanitize'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 250
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])
const DEFAULT_SYSTEM_PROMPT =
  "You are a prompt engineering expert. Your task is to analyze the user's prompt and improve it. Do NOT respond to the prompt content itself. Instead, provide an improved version of the prompt that is clearer, more specific, and better structured. Output only the improved prompt without explanations."

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

function getRetryDelayMs(response: Response | undefined, retryIndex: number): number {
  const retryAfterSeconds = Number(response?.headers.get('Retry-After'))
  const retryAfterMs =
    Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0
  const backoffMs = RETRY_BASE_DELAY_MS * 2 ** retryIndex
  const jitterMs = Math.random() * RETRY_BASE_DELAY_MS
  return Math.max(retryAfterMs, backoffMs + jitterMs)
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(signal.reason)
  }
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timeoutId)
      reject(signal.reason)
    }
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function requestWithRetries(
  apiKey: string,
  signal: AbortSignal,
  body: string
): Promise<Response> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let response: Response
    try {
      response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body
      })
    } catch (error) {
      if (signal.aborted || attempt === MAX_ATTEMPTS - 1) {
        throw error
      }
      await waitForRetry(getRetryDelayMs(undefined, attempt), signal)
      continue
    }
    if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === MAX_ATTEMPTS - 1) {
      return response
    }
    await waitForRetry(getRetryDelayMs(response, attempt), signal)
  }
  throw new Error('OpenRouter retry attempts exhausted')
}

async function parseResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    if (!response.ok) {
      throw new Error(sanitizeProviderError('OpenRouter', response.status).message)
    }
    throw new Error('OpenRouter returned a non-JSON response')
  }
}

function hasErrorField(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'error' in body
}

function validateArgs(args: PromptAnalyzerAnalyzeArgs): void {
  assertPromptAnalyzerClientProvider(args.provider, 'openrouter', 'OpenRouter')
  promptAnalyzerAnalyzeArgsSchema.parse(args)
}

export async function analyzeWithOpenRouter(
  args: PromptAnalyzerAnalyzeArgs,
  apiKey: string,
  signal: AbortSignal
): Promise<PromptAnalyzerAnalyzeResult> {
  validateArgs(args)

  const primaryModel = args.model.trim()
  const response = await requestWithRetries(
    apiKey,
    signal,
    JSON.stringify({
      models: [primaryModel],
      provider: { allow_fallbacks: false },
      messages: [
        { role: 'system', content: args.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
        { role: 'user', content: args.prompt }
      ]
    })
  )

  const body = await parseResponseBody(response)
  if (!response.ok) {
    const { message } = sanitizeProviderError('OpenRouter', response.status, body)
    throw new Error(redactSensitiveErrorText(message, apiKey))
  }
  if (hasErrorField(body)) {
    if (!isStructuredProviderError(body)) {
      throw new Error('OpenRouter returned an invalid response')
    }
    const { message } = sanitizeProviderError('OpenRouter', undefined, body)
    throw new Error(redactSensitiveErrorText(message, apiKey))
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
