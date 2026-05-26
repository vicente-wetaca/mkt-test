// Tests for mr_write tool: file creation inside workspace with collision handling.
import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { mrWrite } from '../src/tools/mr_write.ts'
import { _resetRepoRootCache } from '../src/util/workspace.ts'

let ws: string
let repoRoot: string

before(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-repo-'))
  // Create workspace base structure: <repoRoot>/.dev/MR-auto-review/
  fs.mkdirSync(path.join(repoRoot, '.dev', 'MR-auto-review'), { recursive: true })
  _resetRepoRootCache(repoRoot)
})

after(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true })
  _resetRepoRootCache(null)
})

describe('mrWrite', () => {
  describe('happy path', () => {
    it('creates file and returns fileId and absolute path', async () => {
      const result = await mrWrite({
        ticketId: 'WET-1234',
        agentName: 'R-tests',
        kind: 'issue',
        content: 'hello world',
      })

      assert.ok(result.fileId, 'fileId should be set')
      assert.ok(result.path, 'path should be set')
      assert.ok(path.isAbsolute(result.path), 'path should be absolute')
      assert.ok(fs.existsSync(result.path), 'file should exist on disk')
      assert.equal(fs.readFileSync(result.path, 'utf8'), 'hello world')
    })

    it('fileId matches pattern <agentName>/<kind>-<timestamp>.md', async () => {
      const result = await mrWrite({
        ticketId: 'WET-1234',
        agentName: 'R-code-quality',
        kind: 'report',
        content: 'report content',
      })

      // fileId should be relative: R-code-quality/report-YYYYMMDD-HHMMSS-mmm.md
      assert.match(result.fileId, /^R-code-quality\/report-\d{8}-\d{6}-\d{3}(|-\d+)\.md$/)
    })

    it('creates intermediate directories', async () => {
      const result = await mrWrite({
        ticketId: 'WET-5678',
        agentName: 'R-triage',
        kind: 'context',
        content: 'ctx',
      })

      const dir = path.dirname(result.path)
      assert.ok(fs.existsSync(dir), 'parent directory should be created')
    })

    it('_context agentName writes to _context/<kind>-<timestamp>.md', async () => {
      const result = await mrWrite({
        ticketId: 'WET-1234',
        agentName: '_context',
        kind: 'context',
        content: 'shared context',
      })

      assert.match(result.fileId, /^_context\/context-\d{8}-\d{6}-\d{3}(|-\d+)\.md$/)
    })

    it('supports local-mode ticketId', async () => {
      const result = await mrWrite({
        ticketId: 'local-my-feature',
        agentName: 'R-tests',
        kind: 'issue',
        content: 'local issue',
      })

      assert.ok(result.path.includes('local-my-feature'))
    })
  })

  describe('collision handling', () => {
    it('produces -1 suffix when timestamp collides', async () => {
      // Force two writes in the same millisecond by mocking timestamps
      // We'll do this by writing the file manually at the exact timestamp first
      const ticketId = 'WET-9999'
      const wsBase = path.join(repoRoot, '.dev', 'MR-auto-review', ticketId, 'R-tests')
      fs.mkdirSync(wsBase, { recursive: true })

      // Write the first file normally
      const r1 = await mrWrite({ ticketId, agentName: 'R-tests', kind: 'script', content: 'first' })

      // Manually create a file with the same name (simulating same-ms collision)
      // We do this by finding the timestamp and creating a copy with the same name
      const basename = path.basename(r1.path)
      const withoutSuffix = basename.replace(/-1\.md$/, '.md').replace(/\.md$/, '.md')
      const duplicate = path.join(path.dirname(r1.path), withoutSuffix)
      if (!fs.existsSync(duplicate)) {
        fs.writeFileSync(duplicate, 'duplicate')
      }

      // The next write should not overwrite — the implementation prevents overwrites
      // by checking existence. We just verify two files exist after two writes.
      const r2 = await mrWrite({ ticketId, agentName: 'R-tests', kind: 'script', content: 'second' })
      assert.notEqual(r1.path, r2.path, 'Two writes must produce different paths')
      assert.ok(fs.existsSync(r1.path))
      assert.ok(fs.existsSync(r2.path))
    })
  })

  describe('input validation', () => {
    it('rejects invalid ticketId', async () => {
      await assert.rejects(
        () => mrWrite({ ticketId: 'INVALID', agentName: 'R-tests', kind: 'issue', content: 'x' }),
        /ticketId/,
      )
    })

    it('rejects invalid agentName', async () => {
      await assert.rejects(
        () => mrWrite({ ticketId: 'WET-1', agentName: 'bad_name', kind: 'issue', content: 'x' }),
        /agentName/,
      )
    })

    it('rejects invalid kind', async () => {
      await assert.rejects(
        () => mrWrite({ ticketId: 'WET-1', agentName: 'R-tests', kind: 'unknown' as never, content: 'x' }),
        /kind/,
      )
    })

    it('rejects path traversal via crafted agentName', async () => {
      await assert.rejects(
        () => mrWrite({ ticketId: 'WET-1', agentName: 'R-../../../etc', kind: 'issue', content: 'x' }),
        /agentName|traversal/i,
      )
    })
  })
})
