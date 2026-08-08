import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type {
  AnalyzeOptions,
  AnalyzeResult,
  PromptAnalyzerSlice,
  PromptAnalyzerState
} from '@/prompt-analyzer'
import { DEFAULT_PROVIDER } from '@/prompt-analyzer/constants'
import { PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL } from '../../../../shared/prompt-analyzer-types'

const MISSING_API_KEY_ERROR =
  'OpenRouter API key not configured. Please add it in Settings > Prompt Analyzer.'

const getInitialState = () => ({
  isPanelOpen: false,
  hasWarned: false,
  state: 'idle' as PromptAnalyzerState,
  originalPrompt: '',
  improvedPrompt: '',
  lastSuccessfulResult: null,
  error: null as string | null,
  requestId: 0
})

function getClosedPanelState(state: AppState) {
  const result = state.lastSuccessfulResult
  return {
    isPanelOpen: false,
    state: (result ? 'success' : 'idle') as PromptAnalyzerState,
    originalPrompt: result?.originalPrompt ?? '',
    improvedPrompt: result?.improvedPrompt ?? '',
    error: null,
    requestId: state.requestId + 1
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Prompt analysis failed with an unknown error'
}

export const createPromptAnalyzerSlice: StateCreator<AppState, [], [], PromptAnalyzerSlice> = (
  set,
  get
) => ({
  ...getInitialState(),

  setPanelOpen: (open: boolean) => {
    if (open) {
      set({ isPanelOpen: true })
      return
    }
    if (get().isPanelOpen) {
      void window.api.promptAnalyzer.cancel()
    }
    set(getClosedPanelState)
  },

  setHasWarned: (hasWarned: boolean) => set({ hasWarned }),

  updatePrompt: (prompt: string) =>
    set((state) => ({
      originalPrompt: prompt,
      ...(state.state === 'success'
        ? {
            state: 'idle' as PromptAnalyzerState,
            improvedPrompt: ''
          }
        : {})
    })),

  reportMissingApiKey: () =>
    set({ state: 'error' as PromptAnalyzerState, error: MISSING_API_KEY_ERROR }),

  dismissResult: () =>
    set({
      state: 'idle' as PromptAnalyzerState,
      improvedPrompt: '',
      lastSuccessfulResult: null,
      error: null
    }),

  analyzePrompt: async (
    prompt: string,
    options?: AnalyzeOptions
  ): Promise<AnalyzeResult | null> => {
    const requestId = get().requestId + 1
    set({ requestId })

    const { settings } = get()
    const provider = options?.provider ?? settings?.promptAnalyzerProvider ?? DEFAULT_PROVIDER
    const rawModel =
      options?.model ??
      settings?.promptAnalyzerProviders?.[provider]?.model ??
      (provider === 'openrouter' ? settings?.promptAnalyzerModel : undefined)
    const model =
      typeof rawModel === 'string' && rawModel.trim().length > 0
        ? rawModel.trim()
        : provider === 'openrouter'
          ? PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL
          : null
    const rejectInvalidInvocation = async (error: Error): Promise<null> => {
      await window.api.promptAnalyzer.cancel().catch(() => undefined)
      if (get().requestId !== requestId) {
        return null
      }
      set({ state: 'error' as PromptAnalyzerState, error: error.message })
      throw error
    }

    if (!model) {
      return rejectInvalidInvocation(
        new Error('Prompt analyzer model is not configured. Set a model in Settings.')
      )
    }

    set({
      state: 'processing' as PromptAnalyzerState,
      originalPrompt: prompt,
      error: null
    })

    try {
      const response = await window.api.promptAnalyzer.analyze({
        prompt,
        provider,
        model,
        systemPrompt: options?.systemPrompt
      })
      if (!response.ok) {
        throw new Error(response.error)
      }
      if (!response.result.improvedPrompt.trim()) {
        throw new Error('Empty response from model')
      }
      if (get().requestId !== requestId) {
        return null
      }

      set({
        state: 'success' as PromptAnalyzerState,
        improvedPrompt: response.result.improvedPrompt,
        lastSuccessfulResult: {
          originalPrompt: prompt,
          improvedPrompt: response.result.improvedPrompt
        },
        error: null
      })
      return response.result
    } catch (error) {
      if (get().requestId !== requestId) {
        return null
      }
      const analysisError = new Error(getErrorMessage(error))
      set({ state: 'error' as PromptAnalyzerState, error: analysisError.message })
      throw analysisError
    }
  },

  togglePanel: () => {
    if (!get().isPanelOpen) {
      set({ isPanelOpen: true })
      return
    }
    void window.api.promptAnalyzer.cancel()
    set(getClosedPanelState)
  },

  reset: () => {
    const { requestId, state } = get()
    if (state === 'processing') {
      void window.api.promptAnalyzer.cancel()
    }
    set({ ...getInitialState(), requestId: requestId + 1 })
  }
})
