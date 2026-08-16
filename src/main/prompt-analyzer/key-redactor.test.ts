import { describe, expect, it } from 'vitest'
import { redactPromptAnalyzerApiKeys } from './key-redactor'

describe('redactPromptAnalyzerApiKeys', () => {
  it.each([
    ['truncated key-shaped prefix', 'Rejected sk-abc123de', 'Rejected [REDACTED]'],
    [
      'full provider key',
      'Rejected sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
      'Rejected [REDACTED]'
    ],
    ['Bearer header', 'Authorization: Bearer abcdefghijklmnop', 'Authorization: [REDACTED]'],
    ['Google key', 'Rejected AIzaAbCdEfGhIjKlMnOpQrStUvWxYz', 'Rejected [REDACTED]'],
    ['generic secret', 'Rejected AbCdEfGhIjKlMnOp', 'Rejected [REDACTED]'],
    [
      'URL-encoded provider key',
      'Rejected sk%2Dabc123de after validation',
      'Rejected [REDACTED] after validation'
    ]
  ])('redacts a %s', (_label, message, expected) => {
    expect(redactPromptAnalyzerApiKeys(message)).toBe(expected)
  })

  it('replaces a known key that is too short for shape matching', () => {
    expect(redactPromptAnalyzerApiKeys('Rejected custom-key twice custom-key', 'custom-key')).toBe(
      'Rejected [REDACTED] twice [REDACTED]'
    )
  })

  it('replaces a URL-encoded known key', () => {
    expect(redactPromptAnalyzerApiKeys('Rejected custom%2Fkey', 'custom/key')).toBe(
      'Rejected [REDACTED]'
    )
  })

  it('preserves short sk fragments below the key-shape threshold', () => {
    expect(redactPromptAnalyzerApiKeys('The example sk-abc is not a credential')).toBe(
      'The example sk-abc is not a credential'
    )
  })
})
