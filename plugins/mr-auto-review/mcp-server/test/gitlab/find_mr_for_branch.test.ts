// Tests for gitlab_find_mr_for_branch: filters by source_branch + opened state.
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { gitlabFindMrForBranch } from '../../src/tools/gitlab/find_mr_for_branch.ts'
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

describe('gitlabFindMrForBranch', () => {
  it('returns the most-recent matching MR when one exists', async () => {
    stub.enqueue(200, [
      { iid: 3802, web_url: 'https://gitlab/x/mr/3802', updated_at: '2026-05-20T10:00Z' },
    ])
    const result = await gitlabFindMrForBranch({ branch: 'feature/WET-4814--mr-auto-review-plugin' })
    assert.equal(result.iid, 3802)
    assert.equal(result.matchCount, 1)
    assert.equal(result.webUrl, 'https://gitlab/x/mr/3802')
  })

  it('returns nulls when no open MR matches', async () => {
    stub.enqueue(200, [])
    const result = await gitlabFindMrForBranch({ branch: 'unused-branch' })
    assert.equal(result.iid, null)
    assert.equal(result.matchCount, 0)
    assert.equal(result.webUrl, null)
  })

  it('picks the first (most-recent) when GitLab returns multiple', async () => {
    stub.enqueue(200, [
      { iid: 99, web_url: 'https://gitlab/x/mr/99', updated_at: '2026-05-20T12:00Z' },
      { iid: 88, web_url: 'https://gitlab/x/mr/88', updated_at: '2026-05-19T09:00Z' },
    ])
    const result = await gitlabFindMrForBranch({ branch: 'b' })
    assert.equal(result.iid, 99)
    assert.equal(result.matchCount, 2)
  })

  it('URL-encodes branch names with special characters', async () => {
    stub.enqueue(200, [])
    await gitlabFindMrForBranch({ branch: 'feature/with spaces & slashes' })
    assert.ok(stub.calls[0]?.url.includes('source_branch=feature%2Fwith%20spaces%20%26%20slashes'))
    assert.ok(stub.calls[0]?.url.includes('state=opened'))
  })

  it('rejects empty branch', async () => {
    await assert.rejects(() => gitlabFindMrForBranch({ branch: '' }))
  })
})
