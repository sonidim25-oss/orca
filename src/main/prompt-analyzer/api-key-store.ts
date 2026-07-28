import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { platform } from 'node:process'
import type { SupportedProvider } from '../../shared/prompt-analyzer-types'
import {
  assertSupportedPromptAnalyzerProvider,
  SUPPORTED_PROMPT_ANALYZER_PROVIDERS
} from './supported-provider'

const PROMPT_ANALYZER_API_KEY_FILE_PREFIX = 'prompt-analyzer-'
const PROMPT_ANALYZER_API_KEY_FILE_SUFFIX = '-key.enc'

function getApiKeyPath(provider: SupportedProvider): string {
  return join(
    homedir(),
    '.orca',
    `${PROMPT_ANALYZER_API_KEY_FILE_PREFIX}${provider}${PROMPT_ANALYZER_API_KEY_FILE_SUFFIX}`
  )
}

function isSecureCredentialStorageAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) {
    return false
  }
  if (platform !== 'linux') {
    return true
  }
  const backend = safeStorage.getSelectedStorageBackend()
  return backend !== 'basic_text' && backend !== 'unknown'
}

function assertSecureCredentialStorageAvailable(): void {
  if (!isSecureCredentialStorageAvailable()) {
    throw new Error('Secure credential storage is unavailable')
  }
}

export function hasPromptAnalyzerApiKey(provider?: SupportedProvider): boolean {
  if (provider !== undefined) {
    assertSupportedPromptAnalyzerProvider(provider)
  }
  try {
    if (provider) {
      readPromptAnalyzerApiKey(provider)
      return true
    }
    return SUPPORTED_PROMPT_ANALYZER_PROVIDERS.some((candidate) =>
      hasPromptAnalyzerApiKey(candidate)
    )
  } catch {
    return false
  }
}

export function savePromptAnalyzerApiKey(provider: SupportedProvider, apiKey: string): void {
  assertSupportedPromptAnalyzerProvider(provider)
  const trimmed = apiKey.trim()
  if (!trimmed) {
    throw new Error(`${provider} API key is required`)
  }
  assertSecureCredentialStorageAvailable()

  const apiKeyPath = getApiKeyPath(provider)
  mkdirSync(join(homedir(), '.orca'), { recursive: true })
  writeFileSync(apiKeyPath, safeStorage.encryptString(trimmed), { mode: 0o600 })
}

export function readPromptAnalyzerApiKey(provider: SupportedProvider): string {
  assertSupportedPromptAnalyzerProvider(provider)
  assertSecureCredentialStorageAvailable()

  const apiKeyPath = getApiKeyPath(provider)
  if (!existsSync(apiKeyPath)) {
    throw new Error(`${provider} API key is not configured`)
  }
  try {
    const apiKey = safeStorage.decryptString(readFileSync(apiKeyPath)).trim()
    if (!apiKey) {
      throw new Error(`${provider} API key is empty`)
    }
    return apiKey
  } catch {
    throw new Error(`${provider} API key could not be decrypted`)
  }
}

export function clearPromptAnalyzerApiKey(provider?: SupportedProvider): void {
  if (provider !== undefined) {
    assertSupportedPromptAnalyzerProvider(provider)
    rmSync(getApiKeyPath(provider), { force: true })
  } else {
    for (const candidate of SUPPORTED_PROMPT_ANALYZER_PROVIDERS) {
      rmSync(getApiKeyPath(candidate), { force: true })
    }
  }
}
