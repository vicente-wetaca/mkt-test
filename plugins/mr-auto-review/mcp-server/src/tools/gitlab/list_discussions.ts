// gitlab_list_discussions: list all discussions (threaded) on a merge request.
// Used by the idempotency check (parse issue-hash from body) and overlap detection.

import { z } from 'zod'

import { gitlabRequest } from './client.js'
import { getProjectPathEncoded } from './project.js'

export const GitlabListDiscussionsInputSchema = z.object({
  iid: z.number().int().positive(),
})

export type GitlabListDiscussionsInput = z.infer<typeof GitlabListDiscussionsInputSchema>

export interface GitlabNote {
  id: number
  body: string
  system: boolean
  resolvable: boolean
  resolved: boolean
  created_at: string
  updated_at: string
  author: { id: number; username: string; name: string }
  position?: {
    base_sha: string
    start_sha: string
    head_sha: string
    new_path?: string
    new_line?: number
    old_path?: string
    old_line?: number
  } | null
}

export interface GitlabDiscussion {
  id: string
  individual_note: boolean
  notes: Array<GitlabNote>
}

export interface GitlabListDiscussionsOutput {
  discussions: Array<GitlabDiscussion>
}

/**
 * Fetches all discussions on a merge request, paginated until exhausted.
 * GitLab returns up to 100 discussions per page (per_page=100).
 *
 * @param input - The merge request IID.
 * @returns Array of discussions with their notes (system and human).
 */
export async function gitlabListDiscussions(
  input: GitlabListDiscussionsInput,
): Promise<GitlabListDiscussionsOutput> {
  const { iid } = GitlabListDiscussionsInputSchema.parse(input)
  const project = getProjectPathEncoded()

  const all: Array<GitlabDiscussion> = []
  let page = 1
  // GitLab caps at 100; iterate until a page returns fewer than per_page items
  // or until a hard cap to avoid infinite loops on misconfigured servers.
  for (let safety = 0; safety < 50; safety += 1) {
    const batch = await gitlabRequest<Array<GitlabDiscussion>>(
      'GET',
      `/projects/${project}/merge_requests/${iid}/discussions?per_page=100&page=${page}`,
    )
    all.push(...batch)
    if (batch.length < 100) break
    page += 1
  }
  return { discussions: all }
}
