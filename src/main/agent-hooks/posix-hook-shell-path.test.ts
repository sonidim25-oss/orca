import { describe, expect, it } from 'vitest'
import { resolvePosixHookShellPath } from './posix-hook-shell-path'

describe('resolvePosixHookShellPath', () => {
  it('prefers an existing SHELL before validated system fallbacks', () => {
    expect(
      resolvePosixHookShellPath({ SHELL: '/opt/bin/fish' }, (candidate) =>
        ['/opt/bin/fish', '/bin/sh'].includes(candidate)
      )
    ).toBe('/opt/bin/fish')
  })

  it('tries sh, bash, then zsh and falls back to /bin/sh when none exist locally', () => {
    expect(resolvePosixHookShellPath({}, (candidate) => candidate === '/bin/bash')).toBe(
      '/bin/bash'
    )
    expect(resolvePosixHookShellPath({}, () => false)).toBe('/bin/sh')
  })
})
