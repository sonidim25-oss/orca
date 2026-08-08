import type { PromptAnalyzerAnalyzeArgs } from '../../shared/prompt-analyzer-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeWithGoogleAI } from './google-ai-client'

const args: PromptAnalyzerAnalyzeArgs = {
  prompt: 'Improve this',
  provider: 'google_ai',
  model: ' gemini-2.5-flash '
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
}

function successfulResponse(text = 'Use a specific request.'): Response {
  return jsonResponse({
    candidates: [
      {
        finishReason: 'STOP',
        content: { role: 'model', parts: [{ text }] }
      }
    ]
  })
}

describe('analyzeWithGoogleAI', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the encoded model path and API key query parameter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse())
    vi.stubGlobal('fetch', fetchMock)

    await analyzeWithGoogleAI(args, 'secret key/+', new AbortController().signal)

    const [url, init] = fetchMock.mock.calls[0]
    const requestUrl = new URL(String(url))
    expect(requestUrl.origin).toBe('https://generativelanguage.googleapis.com')
    expect(requestUrl.pathname).toBe('/v1beta/models/gemini-2.5-flash:generateContent')
    expect(requestUrl.searchParams.get('key')).toBe('secret key/+')
    expect([...requestUrl.searchParams.keys()]).toEqual(['key'])
    expect(init.method).toBe('POST')
  })

  it('sends the Gemini REST request body with systemInstruction', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse())
    vi.stubGlobal('fetch', fetchMock)

    await analyzeWithGoogleAI(
      { ...args, systemPrompt: 'Return only the improved prompt.' },
      'secret-key',
      new AbortController().signal
    )

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init.body))).toEqual({
      systemInstruction: {
        parts: [{ text: 'Return only the improved prompt.' }]
      },
      contents: [{ role: 'user', parts: [{ text: 'Improve this' }] }]
    })
  })

  it('parses the first candidate text into the analysis result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulResponse('Be more specific.')))

    await expect(
      analyzeWithGoogleAI(args, 'secret-key', new AbortController().signal)
    ).resolves.toEqual({
      suggestion: 'Be more specific.',
      improvedPrompt: 'Be more specific.',
      reasoning: ''
    })
  })

  it('rejects responses truncated by the token limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          candidates: [
            {
              finishReason: 'MAX_TOKENS',
              content: { role: 'model', parts: [{ text: 'Be more' }] }
            }
          ]
        })
      )
    )

    await expect(
      analyzeWithGoogleAI(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('Google AI response was truncated because the token limit was reached')
  })

  it.each([
    null,
    { error: 'rejected' },
    { error: { message: 401 } },
    { candidates: 'invalid' },
    { candidates: [] },
    { candidates: [{}] },
    { candidates: [{ content: null }] },
    { candidates: [{ content: { parts: [] } }] },
    { candidates: [{ content: { parts: [{ text: 42 }] } }] }
  ])('rejects malformed provider responses: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)))

    await expect(
      analyzeWithGoogleAI(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('Google AI returned an invalid response')
  })

  it('redacts the API key from provider errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { message: 'Rejected secret-key' } }, { status: 401 })
        )
    )

    await expect(
      analyzeWithGoogleAI(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('Rejected [REDACTED]')
  })

  it('uses raw error metadata and redacts every API key occurrence', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: { metadata: { raw: '  Rejected secret-key; retry secret-key.  ' } } },
            { status: 401 }
          )
        )
    )

    await expect(
      analyzeWithGoogleAI(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('Rejected [REDACTED]; retry [REDACTED].')
  })

  it('extracts nested error details without a top-level message', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: { error: { message: 'Invalid secret-key' } } }))
    )

    await expect(
      analyzeWithGoogleAI(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('Invalid [REDACTED]')
  })

  it('rejects another provider before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      analyzeWithGoogleAI(
        { ...args, provider: 'openai' } as PromptAnalyzerAnalyzeArgs,
        'secret-key',
        new AbortController().signal
      )
    ).rejects.toThrow('Google AI client requires provider google_ai')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
