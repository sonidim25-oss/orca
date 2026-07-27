import { existsSync } from 'node:fs'
import { posix } from 'node:path'

export function findExistingPosixShellPath(
  candidates: readonly (string | null | undefined)[],
  pathExists: (candidate: string) => boolean = existsSync
): string | null {
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (candidate && !seen.has(candidate) && posix.isAbsolute(candidate) && pathExists(candidate)) {
      return candidate
    }
    if (candidate) {
      seen.add(candidate)
    }
  }
  return null
}
