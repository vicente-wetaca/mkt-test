// Tests for gitlab_get_diff: writes the unified diff to disk and returns the path
// (the response no longer carries the diff content — keeps LLM context lean).
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { gitlabGetDiff } from '../../src/tools/gitlab/get_diff.ts'
import { _resetCredentialsCache } from '../../src/tools/gitlab/auth.ts'
import { _resetRepoRootCache } from '../../src/util/workspace.ts'
import { stubFetch, type Stub } from './_helpers.ts'

let stub: Stub
let tempRepoRoot: string

beforeEach(() => {
  _resetCredentialsCache({
    apiBase: 'https://gitlab.test/api/v4',
    projectPath: 'foo/bar',
    projectPathEncoded: 'foo%2Fbar',
    token: 'glpat-fake',
    tokenFromEnv: false,
  })
  // Per-test isolated repo root so workspace writes don't collide
  tempRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-auto-review-test-'))
  _resetRepoRootCache(tempRepoRoot)
  stub = stubFetch()
})

describe('gitlabGetDiff', () => {
  it('writes the unified diff to a file and returns its absolute path (tempdir mode)', async () => {
    stub.enqueue(200, {
      diff_refs: { base_sha: 'a1', head_sha: 'b2c3d4e5f60718293a4b', start_sha: 'c3' },
      changes: [
        {
          old_path: 'src/old.ts',
          new_path: 'src/new.ts',
          a_mode: '100644',
          b_mode: '100644',
          diff: '@@ -1 +1 @@\n-old\n+new',
          new_file: false,
          renamed_file: true,
          deleted_file: false,
        },
        {
          old_path: 'src/other.ts',
          new_path: 'src/other.ts',
          a_mode: '100644',
          b_mode: '100644',
          diff: '@@ -10 +10 @@\n-foo\n+bar',
          new_file: false,
          renamed_file: false,
          deleted_file: false,
        },
      ],
    })

    const result = await gitlabGetDiff({ iid: 7 })
    assert.equal(result.base_sha, 'a1')
    assert.equal(result.head_sha, 'b2c3d4e5f60718293a4b')
    assert.equal(result.files.length, 2)

    assert.ok(path.isAbsolute(result.unified_diff_path), 'unified_diff_path must be absolute')
    assert.ok(result.unified_diff_path.includes('iid7'), 'filename must mention the IID')
    assert.ok(fs.existsSync(result.unified_diff_path), 'the diff file must exist on disk')

    const onDisk = fs.readFileSync(result.unified_diff_path, 'utf8')
    assert.ok(onDisk.includes('diff --git a/src/old.ts b/src/new.ts'))
    assert.ok(onDisk.includes('--- a/src/old.ts'))
    assert.ok(onDisk.includes('+++ b/src/new.ts'))
    assert.ok(onDisk.includes('diff --git a/src/other.ts b/src/other.ts'))
    assert.ok(onDisk.includes('--- a/src/other.ts'))
    assert.ok(onDisk.includes('+++ b/src/other.ts'))
    assert.ok(onDisk.includes('+new'))
    assert.ok(onDisk.includes('+bar'))
    assert.equal(result.unified_diff_bytes, Buffer.byteLength(onDisk, 'utf8'))
  })

  it('writes to the workspace _context dir when ticketId is provided', async () => {
    stub.enqueue(200, {
      diff_refs: { base_sha: 'aa', head_sha: 'bb', start_sha: 'cc' },
      changes: [
        {
          old_path: 'a.ts',
          new_path: 'a.ts',
          a_mode: '100644',
          b_mode: '100644',
          diff: '@@ -1 +1 @@\n-x\n+y',
          new_file: false,
          renamed_file: false,
          deleted_file: false,
        },
      ],
    })
    const result = await gitlabGetDiff({ iid: 42, ticketId: 'WET-1234' })
    const expectedDir = path.join(tempRepoRoot, '.dev', 'MR-auto-review', 'WET-1234', '_context')
    assert.equal(path.dirname(result.unified_diff_path), expectedDir)
    assert.equal(path.basename(result.unified_diff_path), 'diff-iid42.patch')
    assert.ok(fs.existsSync(result.unified_diff_path))
  })

  it('rejects an invalid ticketId pattern', async () => {
    await assert.rejects(
      () => gitlabGetDiff({ iid: 1, ticketId: 'INVALID_FORMAT' }),
      /ticketId/i,
    )
  })

  it('handles empty changes list — writes an empty file and reports 0 bytes', async () => {
    stub.enqueue(200, {
      diff_refs: { base_sha: 'a', head_sha: 'b', start_sha: 'c' },
      changes: [],
    })
    const result = await gitlabGetDiff({ iid: 1 })
    assert.equal(result.files.length, 0)
    assert.equal(result.unified_diff_bytes, 0)
    assert.equal(fs.readFileSync(result.unified_diff_path, 'utf8'), '')
  })

  it('returns per-file summary with diff_preview (truncated when long)', async () => {
    const longDiff = Array.from({ length: 40 }, (_, i) => `+ line${i}`).join('\n')
    stub.enqueue(200, {
      diff_refs: { base_sha: 'a', head_sha: 'b', start_sha: 'c' },
      changes: [
        {
          old_path: 'big.ts',
          new_path: 'big.ts',
          a_mode: '100644',
          b_mode: '100644',
          diff: longDiff,
          new_file: false,
          renamed_file: false,
          deleted_file: false,
        },
      ],
    })
    const result = await gitlabGetDiff({ iid: 5 })
    const preview = result.files[0].diff_preview
    assert.ok(preview.includes('+ line0'))
    assert.ok(preview.includes('+ line31'))
    assert.ok(!preview.includes('+ line35'), 'preview must truncate at 32 lines')
    assert.match(preview, /more lines, see unified_diff_path/)
  })

  it('renders /dev/null for new files (no old path) and deleted files (no new path)', async () => {
    stub.enqueue(200, {
      diff_refs: { base_sha: 'a', head_sha: 'b', start_sha: 'c' },
      changes: [
        {
          old_path: 'new.ts',
          new_path: 'new.ts',
          a_mode: '0',
          b_mode: '100644',
          diff: '@@ -0,0 +1,2 @@\n+a\n+b',
          new_file: true,
          renamed_file: false,
          deleted_file: false,
        },
        {
          old_path: 'gone.ts',
          new_path: 'gone.ts',
          a_mode: '100644',
          b_mode: '0',
          diff: '@@ -1,2 +0,0 @@\n-a\n-b',
          new_file: false,
          renamed_file: false,
          deleted_file: true,
        },
      ],
    })
    const result = await gitlabGetDiff({ iid: 8 })
    const onDisk = fs.readFileSync(result.unified_diff_path, 'utf8')
    assert.ok(onDisk.includes('--- /dev/null\n+++ b/new.ts'))
    assert.ok(onDisk.includes('--- a/gone.ts\n+++ /dev/null'))
  })

  it('throws when diff_refs missing', async () => {
    stub.enqueue(200, { changes: [] })
    await assert.rejects(() => gitlabGetDiff({ iid: 1 }), /diff_refs/)
  })
})
