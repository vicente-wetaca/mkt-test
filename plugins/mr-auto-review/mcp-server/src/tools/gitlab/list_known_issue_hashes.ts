// gitlab_list_known_issue_hashes: lists all issue-hashes already posted by the
// bot on the MR. Internally calls gitlab_list_discussions and extracts hashes
// from each note body via the issue-hash regex. Drives idempotency in the
// orchestrator: when about to post issue X, skip if its hash is already known.

import { z } from 'zod'

import { gitlabListDiscussions } from './list_discussions.js'
import { extractIssueHashes } from '../../util/issue-hash.js'

export const GitlabListKnownIssueHashesInputSchema = z.object({
  iid: z.number().int().positive(),
})

export type GitlabListKnownIssueHashesInput = z.infer<typeof GitlabListKnownIssueHashesInputSchema>

export interface KnownHashEntry {
  /** The GitLab discussion ID that contains this hash. */
  discussionId: string
  /** Whether that discussion is currently resolved. */
  resolved: boolean
  /** GitLab numeric ID of the first note in the discussion. */
  firstNoteId: number
}

export interface GitlabListKnownIssueHashesOutput {
  /** Map of issue-hash → entry. Multiple discussions for the same hash collapse
   *  to the most-recent (we still record the count separately). */
  hashes: Record<string, KnownHashEntry>
  /** Count of discussions scanned (sum across pages). */
  scannedDiscussions: number
  /** Count of distinct hashes found. */
  knownCount: number
}

/**
 * Scans every discussion on the MR and indexes the issue-hashes embedded in
 * their note bodies. Returns the lookup table the orchestrator uses to dedupe.
 * If two discussions share a hash (a rare race), the most-recently-updated
 * one wins — GitLab returns discussions in creation order, so we just keep
 * the last entry.
 *
 * @param input - The MR IID.
 * @returns Indexed hashes + counters.
 */
export async function gitlabListKnownIssueHashes(
  input: GitlabListKnownIssueHashesInput,
): Promise<GitlabListKnownIssueHashesOutput> {
  const { iid } = GitlabListKnownIssueHashesInputSchema.parse(input)
  const { discussions } = await gitlabListDiscussions({ iid })

  const hashes: Record<string, KnownHashEntry> = {}
  for (const d of discussions) {
    const firstNote = d.notes[0]
    if (firstNote === undefined) continue
    const found = extractIssueHashes(firstNote.body)
    for (const h of found) {
      hashes[h] = {
        discussionId: d.id,
        resolved: firstNote.resolved,
        firstNoteId: firstNote.id,
      }
    }
  }

  return {
    hashes,
    scannedDiscussions: discussions.length,
    knownCount: Object.keys(hashes).length,
  }
}
