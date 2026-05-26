// Opt-in integration test against the real GitLab API.
// Gated by env GITLAB_INTEGRATION=1 + GITLAB_TEST_IID=<iid>.
// Reads credentials from the current repo's `git remote get-url origin`.
//
// What it does (in this order):
//   1. gitlab_get_mr(iid) → asserts the MR exists and has diff_refs
//   2. gitlab_list_discussions(iid) → records count for delta check
//   3. gitlab_create_discussion(iid, body) → MR-level comment with a probe marker
//   4. gitlab_list_discussions(iid) → count increased by exactly 1
//   5. gitlab_resolve_discussion(iid, discussionId) → marks resolved (best-effort)
//
// To run:
//   GITLAB_INTEGRATION=1 GITLAB_TEST_IID=42 npm test
//
// The test ALWAYS leaves a comment on the MR. Pick an IID where this is acceptable
// (e.g. a dedicated test MR or your own draft branch). The probe body starts with
// `🤖 MR-auto-review · integration-probe` so it's easy to spot and clean up.

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'

import { gitlabGetMr } from '../../src/tools/gitlab/get_mr.ts'
import { gitlabListDiscussions } from '../../src/tools/gitlab/list_discussions.ts'
import { gitlabCreateDiscussion } from '../../src/tools/gitlab/create_discussion.ts'
import { gitlabResolveDiscussion } from '../../src/tools/gitlab/resolve_discussion.ts'

const ENABLED = process.env.GITLAB_INTEGRATION === '1'
const RAW_IID = process.env.GITLAB_TEST_IID
const TEST_IID = RAW_IID !== undefined && RAW_IID.length > 0 ? Number.parseInt(RAW_IID, 10) : NaN

describe('gitlab integration (opt-in)', { skip: !ENABLED || Number.isNaN(TEST_IID) }, () => {
  before(() => {
    if (!ENABLED) {
      // eslint-disable-next-line no-console
      console.log('Skipping gitlab integration tests (set GITLAB_INTEGRATION=1 and GITLAB_TEST_IID=<iid>)')
    }
  })

  it(
    'creates and resolves a probe discussion end-to-end',
    { skip: !ENABLED || Number.isNaN(TEST_IID) },
    async () => {
      // 1. Fetch the MR
      const mr = await gitlabGetMr({ iid: TEST_IID })
      assert.equal(mr.iid, TEST_IID)
      assert.ok(mr.base_sha.length > 0)
      assert.ok(mr.head_sha.length > 0)

      // 2. Baseline discussion count
      const before = await gitlabListDiscussions({ iid: TEST_IID })
      const beforeCount = before.discussions.length

      // 3. Create probe discussion (MR-level, no position)
      const body = `🤖 MR-auto-review · integration-probe\n\nProbe created at ${new Date().toISOString()}. Safe to ignore.`
      const created = await gitlabCreateDiscussion({ iid: TEST_IID, body })
      assert.ok(created.discussionId.length > 0)
      assert.ok(created.firstNoteId > 0)

      // 4. Count delta
      const after = await gitlabListDiscussions({ iid: TEST_IID })
      assert.equal(after.discussions.length, beforeCount + 1)

      // 5. Resolve (best-effort — MR-level discussions may not be resolvable)
      try {
        const resolved = await gitlabResolveDiscussion({
          iid: TEST_IID,
          discussionId: created.discussionId,
        })
        assert.equal(resolved.ok, true)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `Resolve failed (expected for non-resolvable discussions): ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    },
  )
})
