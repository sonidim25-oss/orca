import { translate } from '@/i18n/i18n'

const TITLE_KEY = 'auto.components.settings.prompt-analyzer-copy.title'
const DESCRIPTION_KEY = 'auto.components.settings.prompt-analyzer-copy.description'
const API_KEY_LABEL_KEY = 'auto.components.settings.prompt-analyzer-copy.apiKeyLabel'
const API_KEY_DESCRIPTION_KEY = 'auto.components.settings.prompt-analyzer-copy.apiKeyDescription'
const MODEL_LABEL_KEY = 'auto.components.settings.prompt-analyzer-copy.modelLabel'
const MODEL_DESCRIPTION_KEY = 'auto.components.settings.prompt-analyzer-copy.modelDescription'
const MODEL_PLACEHOLDER_KEY = 'auto.components.settings.prompt-analyzer-copy.modelPlaceholder'

export function getPromptAnalyzerTitle(): string {
  return translate(TITLE_KEY, 'Prompt Analyzer')
}

export function getPromptAnalyzerDescription(): string {
  return translate(
    DESCRIPTION_KEY,
    'Configure the OpenRouter connection used to analyze and improve prompts.'
  )
}

export function getPromptAnalyzerApiKeyLabel(): string {
  return translate(API_KEY_LABEL_KEY, 'OpenRouter API key')
}

export function getPromptAnalyzerApiKeyDescription(): string {
  return translate(API_KEY_DESCRIPTION_KEY, 'Used to send prompt analysis requests to OpenRouter.')
}

export function getPromptAnalyzerModelLabel(): string {
  return translate(MODEL_LABEL_KEY, 'Default model')
}

export function getPromptAnalyzerModelDescription(): string {
  return translate(MODEL_DESCRIPTION_KEY, 'Enter the OpenRouter model ID used for prompt analysis.')
}

export function getPromptAnalyzerModelPlaceholder(): string {
  return translate(MODEL_PLACEHOLDER_KEY, 'provider/model-name')
}
