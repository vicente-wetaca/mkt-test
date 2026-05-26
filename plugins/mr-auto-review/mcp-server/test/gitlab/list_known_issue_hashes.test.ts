// Tests for gitlab_list_known_issue_hashes: composes list_discussions output
// with the issue-hash extractor.
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { gitlabListKnownIssueHashes } from '../../src/tools/gitlab/list_known_issue_hashes.ts'
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
 * Helper to build a discussion whose first note carries the given body.
 *
 * @param id - Discussion ID.
 * @param body - Markdown of the first note.
 * @param resolved - Whether the first note is resolved.
 * @param firstNoteId - Numeric ID of the first note.
 */
function makeDiscussion(id: string, body: string, resolved: boolean, firstNoteId: number) {
  return {
    id,
    individual_note: false,
    notes: [
      {
        id: firstNoteId,
        body,
        system: false,
        resolvable: true,
        resolved,
        created_at: '2026-05-20T00:00:00Z',
        updated_at: '2026-05-20T00:00:00Z',
        author: { id: 1, username: 'bot', name: 'bot' },
        position: null,
      },
    ],
  }
}

describe('gitlabListKnownIssueHashes', () => {
  it('indexes hashes from bot bodies, ignores plain human comments', async () => {
    stub.enqueue(200, [
      makeDiscussion('d-1', '🤖 ... *issue-hash: aaaabbbbcccc1111*', false, 10),
      makeDiscussion('d-2', 'just a human asking a question', false, 11),
      makeDiscussion('d-3', '🤖 ... *issue-hash: deadbeef12345678*', true, 12),
    ])
    const result = await gitlabListKnownIssueHashes({ iid: 1 })
    assert.equal(result.scannedDiscussions, 3)
    assert.equal(result.knownCount, 2)
    assert.deepEqual(result.hashes['aaaabbbbcccc1111'], {
      discussionId: 'd-1',
      resolved: false,
      firstNoteId: 10,
    })
    assert.deepEqual(result.hashes['deadbeef12345678'], {
      discussionId: 'd-3',
      resolved: true,
      firstNoteId: 12,
    })
  })

  it('marks resolved bot discussions as resolved', async () => {
    stub.enqueue(200, [makeDiscussion('d-1', 'issue-hash: cafef00d12345678', true, 99)])
    const r = await gitlabListKnownIssueHashes({ iid: 1 })
    assert.equal(r.hashes['cafef00d12345678']?.resolved, true)
  })

  it('returns empty hashes when there are no discussions', async () => {
    stub.enqueue(200, [])
    const r = await gitlabListKnownIssueHashes({ iid: 1 })
    assert.equal(r.scannedDiscussions, 0)
    assert.equal(r.knownCount, 0)
    assert.deepEqual(r.hashes, {})
  })

  it('handles a discussion whose first note has multiple hashes (keeps both)', async () => {
    stub.enqueue(200, [
      makeDiscussion('d-1', 'issue-hash: aaaa1111bbbb2222 ... issue-hash: cccc3333dddd4444', false, 1),
    ])
    const r = await gitlabListKnownIssueHashes({ iid: 1 })
    assert.equal(r.knownCount, 2)
    assert.ok(r.hashes['aaaa1111bbbb2222'])
    assert.ok(r.hashes['cccc3333dddd4444'])
  })

  it('rejects invalid IID', async () => {
    await assert.rejects(() => gitlabListKnownIssueHashes({ iid: 0 }))
  })
})
