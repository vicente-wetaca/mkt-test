// Workspace path resolution: maps a ticketId to its .dev/MR-auto-review/<ticketId>/ directory.

import { execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

// Cached repo root — computed once at module load time
let cachedRepoRoot: string | null = null

/**
 * Returns the absolute path to the git repository root.
 * Cached after the first call for the lifetime of the process.
 *
 * @returns Absolute path to the repo root.
 * @throws Error when not inside a git repository.
 */
export function getRepoRoot(): string {
  if (cachedRepoRoot !== null) {
    return cachedRepoRoot
  }
  const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
  cachedRepoRoot = fs.realpathSync(root)
  return cachedRepoRoot
}

/**
 * Returns the absolute path to the workspace base directory for a given ticket.
 * The directory is NOT created by this function — callers are responsible.
 *
 * @param ticketId - A ticket identifier matching ^WET-\d+$ or ^local-[a-z0-9-]+$.
 * @returns Absolute path: <repoRoot>/.dev/MR-auto-review/<ticketId>/
 */
export function getWorkspaceBase(ticketId: string): string {
  const repoRoot = getRepoRoot()
  return path.join(repoRoot, '.dev', 'MR-auto-review', ticketId)
}

/**
 * Resets the cached repo root. Used in tests to inject a custom root.
 *
 * @param root - An absolute path to use as the repo root, or null to clear the cache.
 */
export function _resetRepoRootCache(root: string | null): void {
  cachedRepoRoot = root
}
