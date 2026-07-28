import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type * as Os from 'node:os'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const safeStorageMock = vi.hoisted(() => ({
  decryptString: vi.fn((value: Buffer) => value.toString('utf8').replace(/^encrypted:/, '')),
  encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`)),
  getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
  isEncryptionAvailable: vi.fn(() => true)
}))

const platformMock = vi.hoisted(() => ({ value: 'win32' }))

let tempHome = ''

async function loadApiKeyStore() {
  vi.resetModules()
  vi.doMock('electron', () => ({ safeStorage: safeStorageMock }))
  vi.doMock('os', async () => {
    const actual = await vi.importActual<typeof Os>('os')
    return { ...actual, homedir: () => tempHome }
  })
  vi.doMock('node:process', () => ({ platform: platformMock.value }))
  return import('./api-key-store')
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'orca-prompt-analyzer-key-store-'))
  vi.clearAllMocks()
  platformMock.value = 'win32'
  safeStorageMock.decryptString.mockImplementation((value: Buffer) =>
    value.toString('utf8').replace(/^encrypted:/, '')
  )
  safeStorageMock.getSelectedStorageBackend.mockReturnValue('gnome_libsecret')
  safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
})

describe('Prompt Analyzer API key store', () => {
  it('rejects invalid providers at every credential boundary', async () => {
    const store = await loadApiKeyStore()
    const invalidProvider = '../outside' as 'openrouter'

    expect(() => store.hasPromptAnalyzerApiKey(invalidProvider)).toThrow(
      'Unsupported Prompt Analyzer provider: ../outside'
    )
    expect(() => store.savePromptAnalyzerApiKey(invalidProvider, 'secret-key')).toThrow(
      'Unsupported Prompt Analyzer provider: ../outside'
    )
    expect(() => store.readPromptAnalyzerApiKey(invalidProvider)).toThrow(
      'Unsupported Prompt Analyzer provider: ../outside'
    )
    expect(() => store.clearPromptAnalyzerApiKey(invalidProvider)).toThrow(
      'Unsupported Prompt Analyzer provider: ../outside'
    )
    expect(existsSync(join(tempHome, '.orca'))).toBe(false)
  })

  it('encrypts, reads, and clears the API key', async () => {
    const store = await loadApiKeyStore()

    store.savePromptAnalyzerApiKey('openrouter', ' secret-key ')

    expect(safeStorageMock.encryptString).toHaveBeenCalledWith('secret-key')
    expect(store.hasPromptAnalyzerApiKey('openrouter')).toBe(true)
    expect(store.readPromptAnalyzerApiKey('openrouter')).toBe('secret-key')
    expect(safeStorageMock.decryptString).toHaveBeenCalledTimes(2)

    store.clearPromptAnalyzerApiKey('openrouter')
    expect(store.hasPromptAnalyzerApiKey('openrouter')).toBe(false)
  })

  it('reads changes made by another instance', async () => {
    const store = await loadApiKeyStore()
    const apiKeyPath = join(tempHome, '.orca', 'prompt-analyzer-openrouter-key.enc')

    store.savePromptAnalyzerApiKey('openrouter', 'first-key')
    expect(store.readPromptAnalyzerApiKey('openrouter')).toBe('first-key')

    writeFileSync(apiKeyPath, Buffer.from('encrypted:second-key'))
    expect(store.readPromptAnalyzerApiKey('openrouter')).toBe('second-key')

    rmSync(apiKeyPath)
    expect(() => store.readPromptAnalyzerApiKey('openrouter')).toThrow(
      'OpenRouter API key is not configured'
    )
  })

  it('does not report an empty encrypted file as configured', async () => {
    const apiKeyDirectory = join(tempHome, '.orca')
    mkdirSync(apiKeyDirectory)
    writeFileSync(join(apiKeyDirectory, 'prompt-analyzer-openrouter-key.enc'), Buffer.alloc(0))
    const store = await loadApiKeyStore()

    expect(store.hasPromptAnalyzerApiKey('openrouter')).toBe(false)
    expect(() => store.readPromptAnalyzerApiKey('openrouter')).toThrow(
      'OpenRouter API key could not be decrypted'
    )
  })

  it('does not report an undecryptable file as configured', async () => {
    const apiKeyDirectory = join(tempHome, '.orca')
    const apiKeyPath = join(apiKeyDirectory, 'prompt-analyzer-openrouter-key.enc')
    mkdirSync(apiKeyDirectory)
    writeFileSync(apiKeyPath, 'truncated')
    safeStorageMock.decryptString.mockImplementation(() => {
      throw new Error('Invalid ciphertext')
    })
    const store = await loadApiKeyStore()

    expect(() => store.readPromptAnalyzerApiKey('openrouter')).toThrow(
      'OpenRouter API key could not be decrypted'
    )
    expect(safeStorageMock.decryptString).toHaveBeenCalledTimes(1)
  })

  it('does not persist plaintext when secure storage is unavailable', async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false)
    const store = await loadApiKeyStore()

    expect(() => store.savePromptAnalyzerApiKey('openrouter', 'secret-key')).toThrow(
      'Secure credential storage is unavailable'
    )
    expect(existsSync(join(tempHome, '.orca'))).toBe(false)
  })

  it.each(['basic_text', 'unknown'])(
    'rejects the insecure Linux %s storage backend',
    async (backend) => {
      platformMock.value = 'linux'
      safeStorageMock.getSelectedStorageBackend.mockReturnValue(backend)
      const store = await loadApiKeyStore()

      expect(store.hasPromptAnalyzerApiKey('openrouter')).toBe(false)
      expect(() => store.savePromptAnalyzerApiKey('openrouter', 'secret-key')).toThrow(
        'Secure credential storage is unavailable'
      )
      expect(existsSync(join(tempHome, '.orca'))).toBe(false)
    }
  )

  it('does not read a key through the insecure Linux basic_text backend', async () => {
    platformMock.value = 'linux'
    safeStorageMock.getSelectedStorageBackend.mockReturnValue('basic_text')
    const apiKeyDirectory = join(tempHome, '.orca')
    const apiKeyPath = join(apiKeyDirectory, 'prompt-analyzer-openrouter-key.enc')
    mkdirSync(apiKeyDirectory)
    writeFileSync(apiKeyPath, Buffer.from('encrypted:secret-key'))
    const store = await loadApiKeyStore()

    expect(() => store.readPromptAnalyzerApiKey('openrouter')).toThrow(
      'Secure credential storage is unavailable'
    )
    expect(safeStorageMock.decryptString).not.toHaveBeenCalled()
  })
})
