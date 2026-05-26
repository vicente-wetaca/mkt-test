// gitlab_resolve_discussion: mark a discussion as resolved (or unresolved).
// Used by `/mr-review-undo` to revert posted discussions when needed.

import { z } from 'zod'

import { gitlabRequest } from './client.js'
import { getProjectPathEncoded } from './project.js'

export const GitlabResolveDiscussionInputSchema = z.object({
  iid: z.number().int().positive(),
  discussionId: z.string().min(1),
  /** Default true. Pass false to re-open. */
  resolved: z.boolean().optional(),
})

export type GitlabResolveDiscussionInput = z.infer<typeof GitlabResolveDiscussionInputSchema>

export interface GitlabResolveDiscussionOutput {
  ok: true
  discussionId: string
  resolved: boolean
}

/**
 * Marks the discussion as resolved (or unresolved). For discussions where
 * `resolvable: false` (e.g. plain MR comments without a diff position),
 * GitLab returns 4xx — caller should treat as no-op.
 *
 * @param input - IID, discussion ID, and the desired resolved state.
 * @returns Confirmation with the discussion ID and final resolved state.
 */
export async function gitlabResolveDiscussion(
  input: GitlabResolveDiscussionInput,
): Promise<GitlabResolveDiscussionOutput> {
  const { iid, discussionId, resolved } = GitlabResolveDiscussionInputSchema.parse(input)
  const finalResolved = resolved ?? true
  const project = getProjectPathEncoded()
  await gitlabRequest<unknown>(
    'PUT',
    `/projects/${project}/merge_requests/${iid}/discussions/${encodeURIComponent(discussionId)}?resolved=${finalResolved}`,
  )
  return { ok: true, discussionId, resolved: finalResolved }
}
