// Tests for mr_list tool: walks workspace and returns file metadata.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { mrList } from '../src/tools/mr_list.ts'
import { _resetRepoRootCache } from '../src/util/workspace.ts'

let repoRoot: string
const TICKET_ID = 'WET-3333'

before(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-repo-list-'))
  const wsBase = path.join(repoRoot, '.dev', 'MR-auto-review', TICKET_ID)

  // Create a few files
  fs.mkdirSync(path.join(wsBase, 'R-tests'), { recursive: true })
  fs.mkdirSync(path.join(wsBase, 'R-code-quality'), { recursive: true })
  fs.mkdirSync(path.join(wsBase, '_signals'), { recursive: true })

  fs.writeFileSync(path.join(wsBase, 'R-tests', 'issue-20260519-100000-001.md'), 'issue1')
  fs.writeFileSync(path.join(wsBase, 'R-tests', 'report-20260519-110000-001.md'), 'report1')
  fs.writeFileSync(path.join(wsBase, 'R-code-quality', 'issue-20260519-120000-001.md'), 'issue2')
  // _signals directory should be skipped
  fs.writeFileSync(path.join(wsBase, '_signals', 'log.jsonl'), '{"signal":"test"}')

  _resetRepoRootCache(repoRoot)
})

after(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true })
  _resetRepoRootCache(null)
})

describe('mrList', () => {
  it('happy path: returns all files excluding _signals/', async () => {
    const results = await mrList({ ticketId: TICKET_ID })

    assert.equal(results.length, 3, 'Should have 3 files (not _signals/)')
    // Ensure _signals is excluded
    for (const item of results) {
      assert.ok(!item.fileId.startsWith('_signals/'), '_signals/ should be excluded')
    }
  })

  it('each item has expected shape', async () => {
    const results = await mrList({ ticketId: TICKET_ID })
    const item = results.find(r => r.fileId.startsWith('R-tests/issue'))
    assert.ok(item, 'Should find R-tests/issue file')
    assert.ok(item.agentName, 'agentName should be set')
    assert.ok(item.kind, 'kind should be set')
    assert.ok(item.timestamp, 'timestamp should be set')
    assert.ok(item.size > 0, 'size should be > 0')
  })

  it('filter by agentName', async () => {
    const results = await mrList({ ticketId: TICKET_ID, filters: { agentName: 'R-tests' } })
    assert.equal(results.length, 2)
    for (const item of results) {
      assert.equal(item.agentName, 'R-tests')
    }
  })

  it('filter by kind', async () => {
    const results = await mrList({ ticketId: TICKET_ID, filters: { kind: 'report' } })
    assert.equal(results.length, 1)
    assert.equal(results[0]?.kind, 'report')
  })

  it('returns empty array when workspace only contains _signals/', async () => {
    // Create a separate ticket with only _signals/
    const onlySignalsTicket = 'WET-9000'
    const wsBase = path.join(repoRoot, '.dev', 'MR-auto-review', onlySignalsTicket)
    fs.mkdirSync(path.join(wsBase, '_signals'), { recursive: true })
    fs.writeFileSync(path.join(wsBase, '_signals', 'log.jsonl'), '{"x":1}')

    const results = await mrList({ ticketId: onlySignalsTicket })
    assert.equal(results.length, 0)
  })

  it('rejects invalid ticketId', async () => {
    await assert.rejects(
      () => mrList({ ticketId: 'NOPE' }),
      /ticketId/,
    )
  })

  it('returns empty array when workspace does not exist', async () => {
    const results = await mrList({ ticketId: 'WET-0000' })
    assert.equal(results.length, 0)
  })
})
