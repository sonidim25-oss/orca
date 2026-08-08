import type {
  PromptAnalyzerAnalyzeArgs,
  PromptAnalyzerAnalyzeResult
} from '../../shared/prompt-analyzer-types'
import { PROMPT_ANALYZER_PROMPT_MAX_CHARS } from '../../shared/prompt-analyzer-types'
import { z } from 'zod'
import { assertPromptAnalyzerClientProvider } from './supported-provider'
import { DEFAULT_SYSTEM_PROMPT } from './constants'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

const openAIErrorResponseSchema = z.object({
  error: z.object({ message: z.string().trim().min(1) })
})

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
    const errorResponse = openAIErrorResponseSchema.safeParse(body)
    const message = errorResponse.success
      ? errorResponse.data.error.message
      : `OpenAI API error: ${response.status}`
    throw new Error(redactApiKey(message, apiKey))
  }
  if (hasErrorField(body)) {
    const errorResponse = openAIErrorResponseSchema.safeParse(body)
    if (!errorResponse.success) {
      throw new Error('OpenAI returned an invalid response')
    }
    throw new Error(redactApiKey(errorResponse.data.error.message, apiKey))
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
