// gitlab_create_discussion: create a discussion thread on a merge request.
// If `position` is provided, the discussion is anchored to a file/line (line-level).
// Without `position`, GitLab creates a general MR-level discussion.

import { z } from 'zod'

import { gitlabRequest } from './client.js'
import { getProjectPathEncoded } from './project.js'

export const GitlabPositionSchema = z.object({
  base_sha: z.string().min(1),
  start_sha: z.string().min(1),
  head_sha: z.string().min(1),
  position_type: z.literal('text'),
  new_path: z.string().optional(),
  new_line: z.number().int().positive().optional(),
  old_path: z.string().optional(),
  old_line: z.number().int().positive().optional(),
})

export type GitlabPosition = z.infer<typeof GitlabPositionSchema>

export const GitlabCreateDiscussionInputSchema = z.object({
  iid: z.number().int().positive(),
  body: z.string().min(1),
  position: GitlabPositionSchema.optional(),
})

export type GitlabCreateDiscussionInput = z.infer<typeof GitlabCreateDiscussionInputSchema>

export interface GitlabCreateDiscussionOutput {
  discussionId: string
  firstNoteId: number
}

interface DiscussionPayload {
  id: string
  notes?: Array<{ id: number }>
}

/**
 * Creates a discussion on the merge request. With `position`, the comment renders
 * inline on the diff (line-level). Without it, the comment appears in the MR's
 * general discussion stream.
 *
 * GitLab requires both `new_path`+`new_line` (for added lines), both `old_path`+`old_line`
 * (for deleted lines), or all four (for context lines). For MODIFIED FILES (the common
 * case — file existed before and after, only some lines are new/deleted), `old_path`
 * MUST equal `new_path`. Setting `old_path: null` tells GitLab "the file did not exist
 * before this MR" — the API accepts the position but the diff renderer cannot anchor
 * the comment inline on the Changes view (the comment shows in the conversation tab
 * with file metadata but no diff anchor). This util auto-fills `old_path = new_path`
 * when `old_path` is omitted, which is correct for added/context lines in existing
 * files; for brand-new files the caller must explicitly pass `old_path: undefined`
 * (we pass null to GitLab in that case via JSON null).
 *
 * @param input - IID, body markdown, optional position.
 * @returns The created discussion ID and the ID of the first note.
 */
export async function gitlabCreateDiscussion(
  input: GitlabCreateDiscussionInput,
): Promise<GitlabCreateDiscussionOutput> {
  const { iid, body, position } = GitlabCreateDiscussionInputSchema.parse(input)
  const project = getProjectPathEncoded()
  const requestBody: Record<string, unknown> = { body }
  if (position !== undefined) {
    // Auto-fill old_path = new_path for the common case (modified file). The
    // caller can opt-out of this by passing old_path: '' (rare: brand-new file).
    const normalizedPosition: Record<string, unknown> = { ...position }
    if (
      normalizedPosition.old_path === undefined &&
      typeof normalizedPosition.new_path === 'string'
    ) {
      normalizedPosition.old_path = normalizedPosition.new_path
    }
    requestBody.position = normalizedPosition
  }
  const payload = await gitlabRequest<DiscussionPayload>(
    'POST',
    `/projects/${project}/merge_requests/${iid}/discussions`,
    requestBody,
  )
  const firstNote = payload.notes?.[0]
  if (firstNote === undefined) {
    throw new Error('GitLab returned a discussion without notes')
  }
  return { discussionId: payload.id, firstNoteId: firstNote.id }
}
