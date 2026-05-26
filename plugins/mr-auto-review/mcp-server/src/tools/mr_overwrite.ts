// mr_overwrite tool: atomically overwrites an existing file in the workspace.
// Used for updating shared files like REVIEW-SUMMARY.md.
// Writes to a .tmp file first, then renames atomically.

import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

import { validateInWorkspace } from '../policy/path-validator.js'
import { getWorkspaceBase } from '../util/workspace.js'

export const MrOverwriteInputSchema = z.object({
  ticketId: z
    .string()
    .regex(/^(WET-\d+|local-[a-z0-9-]+)$/, 'ticketId must match WET-\\d+ or local-[a-z0-9-]+'),
  fileId: z.string().min(1, 'fileId must not be empty'),
  content: z.string(),
})

export type MrOverwriteInput = z.infer<typeof MrOverwriteInputSchema>

export interface MrOverwriteOutput {
  /** Absolute path to the updated file */
  path: string
}

/**
 * Atomically overwrites an existing file in the workspace.
 * Writes to a .tmp file, then renames to the target path.
 *
 * @param input - ticketId, fileId (relative path), and new content.
 * @returns Absolute path to the updated file.
 * @throws Error when the target file does not already exist.
 * @throws PathTraversalError if fileId escapes the workspace.
 */
export async function mrOverwrite(input: MrOverwriteInput): Promise<MrOverwriteOutput> {
  const parsed = MrOverwriteInputSchema.parse(input)
  const { ticketId, fileId, content } = parsed

  const wsBase = getWorkspaceBase(ticketId)
  const resolvedPath = validateInWorkspace(wsBase, fileId)

  // File must already exist — mr_overwrite is for updates only
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File does not exist: ${resolvedPath}`)
  }

  // Atomic write: write to .tmp, then rename
  const tmpPath = resolvedPath + '.tmp'
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, resolvedPath)

  return { path: resolvedPath }
}
