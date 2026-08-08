import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PromptAnalyzerAnalyzeArgs } from '../../shared/prompt-analyzer-types'
import { analyzeWithAnthropic } from './anthropic-client'

const args: PromptAnalyzerAnalyzeArgs = {
  prompt: 'Improve this',
  provider: 'anthropic',
  model: ' claude-test ',
  systemPrompt: 'Improve the prompt only.'
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
}

describe('analyzeWithAnthropic', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses a fixed required output limit without sampling options', async () => {
    const signal = new AbortController().signal
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        content: [{ type: 'text', text: 'Use a specific request.' }],
        stop_reason: 'end_turn'
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await analyzeWithAnthropic(args, 'secret-key', signal)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init.headers)
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.method).toBe('POST')
    expect(init.signal).toBe(signal)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('x-api-key')).toBe('secret-key')
    expect(headers.get('anthropic-version')).toBe('2023-06-01')
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'claude-test',
      max_tokens: 2048,
      system: 'Improve the prompt only.',
      messages: [{ role: 'user', content: 'Improve this' }]
    })
  })

  it('concatenates text blocks into the analysis result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          content: [
            { type: 'text', text: 'Use a specific request' },
            { type: 'text', text: ' with clear constraints.' }
          ],
          stop_reason: 'end_turn'
        })
      )
    )

    await expect(
      analyzeWithAnthropic(args, 'secret-key', new AbortController().signal)
    ).resolves.toEqual({
      suggestion: 'Use a specific request with clear constraints.',
      improvedPrompt: 'Use a specific request with clear constraints.',
      reasoning: ''
    })
  })

  it('rejects responses truncated by the token limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          content: [{ type: 'text', text: 'Use a more specific request that includes' }],
          stop_reason: 'max_tokens'
        })
      )
    )

    await expect(
      analyzeWithAnthropic(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('Anthropic response was truncated because the token limit was reached')
  })

  it.each([
    null,
    { error: 'rejected' },
    { error: { message: 401 } },
    { content: 'invalid' },
    { content: [] },
    { content: [{}] },
    { content: [{ text: 42 }] }
  ])('rejects malformed provider responses: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)))

    await expect(
      analyzeWithAnthropic(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('Anthropic returned an invalid response')
  })

  it('rejects whitespace-only responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          content: [{ type: 'text', text: '   ' }],
          stop_reason: 'end_turn'
        })
      )
    )

    await expect(
      analyzeWithAnthropic(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('Anthropic returned an empty response')
  })

  it('redacts the credential from provider errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { message: 'Rejected secret-key' } }, { status: 401 })
        )
    )

    await expect(
      analyzeWithAnthropic(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('Rejected [REDACTED]')
  })

  it('reports the HTTP status for non-JSON error responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    )

    await expect(
      analyzeWithAnthropic(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('Anthropic API error: 502')
  })

  it('rejects non-JSON success responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not JSON')))

    await expect(
      analyzeWithAnthropic(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('Anthropic returned a non-JSON response')
  })

  it('rejects another provider before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      analyzeWithAnthropic(
        { ...args, provider: 'google_ai' } as PromptAnalyzerAnalyzeArgs,
        'secret-key',
        new AbortController().signal
      )
    ).rejects.toThrow('Anthropic client requires provider anthropic')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
