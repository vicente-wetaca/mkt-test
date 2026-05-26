// gitlab_get_mr: fetch MR metadata + description + base/head SHAs.

import { z } from 'zod'

import { gitlabRequest } from './client.js'
import { getProjectPathEncoded } from './project.js'

export const GitlabGetMrInputSchema = z.object({
  iid: z.number().int().positive(),
})

export type GitlabGetMrInput = z.infer<typeof GitlabGetMrInputSchema>

export interface GitlabGetMrOutput {
  id: number
  iid: number
  title: string
  description: string
  state: string
  source_branch: string
  target_branch: string
  base_sha: string
  head_sha: string
  start_sha: string
  web_url: string
  author: { id: number; username: string; name: string }
  reviewers: Array<{ id: number; username: string; name: string }>
}

interface GitlabMrPayload {
  id: number
  iid: number
  title: string
  description: string | null
  state: string
  source_branch: string
  target_branch: string
  web_url: string
  author: { id: number; username: string; name: string }
  reviewers?: Array<{ id: number; username: string; name: string }>
  diff_refs?: { base_sha: string; head_sha: string; start_sha: string }
}

/**
 * Fetches a single merge request by its internal IID for the current project.
 *
 * @param input - The merge request IID.
 * @returns Metadata, description, branches, and diff_refs SHAs.
 * @throws GitlabApiError on 4xx/5xx after retries.
 */
export async function gitlabGetMr(input: GitlabGetMrInput): Promise<GitlabGetMrOutput> {
  const { iid } = GitlabGetMrInputSchema.parse(input)
  const project = getProjectPathEncoded()
  const payload = await gitlabRequest<GitlabMrPayload>('GET', `/projects/${project}/merge_requests/${iid}`)

  const diffRefs = payload.diff_refs
  if (diffRefs === undefined) {
    throw new Error(`MR !${iid} has no diff_refs (unmerged with no commits?)`)
  }
  return {
    id: payload.id,
    iid: payload.iid,
    title: payload.title,
    description: payload.description ?? '',
    state: payload.state,
    source_branch: payload.source_branch,
    target_branch: payload.target_branch,
    base_sha: diffRefs.base_sha,
    head_sha: diffRefs.head_sha,
    start_sha: diffRefs.start_sha,
    web_url: payload.web_url,
    author: payload.author,
    reviewers: payload.reviewers ?? [],
  }
}
