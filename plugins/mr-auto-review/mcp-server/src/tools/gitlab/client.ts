// HTTP client over the GitLab REST API. Wraps the global fetch with:
// - PRIVATE-TOKEN auth header injected from getGitlabCredentials()
// - Exponential backoff on 5xx and 429 (max 3 retries, base 500ms)
// - 30s timeout via AbortController
// - Errors that never leak the bearer token (only path and status)

import { getGitlabCredentials } from './auth.js'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface GitlabRequestOptions {
  /** Override the default timeout (ms) */
  timeoutMs?: number
  /** Override the default max retries */
  maxRetries?: number
  /** Inject a custom fetch (test seam) */
  fetchImpl?: typeof fetch
  /** Skip auth header (for tests) */
  skipAuth?: boolean
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RETRIES = 3
const RETRY_STATUS = new Set([429, 500, 502, 503, 504])

/**
 * Issues an authenticated request against the GitLab API.
 * The path is joined with the apiBase from credentials (do not include /api/v4 in the path).
 *
 * @param method - HTTP verb.
 * @param path - Path under the api base, starting with `/`.
 * @param body - Optional JSON body. Stringified internally.
 * @param opts - Optional overrides (timeout, retries, fetch injection).
 * @returns The parsed JSON response, or the raw string for non-JSON content.
 * @throws Error with status code and path when the request fails after retries.
 */
export async function gitlabRequest<T = unknown>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  opts: GitlabRequestOptions = {},
): Promise<T> {
  const creds = opts.skipAuth === true ? null : getGitlabCredentials()
  const baseUrl = creds !== null ? creds.apiBase : ''
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (creds !== null) {
    headers['PRIVATE-TOKEN'] = creds.token
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let lastErr: unknown = null
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      })
      clearTimeout(timer)

      if (response.ok) {
        const text = await response.text()
        if (text.length === 0) {
          return undefined as T
        }
        try {
          return JSON.parse(text) as T
        } catch {
          return text as T
        }
      }

      // Non-2xx: maybe retry
      if (RETRY_STATUS.has(response.status) && attempt < maxRetries) {
        await sleep(backoffMs(attempt))
        continue
      }

      // Non-retryable: throw with sanitized info
      let errText = ''
      try {
        errText = await response.text()
      } catch {
        errText = ''
      }
      throw new GitlabApiError(method, path, response.status, errText.slice(0, 500))
    } catch (err) {
      clearTimeout(timer)
      lastErr = err
      // GitlabApiError or AbortError → only retry if attempts remain and it's transient
      if (err instanceof GitlabApiError && !RETRY_STATUS.has(err.status)) {
        throw err
      }
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt))
        continue
      }
      if (err instanceof GitlabApiError) {
        throw err
      }
      throw new Error(
        `GitLab request failed after ${maxRetries + 1} attempts: ${method} ${path} — ${stringifyError(err)}`,
      )
    }
  }
  // Unreachable in practice
  throw new Error(`GitLab request exhausted retries: ${method} ${path} — ${stringifyError(lastErr)}`)
}

/** Error thrown for non-retryable or final-retry GitLab API failures. */
export class GitlabApiError extends Error {
  constructor(
    public method: HttpMethod,
    public path: string,
    public status: number,
    public bodyExcerpt: string,
  ) {
    super(`GitLab API ${method} ${path} → ${status}: ${bodyExcerpt}`)
    this.name = 'GitlabApiError'
  }
}

/**
 * Exponential backoff in milliseconds: 500, 1000, 2000 …
 *
 * @param attempt - Zero-based attempt index that just failed.
 * @returns Delay before the next attempt.
 */
function backoffMs(attempt: number): number {
  return 500 * Math.pow(2, attempt)
}

/**
 * Resolves after the given delay.
 *
 * @param ms - Delay in milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Serialises an unknown error to a short string for logging.
 *
 * @param err - Any caught value.
 * @returns A short, token-free description.
 */
function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
