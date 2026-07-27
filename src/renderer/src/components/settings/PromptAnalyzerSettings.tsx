import { useEffect, useRef, useState } from 'react'
import type { GlobalSettings } from '../../../../shared/types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { toast } from 'sonner'
import {
  getPromptAnalyzerApiKeyDescription,
  getPromptAnalyzerApiKeyLabel,
  getPromptAnalyzerDescription,
  getPromptAnalyzerModelDescription,
  getPromptAnalyzerModelLabel,
  getPromptAnalyzerModelPlaceholder,
  getPromptAnalyzerTitle
} from './prompt-analyzer-copy'
import { getPromptAnalyzerSearchKeywords } from './prompt-analyzer-settings-search'
import { SearchableSetting } from './SearchableSetting'

type PromptAnalyzerSettingsProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

export function PromptAnalyzerSettings({
  settings,
  updateSettings
}: PromptAnalyzerSettingsProps): React.JSX.Element {
  const title = getPromptAnalyzerTitle()
  const description = getPromptAnalyzerDescription()
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [apiKeyConfigured, setApiKeyConfigured] = useState(
    settings.promptAnalyzerApiKeyConfigured === true
  )
  const [apiKeyPending, setApiKeyPending] = useState(false)
  const apiKeyStatusVersionRef = useRef(0)
  const hasObservedInitialSettingsRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const statusVersion = apiKeyStatusVersionRef.current
    void window.api.promptAnalyzer
      .getApiKeyStatus('openrouter')
      .then(({ configured }) => {
        if (!cancelled && apiKeyStatusVersionRef.current === statusVersion) {
          setApiKeyConfigured(configured)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (hasObservedInitialSettingsRef.current) {
      apiKeyStatusVersionRef.current += 1
    } else {
      hasObservedInitialSettingsRef.current = true
    }
    setApiKeyConfigured(settings.promptAnalyzerApiKeyConfigured === true)
  }, [settings.promptAnalyzerApiKeyConfigured])

  const saveApiKey = async (): Promise<void> => {
    apiKeyStatusVersionRef.current += 1
    setApiKeyPending(true)
    try {
      await window.api.promptAnalyzer.saveApiKey(apiKeyDraft, 'openrouter')
      setApiKeyConfigured(true)
      setApiKeyDraft('')
      toast.success('OpenRouter API key saved securely')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save OpenRouter API key')
    } finally {
      setApiKeyPending(false)
    }
  }

  const clearApiKey = async (): Promise<void> => {
    apiKeyStatusVersionRef.current += 1
    setApiKeyPending(true)
    try {
      await window.api.promptAnalyzer.clearApiKey('openrouter')
      setApiKeyConfigured(false)
      setApiKeyDraft('')
      toast.success('OpenRouter API key cleared')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to clear OpenRouter API key')
    } finally {
      setApiKeyPending(false)
    }
  }

  return (
    <section className="space-y-3">
      <SearchableSetting
        title={title}
        description={description}
        keywords={getPromptAnalyzerSearchKeywords()}
      >
        <div className="space-y-1 py-2">
          <Label>{title}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-start justify-between gap-4 py-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <Label htmlFor="prompt-analyzer-api-key">{getPromptAnalyzerApiKeyLabel()}</Label>
            <p className="text-xs text-muted-foreground">{getPromptAnalyzerApiKeyDescription()}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Input
              id="prompt-analyzer-api-key"
              type="password"
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              placeholder={apiKeyConfigured ? 'Saved securely' : 'Enter API key'}
              autoComplete="off"
              spellCheck={false}
              className="w-64"
            />
            <Button
              type="button"
              size="sm"
              disabled={apiKeyPending || apiKeyDraft.trim() === ''}
              onClick={() => void saveApiKey()}
            >
              Save
            </Button>
            {apiKeyConfigured && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={apiKeyPending}
                onClick={() => void clearApiKey()}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-start justify-between gap-4 py-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <Label htmlFor="prompt-analyzer-model">{getPromptAnalyzerModelLabel()}</Label>
            <p className="text-xs text-muted-foreground">{getPromptAnalyzerModelDescription()}</p>
          </div>
          <Input
            id="prompt-analyzer-model"
            value={settings.promptAnalyzerModel ?? ''}
            onChange={(event) => updateSettings({ promptAnalyzerModel: event.target.value })}
            placeholder={getPromptAnalyzerModelPlaceholder()}
            autoComplete="off"
            spellCheck={false}
            className="w-64 font-mono text-xs"
          />
        </div>
      </SearchableSetting>
    </section>
  )
}
