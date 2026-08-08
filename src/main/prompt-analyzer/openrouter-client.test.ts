import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PromptAnalyzerAnalyzeArgs } from '../../shared/prompt-analyzer-types'
import { analyzeWithOpenRouter } from './openrouter-client'

const args: PromptAnalyzerAnalyzeArgs = {
  prompt: 'Improve this',
  provider: 'openrouter',
  model: 'test-model'
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
}

describe('analyzeWithOpenRouter', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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
    expect(JSON.parse(String(init.body))).toEqual({
      models: ['test-model'],
      provider: { allow_fallbacks: false },
      messages: [
        {
          role: 'system',
          content:
            "You are a prompt engineering expert. Your task is to analyze the user's prompt and improve it. Do NOT respond to the prompt content itself. Instead, provide an improved version of the prompt that is clearer, more specific, and better structured. Output only the improved prompt without explanations."
        },
        { role: 'user', content: 'Improve this' }
      ]
    })
  })

  it('sends only the user-selected model', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: 'Use a specific request.' } }] })
      )
    vi.stubGlobal('fetch', fetchMock)

    await analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init.body)).models).toEqual(['test-model'])
  })

  it('disables OpenRouter provider fallbacks', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: 'Use a specific request.' } }] })
      )
    vi.stubGlobal('fetch', fetchMock)

    await analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init.body)).provider).toEqual({ allow_fallbacks: false })
  })

  it('retries HTTP 429 responses and succeeds on the third attempt', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 429, message: 'Rate limited' } }, { status: 429 })
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 429, message: 'Rate limited' } }, { status: 429 })
      )
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: 'Improved after retry' } }] })
      )
    vi.stubGlobal('fetch', fetchMock)

    const analysis = analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    await vi.runAllTimersAsync()

    await expect(analysis).resolves.toMatchObject({ improvedPrompt: 'Improved after retry' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries HTTP 502 responses and succeeds on the third attempt', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: 'Improved after retry' } }] })
      )
    vi.stubGlobal('fetch', fetchMock)

    const signal = new AbortController().signal
    const analysis = analyzeWithOpenRouter(args, 'secret-key', signal)
    void analysis.catch(() => undefined)
    await vi.runAllTimersAsync()

    await expect(analysis).resolves.toMatchObject({ improvedPrompt: 'Improved after retry' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.signal).toBe(signal)
    }
  })

  it.each([500, 503, 504])(
    'retries HTTP %i responses and succeeds on the third attempt',
    async (status) => {
      vi.useFakeTimers()
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response('Transient failure', { status }))
        .mockResolvedValueOnce(new Response('Transient failure', { status }))
        .mockResolvedValueOnce(
          jsonResponse({ choices: [{ message: { content: 'Improved after retry' } }] })
        )
      vi.stubGlobal('fetch', fetchMock)

      const analysis = analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
      await vi.runAllTimersAsync()

      await expect(analysis).resolves.toMatchObject({ improvedPrompt: 'Improved after retry' })
      expect(fetchMock).toHaveBeenCalledTimes(3)
    }
  )

  it('retries a transient fetch rejection', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: 'Improved after retry' } }] })
      )
    vi.stubGlobal('fetch', fetchMock)

    const analysis = analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    void analysis.catch(() => undefined)
    await vi.runAllTimersAsync()

    await expect(analysis).resolves.toMatchObject({ improvedPrompt: 'Improved after retry' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rethrows the final fetch rejection after three attempts', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const networkError = new TypeError('fetch failed')
    const fetchMock = vi.fn().mockRejectedValue(networkError)
    vi.stubGlobal('fetch', fetchMock)

    const analysis = analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    const rejection = expect(analysis).rejects.toBe(networkError)
    await vi.runAllTimersAsync()

    await rejection
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('uses Retry-After before retrying a transient response', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('Unavailable', { status: 503, headers: { 'Retry-After': '2' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: 'Improved after retry' } }] })
      )
    vi.stubGlobal('fetch', fetchMock)

    const analysis = analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(analysis).resolves.toMatchObject({ improvedPrompt: 'Improved after retry' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces the final transient response after three attempts', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fetchMock = vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    const analysis = analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    const rejection = expect(analysis).rejects.toThrow('OpenRouter API error: 503')
    await vi.runAllTimersAsync()

    await rejection
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('stops retrying when aborted during backoff', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const abortReason = new Error('cancelled')
    const fetchMock = vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    const analysis = analyzeWithOpenRouter(args, 'secret-key', controller.signal)
    await vi.advanceTimersByTimeAsync(0)
    controller.abort(abortReason)

    await expect(analysis).rejects.toBe(abortReason)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps raw rate-limit details and adds guidance after three attempts', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 429,
            message: 'Provider returned error',
            metadata: { raw: 'test-model is temporarily rate-limited upstream.' }
          }
        },
        { status: 429 }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const analysis = analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    const rejection = expect(analysis).rejects.toThrow(
      'test-model is temporarily rate-limited upstream. Switch models or add OpenRouter credits.'
    )
    await vi.runAllTimersAsync()

    await rejection
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('suggests the reliable default when OpenRouter rejects an invalid model', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: { code: 400, message: 'google/gemma-4-31b is not a valid model ID' } },
          { status: 400 }
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow(
      'google/gemma-4-31b is not a valid model ID. Choose a valid model in Settings; try openrouter/auto-beta.'
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry a missing model response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: { code: 404, message: 'The requested model was not found' } },
          { status: 404 }
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow(
      'The requested model was not found. Choose a valid model in Settings; try openrouter/auto-beta.'
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('prefers trimmed OpenRouter metadata details for rate limit errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 429,
              message: 'Rate limit exceeded',
              metadata: { raw: '  Retry after resetting secret-key usage.  ' }
            }
          },
          { status: 429 }
        )
      )
    )

    await expect(
      analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('Retry after resetting [REDACTED] usage.')
  })

  it('falls back to the message for message-only OpenRouter errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: { message: 'Rejected secret-key' } }, { status: 401 })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('Rejected [REDACTED]')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries then reports the HTTP status for non-JSON error responses', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    vi.stubGlobal('fetch', fetchMock)

    const analysis = analyzeWithOpenRouter(args, 'secret-key', new AbortController().signal)
    const rejection = expect(analysis).rejects.toThrow('OpenRouter API error: 502')
    await vi.runAllTimersAsync()

    await rejection
    expect(fetchMock).toHaveBeenCalledTimes(3)
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
