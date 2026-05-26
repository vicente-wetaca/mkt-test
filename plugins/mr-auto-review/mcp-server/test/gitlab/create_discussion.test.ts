// Tests for gitlab_create_discussion: validates POST body shape with and without position.
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { gitlabCreateDiscussion } from '../../src/tools/gitlab/create_discussion.ts'
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

describe('gitlabCreateDiscussion', () => {
  it('creates a general discussion when no position is passed', async () => {
    stub.enqueue(201, { id: 'disc-abc', notes: [{ id: 999 }] })
    const result = await gitlabCreateDiscussion({ iid: 1, body: 'hello' })
    assert.equal(result.discussionId, 'disc-abc')
    assert.equal(result.firstNoteId, 999)
    const sentBody = JSON.parse(stub.calls[0]?.body ?? '{}')
    assert.equal(sentBody.body, 'hello')
    assert.equal(sentBody.position, undefined)
  })

  it('creates a line-level discussion with position', async () => {
    stub.enqueue(201, { id: 'disc-xyz', notes: [{ id: 1 }] })
    const position = {
      base_sha: 'aaa',
      start_sha: 'bbb',
      head_sha: 'ccc',
      position_type: 'text' as const,
      new_path: 'src/foo.ts',
      new_line: 42,
    }
    await gitlabCreateDiscussion({ iid: 1, body: 'inline', position })
    const sentBody = JSON.parse(stub.calls[0]?.body ?? '{}')
    // Auto-fill: old_path = new_path when caller omitted it (modified file path)
    assert.deepEqual(sentBody.position, { ...position, old_path: 'src/foo.ts' })
  })

  it('auto-fills old_path = new_path for added lines in modified files', async () => {
    stub.enqueue(201, { id: 'd', notes: [{ id: 1 }] })
    await gitlabCreateDiscussion({
      iid: 1,
      body: 'inline',
      position: {
        base_sha: 'aaa',
        start_sha: 'bbb',
        head_sha: 'ccc',
        position_type: 'text',
        new_path: 'src/foo.ts',
        new_line: 47,
      },
    })
    const sentBody = JSON.parse(stub.calls[0]?.body ?? '{}')
    assert.equal(sentBody.position.old_path, 'src/foo.ts')
    assert.equal(sentBody.position.new_path, 'src/foo.ts')
    assert.equal(sentBody.position.new_line, 47)
    assert.equal(sentBody.position.old_line, undefined)
  })

  it('preserves explicit old_path when caller passes it (e.g. renamed file)', async () => {
    stub.enqueue(201, { id: 'd', notes: [{ id: 1 }] })
    await gitlabCreateDiscussion({
      iid: 1,
      body: 'inline',
      position: {
        base_sha: 'aaa',
        start_sha: 'bbb',
        head_sha: 'ccc',
        position_type: 'text',
        new_path: 'src/new-name.ts',
        old_path: 'src/old-name.ts',
        new_line: 10,
        old_line: 10,
      },
    })
    const sentBody = JSON.parse(stub.calls[0]?.body ?? '{}')
    assert.equal(sentBody.position.old_path, 'src/old-name.ts')
    assert.equal(sentBody.position.new_path, 'src/new-name.ts')
  })

  it('throws when GitLab returns a discussion without notes', async () => {
    stub.enqueue(201, { id: 'd', notes: [] })
    await assert.rejects(
      () => gitlabCreateDiscussion({ iid: 1, body: 'x' }),
      /without notes/,
    )
  })

  it('rejects empty body', async () => {
    await assert.rejects(() => gitlabCreateDiscussion({ iid: 1, body: '' }))
  })

  it('rejects position_type other than text', async () => {
    await assert.rejects(() =>
      gitlabCreateDiscussion({
        iid: 1,
        body: 'x',
        // @ts-expect-error testing runtime rejection
        position: { base_sha: 'a', start_sha: 'b', head_sha: 'c', position_type: 'image' },
      }),
    )
  })
})
