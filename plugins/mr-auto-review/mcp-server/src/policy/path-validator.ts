// Security-critical path validator: prevents traversal attacks on the workspace sandbox.
// All tools that accept user-supplied file paths MUST call validateInWorkspace before
// performing any filesystem operation.

import fs from 'node:fs'
import path from 'node:path'

/**
 * Thrown when a candidate path resolves outside the allowed workspace root,
 * or when the input contains forbidden byte sequences.
 */
export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathTraversalError'
  }
}

/**
 * Resolves symlinks for an absolute path that may not fully exist on disk.
 * Walks up to the deepest existing ancestor, calls realpathSync on it, then
 * re-appends the non-existent tail segments. This handles macOS /var -> /private/var
 * even when the workspace directory has not been created yet.
 *
 * @param absPath - An absolute path (may not exist on disk).
 * @returns Resolved real path with symlinks expanded.
 */
function realpathMaybeNew(absPath: string): string {
  let current = absPath
  const tail: Array<string> = []

  // Walk up until we find an existing ancestor
  while (current !== path.sep && current !== path.dirname(current)) {
    try {
      const real = fs.realpathSync(current)
      // Re-attach non-existent tail segments
      if (tail.length === 0) return real
      return path.join(real, ...tail.reverse())
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException
      if (nodeErr.code !== 'ENOENT') throw err
      tail.push(path.basename(current))
      current = path.dirname(current)
    }
  }

  // Reached filesystem root without finding an existing ancestor — return as-is
  return absPath
}

/**
 * Validates that a candidate path resolves safely inside the workspace root.
 *
 * @param workspaceRoot - Absolute path to the workspace directory.
 *                        Must be absolute; throws a plain Error if not.
 *                        The function internally resolves symlinks in the root
 *                        (e.g. macOS /var -> /private/var) before comparing.
 *                        The workspace directory itself may not exist yet.
 * @param candidatePath - Relative (or absolute) path supplied by the caller.
 *                        May be a new (not-yet-existing) leaf file.
 * @returns The resolved absolute path when it is confirmed safe.
 * @throws PathTraversalError when the resolved path escapes the workspace.
 * @throws Error when workspaceRoot is not absolute.
 */
export function validateInWorkspace(workspaceRoot: string, candidatePath: string): string {
  // Assert workspace root is absolute — caller contract
  if (!path.isAbsolute(workspaceRoot)) {
    throw new Error(`workspaceRoot must be an absolute path, got: ${workspaceRoot}`)
  }

  // Reject NUL bytes — these can be used to confuse some C-level path functions
  if (candidatePath.includes('\0')) {
    throw new PathTraversalError(`Path contains NUL byte: ${JSON.stringify(candidatePath)}`)
  }

  // Resolve the workspace root through any OS-level symlinks (e.g. macOS /var -> /private/var).
  // The workspace itself may not exist yet when mr_write first runs.
  const realWorkspaceRoot = realpathMaybeNew(workspaceRoot)

  // Resolve the candidate against the workspace root.
  // path.resolve with a relative second arg treats the first as CWD.
  const resolved = path.resolve(realWorkspaceRoot, candidatePath)

  // Ensure the resolved path starts with the real workspace root followed by a separator
  // (or is exactly the workspace root itself, which we still allow for listing).
  const safePrefix = realWorkspaceRoot.endsWith(path.sep)
    ? realWorkspaceRoot
    : realWorkspaceRoot + path.sep

  if (resolved !== realWorkspaceRoot && !resolved.startsWith(safePrefix)) {
    throw new PathTraversalError(
      `Path traversal detected: "${candidatePath}" resolves outside workspace "${realWorkspaceRoot}"`,
    )
  }

  // Symlink resolution: only check segments that live INSIDE the workspace.
  // Ancestor segments above the workspace root are OS paths we don't control and
  // must not reject (e.g. macOS /private is a normal directory, not an escape).
  // We split the resolved path, skip the segments that form the workspace root prefix,
  // then walk the remaining (workspace-relative) segments.
  const workspaceSegments = realWorkspaceRoot.split(path.sep)
  const resolvedSegments = resolved.split(path.sep)

  // Start iteration from the first segment INSIDE the workspace
  for (let depth = workspaceSegments.length; depth < resolvedSegments.length; depth++) {
    const partial = resolvedSegments.slice(0, depth + 1).join(path.sep)
    try {
      const real = fs.realpathSync(partial)
      if (real !== realWorkspaceRoot && !real.startsWith(safePrefix)) {
        throw new PathTraversalError(
          `Symlink traversal detected: "${partial}" resolves to "${real}" which is outside workspace "${realWorkspaceRoot}"`,
        )
      }
    } catch (err) {
      if (err instanceof PathTraversalError) throw err
      // ENOENT means the partial path doesn't exist yet — fine for new files
      const nodeErr = err as NodeJS.ErrnoException
      if (nodeErr.code === 'ENOENT') break
      throw err
    }
  }

  return resolved
}
