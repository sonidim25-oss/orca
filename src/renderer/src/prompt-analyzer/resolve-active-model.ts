import type { GlobalSettings } from '../../../shared/types'
import { PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL } from '../../../shared/prompt-analyzer-types'
import { DEFAULT_PROVIDER } from './constants'

type PromptAnalyzerModelSettings = Pick<
  GlobalSettings,
  'promptAnalyzerModel' | 'promptAnalyzerProvider' | 'promptAnalyzerProviders'
>

export function resolveActivePromptAnalyzerModel(
  settings: PromptAnalyzerModelSettings | null | undefined
): string | null {
  const provider = settings?.promptAnalyzerProvider ?? DEFAULT_PROVIDER
  const rawModel =
    settings?.promptAnalyzerProviders?.[provider]?.model ??
    (provider === 'openrouter' ? settings?.promptAnalyzerModel : undefined)

  return typeof rawModel === 'string' && rawModel.trim().length > 0
    ? rawModel.trim()
    : provider === 'openrouter'
      ? PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL
      : null
}
