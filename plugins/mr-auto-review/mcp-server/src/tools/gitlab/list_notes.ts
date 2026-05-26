// gitlab_list_notes: list all standalone notes (non-discussion) on a merge request.
// Mainly used by the standalone wrapper to find the `*marker: run-completed*` note.

import { z } from 'zod'

import { gitlabRequest } from './client.js'
import { getProjectPathEncoded } from './project.js'

export const GitlabListNotesInputSchema = z.object({
  iid: z.number().int().positive(),
  /** Sort by created_at; default desc so the most recent note is first */
  order: z.enum(['asc', 'desc']).optional(),
})

export type GitlabListNotesInput = z.infer<typeof GitlabListNotesInputSchema>

export interface GitlabPlainNote {
  id: number
  body: string
  system: boolean
  created_at: string
  updated_at: string
  author: { id: number; username: string; name: string }
}

export interface GitlabListNotesOutput {
  notes: Array<GitlabPlainNote>
}

/**
 * Fetches all notes on a merge request, ordered by creation date.
 * Notes include both human comments and discussion-level notes; callers that
 * need only standalone notes should filter for `note.system === false` and
 * cross-reference against `gitlabListDiscussions`.
 *
 * @param input - The merge request IID and optional ordering.
 * @returns Array of notes.
 */
export async function gitlabListNotes(input: GitlabListNotesInput): Promise<GitlabListNotesOutput> {
  const { iid, order } = GitlabListNotesInputSchema.parse(input)
  const project = getProjectPathEncoded()
  const sort = order ?? 'desc'

  const all: Array<GitlabPlainNote> = []
  let page = 1
  for (let safety = 0; safety < 50; safety += 1) {
    const batch = await gitlabRequest<Array<GitlabPlainNote>>(
      'GET',
      `/projects/${project}/merge_requests/${iid}/notes?per_page=100&page=${page}&sort=${sort}&order_by=created_at`,
    )
    all.push(...batch)
    if (batch.length < 100) break
    page += 1
  }
  return { notes: all }
}
