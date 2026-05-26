// gitlab_find_mr_for_branch: locates the open MR (if any) whose source_branch
// matches the given branch. Used by the orchestrator to auto-detect remote mode.
// Returns null when no open MR exists for that branch.

import { z } from 'zod'

import { gitlabRequest } from './client.js'
import { getProjectPathEncoded } from './project.js'

export const GitlabFindMrForBranchInputSchema = z.object({
  branch: z.string().min(1),
})

export type GitlabFindMrForBranchInput = z.infer<typeof GitlabFindMrForBranchInputSchema>

export interface GitlabFindMrForBranchOutput {
  /** The IID of the most recently updated open MR, or null when none exists */
  iid: number | null
  /** Count of open MRs matching the branch (≥2 hints at a duplicate/stale state) */
  matchCount: number
  /** The web URL of the matched MR for quick inspection (null when iid is null) */
  webUrl: string | null
}

interface GitlabMrSummary {
  iid: number
  web_url: string
  updated_at: string
}

/**
 * Lists open MRs filtered by source_branch and returns the most recent one.
 * If GitLab returns multiple matches (rare — usually means a stale or duplicate
 * MR), exposes the count so the orchestrator can warn the human.
 *
 * @param input - The source branch name.
 * @returns The best-matching open MR IID and metadata, or nulls when none exists.
 */
export async function gitlabFindMrForBranch(
  input: GitlabFindMrForBranchInput,
): Promise<GitlabFindMrForBranchOutput> {
  const { branch } = GitlabFindMrForBranchInputSchema.parse(input)
  const project = getProjectPathEncoded()
  const matches = await gitlabRequest<Array<GitlabMrSummary>>(
    'GET',
    `/projects/${project}/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}&per_page=10&order_by=updated_at&sort=desc`,
  )
  if (matches.length === 0) {
    return { iid: null, matchCount: 0, webUrl: null }
  }
  const best = matches[0]
  if (best === undefined) {
    return { iid: null, matchCount: 0, webUrl: null }
  }
  return { iid: best.iid, matchCount: matches.length, webUrl: best.web_url }
}
