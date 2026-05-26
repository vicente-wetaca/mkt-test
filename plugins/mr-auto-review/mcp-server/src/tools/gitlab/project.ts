// Project-path helpers. Most GitLab endpoints want the project ID URL-encoded
// (e.g. `wetaca%2Fwetaca.com`). Wraps getGitlabCredentials() so call sites stay terse.

import { getGitlabCredentials } from './auth.js'

/**
 * Returns the URL-encoded project path suitable for GitLab API paths.
 *
 * @returns e.g. `wetaca%2Fwetaca.com`.
 */
export function getProjectPathEncoded(): string {
  return getGitlabCredentials().projectPathEncoded
}

/**
 * Returns the unencoded project path.
 *
 * @returns e.g. `wetaca/wetaca.com`.
 */
export function getProjectPath(): string {
  return getGitlabCredentials().projectPath
}
