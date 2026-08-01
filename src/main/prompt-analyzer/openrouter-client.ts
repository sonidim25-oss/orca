import type {
  PromptAnalyzerAnalyzeArgs,
  PromptAnalyzerAnalyzeResult
} from '../../shared/prompt-analyzer-types'
import {
  PROMPT_ANALYZER_PROMPT_MAX_CHARS,
  PROMPT_ANALYZER_MAX_TOKENS_MAX,
  PROMPT_ANALYZER_MAX_TOKENS_MIN,
  PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL,
  PROMPT_ANALYZER_TEMPERATURE_MAX,
  PROMPT_ANALYZER_TEMPERATURE_MIN
} from '../../shared/prompt-analyzer-types'
import { z } from 'zod'
import { assertPromptAnalyzerClientProvider } from './supported-provider'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 250
const DEFAULT_SYSTEM_PROMPT =
  "You are a prompt engineering expert. Your task is to analyze the user's prompt and improve it. Do NOT respond to the prompt content itself. Instead, provide an improved version of the prompt that is clearer, more specific, and better structured. Output only the improved prompt without explanations."

const openRouterErrorResponseSchema = z.object({
  error: z.object({
    code: z.number().optional(),
    message: z.string().trim().min(1),
    metadata: z.object({ raw: z.string().optional() }).optional()
  })
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

function getOpenRouterErrorMessage(
  error: z.infer<typeof openRouterErrorResponseSchema>['error']
): string {
  return error.metadata?.raw?.trim() || error.message
}

function appendGuidance(message: string, guidance: string): string {
  return `${message.replace(/[.!?]?$/, '.')} ${guidance}`
}

function isInvalidModelError(status: number, message: string): boolean {
  return (
    (status === 400 || status === 404) &&
    /model/i.test(message) &&
    /(invalid|not (?:a )?valid|not found|unknown|does not exist)/i.test(message)
  )
}

function getRetryDelayMs(response: Response, retryIndex: number): number {
  const retryAfterSeconds = Number(response.headers.get('Retry-After'))
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
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body
    })
    if (response.status !== 429 || attempt === MAX_ATTEMPTS - 1) {
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

  const primaryModel = args.model.trim()
  const response = await requestWithRetries(
    apiKey,
    signal,
    JSON.stringify({
      models: [...new Set([primaryModel, PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL])],
      provider: { allow_fallbacks: true },
      messages: [
        { role: 'system', content: args.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
        { role: 'user', content: args.prompt }
      ],
      max_tokens: args.maxTokens,
      temperature: args.temperature
    })
  )

  const body = await parseResponseBody(response)
  if (!response.ok) {
    const errorResponse = openRouterErrorResponseSchema.safeParse(body)
    let message = errorResponse.success
      ? getOpenRouterErrorMessage(errorResponse.data.error)
      : `OpenRouter API error: ${response.status}`
    if (response.status === 429) {
      message = appendGuidance(message, 'Switch models or add OpenRouter credits.')
    } else if (isInvalidModelError(response.status, message)) {
      message = appendGuidance(
        message,
        `Choose a valid model in Settings; try ${PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL}.`
      )
    }
    throw new Error(redactApiKey(message, apiKey))
  }
  if (hasErrorField(body)) {
    const errorResponse = openRouterErrorResponseSchema.safeParse(body)
    if (!errorResponse.success) {
      throw new Error('OpenRouter returned an invalid response')
    }
    throw new Error(redactApiKey(getOpenRouterErrorMessage(errorResponse.data.error), apiKey))
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
