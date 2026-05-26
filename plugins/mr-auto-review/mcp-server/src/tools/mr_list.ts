// mr_list tool: walks the workspace directory and returns metadata for all files,
// excluding the _signals/ subdirectory (handled by mr_signal).

import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

import { getWorkspaceBase } from '../util/workspace.js'

export const MrListInputSchema = z.object({
  ticketId: z
    .string()
    .regex(/^(WET-\d+|local-[a-z0-9-]+)$/, 'ticketId must match WET-\\d+ or local-[a-z0-9-]+'),
  filters: z
    .object({
      agentName: z.string().optional(),
      kind: z.string().optional(),
      sinceTimestamp: z.string().optional(),
    })
    .optional(),
})

export type MrListInput = z.infer<typeof MrListInputSchema>

export interface FileEntry {
  fileId: string
  agentName: string
  kind: string
  timestamp: string
  size: number
}

/**
 * Parses metadata from a fileId like R-tests/issue-20260519-143022-001.md.
 *
 * @param fileId - Workspace-relative path.
 * @param size - File size in bytes.
 * @returns Parsed metadata or null if the filename does not match the expected pattern.
 */
function parseEntry(fileId: string, size: number): FileEntry | null {
  const parts = fileId.split('/')
  const agentName = parts[0] ?? ''
  const basename = parts[parts.length - 1] ?? ''
  const match = basename.match(/^([a-z]+)-(\d{8}-\d{6}-\d{3}(?:-\d+)?)\.md$/)
  if (!match) return null
  const kind = match[1] ?? ''
  const timestamp = match[2] ?? ''
  return { fileId, agentName, kind, timestamp, size }
}

/**
 * Recursively collects all .md file paths relative to a base directory,
 * skipping any path component named '_signals'.
 *
 * @param baseDir - Absolute path of the directory to walk.
 * @param relPrefix - Current relative path prefix (used during recursion).
 * @returns Array of workspace-relative file paths.
 */
function collectFiles(baseDir: string, relPrefix: string = ''): Array<string> {
  const entries: Array<string> = []
  let dirents: Array<fs.Dirent>
  try {
    dirents = fs.readdirSync(baseDir, { withFileTypes: true })
  } catch {
    return entries
  }

  for (const dirent of dirents) {
    const relPath = relPrefix ? `${relPrefix}/${dirent.name}` : dirent.name

    // Skip _signals directory entirely
    if (dirent.isDirectory() && dirent.name === '_signals') continue

    if (dirent.isDirectory()) {
      entries.push(...collectFiles(path.join(baseDir, dirent.name), relPath))
    } else if (dirent.isFile()) {
      entries.push(relPath)
    }
  }
  return entries
}

/**
 * Lists all files in the workspace for a given ticket, with optional filters.
 *
 * @param input - ticketId and optional filter criteria.
 * @returns Array of file entries with parsed metadata.
 */
export async function mrList(input: MrListInput): Promise<Array<FileEntry>> {
  const parsed = MrListInputSchema.parse(input)
  const { ticketId, filters } = parsed

  const wsBase = getWorkspaceBase(ticketId)

  const filePaths = collectFiles(wsBase)

  const results: Array<FileEntry> = []
  for (const fileId of filePaths) {
    const absPath = path.join(wsBase, fileId)
    let size = 0
    try {
      size = fs.statSync(absPath).size
    } catch {
      continue
    }

    const entry = parseEntry(fileId, size)
    if (!entry) continue

    // Apply optional filters
    if (filters?.agentName !== undefined && entry.agentName !== filters.agentName) continue
    if (filters?.kind !== undefined && entry.kind !== filters.kind) continue
    if (filters?.sinceTimestamp !== undefined && entry.timestamp < filters.sinceTimestamp) continue

    results.push(entry)
  }

  return results
}
