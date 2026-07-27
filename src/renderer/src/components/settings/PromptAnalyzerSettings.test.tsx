// @vitest-environment happy-dom

import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
