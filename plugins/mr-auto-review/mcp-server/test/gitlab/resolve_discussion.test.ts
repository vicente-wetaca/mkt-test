// Tests for gitlab_resolve_discussion: builds the correct PUT URL with `resolved` flag.
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { gitlabResolveDiscussion } from '../../src/tools/gitlab/resolve_discussion.ts'
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

describe('gitlabResolveDiscussion', () => {
  it('resolves by default (true)', async () => {
    stub.enqueue(200, {})
    const result = await gitlabResolveDiscussion({ iid: 1, discussionId: 'd-abc' })
    assert.equal(result.ok, true)
    assert.equal(result.resolved, true)
    assert.equal(stub.calls[0]?.method, 'PUT')
    assert.ok(stub.calls[0]?.url.includes('resolved=true'))
    assert.ok(stub.calls[0]?.url.includes('/discussions/d-abc'))
  })

  it('re-opens when resolved: false', async () => {
    stub.enqueue(200, {})
    const result = await gitlabResolveDiscussion({ iid: 1, discussionId: 'd', resolved: false })
    assert.equal(result.resolved, false)
    assert.ok(stub.calls[0]?.url.includes('resolved=false'))
  })

  it('URL-encodes discussion IDs with special characters', async () => {
    stub.enqueue(200, {})
    await gitlabResolveDiscussion({ iid: 1, discussionId: 'a/b c' })
    assert.ok(stub.calls[0]?.url.includes('/discussions/a%2Fb%20c'))
  })

  it('rejects empty discussionId', async () => {
    await assert.rejects(() => gitlabResolveDiscussion({ iid: 1, discussionId: '' }))
  })
})
