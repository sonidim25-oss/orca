import { redactPromptAnalyzerApiKeys } from './key-redactor'

export type ProviderErrorCode =
  | 'authentication_failed'
  | 'invalid_model'
  | 'provider_error'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'request_timeout'

export type SanitizedProviderError = {
  code: ProviderErrorCode
  message: string
}

type ProviderName = 'Anthropic' | 'Google AI' | 'OpenAI' | 'OpenRouter'

const AUTH_ERROR_CODES = new Set([
  'authentication_error',
  'invalid_api_key',
  'permission_denied',
  'unauthorized'
])
const INVALID_MODEL_ERROR_CODES = new Set(['invalid_model', 'invalid_model_id', 'model_not_found'])
const QUOTA_ERROR_CODES = new Set([
  'billing_hard_limit_reached',
  'insufficient_quota',
  'quota_exceeded',
  'resource_exhausted'
])
const RATE_LIMIT_ERROR_CODES = new Set(['rate_limit_exceeded', 'rate_limited'])
const TIMEOUT_ERROR_CODES = new Set(['deadline_exceeded', 'request_timeout', 'timeout'])

function getErrorRecord(body: unknown): Record<string, unknown> | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return undefined
  }
  const error = (body as Record<string, unknown>).error
  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return undefined
  }
  return error as Record<string, unknown>
}

function getNormalizedErrorCode(error: Record<string, unknown> | undefined): string | undefined {
  const code = error?.code ?? error?.type
  return typeof code === 'string' ? code.trim().toLowerCase() : undefined
}

function isInvalidModelMessage(error: Record<string, unknown> | undefined): boolean {
  const message = error?.message
  return (
    typeof message === 'string' &&
    /model/i.test(message) &&
    /(invalid|not (?:a )?valid|not found|unknown|does not exist)/i.test(message)
  )
}

export function isStructuredProviderError(body: unknown): boolean {
  const error = getErrorRecord(body)
  if (!error) {
    return false
  }
  if ('message' in error && typeof error.message !== 'string') {
    return false
  }
  return !('code' in error) || typeof error.code === 'string' || typeof error.code === 'number'
}

export function sanitizeProviderError(
  provider: ProviderName,
  status: number | undefined,
  body?: unknown
): SanitizedProviderError {
  const error = getErrorRecord(body)
  const errorCode = getNormalizedErrorCode(error)

  if (status === 401 || status === 403 || (errorCode && AUTH_ERROR_CODES.has(errorCode))) {
    return {
      code: 'authentication_failed',
      message: `${provider} authentication failed. Check the configured API key.`
    }
  }
  if (status === 429 || (errorCode && RATE_LIMIT_ERROR_CODES.has(errorCode))) {
    return {
      code: 'rate_limited',
      message: `${provider} rate limit reached. Try again later or choose another model.`
    }
  }
  if (status === 402 || (errorCode && QUOTA_ERROR_CODES.has(errorCode))) {
    return {
      code: 'quota_exceeded',
      message: `${provider} quota exceeded. Check the account plan and billing.`
    }
  }
  if (
    status === 404 ||
    (errorCode && INVALID_MODEL_ERROR_CODES.has(errorCode)) ||
    ((status === 400 || status === undefined) && isInvalidModelMessage(error))
  ) {
    return {
      code: 'invalid_model',
      message: `The selected ${provider} model is unavailable. Choose another model in Settings.`
    }
  }
  if (status === 408 || status === 504 || (errorCode && TIMEOUT_ERROR_CODES.has(errorCode))) {
    return {
      code: 'request_timeout',
      message: `${provider} request timed out. Try again.`
    }
  }
  return {
    code: 'provider_error',
    message: status
      ? `${provider} request failed (HTTP ${status.toString()}).`
      : `${provider} request failed.`
  }
}

export function redactSensitiveErrorText(message: string, apiKey?: string): string {
  const keyShapesRedacted = redactPromptAnalyzerApiKeys(message, apiKey)
  return Array.from(keyShapesRedacted, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) ? ' ' : character
  })
    .join('')
    .trim()
    .slice(0, 200)
}
