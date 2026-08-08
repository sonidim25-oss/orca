// @vitest-environment happy-dom

import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/types'
import { PromptAnalyzerSettings } from './PromptAnalyzerSettings'

const mocks = vi.hoisted(() => ({
  getApiKeyStatus: vi.fn(),
  saveApiKey: vi.fn(),
  clearApiKey: vi.fn()
}))

vi.mock('./SearchableSetting', () => ({
  SearchableSetting: ({ children }: React.PropsWithChildren) => <>{children}</>
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))

describe('PromptAnalyzerSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getApiKeyStatus.mockResolvedValue({ configured: false })
  })

  afterEach(cleanup)

  it('persists the selected provider', () => {
    const updateSettings = vi.fn()
    Object.assign(window, {
      api: {
        promptAnalyzer: {
          getApiKeyStatus: mocks.getApiKeyStatus,
          saveApiKey: mocks.saveApiKey,
          clearApiKey: mocks.clearApiKey
        }
      }
    })

    render(
      <PromptAnalyzerSettings settings={{} as GlobalSettings} updateSettings={updateSettings} />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Anthropic' }))

    expect(updateSettings).toHaveBeenCalledWith({ promptAnalyzerProvider: 'anthropic' })
  })

  it('does not expose sampling controls', () => {
    Object.assign(window, {
      api: {
        promptAnalyzer: {
          getApiKeyStatus: mocks.getApiKeyStatus,
          saveApiKey: mocks.saveApiKey,
          clearApiKey: mocks.clearApiKey
        }
      }
    })

    render(<PromptAnalyzerSettings settings={{} as GlobalSettings} updateSettings={vi.fn()} />)

    expect(screen.queryByLabelText('Temperature')).toBeNull()
    expect(screen.queryByLabelText('Max tokens')).toBeNull()
  })

  it('stores a separate model for each provider', () => {
    Object.assign(window, {
      api: {
        promptAnalyzer: {
          getApiKeyStatus: mocks.getApiKeyStatus,
          saveApiKey: mocks.saveApiKey,
          clearApiKey: mocks.clearApiKey
        }
      }
    })

    function SettingsHarness(): React.JSX.Element {
      const [settings, setSettings] = React.useState({} as GlobalSettings)
      return (
        <PromptAnalyzerSettings
          settings={settings}
          updateSettings={(updates) => setSettings((current) => ({ ...current, ...updates }))}
        />
      )
    }

    render(<SettingsHarness />)

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }))
    fireEvent.change(screen.getByLabelText('OpenAI model'), {
      target: { value: 'gpt-4.1' }
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Anthropic' }))
    fireEvent.change(screen.getByLabelText('Anthropic model'), {
      target: { value: 'claude-sonnet-4' }
    })

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }))
    expect((screen.getByLabelText('OpenAI model') as HTMLInputElement).value).toBe('gpt-4.1')

    fireEvent.click(screen.getByRole('tab', { name: 'Anthropic' }))
    expect((screen.getByLabelText('Anthropic model') as HTMLInputElement).value).toBe(
      'claude-sonnet-4'
    )
  })

  it('ignores a stale key-status response after a newer save succeeds', async () => {
    let resolveStatus!: (value: { configured: boolean }) => void
    mocks.getApiKeyStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatus = resolve
      })
    )
    mocks.saveApiKey.mockResolvedValueOnce({ configured: true })
    Object.assign(window, {
      api: {
        promptAnalyzer: {
          getApiKeyStatus: mocks.getApiKeyStatus,
          saveApiKey: mocks.saveApiKey,
          clearApiKey: mocks.clearApiKey
        }
      }
    })

    render(
      <PromptAnalyzerSettings
        settings={{ promptAnalyzerApiKeyConfigured: false } as GlobalSettings}
        updateSettings={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('OpenRouter API key'), {
      target: { value: 'new-key' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('button', { name: 'Clear' })

    await act(async () => {
      resolveStatus({ configured: false })
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy()
  })
})
