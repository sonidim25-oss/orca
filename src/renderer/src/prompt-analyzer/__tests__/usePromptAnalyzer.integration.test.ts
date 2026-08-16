// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { useAppStore } from '@/store'
import { usePromptAnalyzer } from '../usePromptAnalyzer'
import type { AnalyzeResult } from '../types'

const analyze = vi.fn()
const cancel = vi.fn()

describe('Prompt Analyzer Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cancel.mockResolvedValue(undefined)
    useAppStore.getState().reset()
    useAppStore.setState({ settings: null })
    Object.assign(window, {
      api: { promptAnalyzer: { analyze, cancel } }
    })
  })

  it('flows from settings through the IPC analysis boundary', async () => {
    useAppStore.setState({
      settings: {
        promptAnalyzerApiKeyConfigured: true,
        promptAnalyzerModel: 'test-model'
      } as Partial<GlobalSettings> as GlobalSettings
    })
    analyze.mockResolvedValue({
      ok: true,
      result: {
        suggestion: 'Integration test suggestion',
        improvedPrompt: 'Integration test suggestion',
        reasoning: ''
      }
    })

    const { result } = renderHook(() => usePromptAnalyzer())
    await expect(result.current.analyze('Test prompt')).resolves.toMatchObject({
      improvedPrompt: 'Integration test suggestion'
    })

    expect(analyze).toHaveBeenCalledWith({
      prompt: 'Test prompt',
      provider: 'openrouter',
      model: 'test-model'
    })
    expect(useAppStore.getState().improvedPrompt).toBe('Integration test suggestion')
    expect(useAppStore.getState().state).toBe('success')
  })

  it('fails correctly when main reports a missing credential', async () => {
    analyze.mockResolvedValue({ ok: false, error: 'Prompt analyzer is not configured' })
    const { result } = renderHook(() => usePromptAnalyzer())

    await expect(result.current.analyze('Test prompt', { model: 'test-model' })).rejects.toThrow(
      'Prompt analyzer is not configured'
    )
    expect(useAppStore.getState().state).toBe('error')
    expect(useAppStore.getState().error).toBe('Prompt analyzer is not configured')
  })

  it('prevents store mutation for a stale request', async () => {
    useAppStore.setState({
      settings: {
        promptAnalyzerApiKeyConfigured: true,
        promptAnalyzerModel: 'test-model'
      } as Partial<GlobalSettings> as GlobalSettings
    })
    let resolveAnalyze!: (value: { ok: true; result: AnalyzeResult }) => void
    analyze.mockReturnValue(
      new Promise((resolve) => {
        resolveAnalyze = resolve
      })
    )
    const { result } = renderHook(() => usePromptAnalyzer())

    let analyzePromise!: Promise<AnalyzeResult | null>
    act(() => {
      analyzePromise = result.current.analyze('Test prompt')
    })
    await vi.waitFor(() => expect(useAppStore.getState().state).toBe('processing'))
    act(() => {
      useAppStore.setState({ requestId: 999 })
    })
    resolveAnalyze({
      ok: true,
      result: { suggestion: 'Stale', improvedPrompt: 'Stale', reasoning: '' }
    })

    await expect(analyzePromise).resolves.toBeNull()
    expect(useAppStore.getState().improvedPrompt).toBe('')
    expect(useAppStore.getState().error).toBeNull()
  })
})
