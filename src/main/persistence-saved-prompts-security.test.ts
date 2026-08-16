import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testState = { dir: '' }
const cryptoState = { encryptionAvailable: true, decryptionFails: false }

vi.mock('./ssh/ssh-config-parser', () => ({
  loadUserSshConfig: vi.fn(),
  sshConfigHostsToTargets: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => testState.dir },
  safeStorage: {
    isEncryptionAvailable: () => cryptoState.encryptionAvailable,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => {
      if (cryptoState.decryptionFails) {
        throw new Error('keychain unavailable')
      }
      const decoded = ciphertext.toString('utf-8')
      if (!decoded.startsWith('encrypted:')) {
        throw new Error('invalid ciphertext')
      }
      return decoded.slice('encrypted:'.length)
    }
  }
}))

vi.mock('./telemetry/client', () => ({ track: vi.fn() }))
vi.mock('./telemetry/cohort-classifier', () => ({
  getCohortAtEmit: vi.fn().mockReturnValue({ nth_repo_added: 2 })
}))

const SAVED_PROMPTS = [
  {
    id: 'saved-prompt-1',
    originalPrompt: 'plaintext original prompt',
    improvedPrompt: 'plaintext improved prompt',
    savedAt: 1_754_000_000_000
  }
]

async function createStore() {
  vi.resetModules()
  const { Store, initDataPath } = await import('./persistence')
  initDataPath()
  return new Store()
}

function dataFile(): string {
  return join(testState.dir, 'orca-data.json')
}

function backupFile(): string {
  return `${dataFile()}.bak.0`
}

async function persistSavedPromptsAsync() {
  const store = await createStore()
  store.updateSettings({ promptAnalyzerSavedPrompts: SAVED_PROMPTS })
  vi.advanceTimersByTime(1_000)
  await store.waitForPendingWrite()
  return store
}

const posixIt = process.platform === 'win32' ? it.skip : it

describe('saved prompt persistence security', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-saved-prompts-security-'))
    cryptoState.encryptionAvailable = true
    cryptoState.decryptionFails = false
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('encrypts saved prompts on disk and decrypts them after reload', async () => {
    await persistSavedPromptsAsync()

    const raw = readFileSync(dataFile(), 'utf-8')
    const persisted = JSON.parse(raw) as {
      settings: { promptAnalyzerSavedPrompts: unknown }
    }
    expect(raw).not.toContain(SAVED_PROMPTS[0]!.originalPrompt)
    expect(raw).not.toContain(SAVED_PROMPTS[0]!.improvedPrompt)
    expect(persisted.settings.promptAnalyzerSavedPrompts).toEqual(expect.any(String))
    expect(
      Buffer.from(persisted.settings.promptAnalyzerSavedPrompts as string, 'base64').toString(
        'utf-8'
      )
    ).toContain('encrypted:')

    const reloaded = await createStore()
    expect(reloaded.getSettings().promptAnalyzerSavedPrompts).toEqual(SAVED_PROMPTS)
  })

  it('falls back to no saved prompts when safeStorage is unavailable for ciphertext', async () => {
    await persistSavedPromptsAsync()
    cryptoState.encryptionAvailable = false

    const reloaded = await createStore()

    expect(reloaded.getSettings().promptAnalyzerSavedPrompts).toEqual([])
  })

  it('falls back to no saved prompts when decryption fails', async () => {
    await persistSavedPromptsAsync()
    cryptoState.decryptionFails = true

    const reloaded = await createStore()

    expect(reloaded.getSettings().promptAnalyzerSavedPrompts).toEqual([])
  })

  it('round-trips saved prompts as JSON when encryption is unavailable during the write', async () => {
    cryptoState.encryptionAvailable = false
    await persistSavedPromptsAsync()

    const persisted = JSON.parse(readFileSync(dataFile(), 'utf-8')) as {
      settings: { promptAnalyzerSavedPrompts: string }
    }
    expect(JSON.parse(persisted.settings.promptAnalyzerSavedPrompts)).toEqual(SAVED_PROMPTS)

    const reloaded = await createStore()
    expect(reloaded.getSettings().promptAnalyzerSavedPrompts).toEqual(SAVED_PROMPTS)
  })

  posixIt('writes async settings and backup files with mode 0600', async () => {
    const previousUmask = process.umask(0)
    try {
      await persistSavedPromptsAsync()

      expect(statSync(dataFile()).mode & 0o777).toBe(0o600)
      expect(statSync(backupFile()).mode & 0o777).toBe(0o600)
    } finally {
      process.umask(previousUmask)
    }
  })

  posixIt('writes sync settings and backup files with mode 0600', async () => {
    const previousUmask = process.umask(0)
    try {
      const store = await createStore()
      store.updateSettings({ promptAnalyzerSavedPrompts: SAVED_PROMPTS })
      store.flushOrThrow()

      expect(statSync(dataFile()).mode & 0o777).toBe(0o600)
      expect(statSync(backupFile()).mode & 0o777).toBe(0o600)
    } finally {
      process.umask(previousUmask)
    }
  })
})
