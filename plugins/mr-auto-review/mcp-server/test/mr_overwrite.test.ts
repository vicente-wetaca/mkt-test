// Tests for mr_overwrite tool: atomically updates an existing file in the workspace.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { mrOverwrite } from '../src/tools/mr_overwrite.ts'
import { _resetRepoRootCache } from '../src/util/workspace.ts'

let repoRoot: string
const TICKET_ID = 'WET-4444'
const EXISTING_FILE_ID = 'R-triage/REVIEW-SUMMARY.md'

before(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-repo-overwrite-'))
  const wsBase = path.join(repoRoot, '.dev', 'MR-auto-review', TICKET_ID)
  fs.mkdirSync(path.join(wsBase, 'R-triage'), { recursive: true })
  fs.writeFileSync(path.join(wsBase, EXISTING_FILE_ID), 'original content')
  _resetRepoRootCache(repoRoot)
})

after(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true })
  _resetRepoRootCache(null)
})

describe('mrOverwrite', () => {
  it('happy path: overwrites existing file and returns path', async () => {
    const result = await mrOverwrite({
      ticketId: TICKET_ID,
      fileId: EXISTING_FILE_ID,
      content: 'updated content',
    })

    assert.ok(result.path, 'path should be returned')
    assert.ok(path.isAbsolute(result.path))
    const written = fs.readFileSync(result.path, 'utf8')
    assert.equal(written, 'updated content')
  })

  it('errors when target file does not exist', async () => {
    await assert.rejects(
      () => mrOverwrite({
        ticketId: TICKET_ID,
        fileId: 'R-triage/nonexistent.md',
        content: 'data',
      }),
      /not found|ENOENT|does not exist/i,
    )
  })

  it('rejects path traversal via fileId', async () => {
    await assert.rejects(
      () => mrOverwrite({
        ticketId: TICKET_ID,
        fileId: '../other/file.md',
        content: 'data',
      }),
      /traversal|outside/i,
    )
  })

  it('rejects invalid ticketId', async () => {
    await assert.rejects(
      () => mrOverwrite({ ticketId: 'BAD', fileId: EXISTING_FILE_ID, content: 'x' }),
      /ticketId/,
    )
  })

  it('performs atomic write (file must be complete after write)', async () => {
    const result = await mrOverwrite({
      ticketId: TICKET_ID,
      fileId: EXISTING_FILE_ID,
      content: 'atomic content',
    })

    // After overwrite, no .tmp file should remain
    const tmpPath = result.path + '.tmp'
    assert.ok(!fs.existsSync(tmpPath), '.tmp file should be cleaned up')
    assert.equal(fs.readFileSync(result.path, 'utf8'), 'atomic content')
  })
})
