// mr_write tool: creates a new timestamped file inside the agent's workspace directory.
// Never overwrites — uses suffix (-1, -2, …) to resolve same-millisecond collisions.

import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

import { validateInWorkspace, PathTraversalError } from '../policy/path-validator.js'
import { getWorkspaceBase } from '../util/workspace.js'
import { nowTimestamp } from '../util/timestamp.js'

// Zod schema for input validation
export const MrWriteInputSchema = z.object({
  ticketId: z
    .string()
    .regex(/^(WET-\d+|local-[a-z0-9-]+)$/, 'ticketId must match WET-\\d+ or local-[a-z0-9-]+'),
  agentName: z
    .string()
    .regex(/^R-[a-z][a-z0-9-]*$|^_context$/, 'agentName must match R-[a-z][a-z0-9-]* or _context'),
  kind: z.enum(['issue', 'report', 'context', 'script']),
  content: z.string(),
})

export type MrWriteInput = z.infer<typeof MrWriteInputSchema>

export interface MrWriteOutput {
  /** Relative path from the workspace root, e.g. R-tests/issue-20260519-143022-001.md */
  fileId: string
  /** Absolute path on disk */
  path: string
}

/**
 * Creates a new timestamped markdown file inside the agent's workspace directory.
 *
 * @param input - Validated input containing ticketId, agentName, kind, and content.
 * @returns fileId (relative) and path (absolute) of the created file.
 * @throws ZodError when input is invalid.
 * @throws PathTraversalError if the composed path escapes the workspace (should never happen
 *         when agentName passes regex validation, but validated defensively).
 */
export async function mrWrite(input: MrWriteInput): Promise<MrWriteOutput> {
  const parsed = MrWriteInputSchema.parse(input)
  const { ticketId, agentName, kind, content } = parsed

  const wsBase = getWorkspaceBase(ticketId)

  // Obtain the real (symlink-resolved) workspace root.
  // validateInWorkspace resolves symlinks in the returned path (e.g. macOS /var -> /private/var).
  // We resolve a stable sentinel path one level deep to derive the real wsBase.
  const sentinelResolved = validateInWorkspace(wsBase, '_sentinel')
  const realWsBase = path.dirname(sentinelResolved)

  // Compose the base filename
  const ts = nowTimestamp()
  const baseName = `${kind}-${ts}.md`

  // Resolve and validate the target path, handling collisions with numeric suffixes
  let targetPath: string
  let collision = 0
  while (true) {
    const fileName = collision === 0 ? baseName : baseName.replace(/\.md$/, `-${collision}.md`)
    const relPath = `${agentName}/${fileName}`

    // Defensive path traversal check (agentName regex prevents this in practice)
    try {
      targetPath = validateInWorkspace(wsBase, relPath)
    } catch (err) {
      if (err instanceof PathTraversalError) throw err
      throw err
    }

    if (!fs.existsSync(targetPath)) break
    collision++
  }

  // Create parent directories and write the file
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, content, 'utf8')

  const fileId = path.relative(realWsBase, targetPath)

  return { fileId, path: targetPath }
}
