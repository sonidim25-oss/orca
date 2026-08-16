import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { SavedPrompt } from '@/prompt-analyzer'

type SavedPromptsProps = {
  prompts: SavedPrompt[]
}

const PREVIEW_LENGTH = 120
const savedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
})

function getPreview(prompt: string): string {
  if (prompt.length <= PREVIEW_LENGTH) {
    return prompt
  }
  return `${prompt.slice(0, PREVIEW_LENGTH)}…`
}

export function SavedPrompts({ prompts }: SavedPromptsProps): React.JSX.Element | null {
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null)
  const expandedId = prompts.some((prompt) => prompt.id === expandedPromptId)
    ? expandedPromptId
    : null

  if (prompts.length === 0) {
    return null
  }

  return (
    <section className="mt-4 border-t border-prompt-analyzer-border pt-4">
      <h2 className="text-[12px] font-medium text-prompt-analyzer-muted-foreground">
        {translate('promptAnalyzer.panel.savedPrompts', 'Saved Prompts')}
      </h2>

      <ul className="mt-3 space-y-2">
        {prompts.map((prompt) => {
          const isExpanded = expandedId === prompt.id
          const detailsId = `saved-prompt-${prompt.id}`
          const titleId = `${detailsId}-title`

          return (
            <li key={prompt.id}>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  'h-auto w-full justify-between gap-3 whitespace-normal rounded-lg border border-prompt-analyzer-border px-3 py-2 text-left',
                  'bg-prompt-analyzer-muted/40 hover:bg-prompt-analyzer-accent/10'
                )}
                aria-expanded={isExpanded}
                aria-controls={detailsId}
                onClick={() => setExpandedPromptId(isExpanded ? null : prompt.id)}
              >
                <span className="min-w-0 flex-1">
                  <span
                    id={titleId}
                    className="block text-[12px] font-medium text-prompt-analyzer-foreground"
                  >
                    {getPreview(prompt.improvedPrompt)}
                  </span>
                  <span className="mt-1 block text-[11px] font-normal text-prompt-analyzer-muted-foreground">
                    {savedAtFormatter.format(prompt.savedAt)}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    'size-3.5 shrink-0 transition-transform',
                    isExpanded && 'rotate-180'
                  )}
                />
              </Button>

              {isExpanded && (
                <div id={detailsId} className="mt-2" role="region" aria-labelledby={titleId}>
                  <div className="rounded-lg border border-prompt-analyzer-border bg-prompt-analyzer-bg p-3">
                    <div className="whitespace-pre-wrap break-words text-[12px] text-prompt-analyzer-foreground">
                      {prompt.improvedPrompt}
                    </div>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
