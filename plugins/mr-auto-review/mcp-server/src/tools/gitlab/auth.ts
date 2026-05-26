// Extracts GitLab API credentials. Token resolution order:
//   1. Env GITLAB_TOKEN — preferred (dedicated PAT for the plugin)
//   2. Token embedded in `git remote get-url origin` (fallback)
// Host and project path always come from the remote, so the plugin keeps
// targeting the same project that the developer's working tree belongs to.
// We never log the token; only `<redacted>` shows up in errors.

import { execSync } from 'node:child_process'

export interface GitlabCredentials {
  /** API base, e.g. https://gitlab.com/api/v4 */
  apiBase: string
  /** Project path, e.g. wetaca/wetaca.com */
  projectPath: string
  /** URL-encoded project path, e.g. wetaca%2Fwetaca.com */
  projectPathEncoded: string
  /** Personal access token (glpat-...). Never log this. */
  token: string
  /** Whether the token came from env (true) or the remote URL (false). */
  tokenFromEnv: boolean
}

// Match remote URLs with an embedded token: `https://<user>:<token>@<host>/<group>/<project>.git`
// or the shorter `https://<token>@<host>/<group>/<project>.git`.
const HTTPS_WITH_TOKEN = /^https:\/\/(?:[^:@/]+:)?([^@/]+)@([^/]+)\/(.+?)(?:\.git)?$/
// Match remotes without an embedded token: `https://<host>/<group>/<project>.git`
const HTTPS_NO_TOKEN = /^https:\/\/([^@/]+)\/(.+?)(?:\.git)?$/

// Cached creds — read once per process. Tests can reset via _resetCredentialsCache.
let cached: GitlabCredentials | null = null

/**
 * Resolves credentials by combining the env token (if set) with host+project
 * from the remote. Falls back to the remote-embedded token when env is absent.
 * Throws if neither source yields a usable token.
 *
 * @returns Parsed credentials with redacted-safe accessors.
 */
export function getGitlabCredentials(): GitlabCredentials {
  if (cached !== null) {
    return cached
  }
  const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim()
  const envToken = process.env.GITLAB_TOKEN
  cached = parseGitlabRemoteUrl(url, envToken)
  return cached
}

/**
 * Parses a GitLab https remote URL and merges the env token if provided.
 * Token precedence: envToken > token embedded in url. The host and project
 * path always come from the URL.
 * Exposed for unit tests — production code should call getGitlabCredentials().
 *
 * @param url - The remote URL string (output of `git remote get-url origin`).
 * @param envToken - Optional override token (e.g. from process.env.GITLAB_TOKEN).
 * @returns Parsed credentials.
 * @throws Error when neither envToken nor the URL provide a usable PAT.
 */
export function parseGitlabRemoteUrl(url: string, envToken?: string): GitlabCredentials {
  // First try the format with an embedded token
  const withToken = HTTPS_WITH_TOKEN.exec(url)
  let host: string | undefined
  let projectPath: string | undefined
  let urlToken: string | undefined

  if (withToken) {
    urlToken = withToken[1]
    host = withToken[2]
    projectPath = withToken[3]
  } else {
    // Fall back to the tokenless format — only valid if envToken supplies the credential
    const noToken = HTTPS_NO_TOKEN.exec(url)
    if (!noToken) {
      throw new Error(
        'GitLab remote URL must be HTTPS (format: ' +
          'https://[oauth2:<token>@]<host>/<group>/<project>.git). ' +
          'Detected remote does not match.',
      )
    }
    host = noToken[1]
    projectPath = noToken[2]
  }

  if (host === undefined || projectPath === undefined) {
    throw new Error('Failed to parse GitLab remote URL components')
  }

  const useEnv = envToken !== undefined && envToken.length > 0
  const token = useEnv ? envToken : urlToken
  if (token === undefined) {
    throw new Error(
      'No GitLab token available: GITLAB_TOKEN env is unset and the remote URL has no embedded token.',
    )
  }
  if (!token.startsWith('glpat-')) {
    throw new Error('Token does not look like a GitLab PAT (expected glpat- prefix)')
  }

  return {
    apiBase: `https://${host}/api/v4`,
    projectPath,
    projectPathEncoded: encodeURIComponent(projectPath),
    token,
    tokenFromEnv: useEnv,
  }
}

/**
 * Clears the cached credentials. Used by tests to inject custom remotes.
 *
 * @param creds - Credentials to inject, or null to clear.
 */
export function _resetCredentialsCache(creds: GitlabCredentials | null): void {
  cached = creds
}
