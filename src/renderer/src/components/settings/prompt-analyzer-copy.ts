import {
  PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL,
  type SupportedProvider
} from '../../../../shared/prompt-analyzer-types'
import { translate } from '@/i18n/i18n'

const TITLE_KEY = 'auto.components.settings.prompt-analyzer-copy.title'
const DESCRIPTION_KEY = 'auto.components.settings.prompt-analyzer-copy.description'

const PROVIDER_LABELS: Record<SupportedProvider, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google_ai: 'Google AI'
}

const PROVIDER_MODEL_PLACEHOLDERS: Record<SupportedProvider, string> = {
  openrouter: PROMPT_ANALYZER_OPENROUTER_DEFAULT_MODEL,
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google_ai: 'gemini-2.5-pro'
}

export function getPromptAnalyzerTitle(): string {
  return translate(TITLE_KEY, 'Prompt Analyzer')
}

export function getPromptAnalyzerDescription(): string {
  return translate(
    DESCRIPTION_KEY,
    'Configure AI provider connections used to analyze and improve prompts.'
  )
}

export function getProviderLabel(provider: SupportedProvider): string {
  return PROVIDER_LABELS[provider]
}

export function getPromptAnalyzerApiKeyLabel(provider: SupportedProvider): string {
  return `${getProviderLabel(provider)} API key`
}

export function getPromptAnalyzerApiKeyDescription(provider: SupportedProvider): string {
  return `Used to send prompt analysis requests to ${getProviderLabel(provider)}.`
}

export function getPromptAnalyzerModelLabel(provider: SupportedProvider): string {
  return `${getProviderLabel(provider)} model`
}

export function getPromptAnalyzerModelDescription(provider: SupportedProvider): string {
  return `Enter the ${getProviderLabel(provider)} model ID used for prompt analysis.`
}

export function getPromptAnalyzerModelPlaceholder(provider: SupportedProvider): string {
  return PROVIDER_MODEL_PLACEHOLDERS[provider]
}

export function getPromptAnalyzerPanelCopy(provider: SupportedProvider) {
  return {
    missingApiKeyTitle: translate(
      'promptAnalyzer.panel.missingApiKeyTitle',
      'Missing {{provider}} API Key',
      { provider: getProviderLabel(provider) }
    ),
    missingApiKeyDescription: translate(
      'promptAnalyzer.panel.missingApiKeyDescription',
      'Add your API key in Settings > Prompt Analyzer'
    ),
    beforeSendTitle: translate('promptAnalyzer.panel.beforeSendTitle', 'Before you send'),
    improvedToastTitle: translate('promptAnalyzer.panel.improvedToastTitle', 'Prompt improved'),
    improvedToastDescription: translate(
      'promptAnalyzer.panel.improvedToastDescription',
      'Click Copy to use it in any agent terminal'
    ),
    improvementFailed: translate('promptAnalyzer.panel.improvementFailed', 'Improvement failed'),
    copiedToastTitle: translate('promptAnalyzer.panel.copiedToastTitle', 'Copied!'),
    copiedToastDescription: translate(
      'promptAnalyzer.panel.copiedToastDescription',
      'Paste into any agent terminal'
    ),
    copyFailed: translate('promptAnalyzer.panel.copyFailed', 'Copy failed'),
    clipboardUnavailable: translate(
      'promptAnalyzer.panel.clipboardUnavailable',
      'Could not access clipboard'
    )
  }
}
