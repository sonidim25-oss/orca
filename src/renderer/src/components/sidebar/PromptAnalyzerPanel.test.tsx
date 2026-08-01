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
      promptAnalyzerModel: 'test-model'
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
  usePromptAnalyzer: () => ({ analyze: mocks.analyze })
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
    mocks.analyze.mockResolvedValue(null)
    mocks.saveDownloadedFile.mockResolvedValue({ canceled: true })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        fs: {
          saveDownloadedFile: mocks.saveDownloadedFile
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

  it('saves the improved prompt with a sensible default filename', async () => {
    mocks.saveDownloadedFile.mockResolvedValue({
      canceled: false,
      destinationPath: 'C:\\prompts\\improved-prompt.md'
    })
    renderResult()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() =>
      expect(mocks.saveDownloadedFile).toHaveBeenCalledWith({
        suggestedName: 'improved-prompt.md',
        content: 'Improved prompt content',
        encoding: 'utf8'
      })
    )
    expect(mocks.successToast).toHaveBeenCalledWith('Prompt saved', {
      description: 'Saved to C:\\prompts\\improved-prompt.md'
    })
  })

  it('does nothing when saving is canceled', async () => {
    renderResult()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(mocks.saveDownloadedFile).toHaveBeenCalledOnce())
    expect(mocks.successToast).not.toHaveBeenCalled()
    expect(mocks.errorToast).not.toHaveBeenCalled()
  })

  it('reports a save failure', async () => {
    mocks.saveDownloadedFile.mockRejectedValue(new Error('Disk full'))
    renderResult()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() =>
      expect(mocks.errorToast).toHaveBeenCalledWith('Save failed', {
        description: 'Disk full'
      })
    )
    expect(mocks.successToast).not.toHaveBeenCalled()
  })
})
