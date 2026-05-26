// Tests for gitlab_get_mr: ensures the GitLab MR payload is normalised to our schema.
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { gitlabGetMr } from '../../src/tools/gitlab/get_mr.ts'
import { _resetCredentialsCache } from '../../src/tools/gitlab/auth.ts'
import { stubFetch, type Stub } from './_helpers.ts'

let stub: Stub

beforeEach(() => {
  _resetCredentialsCache({
    apiBase: 'https://gitlab.test/api/v4',
    projectPath: 'wetaca/wetaca.com',
    projectPathEncoded: 'wetaca%2Fwetaca.com',
    token: 'glpat-fake',
    tokenFromEnv: false,
  })
  stub = stubFetch()
})

describe('gitlabGetMr', () => {
  it('returns normalised MR with diff_refs hoisted to top-level', async () => {
    stub.enqueue(200, {
      id: 100,
      iid: 42,
      title: 'WET-4814: test',
      description: 'some description',
      state: 'opened',
      source_branch: 'feature/x',
      target_branch: 'master',
      web_url: 'https://gitlab.test/wetaca/wetaca.com/-/merge_requests/42',
      author: { id: 1, username: 'vsempere', name: 'Vicente' },
      reviewers: [{ id: 2, username: 'alice', name: 'Alice' }],
      diff_refs: {
        base_sha: 'aaaa',
        head_sha: 'bbbb',
        start_sha: 'cccc',
      },
    })

    const result = await gitlabGetMr({ iid: 42 })
    assert.equal(result.iid, 42)
    assert.equal(result.title, 'WET-4814: test')
    assert.equal(result.base_sha, 'aaaa')
    assert.equal(result.head_sha, 'bbbb')
    assert.equal(result.start_sha, 'cccc')
    assert.equal(result.author.username, 'vsempere')
    assert.equal(result.reviewers[0]?.username, 'alice')
    assert.equal(
      stub.calls[0]?.url,
      'https://gitlab.test/api/v4/projects/wetaca%2Fwetaca.com/merge_requests/42',
    )
  })

  it('defaults description to empty string when null', async () => {
    stub.enqueue(200, {
      id: 1,
      iid: 1,
      title: 't',
      description: null,
      state: 'opened',
      source_branch: 'a',
      target_branch: 'b',
      web_url: '',
      author: { id: 1, username: 'u', name: 'n' },
      diff_refs: { base_sha: 'a', head_sha: 'b', start_sha: 'c' },
    })

    const result = await gitlabGetMr({ iid: 1 })
    assert.equal(result.description, '')
    assert.deepEqual(result.reviewers, [])
  })

  it('throws when diff_refs is missing', async () => {
    stub.enqueue(200, {
      id: 1,
      iid: 1,
      title: 't',
      description: 'd',
      state: 'opened',
      source_branch: 'a',
      target_branch: 'b',
      web_url: '',
      author: { id: 1, username: 'u', name: 'n' },
    })
    await assert.rejects(() => gitlabGetMr({ iid: 1 }), /diff_refs/)
  })

  it('rejects invalid IID', async () => {
    await assert.rejects(() => gitlabGetMr({ iid: 0 }))
    await assert.rejects(() => gitlabGetMr({ iid: -1 }))
  })
})
