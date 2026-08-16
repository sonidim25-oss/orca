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

async function parseResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    if (!response.ok) {
      throw new Error(sanitizeProviderError('OpenAI', response.status).message)
    }
    throw new Error('OpenAI returned a non-JSON response')
  }
}

function hasErrorField(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'error' in body
}

function validateArgs(args: PromptAnalyzerAnalyzeArgs): void {
  assertPromptAnalyzerClientProvider(args.provider, 'openai', 'OpenAI')
  promptAnalyzerAnalyzeArgsSchema.parse(args)
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
    const { message } = sanitizeProviderError('OpenAI', response.status, body)
    throw new Error(redactSensitiveErrorText(message, apiKey))
  }
  if (hasErrorField(body)) {
    if (!isStructuredProviderError(body)) {
      throw new Error('OpenAI returned an invalid response')
    }
    const { message } = sanitizeProviderError('OpenAI', undefined, body)
    throw new Error(redactSensitiveErrorText(message, apiKey))
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
