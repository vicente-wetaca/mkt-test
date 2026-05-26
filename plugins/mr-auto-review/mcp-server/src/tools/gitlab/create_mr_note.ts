// gitlab_create_mr_note: posts a stand-alone note on a merge request (no
// thread). Used for the run-completed marker that signals the wrapper that
// a successful review just finished. POST /merge_requests/:iid/notes.

import { z } from 'zod'

import { gitlabRequest } from './client.js'
import { getProjectPathEncoded } from './project.js'

export const GitlabCreateMrNoteInputSchema = z.object({
  iid: z.number().int().positive(),
  body: z.string().min(1),
})

export type GitlabCreateMrNoteInput = z.infer<typeof GitlabCreateMrNoteInputSchema>

export interface GitlabCreateMrNoteOutput {
  noteId: number
}

interface NotePayload {
  id: number
}

/**
 * Creates a stand-alone note on the merge request. Unlike a discussion, a
 * note has no thread and no resolvable state. Used by the orchestrator for
 * the run-completed marker (visible, parseable, never auto-resolved).
 *
 * @param input - IID + markdown body.
 * @returns The created note ID.
 */
export async function gitlabCreateMrNote(
  input: GitlabCreateMrNoteInput,
): Promise<GitlabCreateMrNoteOutput> {
  const { iid, body } = GitlabCreateMrNoteInputSchema.parse(input)
  const project = getProjectPathEncoded()
  const payload = await gitlabRequest<NotePayload>(
    'POST',
    `/projects/${project}/merge_requests/${iid}/notes`,
    { body },
  )
  return { noteId: payload.id }
}
