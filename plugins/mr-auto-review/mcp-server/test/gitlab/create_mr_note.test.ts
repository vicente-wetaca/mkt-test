// Tests for gitlab_create_mr_note: POST body shape + return value.
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { gitlabCreateMrNote } from '../../src/tools/gitlab/create_mr_note.ts'
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

describe('gitlabCreateMrNote', () => {
  it('POSTs the body to /notes and returns the note ID', async () => {
    stub.enqueue(201, { id: 1234 })
    const result = await gitlabCreateMrNote({ iid: 7, body: 'hello' })
    assert.equal(result.noteId, 1234)
    assert.equal(stub.calls[0]?.method, 'POST')
    assert.ok(stub.calls[0]?.url.endsWith('/merge_requests/7/notes'))
    const sentBody = JSON.parse(stub.calls[0]?.body ?? '{}')
    assert.equal(sentBody.body, 'hello')
  })

  it('rejects empty body', async () => {
    await assert.rejects(() => gitlabCreateMrNote({ iid: 1, body: '' }))
  })

  it('rejects zero IID', async () => {
    await assert.rejects(() => gitlabCreateMrNote({ iid: 0, body: 'x' }))
  })
})
