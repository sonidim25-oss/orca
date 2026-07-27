// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePromptAnalyzer } from '../usePromptAnalyzer'

const mocks = vi.hoisted(() => ({
  analyzePrompt: vi.fn(),
  state: 'idle',
  error: null as string | null
}))

vi.mock('@/store', () => ({
  useAppStore: vi.fn((selector) => selector(mocks))
}))

describe('usePromptAnalyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state = 'idle'
    mocks.error = null
  })

  it('delegates analysis lifecycle ownership to the store action', async () => {
    const expected = { suggestion: 'Better', improvedPrompt: 'Better', reasoning: '' }
    mocks.analyzePrompt.mockResolvedValue(expected)
    const { result } = renderHook(() => usePromptAnalyzer())

    await expect(result.current.analyze('test prompt', { model: 'test-model' })).resolves.toBe(
      expected
    )
    expect(mocks.analyzePrompt).toHaveBeenCalledWith('test prompt', { model: 'test-model' })
  })

  it('derives processing and error state from the store', () => {
    mocks.state = 'processing'
    mocks.error = 'failed'

    const { result } = renderHook(() => usePromptAnalyzer())

    expect(result.current.isAnalyzing).toBe(true)
    expect(result.current.error).toBe('failed')
  })
})
