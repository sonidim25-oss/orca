import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PromptAnalyzerAnalyzeArgs } from '../../shared/prompt-analyzer-types'
import { analyzeWithOpenRouter } from './openrouter-client'

const args: PromptAnalyzerAnalyzeArgs = {
  prompt: 'Improve this',
  provider: 'openrouter',
  model: 'test-model',
  maxTokens: 2048,
  temperature: 0.3
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
}

describe('analyzeWithOpenRouter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the credential from main-process memory and returns the analysis', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ finish_reason: 'stop', message: { content: 'Use a specific request.' } }]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    ).resolves.toEqual({
      suggestion: 'Use a specific request.',
      improvedPrompt: 'Use a specific request.',
      reasoning: ''
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer secret-key')
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'test-model',
      max_tokens: 2048,
      temperature: 0.3
    })
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
      analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('Rejected [REDACTED]')
  })

  it('reports the HTTP status for non-JSON error responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    )

    await expect(
      analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('OpenRouter API error: 502')
  })

  it('rejects non-JSON success responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not JSON')))

    await expect(
      analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('OpenRouter returned a non-JSON response')
  })

  it.each([
    null,
    { error: 'rejected' },
    { error: { message: 401 } },
    { choices: 'invalid' },
    { choices: [{}] },
    { choices: [{ message: null }] },
    { choices: [{ message: { content: 42 } }] }
  ])('rejects malformed provider responses: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)))

    await expect(
      analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('OpenRouter returned an invalid response')
  })

  it('rejects whitespace-only responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          choices: [{ message: { content: '   ' } }]
        })
      )
    )

    await expect(
      analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('OpenRouter returned an empty response')
  })

  it('rejects responses truncated by the token limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          choices: [
            {
              finish_reason: 'length',
              message: { content: 'Use a more specific request that includes' }
            }
          ]
        })
      )
    )

    await expect(
      analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('OpenRouter response was truncated because the token limit was reached')
  })

  it('rejects another provider before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      analyzeWithOpenRouter(
        { ...args, provider: 'anthropic' } as unknown as PromptAnalyzerAnalyzeArgs,
        'secret-key',
        new AbortController().signal
      )
    ).rejects.toThrow('OpenRouter client requires provider openrouter')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects prompts that exceed the renderer limit before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      analyzeWithOpenRouter(
        { ...args, prompt: 'a'.repeat(4001) },
        'secret-key',
        new AbortController().signal
      )
    ).rejects.toThrow('Prompt must not exceed 4000 characters')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
