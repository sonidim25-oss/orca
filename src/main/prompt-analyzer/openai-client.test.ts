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
})
