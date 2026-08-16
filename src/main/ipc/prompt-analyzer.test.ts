import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  analyzeWithAnthropicMock,
  analyzeWithGoogleAIMock,
  analyzeWithOpenAIMock,
  analyzeWithOpenRouterMock,
  clearPromptAnalyzerApiKeyMock,
  handleMock,
  hasPromptAnalyzerApiKeyMock,
  isTrustedUIRendererMock,
  readPromptAnalyzerApiKeyMock,
  savePromptAnalyzerApiKeyMock
} = vi.hoisted(() => ({
  analyzeWithAnthropicMock: vi.fn(),
  analyzeWithGoogleAIMock: vi.fn(),
  analyzeWithOpenAIMock: vi.fn(),
  analyzeWithOpenRouterMock: vi.fn(),
  clearPromptAnalyzerApiKeyMock: vi.fn(),
  handleMock: vi.fn(),
  hasPromptAnalyzerApiKeyMock: vi.fn(),
  isTrustedUIRendererMock: vi.fn((_event: unknown) => true),
  readPromptAnalyzerApiKeyMock: vi.fn(),
  savePromptAnalyzerApiKeyMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock }
}))

vi.mock('../prompt-analyzer/api-key-store', () => ({
  clearPromptAnalyzerApiKey: clearPromptAnalyzerApiKeyMock,
  hasPromptAnalyzerApiKey: hasPromptAnalyzerApiKeyMock,
  readPromptAnalyzerApiKey: readPromptAnalyzerApiKeyMock,
  savePromptAnalyzerApiKey: savePromptAnalyzerApiKeyMock
}))

vi.mock('../prompt-analyzer/openrouter-client', () => ({
  analyzeWithOpenRouter: analyzeWithOpenRouterMock
}))

vi.mock('../prompt-analyzer/openai-client', () => ({
  analyzeWithOpenAI: analyzeWithOpenAIMock
}))

vi.mock('../prompt-analyzer/anthropic-client', () => ({
  analyzeWithAnthropic: analyzeWithAnthropicMock
}))

vi.mock('../prompt-analyzer/google-ai-client', () => ({
  analyzeWithGoogleAI: analyzeWithGoogleAIMock
}))

vi.mock('./ui', () => ({
  isTrustedUIRenderer: isTrustedUIRendererMock
}))

import { registerPromptAnalyzerHandlers } from './prompt-analyzer'

const store = {
  getSettings: vi.fn(),
  updateSettings: vi.fn()
}

describe('registerPromptAnalyzerHandlers', () => {
  beforeEach(() => {
    handleMock.mockClear()
    analyzeWithAnthropicMock.mockReset()
    analyzeWithGoogleAIMock.mockReset()
    analyzeWithOpenAIMock.mockReset()
    analyzeWithOpenRouterMock.mockReset()
    clearPromptAnalyzerApiKeyMock.mockReset()
    hasPromptAnalyzerApiKeyMock.mockReset()
    isTrustedUIRendererMock.mockReset()
    isTrustedUIRendererMock.mockReturnValue(true)
    readPromptAnalyzerApiKeyMock.mockReset()
    savePromptAnalyzerApiKeyMock.mockReset()
    store.getSettings.mockReset()
    store.updateSettings.mockReset()
  })

  it('removes an empty legacy API key and reconciles missing secure storage', () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    hasPromptAnalyzerApiKeyMock.mockReturnValue(false)

    registerPromptAnalyzerHandlers(store as never)

    expect(savePromptAnalyzerApiKeyMock).not.toHaveBeenCalled()
    expect(store.updateSettings).toHaveBeenCalledWith({
      promptAnalyzerApiKey: '***',
      promptAnalyzerApiKeyConfigured: false
    })
  })

  it('removes an empty legacy API key and reconciles existing secure storage', () => {
    store.getSettings.mockReturnValue({
      promptAnalyzerApiKey: '  ',
      promptAnalyzerApiKeyConfigured: false
    })
    hasPromptAnalyzerApiKeyMock.mockReturnValue(true)

    registerPromptAnalyzerHandlers(store as never)

    expect(savePromptAnalyzerApiKeyMock).not.toHaveBeenCalled()
    expect(store.updateSettings).toHaveBeenCalledWith({
      promptAnalyzerApiKey: '***',
      promptAnalyzerApiKeyConfigured: true
    })
  })

  it('cleans up the legacy API key when secure storage is already configured', () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: 'legacy-key' })
    hasPromptAnalyzerApiKeyMock.mockReturnValue(true)

    registerPromptAnalyzerHandlers(store as never)

    expect(savePromptAnalyzerApiKeyMock).not.toHaveBeenCalled()
    expect(store.updateSettings).toHaveBeenCalledWith({
      promptAnalyzerApiKey: '***',
      promptAnalyzerApiKeyConfigured: true
    })
  })

  it('cleans up settings after migrating a legacy API key', () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: ' legacy-key ' })
    hasPromptAnalyzerApiKeyMock.mockReturnValue(false)

    registerPromptAnalyzerHandlers(store as never)

    expect(savePromptAnalyzerApiKeyMock).toHaveBeenCalledWith('openrouter', 'legacy-key')
    expect(store.updateSettings).toHaveBeenCalledWith({
      promptAnalyzerApiKey: '***',
      promptAnalyzerApiKeyConfigured: true
    })
  })

  it('redacts the legacy API key when secure storage migration fails', () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: 'legacy-key' })
    hasPromptAnalyzerApiKeyMock.mockReturnValue(false)
    savePromptAnalyzerApiKeyMock.mockImplementation(() => {
      throw new Error('Secure credential storage is unavailable')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => registerPromptAnalyzerHandlers(store as never)).not.toThrow()

    expect(store.updateSettings).toHaveBeenCalledWith({
      promptAnalyzerApiKey: '***',
      promptAnalyzerApiKeyConfigured: false
    })
    expect(warn).toHaveBeenCalledWith('[prompt-analyzer] failed to migrate legacy API key')
    warn.mockRestore()
  })

  it('analyzes in main without returning the credential', async () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    readPromptAnalyzerApiKeyMock.mockReturnValue('secret-key')
    analyzeWithOpenRouterMock.mockResolvedValue({
      suggestion: 'Better',
      improvedPrompt: 'Better',
      reasoning: ''
    })
    registerPromptAnalyzerHandlers(store as never)
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])
    const event = { sender: { id: 99 } }
    const args = {
      prompt: 'Improve this',
      provider: 'openrouter',
      model: 'test-model'
    }

    const analyzeHandler = handlers.get('promptAnalyzer:analyze') as (
      event: unknown,
      args: unknown
    ) => Promise<unknown>
    await expect(analyzeHandler(event, args)).resolves.toEqual({
      ok: true,
      result: { suggestion: 'Better', improvedPrompt: 'Better', reasoning: '' }
    })
    expect(readPromptAnalyzerApiKeyMock).toHaveBeenCalledOnce()
    expect(analyzeWithOpenRouterMock).toHaveBeenCalledWith(
      args,
      'secret-key',
      expect.any(AbortSignal)
    )
  })

  it.each([
    ['openrouter', analyzeWithOpenRouterMock],
    ['openai', analyzeWithOpenAIMock],
    ['anthropic', analyzeWithAnthropicMock],
    ['google_ai', analyzeWithGoogleAIMock]
  ] as const)('routes %s analysis to its provider client', async (provider, analyzeMock) => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    readPromptAnalyzerApiKeyMock.mockReturnValue('secret-key')
    analyzeMock.mockResolvedValue({
      suggestion: 'Better',
      improvedPrompt: 'Better',
      reasoning: ''
    })
    registerPromptAnalyzerHandlers(store as never)
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])
    const args = {
      prompt: 'Improve this',
      provider,
      model: 'test-model'
    }
    const analyzeHandler = handlers.get('promptAnalyzer:analyze') as (
      event: unknown,
      args: unknown
    ) => Promise<unknown>

    await expect(analyzeHandler({ sender: { id: 99 } }, args)).resolves.toEqual({
      ok: true,
      result: { suggestion: 'Better', improvedPrompt: 'Better', reasoning: '' }
    })
    expect(readPromptAnalyzerApiKeyMock).toHaveBeenCalledWith(provider)
    expect(analyzeMock).toHaveBeenCalledWith(args, 'secret-key', expect.any(AbortSignal))
  })

  it.each([
    ['an invalid provider', { provider: '../outside', prompt: 'test', model: 'm' }],
    ['an empty prompt', { provider: 'openrouter', prompt: '   ', model: 'm' }],
    ['an oversized prompt', { provider: 'openrouter', prompt: 'a'.repeat(4001), model: 'm' }],
    ['a missing model', { provider: 'openrouter', prompt: 'test' }],
    ['an oversized model', { provider: 'openrouter', prompt: 'test', model: 'm'.repeat(201) }],
    [
      'an oversized system prompt',
      { provider: 'openrouter', prompt: 'test', model: 'm', systemPrompt: 's'.repeat(8001) }
    ],
    [
      'an organization ID with unsafe characters',
      { provider: 'openai', prompt: 'test', model: 'm', organizationId: 'org\r\ninjected' }
    ],
    ['a non-object payload', null]
  ])('rejects %s before credential access or provider dispatch', async (_name, invalidArgs) => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    registerPromptAnalyzerHandlers(store as never)
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])
    const event = { sender: { id: 99 } }
    const analyzeHandler = handlers.get('promptAnalyzer:analyze') as (
      event: unknown,
      args: unknown
    ) => Promise<unknown>

    await expect(analyzeHandler(event, invalidArgs)).resolves.toEqual({
      ok: false,
      error: 'Invalid Prompt Analyzer request'
    })
    expect(readPromptAnalyzerApiKeyMock).not.toHaveBeenCalled()
    expect(analyzeWithOpenRouterMock).not.toHaveBeenCalled()
    expect(analyzeWithOpenAIMock).not.toHaveBeenCalled()
    expect(analyzeWithAnthropicMock).not.toHaveBeenCalled()
    expect(analyzeWithGoogleAIMock).not.toHaveBeenCalled()
  })

  it('rejects invalid providers for API key operations', () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    registerPromptAnalyzerHandlers(store as never)
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])
    const event = { sender: { id: 99 } }
    const invalidProvider = '../outside'

    expect(() => handlers.get('promptAnalyzer:getApiKeyStatus')?.(event, invalidProvider)).toThrow(
      'Unsupported Prompt Analyzer provider: ../outside'
    )
    expect(() =>
      handlers.get('promptAnalyzer:saveApiKey')?.(event, invalidProvider, 'secret-key')
    ).toThrow('Unsupported Prompt Analyzer provider: ../outside')
    expect(() => handlers.get('promptAnalyzer:clearApiKey')?.(event, invalidProvider)).toThrow(
      'Unsupported Prompt Analyzer provider: ../outside'
    )
    expect(savePromptAnalyzerApiKeyMock).not.toHaveBeenCalled()
    expect(clearPromptAnalyzerApiKeyMock).not.toHaveBeenCalled()
  })

  it('redacts credential-shaped values from errors returned to the renderer', async () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    readPromptAnalyzerApiKeyMock.mockReturnValue('secret-key')
    analyzeWithOpenRouterMock.mockRejectedValue(
      new Error(
        'Rejected secret-key, sk-sensitive123, AIzaSensitiveValue123456789012345, Bearer signed-token-abcdefghij'
      )
    )
    registerPromptAnalyzerHandlers(store as never)
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])
    const analyzeHandler = handlers.get('promptAnalyzer:analyze') as (
      event: unknown,
      args: unknown
    ) => Promise<unknown>

    await expect(
      analyzeHandler({ sender: { id: 99 } }, { provider: 'openrouter', prompt: 'test', model: 'm' })
    ).resolves.toEqual({
      ok: false,
      error: 'Rejected [REDACTED], [REDACTED], [REDACTED], [REDACTED]'
    })
  })

  it('redacts key-shaped credentials when credential retrieval fails', async () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    readPromptAnalyzerApiKeyMock.mockImplementation(() => {
      throw new Error('Credential decode failed for sk-abc123de')
    })
    registerPromptAnalyzerHandlers(store as never)
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])
    const analyzeHandler = handlers.get('promptAnalyzer:analyze') as (
      event: unknown,
      args: unknown
    ) => Promise<unknown>

    await expect(
      analyzeHandler({ sender: { id: 99 } }, { provider: 'openrouter', prompt: 'test', model: 'm' })
    ).resolves.toEqual({
      ok: false,
      error: 'Credential decode failed for [REDACTED]'
    })
  })

  it('cancels the active analysis for the requesting renderer', async () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    readPromptAnalyzerApiKeyMock.mockReturnValue('secret-key')
    let signal: AbortSignal | undefined
    analyzeWithOpenRouterMock.mockImplementation(
      (_args: unknown, _apiKey: unknown, requestSignal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal = requestSignal
          requestSignal.addEventListener('abort', () => reject(requestSignal.reason), {
            once: true
          })
        })
    )
    registerPromptAnalyzerHandlers(store as never)
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])
    const event = { sender: { id: 99 } }
    const analyzeHandler = handlers.get('promptAnalyzer:analyze') as (
      event: unknown,
      args: unknown
    ) => Promise<unknown>

    const analysis = analyzeHandler(event, {
      provider: 'openrouter',
      prompt: 'test',
      model: 'm'
    })
    handlers.get('promptAnalyzer:cancel')?.(event)

    await expect(analysis).resolves.toEqual({ ok: false, error: 'Request canceled' })
    expect(signal?.aborted).toBe(true)
  })

  it('restores the previous credential when saving configured state fails', () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    readPromptAnalyzerApiKeyMock.mockReturnValue('previous-key')
    store.updateSettings.mockImplementation(() => {
      throw new Error('Settings write failed')
    })
    registerPromptAnalyzerHandlers(store as never)
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])

    expect(() =>
      handlers.get('promptAnalyzer:saveApiKey')?.({ sender: { id: 99 } }, 'openrouter', 'new-key')
    ).toThrow('Settings write failed')
    expect(savePromptAnalyzerApiKeyMock.mock.calls).toEqual([
      ['openrouter', 'new-key'],
      ['openrouter', 'previous-key']
    ])
    expect(clearPromptAnalyzerApiKeyMock).not.toHaveBeenCalled()
  })

  it('removes a newly saved credential when saving configured state fails', () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    readPromptAnalyzerApiKeyMock.mockImplementation(() => {
      throw new Error('OpenRouter API key is not configured')
    })
    store.updateSettings.mockImplementation(() => {
      throw new Error('Settings write failed')
    })
    registerPromptAnalyzerHandlers(store as never)
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])

    expect(() =>
      handlers.get('promptAnalyzer:saveApiKey')?.({ sender: { id: 99 } }, 'openrouter', 'new-key')
    ).toThrow('Settings write failed')
    expect(savePromptAnalyzerApiKeyMock).toHaveBeenCalledOnce()
    expect(clearPromptAnalyzerApiKeyMock).toHaveBeenCalledOnce()
  })

  it('keeps aggregate configured state when clearing one of multiple provider credentials', () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    readPromptAnalyzerApiKeyMock.mockReturnValue('previous-key')
    hasPromptAnalyzerApiKeyMock.mockReturnValue(false)
    registerPromptAnalyzerHandlers(store as never)
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])
    hasPromptAnalyzerApiKeyMock.mockClear()
    hasPromptAnalyzerApiKeyMock.mockReturnValue(true)

    expect(
      handlers.get('promptAnalyzer:clearApiKey')?.({ sender: { id: 99 } }, 'openrouter')
    ).toEqual({ configured: true })
    expect(clearPromptAnalyzerApiKeyMock).toHaveBeenCalledWith('openrouter')
    expect(hasPromptAnalyzerApiKeyMock).toHaveBeenCalledWith()
    expect(store.updateSettings).toHaveBeenLastCalledWith(
      { promptAnalyzerApiKeyConfigured: true },
      { notifyListeners: true }
    )
  })

  it('restores the cleared credential when aggregate configured state update fails', () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    readPromptAnalyzerApiKeyMock.mockReturnValue('previous-key')
    hasPromptAnalyzerApiKeyMock.mockReturnValue(true)
    store.updateSettings.mockImplementation(() => {
      throw new Error('Settings write failed')
    })
    registerPromptAnalyzerHandlers(store as never)
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])

    expect(() =>
      handlers.get('promptAnalyzer:clearApiKey')?.({ sender: { id: 99 } }, 'openrouter')
    ).toThrow('Settings write failed')
    expect(clearPromptAnalyzerApiKeyMock).toHaveBeenCalledOnce()
    expect(savePromptAnalyzerApiKeyMock).toHaveBeenCalledWith('openrouter', 'previous-key')
    expect(store.updateSettings).toHaveBeenLastCalledWith(
      { promptAnalyzerApiKeyConfigured: true },
      { notifyListeners: true }
    )
  })

  it('preserves the settings and rollback errors when save rollback fails', () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    readPromptAnalyzerApiKeyMock.mockReturnValue('previous-key')
    const settingsError = new Error('Settings write failed')
    const rollbackError = new Error('Credential rollback failed')
    store.updateSettings.mockImplementation(() => {
      throw settingsError
    })
    savePromptAnalyzerApiKeyMock
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw rollbackError
      })
    registerPromptAnalyzerHandlers(store as never)
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])

    expect(() =>
      handlers.get('promptAnalyzer:saveApiKey')?.({ sender: { id: 99 } }, 'openrouter', 'new-key')
    ).toThrow(
      expect.objectContaining({
        errors: [settingsError, rollbackError],
        message: 'Prompt Analyzer settings update and credential rollback both failed'
      })
    )
  })

  it('preserves the settings and rollback errors when clear rollback fails', () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    readPromptAnalyzerApiKeyMock.mockReturnValue('previous-key')
    const settingsError = new Error('Settings write failed')
    const rollbackError = new Error('Credential rollback failed')
    store.updateSettings.mockImplementation(() => {
      throw settingsError
    })
    savePromptAnalyzerApiKeyMock.mockImplementation(() => {
      throw rollbackError
    })
    registerPromptAnalyzerHandlers(store as never)
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])

    expect(() =>
      handlers.get('promptAnalyzer:clearApiKey')?.({ sender: { id: 99 } }, 'openrouter')
    ).toThrow(
      expect.objectContaining({
        errors: [settingsError, rollbackError],
        message: 'Prompt Analyzer settings update and credential rollback both failed'
      })
    )
  })

  it('rejects every API key operation from renderers outside the trusted UI boundary', async () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    isTrustedUIRendererMock.mockReturnValue(false)
    registerPromptAnalyzerHandlers(store as never)
    hasPromptAnalyzerApiKeyMock.mockClear()
    store.updateSettings.mockClear()
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])
    const event = { sender: { id: 99 } }

    expect(() => handlers.get('promptAnalyzer:getApiKeyStatus')?.(event)).toThrow(
      'Unauthorized Prompt Analyzer sender'
    )
    const analyzeHandler = handlers.get('promptAnalyzer:analyze') as (
      event: unknown,
      args: unknown
    ) => Promise<unknown>
    await expect(analyzeHandler(event, {})).rejects.toThrow('Unauthorized Prompt Analyzer sender')
    expect(() => handlers.get('promptAnalyzer:cancel')?.(event)).toThrow(
      'Unauthorized Prompt Analyzer sender'
    )
    expect(() =>
      handlers.get('promptAnalyzer:saveApiKey')?.(event, 'openrouter', 'attacker-key')
    ).toThrow('Unauthorized Prompt Analyzer sender')
    expect(() => handlers.get('promptAnalyzer:clearApiKey')?.(event, 'openrouter')).toThrow(
      'Unauthorized Prompt Analyzer sender'
    )
    expect(hasPromptAnalyzerApiKeyMock).not.toHaveBeenCalled()
    expect(readPromptAnalyzerApiKeyMock).not.toHaveBeenCalled()
    expect(savePromptAnalyzerApiKeyMock).not.toHaveBeenCalled()
    expect(clearPromptAnalyzerApiKeyMock).not.toHaveBeenCalled()
    expect(store.updateSettings).not.toHaveBeenCalled()
  })

  it('passes the sending frame through the Prompt Analyzer authorization boundary', () => {
    store.getSettings.mockReturnValue({ promptAnalyzerApiKey: '  ' })
    const mainFrame = {}
    const event = {
      sender: { id: 99, mainFrame },
      senderFrame: {}
    }
    isTrustedUIRendererMock.mockImplementation((candidate) => {
      const { sender, senderFrame } = candidate as {
        sender: { mainFrame: unknown }
        senderFrame: unknown
      }
      return senderFrame === sender.mainFrame
    })
    registerPromptAnalyzerHandlers(store as never)
    hasPromptAnalyzerApiKeyMock.mockClear()
    const handlers = new Map(handleMock.mock.calls as [string, (...args: unknown[]) => unknown][])

    expect(() => handlers.get('promptAnalyzer:getApiKeyStatus')?.(event)).toThrow(
      'Unauthorized Prompt Analyzer sender'
    )
    expect(isTrustedUIRendererMock).toHaveBeenCalledWith(event)
    expect(hasPromptAnalyzerApiKeyMock).not.toHaveBeenCalled()
  })
})
