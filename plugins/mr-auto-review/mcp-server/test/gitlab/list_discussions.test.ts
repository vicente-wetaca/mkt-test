// Tests for gitlab_list_discussions: paginates until a page returns < 100 items.
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { gitlabListDiscussions } from '../../src/tools/gitlab/list_discussions.ts'
import { _resetCredentialsCache } from '../../src/tools/gitlab/auth.ts'
import { stubFetch, type Stub } from './_helpers.ts'

let stub: Stub

beforeEach(() => {
  _resetCredentialsCache({
    apiBase: 'https://gitlab.test/api/v4',
    projectPath: 'foo/bar',
    projectPathEncoded: 'foo%2Fbar',
    token: 'glpat-fake',
    tokenFromEnv: false,
  })
  stub = stubFetch()
})

/**
 * Builds a discussion object with N notes for fixture payloads.
 *
 * @param id - Discussion ID string.
 * @param notesCount - Number of notes to attach.
 */
function makeDiscussion(id: string, notesCount: number) {
  return {
    id,
    individual_note: false,
    notes: Array.from({ length: notesCount }, (_, i) => ({
      id: i + 1,
      body: `note ${i}`,
      system: false,
      resolvable: true,
      resolved: false,
      created_at: '2026-05-20T00:00:00Z',
      updated_at: '2026-05-20T00:00:00Z',
      author: { id: 1, username: 'u', name: 'n' },
      position: null,
    })),
  }
}

describe('gitlabListDiscussions', () => {
  it('returns the single page when count < 100', async () => {
    stub.enqueue(200, [makeDiscussion('d1', 1), makeDiscussion('d2', 2)])
    const result = await gitlabListDiscussions({ iid: 1 })
    assert.equal(result.discussions.length, 2)
    assert.equal(result.discussions[0]?.id, 'd1')
  })

  it('paginates when first page returns 100 items', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => makeDiscussion(`d${i}`, 1))
    stub.enqueue(200, fullPage)
    stub.enqueue(200, [makeDiscussion('last', 1)])

    const result = await gitlabListDiscussions({ iid: 1 })
    assert.equal(result.discussions.length, 101)
    assert.equal(stub.calls.length, 2)
    assert.ok(stub.calls[0]?.url.includes('page=1'))
    assert.ok(stub.calls[1]?.url.includes('page=2'))
  })

  it('returns empty list on empty page', async () => {
    stub.enqueue(200, [])
    const result = await gitlabListDiscussions({ iid: 1 })
    assert.equal(result.discussions.length, 0)
  })
})
