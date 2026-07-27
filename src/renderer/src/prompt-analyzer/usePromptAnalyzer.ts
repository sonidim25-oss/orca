import { useAppStore } from '@/store'
import type { AnalyzeOptions, AnalyzeResult } from './types'

export function usePromptAnalyzer(): {
  analyze: (prompt: string, options?: AnalyzeOptions) => Promise<AnalyzeResult | null>
  isAnalyzing: boolean
  error: string | null
} {
  const isAnalyzing = useAppStore((s) => s.state === 'processing')
  const error = useAppStore((s) => s.error)
  const analyze = useAppStore((s) => s.analyzePrompt)

  return { analyze, isAnalyzing, error }
}
