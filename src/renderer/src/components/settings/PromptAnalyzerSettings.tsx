import { useCallback, useEffect, useRef, useState } from 'react'
import type { GlobalSettings } from '../../../../shared/types'
import type { SupportedProvider } from '../../../../shared/prompt-analyzer-types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Slider } from '../ui/slider'
import { toast } from 'sonner'
import {
  getPromptAnalyzerTitle,
  getPromptAnalyzerDescription,
  getPromptAnalyzerApiKeyLabel,
  getPromptAnalyzerApiKeyDescription,
  getPromptAnalyzerModelLabel,
  getPromptAnalyzerModelDescription,
  getPromptAnalyzerModelPlaceholder,
  getProviderLabel,
  getTemperatureLabel,
  getMaxTokensLabel
} from './prompt-analyzer-copy'
import { getPromptAnalyzerSearchKeywords } from './prompt-analyzer-settings-search'
import { SearchableSetting } from './SearchableSetting'

const PROVIDERS: SupportedProvider[] = ['openrouter', 'openai', 'anthropic', 'google_ai']

type PromptAnalyzerSettingsProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

type ProviderApiKeyState = {
  draft: string
  configured: boolean
  pending: boolean
}

function useProviderApiKeys() {
  const [keys, setKeys] = useState<Record<SupportedProvider, ProviderApiKeyState>>(
    () =>
      Object.fromEntries(
        PROVIDERS.map((p) => [p, { draft: '', configured: false, pending: false }])
      ) as Record<SupportedProvider, ProviderApiKeyState>
  )
  const statusVersionRef = useRef(0)

  useEffect(() => {
    statusVersionRef.current += 1
    const version = statusVersionRef.current
    for (const provider of PROVIDERS) {
      void window.api.promptAnalyzer
        .getApiKeyStatus(provider)
        .then(({ configured }) => {
          if (statusVersionRef.current === version) {
            setKeys((prev) => ({ ...prev, [provider]: { ...prev[provider], configured } }))
          }
        })
        .catch(() => {})
    }
  }, [])

  const syncConfigured = useCallback((provider: SupportedProvider, configured: boolean) => {
    statusVersionRef.current += 1
    setKeys((prev) => ({ ...prev, [provider]: { ...prev[provider], configured } }))
  }, [])

  const setDraft = useCallback((provider: SupportedProvider, draft: string) => {
    setKeys((prev) => ({ ...prev, [provider]: { ...prev[provider], draft } }))
  }, [])

  const setPending = useCallback((provider: SupportedProvider, pending: boolean) => {
    setKeys((prev) => ({ ...prev, [provider]: { ...prev[provider], pending } }))
  }, [])

  return { keys, syncConfigured, setDraft, setPending, statusVersionRef }
}

export function PromptAnalyzerSettings({
  settings,
  updateSettings
}: PromptAnalyzerSettingsProps): React.JSX.Element {
  const activeProvider = settings.promptAnalyzerProvider ?? 'openrouter'
  const { keys, syncConfigured, setDraft, setPending } = useProviderApiKeys()

  const handleTabClick = useCallback(
    (provider: SupportedProvider) => {
      void updateSettings({ promptAnalyzerProvider: provider })
    },
    [updateSettings]
  )

  const saveApiKey = useCallback(
    async (provider: SupportedProvider): Promise<void> => {
      setPending(provider, true)
      try {
        await window.api.promptAnalyzer.saveApiKey(keys[provider].draft, provider)
        syncConfigured(provider, true)
        setDraft(provider, '')
        toast.success(`${getProviderLabel(provider)} API key saved securely`)
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : `Failed to save ${getProviderLabel(provider)} API key`
        )
      } finally {
        setPending(provider, false)
      }
    },
    [keys, setPending, syncConfigured, setDraft]
  )

  const clearApiKey = useCallback(
    async (provider: SupportedProvider): Promise<void> => {
      setPending(provider, true)
      try {
        await window.api.promptAnalyzer.clearApiKey(provider)
        syncConfigured(provider, false)
        setDraft(provider, '')
        toast.success(`${getProviderLabel(provider)} API key cleared`)
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : `Failed to clear ${getProviderLabel(provider)} API key`
        )
      } finally {
        setPending(provider, false)
      }
    },
    [setPending, syncConfigured, setDraft]
  )

  return (
    <section className="space-y-3">
      <SearchableSetting
        title={getPromptAnalyzerTitle()}
        description={getPromptAnalyzerDescription()}
        keywords={getPromptAnalyzerSearchKeywords()}
      >
        <div className="space-y-1 py-2">
          <Label>{getPromptAnalyzerTitle()}</Label>
          <p className="text-xs text-muted-foreground">{getPromptAnalyzerDescription()}</p>
        </div>

        <div className="flex gap-1 border-b pb-1">
          {PROVIDERS.map((provider) => (
            <button
              key={provider}
              type="button"
              role="tab"
              aria-selected={activeProvider === provider}
              onClick={() => handleTabClick(provider)}
              className={`rounded-t px-3 py-1.5 text-sm font-medium transition-colors ${
                activeProvider === provider
                  ? 'bg-background text-foreground border border-b-0 border-border -mb-px'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {getProviderLabel(provider)}
            </button>
          ))}
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex items-start justify-between gap-4 py-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Label htmlFor={`prompt-analyzer-api-key-${activeProvider}`}>
                {getPromptAnalyzerApiKeyLabel(activeProvider)}
              </Label>
              <p className="text-xs text-muted-foreground">
                {getPromptAnalyzerApiKeyDescription(activeProvider)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Input
                id={`prompt-analyzer-api-key-${activeProvider}`}
                type="password"
                value={keys[activeProvider].draft}
                onChange={(event) => setDraft(activeProvider, event.target.value)}
                placeholder={keys[activeProvider].configured ? 'Saved securely' : 'Enter API key'}
                autoComplete="off"
                spellCheck={false}
                className="w-64"
              />
              <Button
                type="button"
                size="sm"
                disabled={keys[activeProvider].pending || keys[activeProvider].draft.trim() === ''}
                onClick={() => void saveApiKey(activeProvider)}
              >
                Save
              </Button>
              {keys[activeProvider].configured && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={keys[activeProvider].pending}
                  onClick={() => void clearApiKey(activeProvider)}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 py-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Label htmlFor={`prompt-analyzer-model-${activeProvider}`}>
                {getPromptAnalyzerModelLabel(activeProvider)}
              </Label>
              <p className="text-xs text-muted-foreground">
                {getPromptAnalyzerModelDescription(activeProvider)}
              </p>
            </div>
            <Input
              id={`prompt-analyzer-model-${activeProvider}`}
              value={
                settings.promptAnalyzerProviders?.[activeProvider]?.model ??
                (activeProvider === 'openrouter' ? settings.promptAnalyzerModel : '') ??
                ''
              }
              onChange={(event) =>
                updateSettings({
                  promptAnalyzerProviders: {
                    ...settings.promptAnalyzerProviders,
                    [activeProvider]: {
                      ...settings.promptAnalyzerProviders?.[activeProvider],
                      model: event.target.value
                    }
                  }
                })
              }
              placeholder={getPromptAnalyzerModelPlaceholder(activeProvider)}
              autoComplete="off"
              spellCheck={false}
              className="w-64 font-mono text-xs"
            />
          </div>

          <div className="flex items-start justify-between gap-4 py-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Label htmlFor="prompt-analyzer-temperature">{getTemperatureLabel()}</Label>
            </div>
            <div className="flex w-64 items-center gap-3">
              <Slider
                id="prompt-analyzer-temperature"
                min={0}
                max={2}
                step={0.1}
                value={[settings.promptAnalyzerTemperature ?? 0.3]}
                onValueChange={([value]) => updateSettings({ promptAnalyzerTemperature: value })}
                className="flex-1"
              />
              <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                {(settings.promptAnalyzerTemperature ?? 0.3).toFixed(1)}
              </span>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 py-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Label htmlFor="prompt-analyzer-max-tokens">{getMaxTokensLabel()}</Label>
            </div>
            <Input
              id="prompt-analyzer-max-tokens"
              type="number"
              min={1}
              max={32768}
              value={settings.promptAnalyzerMaxTokens ?? 2048}
              onChange={(event) =>
                updateSettings({
                  promptAnalyzerMaxTokens: Number.parseInt(event.target.value, 10) || 1
                })
              }
              className="w-64 font-mono text-xs"
            />
          </div>
        </div>
      </SearchableSetting>
    </section>
  )
}
