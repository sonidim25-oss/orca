import { execFileSync } from 'node:child_process'
import { platform } from 'node:process'
import { getIcaclsExePath, resolveCurrentWindowsIdentity } from '../win32-utils'

export function restrictPromptAnalyzerApiKeyDirectory(apiKeyDirectory: string): void {
  if (platform !== 'win32') {
    return
  }

  const identity = resolveCurrentWindowsIdentity()
  if (!identity) {
    throw new Error('Could not resolve the current Windows user for API key storage')
  }

  // Why: POSIX modes are ignored on Windows, so inherited grants must be removed explicitly.
  execFileSync(
    getIcaclsExePath(),
    [apiKeyDirectory, '/inheritance:r', '/grant:r', `${identity}:(OI)(CI)(F)`],
    { stdio: 'ignore', windowsHide: true, timeout: 10_000 }
  )
}
