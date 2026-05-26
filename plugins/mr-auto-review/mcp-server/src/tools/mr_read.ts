// mr_read tool: reads a file from the workspace by its fileId and parses metadata.

import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

import { validateInWorkspace } from '../policy/path-validator.js'
import { getWorkspaceBase } from '../util/workspace.js'

export const MrReadInputSchema = z.object({
  ticketId: z
    .string()
    .regex(/^(WET-\d+|local-[a-z0-9-]+)$/, 'ticketId must match WET-\\d+ or local-[a-z0-9-]+'),
  fileId: z.string().min(1, 'fileId must not be empty'),
})

export type MrReadInput = z.infer<typeof MrReadInputSchema>

export interface FileMetadata {
  agentName: string
  kind: string
  timestamp: string
  size: number
}

export interface MrReadOutput {
  content: string
  metadata: FileMetadata
}

/**
 * Parses agent name, kind, and timestamp from a fileId like R-tests/issue-20260519-143022-001.md
 *
 * @param fileId - Relative path from workspace root.
 * @returns Parsed metadata fields.
 */
function parseFileId(fileId: string, size: number): FileMetadata {
  const parts = fileId.split('/')
  const agentName = parts[0] ?? ''
  const basename = parts[parts.length - 1] ?? ''
  // Pattern: <kind>-<YYYYMMDD-HHMMSS-mmm>[-<n>].md
  const match = basename.match(/^([a-z]+)-(\d{8}-\d{6}-\d{3}(?:-\d+)?)\.md$/)
  const kind = match?.[1] ?? ''
  const timestamp = match?.[2] ?? ''

  return { agentName, kind, timestamp, size }
}

/**
 * Reads a file by fileId and returns its content and parsed metadata.
 *
 * @param input - ticketId to locate the workspace, fileId as relative path.
 * @returns content string and metadata object.
 * @throws PathTraversalError if fileId escapes the workspace.
 * @throws Error (ENOENT) if the file does not exist.
 */
export async function mrRead(input: MrReadInput): Promise<MrReadOutput> {
  const parsed = MrReadInputSchema.parse(input)
  const { ticketId, fileId } = parsed

  const wsBase = getWorkspaceBase(ticketId)
  const resolvedPath = validateInWorkspace(wsBase, fileId)

  // fs.readFileSync will throw ENOENT if file doesn't exist — let it propagate
  const content = fs.readFileSync(resolvedPath, 'utf8')
  const stat = fs.statSync(resolvedPath)
  const metadata = parseFileId(fileId, stat.size)

  return { content, metadata }
}
