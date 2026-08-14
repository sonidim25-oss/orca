// @vitest-environment happy-dom

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PromptAnalyzerPanel } from './PromptAnalyzerPanel'

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  confirm: vi.fn(),
  errorToast: vi.fn(),
  saveDownloadedFile: vi.fn(),
  successToast: vi.fn(),
  getApiKeyStatus: vi.fn(),
  writeClipboardText: vi.fn(),
  state: {
    state: 'idle',
    hasWarned: true,
    originalPrompt: 'Improve this prompt',
    improvedPrompt: '',
    lastSuccessfulResult: null as {
      originalPrompt: string
      improvedPrompt: string
    } | null,
    error: null as string | null,
    settings: {
      promptAnalyzerApiKeyConfigured: true,
      promptAnalyzerModel: undefined as string | undefined,
      promptAnalyzerProvider: undefined as
        | 'openrouter'
        | 'openai'
        | 'anthropic'
        | 'google_ai'
        | undefined,
      promptAnalyzerProviders: undefined as
        | Partial<Record<'openrouter' | 'openai' | 'anthropic' | 'google_ai', { model?: string }>>
        | undefined
    },
    updatePrompt: vi.fn(),
    setHasWarned: vi.fn(),
    reportMissingApiKey: vi.fn(),
    dismissResult: vi.fn()
  }
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    vi.fn((selector) => selector(mocks.state)),
    {
      getState: vi.fn(() => mocks.state)
    }
  )
}))

vi.mock('@/prompt-analyzer', () => ({
  usePromptAnalyzer: () => ({ analyze: mocks.analyze }),
  DEFAULT_PROVIDER: 'openrouter'
}))

vi.mock('@/components/confirmation-dialog', () => ({
  useConfirmationDialog: () => mocks.confirm
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => children,
  TooltipContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  TooltipTrigger: ({ children }: React.PropsWithChildren) => children
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('sonner', () => ({
  toast: { success: mocks.successToast, error: mocks.errorToast }
}))

function renderResult(): void {
  mocks.state.state = 'success'
  mocks.state.improvedPrompt = 'Improved prompt content'
  render(<PromptAnalyzerPanel isOpen onClose={vi.fn()} />)
}

describe('PromptAnalyzerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.state = 'idle'
    mocks.state.hasWarned = true
    mocks.state.originalPrompt = 'Improve this prompt'
    mocks.state.improvedPrompt = ''
    mocks.state.lastSuccessfulResult = null
    mocks.state.error = null
    mocks.state.settings.promptAnalyzerApiKeyConfigured = true
    mocks.state.settings.promptAnalyzerModel = undefined
    mocks.state.settings.promptAnalyzerProvider = undefined
    mocks.state.settings.promptAnalyzerProviders = undefined
    mocks.analyze.mockResolvedValue(null)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        fs: {
          saveDownloadedFile: mocks.saveDownloadedFile
        },
        ui: {
          writeClipboardText: mocks.writeClipboardText
        }
      }
    })
  })

  afterEach(() => {
    cleanup()
    document.body.style.overflow = ''
  })

  it('does not turn an intentionally invalidated request into an empty-response error', async () => {
    render(<PromptAnalyzerPanel isOpen onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Improve' }))

    await vi.waitFor(() => expect(mocks.analyze).toHaveBeenCalledWith('Improve this prompt'))
    expect(mocks.errorToast).not.toHaveBeenCalled()
  })

  it('shows the effective model name in the header', () => {
    mocks.state.settings.promptAnalyzerProvider = 'anthropic'
    mocks.state.settings.promptAnalyzerProviders = {
      anthropic: { model: '  claude-sonnet-4  ' }
    }

    const { container } = render(<PromptAnalyzerPanel isOpen onClose={vi.fn()} />)

    const badge = container.querySelector('[data-slot="badge"]')
    expect(badge?.textContent).toBe('claude-sonnet-4')
  })

  it('updates the model badge when settings change', () => {
    mocks.state.settings.promptAnalyzerProvider = 'anthropic'
    mocks.state.settings.promptAnalyzerProviders = {
      anthropic: { model: 'claude-sonnet-4' }
    }
    const { container, rerender } = render(<PromptAnalyzerPanel isOpen onClose={vi.fn()} />)

    mocks.state.settings.promptAnalyzerProvider = 'openai'
    mocks.state.settings.promptAnalyzerProviders = { openai: { model: 'gpt-5' } }
    rerender(<PromptAnalyzerPanel isOpen onClose={vi.fn()} />)

    const badge = container.querySelector('[data-slot="badge"]')
    expect(badge?.textContent).toBe('gpt-5')
  })

  it('hides the model badge when the active model is not configured', () => {
    mocks.state.settings.promptAnalyzerProvider = 'anthropic'

    const { container } = render(<PromptAnalyzerPanel isOpen onClose={vi.fn()} />)

    expect(container.querySelector('[data-slot="badge"]')).toBeNull()
  })

  it('disables Improve when the active provider has no API key', async () => {
    mocks.state.settings.promptAnalyzerApiKeyConfigured = true
    mocks.state.settings.promptAnalyzerProvider = 'openai'
    mocks.getApiKeyStatus.mockResolvedValue({ configured: false })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        promptAnalyzer: { getApiKeyStatus: mocks.getApiKeyStatus },
        ui: { writeClipboardText: mocks.writeClipboardText }
      }
    })

    render(<PromptAnalyzerPanel isOpen onClose={vi.fn()} />)

    const improveButton = screen.getByRole('button', { name: 'Improve' }) as HTMLButtonElement
    await vi.waitFor(() => expect(mocks.getApiKeyStatus).toHaveBeenCalledWith('openai'))
    expect(improveButton.disabled).toBe(true)
    fireEvent.click(improveButton)
    expect(mocks.analyze).not.toHaveBeenCalled()
  })

  it('enables Improve when the active provider has an API key', async () => {
    mocks.state.settings.promptAnalyzerApiKeyConfigured = false
    mocks.state.settings.promptAnalyzerProvider = 'openai'
    mocks.getApiKeyStatus.mockResolvedValue({ configured: true })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        promptAnalyzer: { getApiKeyStatus: mocks.getApiKeyStatus },
        ui: { writeClipboardText: mocks.writeClipboardText }
      }
    })

    render(<PromptAnalyzerPanel isOpen onClose={vi.fn()} />)

    const improveButton = screen.getByRole('button', { name: 'Improve' }) as HTMLButtonElement
    await vi.waitFor(() => expect(improveButton.disabled).toBe(false))
    fireEvent.click(improveButton)
    await vi.waitFor(() => expect(mocks.analyze).toHaveBeenCalledWith('Improve this prompt'))
  })

  it('only owns the body scroll lock while the panel is open', () => {
    document.body.style.overflow = 'scroll'
    const { rerender } = render(<PromptAnalyzerPanel isOpen={false} onClose={vi.fn()} />)

    expect(document.body.style.overflow).toBe('scroll')

    rerender(<PromptAnalyzerPanel isOpen onClose={vi.fn()} />)
    expect(document.body.style.overflow).toBe('hidden')

    rerender(<PromptAnalyzerPanel isOpen={false} onClose={vi.fn()} />)
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('renders the retained result when a later improvement fails', () => {
    mocks.state.state = 'error'
    mocks.state.originalPrompt = 'Failed original'
    mocks.state.error = 'Provider failed'
    mocks.state.lastSuccessfulResult = {
      originalPrompt: 'Previous original',
      improvedPrompt: 'Previous improvement'
    }

    render(<PromptAnalyzerPanel isOpen onClose={vi.fn()} />)

    expect(screen.getByDisplayValue('Previous improvement')).toBeTruthy()
    expect(screen.queryByText('How it works')).toBeNull()
  })

  it('copies the complete improved prompt while capping the displayed result', async () => {
    const fullPrompt = `${'a'.repeat(8000)}complete-copy-tail`
    mocks.state.state = 'success'
    mocks.state.improvedPrompt = fullPrompt

    render(<PromptAnalyzerPanel isOpen onClose={vi.fn()} />)

    expect(screen.getByDisplayValue('a'.repeat(8000))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copy & Use' }))

    await vi.waitFor(() => expect(mocks.writeClipboardText).toHaveBeenCalledWith(fullPrompt))
  })

  it('offers Copy & Use as the sole copy affordance', () => {
    renderResult()

    expect(screen.getByRole('button', { name: 'Copy & Use' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '' })).toBeNull()
  })

  it('saves the complete retained result and shows its destination', async () => {
    const fullPrompt = `${'b'.repeat(8000)}complete-save-tail`
    mocks.state.state = 'error'
    mocks.state.lastSuccessfulResult = {
      originalPrompt: 'Previous original',
      improvedPrompt: fullPrompt
    }
    mocks.saveDownloadedFile.mockResolvedValue({
      canceled: false,
      destinationPath: 'C:\\prompts\\improved-prompt.md'
    })

    render(<PromptAnalyzerPanel isOpen onClose={vi.fn()} />)

    expect(screen.getByDisplayValue('b'.repeat(8000))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() =>
      expect(mocks.saveDownloadedFile).toHaveBeenCalledWith({
        suggestedName: 'improved-prompt.md',
        content: fullPrompt,
        encoding: 'utf8'
      })
    )
    expect(mocks.successToast).toHaveBeenCalledWith('Prompt saved', {
      description: 'Saved to C:\\prompts\\improved-prompt.md'
    })
    expect(mocks.state.updatePrompt).not.toHaveBeenCalled()
    expect(mocks.state.dismissResult).not.toHaveBeenCalled()
  })

  it('leaves the result unchanged when saving is canceled', async () => {
    renderResult()
    mocks.saveDownloadedFile.mockResolvedValue({ canceled: true })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(mocks.saveDownloadedFile).toHaveBeenCalledOnce())
    expect(mocks.successToast).not.toHaveBeenCalled()
    expect(mocks.errorToast).not.toHaveBeenCalled()
    expect(mocks.state.updatePrompt).not.toHaveBeenCalled()
    expect(mocks.state.dismissResult).not.toHaveBeenCalled()
  })

  it('shows the error message when saving fails', async () => {
    renderResult()
    mocks.saveDownloadedFile.mockRejectedValue(new Error('Disk is full'))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() =>
      expect(mocks.errorToast).toHaveBeenCalledWith('Save failed', {
        description: 'Disk is full'
      })
    )
    expect(mocks.successToast).not.toHaveBeenCalled()
  })
})
