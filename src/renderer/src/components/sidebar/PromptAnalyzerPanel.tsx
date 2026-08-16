import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { toast } from 'sonner'
import { usePromptAnalyzer, DEFAULT_PROVIDER } from '@/prompt-analyzer'
import { resolveActivePromptAnalyzerModel } from '@/prompt-analyzer/resolve-active-model'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import { getProviderLabel } from '@/components/settings/prompt-analyzer-copy'
import { PROMPT_ANALYZER_PROMPT_MAX_CHARS } from '../../../../shared/prompt-analyzer-types'
import { PromptAnalyzerResult } from './PromptAnalyzerResult'
import { SavedPrompts } from './SavedPrompts'

const PANEL_WIDTH = 420
const IMPROVED_PROMPT_DISPLAY_LIMIT = 8000
const HINT_ITEMS: readonly [string, string][] = [
  ['promptAnalyzer.panel.hint1', 'Paste your draft prompt for any coding agent'],
  ['promptAnalyzer.panel.hint2', 'Click Improve to clarify and structure it'],
  ['promptAnalyzer.panel.hint3', 'Copy the result and paste into any terminal']
]
const PROVIDER_WARNING =
  'Prompts are sent to a third-party AI provider. Avoid pasting sensitive data (API keys, tokens, passwords).'

type PromptAnalyzerPanelProps = {
  isOpen: boolean
  onClose: () => void
}

export function PromptAnalyzerPanel({
  isOpen,
  onClose
}: PromptAnalyzerPanelProps): React.JSX.Element | null {
  const state = useAppStore((s) => s.state)
  const hasWarned = useAppStore((s) => s.hasWarned)
  const originalPrompt = useAppStore((s) => s.originalPrompt)
  const improvedPrompt = useAppStore((s) => s.improvedPrompt)
  const lastSuccessfulResult = useAppStore((s) => s.lastSuccessfulResult)
  const savedPrompts = useAppStore((s) => s.savedPrompts)
  const activePromptAnalyzerModel = useAppStore((s) => s.activePromptAnalyzerModel)
  const error = useAppStore((s) => s.error)
  const settings = useAppStore((s) => s.settings)
  const updatePrompt = useAppStore((s) => s.updatePrompt)
  const setHasWarned = useAppStore((s) => s.setHasWarned)
  const reportMissingApiKey = useAppStore((s) => s.reportMissingApiKey)
  const dismissResult = useAppStore((s) => s.dismissResult)
  const savePromptLocally = useAppStore((s) => s.savePromptLocally)
  const hydrateSavedPrompts = useAppStore((s) => s.hydrateSavedPrompts)

  const { analyze } = usePromptAnalyzer()
  const confirm = useConfirmationDialog()
  const [isWarningOpen, setIsWarningOpen] = useState(false)
  const [activeApiKeyConfigured, setActiveApiKeyConfigured] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const activeProvider = settings?.promptAnalyzerProvider ?? DEFAULT_PROVIDER
  const activeModel = activePromptAnalyzerModel ?? resolveActivePromptAnalyzerModel(settings)
  const resultPrompt = improvedPrompt || lastSuccessfulResult?.improvedPrompt || ''
  const displayedImprovedPrompt = resultPrompt.slice(0, IMPROVED_PROMPT_DISPLAY_LIMIT)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const getApiKeyStatus = window.api?.promptAnalyzer?.getApiKeyStatus
    if (!getApiKeyStatus) {
      setActiveApiKeyConfigured(settings?.promptAnalyzerApiKeyConfigured === true)
      return
    }

    let cancelled = false
    setActiveApiKeyConfigured(false)
    void getApiKeyStatus(activeProvider)
      .then(({ configured }) => {
        if (!cancelled) {
          setActiveApiKeyConfigured(configured)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [activeProvider, isOpen, settings?.promptAnalyzerApiKeyConfigured])

  // Focus textarea on open
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isOpen])

  // Hydrate saved prompts from persisted settings when panel opens
  useEffect(() => {
    if (isOpen) {
      hydrateSavedPrompts()
    }
  }, [isOpen, hydrateSavedPrompts])

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (!isOpen) {
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  // Handle escape key to close
  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isWarningOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isWarningOpen, onClose])

  async function handleImprove(): Promise<void> {
    const prompt = originalPrompt.slice(0, PROMPT_ANALYZER_PROMPT_MAX_CHARS)
    if (!prompt.trim()) {
      return
    }

    if (!activeApiKeyConfigured) {
      reportMissingApiKey(activeProvider)
      toast.error(`Missing ${getProviderLabel(activeProvider)} API Key`, {
        description: 'Add your API key in Settings > Prompt Analyzer'
      })
      return
    }

    if (!hasWarned) {
      setIsWarningOpen(true)
      const confirmed = await confirm({
        title: 'Before you send',
        description: PROVIDER_WARNING,
        confirmLabel: 'Send prompt'
      })
      setIsWarningOpen(false)
      if (!confirmed) {
        return
      }
      setHasWarned(true)
    }

    try {
      const result = await analyze(prompt)

      if (!result) {
        return
      }

      toast.success('Prompt improved', {
        description: 'Click Copy to use it in any agent terminal'
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to improve prompt'
      toast.error('Improvement failed', { description: message })
    }
  }

  const handleCopy = useCallback(
    async (onCopied?: () => void) => {
      const text = resultPrompt || originalPrompt
      if (!text) {
        return
      }

      try {
        // Use Electron's clipboard IPC (works in Electron context) with fallback
        if (window.api?.ui?.writeClipboardText) {
          await window.api.ui.writeClipboardText(text)
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
        } else {
          throw new Error('No clipboard API available')
        }
        toast.success('Copied!', { description: 'Paste into any agent terminal' })
        onCopied?.()
      } catch {
        toast.error('Copy failed', { description: 'Could not access clipboard' })
      }
    },
    [resultPrompt, originalPrompt]
  )

  const handleSave = useCallback(() => {
    if (!resultPrompt) {
      return
    }

    savePromptLocally()
    toast.success(translate('promptAnalyzer.panel.savedToast', 'Prompt saved'), {
      description: translate(
        'promptAnalyzer.panel.savedToastDescription',
        'Saved in Prompt Analyzer — persists across sessions'
      )
    })
  }, [resultPrompt, savePromptLocally])

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updatePrompt(e.target.value.slice(0, PROMPT_ANALYZER_PROMPT_MAX_CHARS))
    },
    [updatePrompt]
  )

  if (!isOpen) {
    return null
  }

  const isProcessing = state === 'processing'
  const hasResult = Boolean(resultPrompt)
  const isImprovedPromptTruncated = resultPrompt.length > IMPROVED_PROMPT_DISPLAY_LIMIT

  return (
    <div
      className={cn(
        'fixed top-0 right-0 z-50 h-dvh flex flex-col bg-prompt-analyzer-bg border-l border-prompt-analyzer-border',
        'transition-transform duration-200 ease-out',
        isOpen ? 'translate-x-0' : 'translate-x-full',
        'shadow-[0_0_0_9999px_rgba(0,0,0,0.3)]'
      )}
      style={{ width: PANEL_WIDTH }}
      role="dialog"
      aria-modal="true"
      aria-label={translate('promptAnalyzer.panel.title', 'Prompt Analyzer')}
    >
      {/* Overlay backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel content */}
      <div className="relative flex flex-col h-full w-full bg-prompt-analyzer-surface mt-10">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-prompt-analyzer-border px-4">
          <div className="flex items-center gap-2" />

          <div className="flex items-center gap-2">
            {activeModel && (
              <Badge
                variant="outline"
                className="h-7 border-prompt-analyzer-border bg-prompt-analyzer-surface px-2 py-0 text-[16px] font-normal leading-none text-prompt-analyzer-muted-foreground"
              >
                {activeModel}
              </Badge>
            )}
            {state === 'error' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-destructive">
                    <AlertCircle className="size-3" />
                    <span className="text-[11px]">Error</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left">{error || 'Unknown error'}</TooltipContent>
              </Tooltip>
            )}

            {/* Close button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-prompt-analyzer-muted-foreground hover:bg-prompt-analyzer-accent hover:text-prompt-analyzer-accent-foreground transition-colors"
                  aria-label={translate('promptAnalyzer.panel.close', 'Close panel')}
                >
                  <X className="size-4" strokeWidth={2} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">Close</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Content */}
        <div className="scrollbar-sleek flex-1 overflow-y-auto p-4">
          {/* Title */}
          <h1 className="text-lg font-semibold text-prompt-analyzer-foreground">
            {translate('promptAnalyzer.panel.title', 'Prompt Analyzer')}
          </h1>

          {/* Textarea */}
          <div className="flex flex-col gap-3 mt-4">
            <label className="text-[12px] font-medium text-prompt-analyzer-muted-foreground">
              {translate('promptAnalyzer.panel.promptLabel', 'Your Prompt')}
            </label>

            <Textarea
              ref={textareaRef}
              value={originalPrompt.slice(0, PROMPT_ANALYZER_PROMPT_MAX_CHARS)}
              onChange={handlePromptChange}
              placeholder={translate(
                'promptAnalyzer.panel.placeholder',
                'Paste or write your prompt for a coding agent...'
              )}
              disabled={isProcessing}
              maxLength={PROMPT_ANALYZER_PROMPT_MAX_CHARS}
              className={cn(
                'scrollbar-sleek min-h-[312px] max-h-[624px] resize-y',
                'bg-prompt-analyzer-bg border-prompt-analyzer-border',
                'focus:border-prompt-analyzer-accent focus:ring-prompt-analyzer-accent/20',
                isProcessing && 'opacity-60 cursor-wait'
              )}
              rows={16}
            />

            {/* Error message */}
            {state === 'error' && error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[12px]">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 pt-2">
              <div className="flex-1" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={onClose} className="gap-1.5">
                    <X className="size-3.5" strokeWidth={2} />
                    <span>{translate('promptAnalyzer.panel.cancel', 'Cancel')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Close without saving</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isProcessing ? 'outline' : 'default'}
                    size="sm"
                    onClick={handleImprove}
                    disabled={
                      isProcessing ||
                      isWarningOpen ||
                      !originalPrompt.trim() ||
                      !activeModel ||
                      !activeApiKeyConfigured
                    }
                    className={cn(
                      'gap-1.5',
                      isProcessing &&
                        'bg-prompt-analyzer-accent/10 border-prompt-analyzer-accent/30 text-prompt-analyzer-accent'
                    )}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
                        <span>{translate('promptAnalyzer.panel.improving', 'Improving...')}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5" strokeWidth={2} />
                        <span>{translate('promptAnalyzer.panel.improve', 'Improve')}</span>
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {translate('promptAnalyzer.panel.improveTooltip', 'Send to AI for improvement')}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Improved Prompt Section */}
          {hasResult && (
            <PromptAnalyzerResult
              prompt={displayedImprovedPrompt}
              isTruncated={isImprovedPromptTruncated}
              onCopyAndUse={() => void handleCopy(onClose)}
              onSave={handleSave}
              onEdit={dismissResult}
            />
          )}

          <SavedPrompts prompts={savedPrompts} />

          {/* Empty state / hint */}
          {!originalPrompt && !hasResult && (
            <div className="mt-4 p-4 rounded-lg bg-prompt-analyzer-accent/5 border border-prompt-analyzer-accent/20">
              <div className="flex items-start gap-2">
                <Sparkles
                  className="size-4 shrink-0 text-prompt-analyzer-accent mt-0.5"
                  strokeWidth={2}
                />
                <div className="text-[12px] text-prompt-analyzer-muted-foreground">
                  <p className="font-medium text-prompt-analyzer-foreground mb-1">
                    {translate('promptAnalyzer.panel.hintTitle', 'How it works')}
                  </p>
                  <ul className="space-y-1 text-[11px]">
                    {HINT_ITEMS.map(([hintKey, hintText]) => (
                      <li key={hintKey}>•{translate(hintKey, hintText)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
