// Tests for mr_read tool: reads a file by fileId and parses metadata from filename.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { mrRead } from '../src/tools/mr_read.ts'
import { _resetRepoRootCache } from '../src/util/workspace.ts'

let repoRoot: string
const TICKET_ID = 'WET-2222'

before(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-repo-read-'))
  // Pre-create a file the tests can read
  const agentDir = path.join(repoRoot, '.dev', 'MR-auto-review', TICKET_ID, 'R-tests')
  fs.mkdirSync(agentDir, { recursive: true })
  fs.writeFileSync(
    path.join(agentDir, 'issue-20260519-143022-001.md'),
    'file content here',
  )
  _resetRepoRootCache(repoRoot)
})

after(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true })
  _resetRepoRootCache(null)
})

describe('mrRead', () => {
  it('happy path: returns content and parsed metadata', async () => {
    const result = await mrRead({
      ticketId: TICKET_ID,
      fileId: 'R-tests/issue-20260519-143022-001.md',
    })

    assert.equal(result.content, 'file content here')
    assert.equal(result.metadata.agentName, 'R-tests')
    assert.equal(result.metadata.kind, 'issue')
    assert.equal(result.metadata.timestamp, '20260519-143022-001')
    assert.ok(result.metadata.size > 0)
  })

  it('rejects path traversal via fileId', async () => {
    await assert.rejects(
      () => mrRead({ ticketId: TICKET_ID, fileId: '../other-ticket/secret.md' }),
      /traversal|outside/i,
    )
  })

  it('errors when file does not exist', async () => {
    await assert.rejects(
      () => mrRead({ ticketId: TICKET_ID, fileId: 'R-tests/nonexistent.md' }),
      /ENOENT|not found/i,
    )
  })

  it('rejects invalid ticketId', async () => {
    await assert.rejects(
      () => mrRead({ ticketId: 'NOPE', fileId: 'R-tests/issue-foo.md' }),
      /ticketId/,
    )
  })

  it('rejects NUL byte in fileId', async () => {
    await assert.rejects(
      () => mrRead({ ticketId: TICKET_ID, fileId: 'R-tests/issue\0.md' }),
      /NUL|traversal/i,
    )
  })
})
