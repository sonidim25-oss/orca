import { describe, expect, it, vi } from 'vitest'
import { findExistingPosixShellPath } from './posix-shell-path'

describe('findExistingPosixShellPath', () => {
  it('returns the first existing absolute candidate', () => {
    const pathExists = vi.fn((candidate: string) => candidate === '/bin/zsh')

    expect(
      findExistingPosixShellPath(['zsh', '/missing/shell', '/bin/zsh', '/bin/sh'], pathExists)
    ).toBe('/bin/zsh')
    expect(pathExists.mock.calls.map(([candidate]) => candidate)).toEqual([
      '/missing/shell',
      '/bin/zsh'
    ])
  })

  it('returns null when no absolute candidate exists', () => {
    expect(findExistingPosixShellPath([undefined, 'bash', '/missing/bash'], () => false)).toBeNull()
  })
})
