import { describe, expect, it } from 'vitest'
import { PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL } from '../../../../shared/prompt-analyzer-types'
import type { GlobalSettings } from '../../../../shared/types'
import { resolveActivePromptAnalyzerModel } from '../resolve-active-model'

type ModelSettings = Pick<
  GlobalSettings,
  'promptAnalyzerModel' | 'promptAnalyzerProvider' | 'promptAnalyzerProviders'
>

describe('resolveActivePromptAnalyzerModel', () => {
  it('uses the default provider and model when settings are empty', () => {
    expect(resolveActivePromptAnalyzerModel({})).toBe(PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL)
  })

  it('uses the selected per-provider model', () => {
    const settings: ModelSettings = {
      promptAnalyzerProvider: 'openai',
      promptAnalyzerProviders: { openai: { model: 'gpt-5' } }
    }

    expect(resolveActivePromptAnalyzerModel(settings)).toBe('gpt-5')
  })

  it('uses the legacy OpenRouter model when the nested model is absent', () => {
    expect(resolveActivePromptAnalyzerModel({ promptAnalyzerModel: 'legacy-model' })).toBe(
      'legacy-model'
    )
  })

  it('uses the OpenRouter default model when its model is unset', () => {
    expect(resolveActivePromptAnalyzerModel({ promptAnalyzerProvider: 'openrouter' })).toBe(
      PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL
    )
  })

  it('returns null when a non-OpenRouter provider has no model', () => {
    expect(resolveActivePromptAnalyzerModel({ promptAnalyzerProvider: 'anthropic' })).toBeNull()
  })

  it('trims whitespace from the configured model', () => {
    const settings: ModelSettings = {
      promptAnalyzerProvider: 'google_ai',
      promptAnalyzerProviders: { google_ai: { model: '  gemini-2.5-pro  ' } }
    }

    expect(resolveActivePromptAnalyzerModel(settings)).toBe('gemini-2.5-pro')
  })

  it('honors an explicit provider override', () => {
    const settings: ModelSettings = {
      promptAnalyzerModel: 'legacy-openrouter-model',
      promptAnalyzerProvider: 'anthropic',
      promptAnalyzerProviders: {
        openrouter: { model: 'openrouter-model' },
        anthropic: { model: 'claude-sonnet-4' }
      }
    }

    expect(resolveActivePromptAnalyzerModel(settings)).toBe('claude-sonnet-4')
  })

  it('prefers the nested OpenRouter model over the legacy model', () => {
    const settings: ModelSettings = {
      promptAnalyzerModel: 'legacy-model',
      promptAnalyzerProviders: { openrouter: { model: 'nested-model' } }
    }

    expect(resolveActivePromptAnalyzerModel(settings)).toBe('nested-model')
  })
})
