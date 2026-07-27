import React from 'react';
import { PromptAnalyzerTab } from './PromptAnalyzerTab';
import { PromptAnalyzerPanel } from './PromptAnalyzerPanel';
import { useAppStore } from '@/store';

export function PromptAnalyzer(): React.JSX.Element {
  const isPanelOpen = useAppStore((s) => s.isPanelOpen);
  const setPanelOpen = useAppStore((s) => s.setPanelOpen);

  return (
    <>
      <PromptAnalyzerTab />
      <PromptAnalyzerPanel isOpen={isPanelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}

export default PromptAnalyzer;
