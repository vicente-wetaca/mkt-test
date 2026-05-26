// gitlab_delete_mr_note: deletes a single note on a merge request.
// DELETE /merge_requests/:iid/notes/:note_id. Used by /mr-review-undo to
// remove discussions previously posted by the bot. Only deletes notes the
// caller owns (the token's user); GitLab returns 403 otherwise.

import { z } from 'zod'

import { gitlabRequest } from './client.js'
import { getProjectPathEncoded } from './project.js'

export const GitlabDeleteMrNoteInputSchema = z.object({
  iid: z.number().int().positive(),
  noteId: z.number().int().positive(),
})

export type GitlabDeleteMrNoteInput = z.infer<typeof GitlabDeleteMrNoteInputSchema>

export interface GitlabDeleteMrNoteOutput {
  ok: true
  noteId: number
}

/**
 * Deletes a note from a merge request. Returns `ok: true` on success.
 * When the note is the first note of a discussion thread, GitLab also
 * closes the thread; subsequent notes (if any) remain visible but the
 * discussion is no longer resolvable through normal flows.
 *
 * @param input - IID + note ID.
 * @returns Confirmation with the deleted note ID.
 */
export async function gitlabDeleteMrNote(
  input: GitlabDeleteMrNoteInput,
): Promise<GitlabDeleteMrNoteOutput> {
  const { iid, noteId } = GitlabDeleteMrNoteInputSchema.parse(input)
  const project = getProjectPathEncoded()
  await gitlabRequest<unknown>(
    'DELETE',
    `/projects/${project}/merge_requests/${iid}/notes/${noteId}`,
  )
  return { ok: true, noteId }
}
