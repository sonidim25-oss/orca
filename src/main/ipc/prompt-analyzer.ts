import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type {
  PromptAnalyzerAnalyzeArgs,
  PromptAnalyzerAnalyzeResponse,
  SupportedProvider
} from '../../shared/prompt-analyzer-types'
import type { GlobalSettings } from '../../shared/types'
import type { Store } from '../persistence'
import {
  clearPromptAnalyzerApiKey,
  hasPromptAnalyzerApiKey,
  readPromptAnalyzerApiKey,
  savePromptAnalyzerApiKey
} from '../prompt-analyzer/api-key-store'
import { analyzeWithOpenRouter } from '../prompt-analyzer/openrouter-client'
import { isTrustedUIRenderer } from './ui'

const REQUEST_TIMEOUT_MS = 30_000
const activeRequests = new Map<number, AbortController>()

type LegacyPromptAnalyzerSettings = GlobalSettings & {
  promptAnalyzerApiKey?: string
}

function migrateLegacyApiKey(store: Store): void {
  const settings = store.getSettings() as LegacyPromptAnalyzerSettings
  const legacyApiKey = settings.promptAnalyzerApiKey?.trim()
  if ('promptAnalyzerApiKey' in settings) {
    if (legacyApiKey) {
      if (!hasPromptAnalyzerApiKey('openrouter')) {
        savePromptAnalyzerApiKey('openrouter', legacyApiKey)
      }
      store.updateSettings({
        promptAnalyzerApiKey: '***',
        promptAnalyzerApiKeyConfigured: true
      } as Partial<GlobalSettings>)
    } else {
      store.updateSettings({
        promptAnalyzerApiKey: '***',
        promptAnalyzerApiKeyConfigured: hasPromptAnalyzerApiKey('openrouter')
      } as Partial<GlobalSettings>)
    }
  } else if (settings.promptAnalyzerApiKeyConfigured !== hasPromptAnalyzerApiKey('openrouter')) {
    store.updateSettings({ promptAnalyzerApiKeyConfigured: hasPromptAnalyzerApiKey('openrouter') })
  }
}

function assertTrustedPromptAnalyzerSender(
  event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>
): void {
  if (!isTrustedUIRenderer(event)) {
    throw new Error('Unauthorized Prompt Analyzer sender')
  }
}

function readConfiguredPromptAnalyzerApiKey(provider: SupportedProvider): string | undefined {
  try {
    return readPromptAnalyzerApiKey(provider)
  } catch {
    return undefined
  }
}

function restorePromptAnalyzerApiKey(provider: SupportedProvider, apiKey: string | undefined): void {
  if (apiKey) {
    savePromptAnalyzerApiKey(provider, apiKey)
  } else {
    clearPromptAnalyzerApiKey(provider)
  }
}

function rollbackPromptAnalyzerApiKey(provider: SupportedProvider, apiKey: string | undefined, settingsError: unknown): never {
  try {
    restorePromptAnalyzerApiKey(provider, apiKey)
  } catch (rollbackError) {
    throw new AggregateError(
      [settingsError, rollbackError],
      'Prompt Analyzer settings update and credential rollback both failed'
    )
  }
  throw settingsError
}

async function analyzeWithProvider(
  args: PromptAnalyzerAnalyzeArgs,
  apiKey: string,
  signal: AbortSignal
): Promise<{ suggestion: string; improvedPrompt: string; reasoning: string }> {
  const provider = args.provider as SupportedProvider
  switch (provider) {
    case 'openrouter':
      return analyzeWithOpenRouter(args, apiKey, signal)
    case 'openai':
      return analyzeWithOpenAI(args, apiKey, signal)
    case 'anthropic':
      return analyzeWithAnthropic(args, apiKey, signal)
    case 'google_ai':
      return analyzeWithGoogleAI(args, apiKey, signal)
    default: {
      const exhaustiveCheck: never = provider
      throw new Error(`Provider ${exhaustiveCheck} is not supported`)
    }
  }
}

async function analyzeWithOpenAI(
  _args: PromptAnalyzerAnalyzeArgs,
  _apiKey: string,
  _signal: AbortSignal
): Promise<{ suggestion: string; improvedPrompt: string; reasoning: string }> {
  // TODO: Implement OpenAI client
  throw new Error('OpenAI provider not yet implemented')
}

async function analyzeWithAnthropic(
  _args: PromptAnalyzerAnalyzeArgs,
  _apiKey: string,
  _signal: AbortSignal
): Promise<{ suggestion: string; improvedPrompt: string; reasoning: string }> {
  // TODO: Implement Anthropic client
  throw new Error('Anthropic provider not yet implemented')
}

async function analyzeWithGoogleAI(
  _args: PromptAnalyzerAnalyzeArgs,
  _apiKey: string,
  _signal: AbortSignal
): Promise<{ suggestion: string; improvedPrompt: string; reasoning: string }> {
  // TODO: Implement Google AI client
  throw new Error('Google AI provider not yet implemented')
}

export function registerPromptAnalyzerHandlers(store: Store): void {
  try {
    migrateLegacyApiKey(store)
  } catch {
    console.warn('[prompt-analyzer] failed to migrate legacy API key')
  }

  ipcMain.handle('promptAnalyzer:getApiKeyStatus', (event, provider: SupportedProvider) => {
    assertTrustedPromptAnalyzerSender(event)
    return { configured: hasPromptAnalyzerApiKey(provider) }
  })
  ipcMain.handle('promptAnalyzer:analyze', async (event, args: PromptAnalyzerAnalyzeArgs) => {
    assertTrustedPromptAnalyzerSender(event)
    activeRequests.get(event.sender.id)?.abort(new Error('Request canceled'))
    const controller = new AbortController()
    activeRequests.set(event.sender.id, controller)
    const timeoutId = setTimeout(
      () => controller.abort(new Error('Request timed out')),
      REQUEST_TIMEOUT_MS
    )
    let apiKey: string | undefined
    try {
      apiKey = readPromptAnalyzerApiKey(args.provider)
      const result = await analyzeWithProvider(args, apiKey, controller.signal)
      return { ok: true, result } satisfies PromptAnalyzerAnalyzeResponse
    } catch (error) {
      const rawMessage =
        controller.signal.aborted && controller.signal.reason instanceof Error
          ? controller.signal.reason.message
          : error instanceof Error
            ? error.message
            : 'Prompt analysis failed with an unknown error'
      const message = apiKey ? rawMessage.replaceAll(apiKey, '[REDACTED]') : rawMessage
      return { ok: false, error: message } satisfies PromptAnalyzerAnalyzeResponse
    } finally {
      clearTimeout(timeoutId)
      if (activeRequests.get(event.sender.id) === controller) {
        activeRequests.delete(event.sender.id)
      }
    }
  })
  ipcMain.handle('promptAnalyzer:cancel', (event) => {
    assertTrustedPromptAnalyzerSender(event)
    activeRequests.get(event.sender.id)?.abort(new Error('Request canceled'))
  })
  ipcMain.handle('promptAnalyzer:saveApiKey', (event, provider: SupportedProvider, apiKey: string) => {
    assertTrustedPromptAnalyzerSender(event)
    const previousApiKey = readConfiguredPromptAnalyzerApiKey(provider)
    savePromptAnalyzerApiKey(provider, apiKey)
    try {
      store.updateSettings({ promptAnalyzerApiKeyConfigured: true }, { notifyListeners: true })
    } catch (error) {
      rollbackPromptAnalyzerApiKey(provider, previousApiKey, error)
    }
    return { configured: true }
  })
  ipcMain.handle('promptAnalyzer:clearApiKey', (event, provider: SupportedProvider) => {
    assertTrustedPromptAnalyzerSender(event)
    const previousApiKey = readConfiguredPromptAnalyzerApiKey(provider)
    clearPromptAnalyzerApiKey(provider)
    try {
      store.updateSettings({ promptAnalyzerApiKeyConfigured: false }, { notifyListeners: true })
    } catch (error) {
      rollbackPromptAnalyzerApiKey(provider, previousApiKey, error)
    }
    return { configured: false }
  })
}