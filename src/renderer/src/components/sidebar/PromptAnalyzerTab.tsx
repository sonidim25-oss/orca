import React from 'react';
import { SquarePen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import { translate } from '@/i18n/i18n';

type PromptAnalyzerTabProps = {
  className?: string;
};

export function PromptAnalyzerTab({ className }: PromptAnalyzerTabProps): React.JSX.Element {
  const isPanelOpen = useAppStore((s) => s.isPanelOpen);
  const setPanelOpen = useAppStore((s) => s.setPanelOpen);
  const originalPrompt = useAppStore((s) => s.originalPrompt);
  const improvedPrompt = useAppStore((s) => s.improvedPrompt);

  return (
    <button
      type="button"
      onClick={() => setPanelOpen(!isPanelOpen)}
      aria-expanded={isPanelOpen}
      aria-label={translate('promptAnalyzer.tab.label', 'Prompt Analyzer')}
      title={translate('promptAnalyzer.tab.tooltip', 'Open Prompt Analyzer')}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        isPanelOpen
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8',
        className
      )}
    >
      <SquarePen
        className={cn(
          'size-4 shrink-0',
          !isPanelOpen && 'text-worktree-sidebar-foreground/30'
        )}
        strokeWidth={isPanelOpen ? 2.25 : 1.75}
      />
      <span className="flex-1">
        {translate('promptAnalyzer.tab.label', 'Prompt Analyzer')}
      </span>
      {(improvedPrompt || originalPrompt) && (
        <span className="size-2 rounded-full bg-amber-500" />
      )}
    </button>
  );
}

export default PromptAnalyzerTab;
