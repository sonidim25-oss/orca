import type { PromptAnalyzerAnalyzeArgs } from '../../shared/prompt-analyzer-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeWithOpenAI } from './openai-client'

const args: PromptAnalyzerAnalyzeArgs = {
  prompt: 'Improve this',
  provider: 'openai',
  model: 'gpt-test'
}

function successResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: 'Use a specific request.' } }]
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
}

describe('analyzeWithOpenAI', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects another provider before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      analyzeWithOpenAI(
        { ...args, provider: 'openrouter' } as PromptAnalyzerAnalyzeArgs,
        'secret-key',
        new AbortController().signal
      )
    ).rejects.toThrow('OpenAI client requires provider openai')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    { organizationId: ' org-example ', expectedHeader: 'org-example' },
    { organizationId: undefined, expectedHeader: null }
  ])(
    'sends the configured organization as the OpenAI request header',
    async ({ organizationId, expectedHeader }) => {
      const fetchMock = vi.fn().mockResolvedValue(successResponse())
      vi.stubGlobal('fetch', fetchMock)

      await analyzeWithOpenAI(
        { ...args, organizationId },
        'secret-key',
        new AbortController().signal
      )

      const [, init] = fetchMock.mock.calls[0]
      expect(new Headers(init.headers).get('OpenAI-Organization')).toBe(expectedHeader)
      const body = JSON.parse(String(init.body))
      expect(body).toMatchObject({
        model: 'gpt-test',
        messages: [{ role: 'system' }, { role: 'user', content: 'Improve this' }]
      })
      expect(body).not.toHaveProperty('max_tokens')
      expect(body).not.toHaveProperty('temperature')
    }
  )

  it('maps raw error metadata to a safe authentication error', async () => {
    const echoedPrompt = 'Improve this confidential acquisition plan'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              metadata: {
                raw: `Rejected secret-key while processing: ${echoedPrompt}`
              }
            }
          },
          { status: 401 }
        )
      )
    )

    const error = (await analyzeWithOpenAI(args, 'secret-key', new AbortController().signal).catch(
      (caught: unknown) => caught as Error
    )) as Error

    expect(error.message).toBe('OpenAI authentication failed. Check the configured API key.')
    expect(error.message).not.toContain(echoedPrompt)
    expect(error.message).not.toContain('secret-key')
  })

  it.each([
    {
      body: { error: { code: 'rate_limit_exceeded', message: 'Sensitive details' } },
      status: 429,
      expected: 'OpenAI rate limit reached. Try again later or choose another model.'
    },
    {
      body: { error: { code: 'model_not_found', message: 'Sensitive details' } },
      status: 400,
      expected: 'The selected OpenAI model is unavailable. Choose another model in Settings.'
    },
    {
      body: { error: { code: 'insufficient_quota', message: 'Sensitive details' } },
      status: 400,
      expected: 'OpenAI quota exceeded. Check the account plan and billing.'
    },
    {
      body: { error: { code: 'request_timeout', message: 'Sensitive details' } },
      status: 408,
      expected: 'OpenAI request timed out. Try again.'
    },
    {
      body: { error: { message: 'Sensitive details' } },
      status: 500,
      expected: 'OpenAI request failed (HTTP 500).'
    }
  ])(
    'maps status $status and known error codes to a stable message',
    async ({ body, status, expected }) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body, { status })))

      await expect(
        analyzeWithOpenAI(args, 'secret-key', new AbortController().signal)
      ).rejects.toThrow(expected)
    }
  )

  it('maps nested error details without surfacing them', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: { error: { message: 'Invalid secret-key' } } }))
    )

    await expect(
      analyzeWithOpenAI(args, 'secret-key', new AbortController().signal)
    ).rejects.toThrow('OpenAI request failed.')
  })
})
