// gitlab_get_diff: fetches the diff of a merge request and writes the unified
// diff to a file on disk. The tool does NOT return the diff content in its
// response — only the absolute path — so the MCP layer never bloats the LLM
// context with multi-MB patches. Library scripts read the file via $DIFF_PATCH.

import { z } from 'zod'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

import { gitlabRequest } from './client.js'
import { getProjectPathEncoded } from './project.js'
import { getWorkspaceBase } from '../../util/workspace.js'

export const GitlabGetDiffInputSchema = z.object({
  iid: z.number().int().positive(),
  /** When provided, the unified diff is persisted under the ticket's workspace
   *  at `<workspace>/_context/diff-iid<iid>.patch`. Recommended in /mr-review
   *  flows so the patch is auditable + reachable via `/mr-review-resume`.
   *  When omitted, the diff is written to the OS tempdir with a deterministic
   *  name and survives only until the OS reaps it. */
  ticketId: z
    .string()
    .regex(/^(WET-\d+|local-[a-z0-9-]+)$/)
    .optional(),
})

export type GitlabGetDiffInput = z.infer<typeof GitlabGetDiffInputSchema>

export interface GitlabFileDiff {
  old_path: string
  new_path: string
  a_mode: string
  b_mode: string
  diff: string
  new_file: boolean
  renamed_file: boolean
  deleted_file: boolean
}

export interface GitlabGetDiffOutput {
  base_sha: string
  head_sha: string
  start_sha: string
  /** Absolute path of the file containing the concatenated unified diff. The
   *  caller (orchestrator) passes this path verbatim to library scripts as
   *  `$DIFF_PATCH`. The MCP server has already written the content; do NOT
   *  re-read it into LLM context unless strictly necessary. */
  unified_diff_path: string
  /** Size of the written diff file in bytes. Useful for the orchestrator to
   *  decide whether to stream-process it (vs. Read into context). */
  unified_diff_bytes: number
  /** Per-file structured diff entries from GitLab `/changes`. Kept in the
   *  response because the orchestrator needs file paths cheaply for bucketing
   *  and specialist selection (no diff content per file in this list — only
   *  metadata). The per-file `diff` body is intentionally truncated to a
   *  preview so the response stays compact. */
  files: Array<GitlabFileDiffSummary>
}

export interface GitlabFileDiffSummary {
  old_path: string
  new_path: string
  a_mode: string
  b_mode: string
  new_file: boolean
  renamed_file: boolean
  deleted_file: boolean
  /** Lightweight preview of the per-file diff (first 32 lines + truncation
   *  marker). For the full diff per file, Read the unified_diff_path file
   *  and parse it; or split it with library scripts. */
  diff_preview: string
}

interface GitlabChangesPayload {
  diff_refs?: { base_sha: string; head_sha: string; start_sha: string }
  changes?: Array<GitlabFileDiff>
}

const PREVIEW_MAX_LINES = 32

/**
 * Builds a short preview of a file's diff body (first 32 lines + ellipsis when
 * truncated). The preview keeps the LLM-facing response compact while still
 * letting the orchestrator see what kind of change each file represents.
 *
 * @param diff - Full per-file diff string.
 * @returns The preview string.
 */
function buildDiffPreview(diff: string): string {
  const lines = diff.split('\n')
  if (lines.length <= PREVIEW_MAX_LINES) {
    return diff
  }
  return [
    ...lines.slice(0, PREVIEW_MAX_LINES),
    `… (${lines.length - PREVIEW_MAX_LINES} more lines, see unified_diff_path)`,
  ].join('\n')
}

/**
 * Resolves the absolute path where the unified diff will be written. Workspace
 * path when ticketId is provided; OS tempdir otherwise. Always returns an
 * absolute path; creates the parent directory as needed.
 *
 * @param iid - The merge request IID (used in the filename for traceability).
 * @param headSha - The MR head SHA (used in the tempdir filename to dedupe).
 * @param ticketId - Optional ticket identifier; selects the workspace path.
 * @returns Absolute path of the destination file.
 */
function resolveDiffPath(
  iid: number,
  headSha: string,
  ticketId: string | undefined,
): string {
  if (ticketId !== undefined) {
    const contextDir = path.join(getWorkspaceBase(ticketId), '_context')
    fs.mkdirSync(contextDir, { recursive: true })
    return path.join(contextDir, `diff-iid${iid}.patch`)
  }
  const shaTag = headSha.slice(0, 8) !== '' ? headSha.slice(0, 8) : crypto.randomBytes(4).toString('hex')
  return path.join(os.tmpdir(), `mr-auto-review-diff-iid${iid}-${shaTag}.patch`)
}

/**
 * Fetches the diff of a merge request via the `/changes` endpoint, writes the
 * concatenated unified diff to disk, and returns a compact response.
 *
 * @param input - The merge request IID and optional ticketId for workspace placement.
 * @returns SHAs + the absolute path of the on-disk diff + a per-file summary with previews.
 */
export async function gitlabGetDiff(input: GitlabGetDiffInput): Promise<GitlabGetDiffOutput> {
  const parsed = GitlabGetDiffInputSchema.parse(input)
  const project = getProjectPathEncoded()
  const payload = await gitlabRequest<GitlabChangesPayload>(
    'GET',
    `/projects/${project}/merge_requests/${parsed.iid}/changes`,
  )
  const diffRefs = payload.diff_refs
  if (diffRefs === undefined) {
    throw new Error(`MR !${parsed.iid} has no diff_refs`)
  }
  const files = payload.changes ?? []
  const unified = files
    .map((f) => {
      // GitLab `/changes` returns the per-file `diff` body starting at `@@` hunks,
      // without the `--- a/` and `+++ b/` index lines that standard unified diff
      // expects. Library scripts (stratify-by-module, compute-mr-size) rely on
      // those headers to identify file paths via `grep`. Inject them here.
      // Handle new/deleted/renamed flags so the headers reflect GitLab's view.
      const oldHeader = f.new_file ? '/dev/null' : `a/${f.old_path}`
      const newHeader = f.deleted_file ? '/dev/null' : `b/${f.new_path}`
      return `diff --git a/${f.old_path} b/${f.new_path}\n--- ${oldHeader}\n+++ ${newHeader}\n${f.diff}`
    })
    .join('\n')

  const diffPath = resolveDiffPath(parsed.iid, diffRefs.head_sha, parsed.ticketId)
  fs.writeFileSync(diffPath, unified, { encoding: 'utf8' })
  const stat = fs.statSync(diffPath)

  return {
    base_sha: diffRefs.base_sha,
    head_sha: diffRefs.head_sha,
    start_sha: diffRefs.start_sha,
    unified_diff_path: diffPath,
    unified_diff_bytes: stat.size,
    files: files.map((f) => ({
      old_path: f.old_path,
      new_path: f.new_path,
      a_mode: f.a_mode,
      b_mode: f.b_mode,
      new_file: f.new_file,
      renamed_file: f.renamed_file,
      deleted_file: f.deleted_file,
      diff_preview: buildDiffPreview(f.diff),
    })),
  }
}
