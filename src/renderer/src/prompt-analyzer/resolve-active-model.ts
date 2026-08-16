import type { GlobalSettings } from '../../../shared/types'
import { PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL } from '../../../shared/prompt-analyzer-types'
import { DEFAULT_PROVIDER } from './constants'
import type { SupportedProvider } from './types'

type PromptAnalyzerModelSettings = Pick<
  GlobalSettings,
  'promptAnalyzerModel' | 'promptAnalyzerProvider' | 'promptAnalyzerProviders'
>

type PromptAnalyzerModelOverrides = {
  provider?: SupportedProvider
  model?: string
}

export type PromptAnalyzerSelection = {
  provider: SupportedProvider
  model: string | null
}

function normalizeModel(rawModel: unknown, provider: SupportedProvider): string | null {
  return typeof rawModel === 'string' && rawModel.trim().length > 0
    ? rawModel.trim()
    : provider === 'openrouter'
      ? PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL
      : null
}

export function resolvePromptAnalyzerSelection(
  settings: PromptAnalyzerModelSettings | null | undefined,
  overrides?: PromptAnalyzerModelOverrides
): PromptAnalyzerSelection {
  const provider = overrides?.provider ?? settings?.promptAnalyzerProvider ?? DEFAULT_PROVIDER
  const rawModel =
    overrides?.model !== undefined
      ? overrides.model
      : (settings?.promptAnalyzerProviders?.[provider]?.model ??
        (provider === 'openrouter' ? settings?.promptAnalyzerModel : undefined))

  return { provider, model: normalizeModel(rawModel, provider) }
}

export function resolveActivePromptAnalyzerModel(
  settings: PromptAnalyzerModelSettings | null | undefined
): string | null {
  return resolvePromptAnalyzerSelection(settings).model
}
