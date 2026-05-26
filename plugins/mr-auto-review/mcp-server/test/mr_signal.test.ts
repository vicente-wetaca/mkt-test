// Tests for mr_signal tool: appends signal events to _signals/log.jsonl.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { mrSignal } from '../src/tools/mr_signal.ts'
import { _resetRepoRootCache } from '../src/util/workspace.ts'

let repoRoot: string
const TICKET_ID = 'WET-5555'

before(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-repo-signal-'))
  fs.mkdirSync(path.join(repoRoot, '.dev', 'MR-auto-review'), { recursive: true })
  _resetRepoRootCache(repoRoot)
})

after(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true })
  _resetRepoRootCache(null)
})

describe('mrSignal', () => {
  it('creates _signals/ directory if missing and appends a line', async () => {
    const result = await mrSignal({
      ticketId: TICKET_ID,
      agentName: 'R-triage',
      signal: 'BLOCKER_ESCALATION',
      payload: { reason: 'test blocker' },
    })

    assert.ok(result.ok)
    assert.ok(result.signalId, 'signalId should be a non-empty string')

    const logPath = path.join(repoRoot, '.dev', 'MR-auto-review', TICKET_ID, '_signals', 'log.jsonl')
    assert.ok(fs.existsSync(logPath), 'log.jsonl should be created')

    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n')
    assert.equal(lines.length, 1)
    const entry = JSON.parse(lines[0] ?? '{}')
    assert.equal(entry.agentName, 'R-triage')
    assert.equal(entry.signal, 'BLOCKER_ESCALATION')
    assert.deepEqual(entry.payload, { reason: 'test blocker' })
    assert.ok(entry.id)
    assert.ok(entry.timestamp)
  })

  it('appends to existing log.jsonl without overwriting', async () => {
    // Write second signal
    await mrSignal({
      ticketId: TICKET_ID,
      agentName: 'R-tests',
      signal: 'KB_GAP',
      payload: { topic: 'missing docs' },
    })

    const logPath = path.join(repoRoot, '.dev', 'MR-auto-review', TICKET_ID, '_signals', 'log.jsonl')
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n')
    assert.ok(lines.length >= 2, 'Should have at least 2 lines in the log')
  })

  it('each call produces a unique signalId', async () => {
    const r1 = await mrSignal({
      ticketId: TICKET_ID,
      agentName: 'R-triage',
      signal: 'AMBIGUITY_NEEDS_HUMAN',
      payload: {},
    })
    const r2 = await mrSignal({
      ticketId: TICKET_ID,
      agentName: 'R-triage',
      signal: 'AMBIGUITY_NEEDS_HUMAN',
      payload: {},
    })

    assert.notEqual(r1.signalId, r2.signalId)
  })

  it('rejects invalid signal type', async () => {
    await assert.rejects(
      () => mrSignal({
        ticketId: TICKET_ID,
        agentName: 'R-triage',
        signal: 'UNKNOWN_SIGNAL' as never,
        payload: {},
      }),
      /signal/,
    )
  })

  it('rejects invalid ticketId', async () => {
    await assert.rejects(
      () => mrSignal({ ticketId: 'BAD', agentName: 'R-triage', signal: 'KB_GAP', payload: {} }),
      /ticketId/,
    )
  })

  it('rejects invalid agentName', async () => {
    await assert.rejects(
      () => mrSignal({ ticketId: TICKET_ID, agentName: 'bad', signal: 'KB_GAP', payload: {} }),
      /agentName/,
    )
  })
})
