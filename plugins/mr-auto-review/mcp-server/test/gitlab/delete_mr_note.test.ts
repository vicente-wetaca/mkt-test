// Tests for gitlab_delete_mr_note: DELETE shape + URL + IID handling.
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { gitlabDeleteMrNote } from '../../src/tools/gitlab/delete_mr_note.ts'
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

describe('gitlabDeleteMrNote', () => {
  it('issues DELETE to /merge_requests/:iid/notes/:noteId', async () => {
    stub.enqueue(204, {})
    const result = await gitlabDeleteMrNote({ iid: 7, noteId: 1234 })
    assert.equal(result.ok, true)
    assert.equal(result.noteId, 1234)
    assert.equal(stub.calls[0]?.method, 'DELETE')
    assert.ok(stub.calls[0]?.url.endsWith('/merge_requests/7/notes/1234'))
  })

  it('rejects zero IID', async () => {
    await assert.rejects(() => gitlabDeleteMrNote({ iid: 0, noteId: 1 }))
  })

  it('rejects zero noteId', async () => {
    await assert.rejects(() => gitlabDeleteMrNote({ iid: 1, noteId: 0 }))
  })

  it('rejects negative inputs', async () => {
    await assert.rejects(() => gitlabDeleteMrNote({ iid: -1, noteId: 1 }))
    await assert.rejects(() => gitlabDeleteMrNote({ iid: 1, noteId: -1 }))
  })
})
