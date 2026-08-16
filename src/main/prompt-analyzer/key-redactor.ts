const REDACTED = '[REDACTED]'

const KEY_SHAPED_PATTERNS = [
  /(^|[^A-Za-z0-9_-])sk(?:-|%2D)(?:[A-Za-z0-9_-]|%(?:2D|5F)){8,}(?![A-Za-z0-9_-]|%(?:2D|5F))/gi,
  /(^|[^A-Za-z0-9_-])AIza(?:[A-Za-z0-9_-]|%(?:2D|5F)){20,}(?![A-Za-z0-9_-]|%(?:2D|5F))/gi,
  /(^|[^A-Za-z0-9_-])(?:Bearer(?:\s+|%20|\+))?(?:[A-Za-z0-9_-]|%(?:2D|5F)){16,}(?![A-Za-z0-9_-]|%(?:2D|5F))/gi
]

export function redactPromptAnalyzerApiKeys(message: string, apiKey?: string): string {
  let redacted = message
  if (apiKey) {
    redacted = redacted.replaceAll(apiKey, REDACTED)
    const encodedApiKey = encodeURIComponent(apiKey)
    if (encodedApiKey !== apiKey) {
      redacted = redacted.replaceAll(encodedApiKey, REDACTED)
    }
  }
  for (const pattern of KEY_SHAPED_PATTERNS) {
    redacted = redacted.replace(pattern, (_match, prefix: string) => `${prefix}${REDACTED}`)
  }
  return redacted
}
