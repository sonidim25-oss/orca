import { existsSync } from 'node:fs'
import { findExistingPosixShellPath } from '../../shared/posix-shell-path'

const POSIX_FALLBACK_SHELL = '/bin/sh'

export function resolvePosixHookShellPath(
  env: NodeJS.ProcessEnv = process.env,
  pathExists: (candidate: string) => boolean = existsSync
): string {
  const candidates = [env.SHELL, POSIX_FALLBACK_SHELL, '/bin/bash', '/bin/zsh']
  const resolved = findExistingPosixShellPath(candidates, pathExists)
  if (resolved) {
    return resolved
  }
  // Why: wrapPosixHookCommand is called from remote SSH installers on any host
  // OS, including Windows where /bin/sh does not exist locally. The remote
  // server always has /bin/sh, so it is the safe last-resort fallback.
  return POSIX_FALLBACK_SHELL
}
