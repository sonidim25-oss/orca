import type { SettingsSearchEntry } from './settings-search'
import { getPromptAnalyzerDescription, getPromptAnalyzerTitle } from './prompt-analyzer-copy'
import { searchKeywords } from './settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export function getPromptAnalyzerSearchKeywords(): string[] {
  return searchKeywords([
    {
      key: 'auto.components.settings.prompt-analyzer-settings-search.prompt',
      fallback: 'prompt'
    },
    {
      key: 'auto.components.settings.prompt-analyzer-settings-search.analyzer',
      fallback: 'analyzer'
    },
    {
      key: 'auto.components.settings.prompt-analyzer-settings-search.improve',
      fallback: 'improve'
    },
    {
      key: 'auto.components.settings.prompt-analyzer-settings-search.apiKey',
      fallback: 'api key'
    },
    {
      key: 'auto.components.settings.prompt-analyzer-settings-search.model',
      fallback: 'model'
    },
    {
      key: 'auto.components.settings.prompt-analyzer-settings-search.openrouter',
      fallback: 'openrouter',
      englishOnly: true
    },
    {
      key: 'auto.components.settings.prompt-analyzer-settings-search.openai',
      fallback: 'openai',
      englishOnly: true
    },
    {
      key: 'auto.components.settings.prompt-analyzer-settings-search.anthropic',
      fallback: 'anthropic',
      englishOnly: true
    },
    {
      key: 'auto.components.settings.prompt-analyzer-settings-search.googleAi',
      fallback: 'google ai',
      englishOnly: true
    }
  ])
}

export const getPromptAnalyzerSearchEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    title: getPromptAnalyzerTitle(),
    description: getPromptAnalyzerDescription(),
    keywords: getPromptAnalyzerSearchKeywords()
  })
)
