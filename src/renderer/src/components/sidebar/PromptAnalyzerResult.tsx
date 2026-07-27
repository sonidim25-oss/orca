import { Check, Copy, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type PromptAnalyzerResultProps = {
  prompt: string
  isTruncated: boolean
  onCopy: () => void
  onCopyAndUse: () => void
  onEdit: () => void
}

export function PromptAnalyzerResult({
  prompt,
  isTruncated,
  onCopy,
  onCopyAndUse,
  onEdit
}: PromptAnalyzerResultProps): React.JSX.Element {
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-prompt-analyzer-border pt-4">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-medium text-prompt-analyzer-muted-foreground flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-prompt-analyzer-accent" strokeWidth={2} />
          {translate('promptAnalyzer.panel.improvedLabel', 'Improved Prompt')}
        </label>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onCopy}
              className="text-prompt-analyzer-muted-foreground hover:text-prompt-analyzer-accent"
            >
              <Copy className="size-4" strokeWidth={2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {translate('promptAnalyzer.panel.copyTooltip', 'Copy improved prompt')}
          </TooltipContent>
        </Tooltip>
      </div>

      <Textarea
        value={prompt}
        readOnly
        className={cn(
          'min-h-[200px] max-h-[400px] resize-y',
          'bg-prompt-analyzer-bg border-prompt-analyzer-border',
          'focus:border-prompt-analyzer-accent focus:ring-prompt-analyzer-accent/20',
          'text-prompt-analyzer-foreground'
        )}
        rows={8}
      />

      {isTruncated && (
        <p className="text-[11px] text-prompt-analyzer-muted-foreground">
          Response too large — showing first 8000 characters
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size="sm"
              onClick={onCopyAndUse}
              className="gap-1.5 bg-prompt-analyzer-accent hover:bg-prompt-analyzer-accent/90 text-prompt-analyzer-accent-foreground"
            >
              <Check className="size-3.5" strokeWidth={2} />
              <span>{translate('promptAnalyzer.panel.copy', 'Copy & Use')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {translate('promptAnalyzer.panel.copyTooltip', 'Copy to clipboard and close')}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
              <X className="size-3.5" strokeWidth={2} />
              <span>{translate('promptAnalyzer.panel.edit', 'Edit')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Edit original prompt</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
