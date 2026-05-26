// Tests for gitlab_list_notes: paginates and exposes order via the query string.
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { gitlabListNotes } from '../../src/tools/gitlab/list_notes.ts'
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

describe('gitlabListNotes', () => {
  it('defaults to desc order', async () => {
    stub.enqueue(200, [])
    await gitlabListNotes({ iid: 7 })
    assert.ok(stub.calls[0]?.url.includes('sort=desc'))
    assert.ok(stub.calls[0]?.url.includes('order_by=created_at'))
  })

  it('honours explicit asc order', async () => {
    stub.enqueue(200, [])
    await gitlabListNotes({ iid: 7, order: 'asc' })
    assert.ok(stub.calls[0]?.url.includes('sort=asc'))
  })

  it('returns notes from the API', async () => {
    stub.enqueue(200, [
      {
        id: 1,
        body: 'first',
        system: false,
        created_at: '2026-05-20T00:00:00Z',
        updated_at: '2026-05-20T00:00:00Z',
        author: { id: 1, username: 'a', name: 'A' },
      },
      {
        id: 2,
        body: '*marker: run-completed*',
        system: false,
        created_at: '2026-05-20T00:01:00Z',
        updated_at: '2026-05-20T00:01:00Z',
        author: { id: 1, username: 'a', name: 'A' },
      },
    ])
    const result = await gitlabListNotes({ iid: 7 })
    assert.equal(result.notes.length, 2)
    assert.ok(result.notes[1]?.body.includes('marker: run-completed'))
  })
})
