import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { platform } from 'node:process'
import type { SupportedProvider } from '../../shared/prompt-analyzer-types'

const PROMPT_ANALYZER_API_KEY_FILE_PREFIX = 'prompt-analyzer-'
const PROMPT_ANALYZER_API_KEY_FILE_SUFFIX = '-key.enc'

function getApiKeyPath(provider: SupportedProvider): string {
  return join(homedir(), '.orca', `${PROMPT_ANALYZER_API_KEY_FILE_PREFIX}${provider}${PROMPT_ANALYZER_API_KEY_FILE_SUFFIX}`)
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
  try {
    if (provider) {
      readPromptAnalyzerApiKey(provider)
      return true
    }
    // Check if any provider has a key
    const providers: SupportedProvider[] = ['openrouter', 'openai', 'anthropic', 'google_ai']
    return providers.some(p => hasPromptAnalyzerApiKey(p))
  } catch {
    return false
  }
}

export function savePromptAnalyzerApiKey(provider: SupportedProvider, apiKey: string): void {
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
  if (provider) {
    rmSync(getApiKeyPath(provider), { force: true })
  } else {
    // Clear all provider keys
    const providers: SupportedProvider[] = ['openrouter', 'openai', 'anthropic', 'google_ai']
    for (const p of providers) {
      rmSync(getApiKeyPath(p), { force: true })
    }
  }
}