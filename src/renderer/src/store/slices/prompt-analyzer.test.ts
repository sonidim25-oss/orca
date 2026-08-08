import { describe, it, expect, beforeEach, vi } from 'vitest'
import { create } from 'zustand'
import { createPromptAnalyzerSlice } from './prompt-analyzer'
import type { AppState } from '../types'

function createTestStore() {
  return create<AppState>()(
    (...a) =>
      ({
        ...createPromptAnalyzerSlice(...a)
      }) as AppState
  )
}

describe('PromptAnalyzerSlice', () => {
  let store: ReturnType<typeof createTestStore>

  beforeEach(() => {
    vi.stubGlobal('window', {
      api: {
        promptAnalyzer: {
          analyze: vi.fn(),
          cancel: vi.fn().mockResolvedValue(undefined)
        }
      }
    })
    store = createTestStore()
  })

  it('has the expected initial state', () => {
    const state = store.getState()
    expect(state.isPanelOpen).toBe(false)
    expect(state.hasWarned).toBe(false)
    expect(state.state).toBe('idle')
    expect(state.originalPrompt).toBe('')
    expect(state.improvedPrompt).toBe('')
    expect(state.lastSuccessfulResult).toBeNull()
    expect(state.error).toBeNull()
  })

  it('togglePanel flips isPanelOpen', () => {
    store.getState().togglePanel()
    expect(store.getState().isPanelOpen).toBe(true)

    store.setState({
      state: 'success',
      originalPrompt: 'test prompt',
      improvedPrompt: 'improved',
      error: 'some error'
    })

    store.getState().togglePanel()
    const state = store.getState()
    expect(state.isPanelOpen).toBe(false)
    expect(state.state).toBe('idle')
    expect(state.originalPrompt).toBe('')
    expect(state.improvedPrompt).toBe('')
    expect(state.error).toBeNull()
    expect(window.api.promptAnalyzer.cancel).toHaveBeenCalledOnce()
  })

  it('cancels the active request when setPanelOpen closes the panel', () => {
    store.getState().setPanelOpen(true)

    store.getState().setPanelOpen(false)

    expect(window.api.promptAnalyzer.cancel).toHaveBeenCalledOnce()
  })

  it('retains a successful result across panel close and reopen', async () => {
    vi.mocked(window.api.promptAnalyzer.analyze).mockResolvedValue({
      ok: true,
      result: { suggestion: 'Better', improvedPrompt: 'Better', reasoning: '' }
    })
    store.getState().setPanelOpen(true)

    await store.getState().analyzePrompt('Original', { model: 'test-model' })
    store.getState().setPanelOpen(false)
    store.getState().setPanelOpen(true)

    expect(store.getState()).toMatchObject({
      isPanelOpen: true,
      state: 'success',
      originalPrompt: 'Original',
      improvedPrompt: 'Better',
      lastSuccessfulResult: { originalPrompt: 'Original', improvedPrompt: 'Better' },
      error: null
    })

    store.getState().togglePanel()
    store.getState().togglePanel()
    expect(store.getState()).toMatchObject({
      isPanelOpen: true,
      state: 'success',
      originalPrompt: 'Original',
      improvedPrompt: 'Better'
    })
  })

  it('replaces the retained result on success but preserves it after failure', async () => {
    vi.mocked(window.api.promptAnalyzer.analyze)
      .mockResolvedValueOnce({
        ok: true,
        result: { suggestion: 'First better', improvedPrompt: 'First better', reasoning: '' }
      })
      .mockResolvedValueOnce({
        ok: true,
        result: { suggestion: 'Second better', improvedPrompt: 'Second better', reasoning: '' }
      })
      .mockRejectedValueOnce(new Error('Provider failed'))
    store.getState().setPanelOpen(true)

    await store.getState().analyzePrompt('First original', { model: 'test-model' })
    await store.getState().analyzePrompt('Second original', { model: 'test-model' })
    await expect(
      store.getState().analyzePrompt('Failed original', { model: 'test-model' })
    ).rejects.toThrow('Provider failed')

    expect(store.getState().lastSuccessfulResult).toEqual({
      originalPrompt: 'Second original',
      improvedPrompt: 'Second better'
    })

    store.getState().setPanelOpen(false)
    expect(store.getState()).toMatchObject({
      state: 'success',
      originalPrompt: 'Second original',
      improvedPrompt: 'Second better',
      error: null
    })
  })

  it('updatePrompt and dismissResult own their complete transitions', () => {
    store.setState({
      state: 'success',
      originalPrompt: 'orig',
      improvedPrompt: 'improved',
      error: null
    })

    store.getState().updatePrompt('edited')
    expect(store.getState()).toMatchObject({
      state: 'idle',
      originalPrompt: 'edited',
      improvedPrompt: ''
    })

    store.setState({ state: 'success', improvedPrompt: 'improved' })
    store.setState({
      lastSuccessfulResult: { originalPrompt: 'edited', improvedPrompt: 'improved' }
    })
    store.getState().dismissResult()
    expect(store.getState()).toMatchObject({
      state: 'idle',
      originalPrompt: 'edited',
      improvedPrompt: '',
      lastSuccessfulResult: null,
      error: null
    })
  })

  it('setHasWarned tracks the session warning', () => {
    store.getState().setHasWarned(true)
    expect(store.getState().hasWarned).toBe(true)
  })

  it('reset returns to initial state', () => {
    store.getState().togglePanel()
    store.getState().setHasWarned(true)
    store.setState({ state: 'processing', requestId: 7 })

    store.getState().reset()

    const state = store.getState()
    expect(state.isPanelOpen).toBe(false)
    expect(state.hasWarned).toBe(false)
    expect(state.state).toBe('idle')
    expect(state.originalPrompt).toBe('')
    expect(state.improvedPrompt).toBe('')
    expect(state.lastSuccessfulResult).toBeNull()
    expect(state.error).toBeNull()
    expect(state.requestId).toBe(8)
    expect(window.api.promptAnalyzer.cancel).toHaveBeenCalledOnce()
  })

  it('owns processing and success transitions for analysis', async () => {
    vi.mocked(window.api.promptAnalyzer.analyze).mockResolvedValue({
      ok: true,
      result: { suggestion: 'Better', improvedPrompt: 'Better', reasoning: '' }
    })

    const result = await store.getState().analyzePrompt('Original', { model: 'test-model' })

    expect(result?.improvedPrompt).toBe('Better')
    expect(store.getState()).toMatchObject({
      state: 'success',
      originalPrompt: 'Original',
      improvedPrompt: 'Better',
      error: null,
      requestId: 1
    })
  })

  it('uses the selected provider and its nested model for analysis', async () => {
    vi.mocked(window.api.promptAnalyzer.analyze).mockResolvedValue({
      ok: true,
      result: { suggestion: 'Better', improvedPrompt: 'Better', reasoning: '' }
    })
    store.setState({
      settings: {
        promptAnalyzerProvider: 'anthropic',
        promptAnalyzerModel: 'openai/gpt-4o',
        promptAnalyzerProviders: {
          anthropic: { model: 'claude-sonnet-4' }
        }
      } as AppState['settings']
    })

    await store.getState().analyzePrompt('Original')

    expect(window.api.promptAnalyzer.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'anthropic', model: 'claude-sonnet-4' })
    )
  })

  it('ignores stale slice config when resolving provider and model', async () => {
    vi.mocked(window.api.promptAnalyzer.analyze).mockResolvedValue({
      ok: true,
      result: { suggestion: 'Better', improvedPrompt: 'Better', reasoning: '' }
    })
    store.setState({
      config: { provider: 'openrouter', model: 'stale-model' },
      settings: {
        promptAnalyzerProvider: 'anthropic',
        promptAnalyzerProviders: {
          anthropic: { model: 'claude-sonnet-4' }
        }
      } as AppState['settings']
    } as unknown as Partial<AppState>)

    await store.getState().analyzePrompt('Original')

    expect(window.api.promptAnalyzer.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'anthropic', model: 'claude-sonnet-4' })
    )
  })

  it('uses the reliable OpenRouter default when no model is configured', async () => {
    vi.mocked(window.api.promptAnalyzer.analyze).mockResolvedValue({
      ok: true,
      result: { suggestion: 'Better', improvedPrompt: 'Better', reasoning: '' }
    })

    await store.getState().analyzePrompt('Original')

    expect(window.api.promptAnalyzer.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openrouter', model: 'openrouter/auto-beta' })
    )
  })

  it('owns empty-response failure without publishing success', async () => {
    vi.mocked(window.api.promptAnalyzer.analyze).mockResolvedValue({
      ok: true,
      result: { suggestion: '', improvedPrompt: '   ', reasoning: '' }
    })

    await expect(
      store.getState().analyzePrompt('Original', { model: 'test-model' })
    ).rejects.toThrow('Empty response from model')

    expect(store.getState()).toMatchObject({
      state: 'error',
      originalPrompt: 'Original',
      improvedPrompt: '',
      error: 'Empty response from model'
    })
  })

  it('owns validation and error transitions without invoking analysis', async () => {
    store.setState({
      settings: { promptAnalyzerProvider: 'anthropic' } as AppState['settings']
    })

    await expect(store.getState().analyzePrompt('Original')).rejects.toThrow(
      'Prompt analyzer model is not configured. Set a model in Settings.'
    )

    expect(window.api.promptAnalyzer.analyze).not.toHaveBeenCalled()
    expect(window.api.promptAnalyzer.cancel).toHaveBeenCalledOnce()
    expect(store.getState()).toMatchObject({
      state: 'error',
      error: 'Prompt analyzer model is not configured. Set a model in Settings.',
      requestId: 1
    })
  })

  it('invalidates an active request before reporting newer invalid configuration', async () => {
    let resolveAnalyze!: (
      response: Awaited<ReturnType<typeof window.api.promptAnalyzer.analyze>>
    ) => void
    vi.mocked(window.api.promptAnalyzer.analyze).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAnalyze = resolve
      })
    )

    const activeRequest = store.getState().analyzePrompt('First prompt', { model: 'test-model' })
    await expect(
      store.getState().analyzePrompt('Second prompt', { provider: 'anthropic' })
    ).rejects.toThrow('Prompt analyzer model is not configured. Set a model in Settings.')
    resolveAnalyze({
      ok: true,
      result: { suggestion: 'Stale', improvedPrompt: 'Stale', reasoning: '' }
    })

    await expect(activeRequest).resolves.toBeNull()
    expect(window.api.promptAnalyzer.cancel).toHaveBeenCalledOnce()
    expect(store.getState()).toMatchObject({
      state: 'error',
      improvedPrompt: '',
      requestId: 2
    })
  })

  it('does not let a closed-panel request repopulate lifecycle state', async () => {
    let resolveAnalyze!: (
      response: Awaited<ReturnType<typeof window.api.promptAnalyzer.analyze>>
    ) => void
    vi.mocked(window.api.promptAnalyzer.analyze).mockReturnValue(
      new Promise((resolve) => {
        resolveAnalyze = resolve
      })
    )
    store.getState().setPanelOpen(true)

    const analysis = store.getState().analyzePrompt('Original', { model: 'test-model' })
    expect(store.getState().state).toBe('processing')

    store.getState().setPanelOpen(false)
    resolveAnalyze({
      ok: true,
      result: { suggestion: 'Stale', improvedPrompt: 'Stale', reasoning: '' }
    })

    await expect(analysis).resolves.toBeNull()
    expect(store.getState()).toMatchObject({
      state: 'idle',
      originalPrompt: '',
      improvedPrompt: '',
      error: null
    })
    expect(window.api.promptAnalyzer.cancel).toHaveBeenCalledOnce()
  })
})
