// Tests for marker-note: round-trip compose↔parse + robustness to extra whitespace.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { composeMarkerNote, parseMarkerNote, type MarkerNoteInput } from '../../src/util/marker-note.ts'

const BASE: MarkerNoteInput = {
  headSha: '69ab9e01ac67abc1',
  timestamp: '2026-05-20T15:30:00Z',
  publishedCount: 7,
  totalDetected: 12,
  filteredByPolicy: 3,
  filteredByCap: 2,
  tokensSpent: 184320,
  bucket: 'MEDIUM',
  pluginVersion: '0.3.0',
}

describe('composeMarkerNote', () => {
  it('emits the run-completed prefix and the marker line', () => {
    const body = composeMarkerNote(BASE)
    assert.ok(body.startsWith('🤖 MR-auto-review · run completed'))
    assert.ok(body.includes('*marker: run-completed*'))
  })

  it('reports the published/detected/filtered counters', () => {
    const body = composeMarkerNote(BASE)
    assert.ok(
      body.includes('Comments published: 7 (of 12 detected; 3 filtered by policy; 2 filtered by cap)'),
    )
  })

  it('includes SHA, timestamp, tokens, bucket and version', () => {
    const body = composeMarkerNote(BASE)
    assert.ok(body.includes('SHA reviewed: 69ab9e01ac67abc1'))
    assert.ok(body.includes('Timestamp: 2026-05-20T15:30:00Z'))
    assert.ok(body.includes('Tokens spent: 184320'))
    assert.ok(body.includes('Bucket: MEDIUM'))
    assert.ok(body.includes('Plugin version: 0.3.0'))
  })
})

describe('parseMarkerNote', () => {
  it('round-trips a freshly composed marker', () => {
    const parsed = parseMarkerNote(composeMarkerNote(BASE))
    assert.deepEqual(parsed, {
      headSha: BASE.headSha,
      timestamp: BASE.timestamp,
      publishedCount: BASE.publishedCount,
      totalDetected: BASE.totalDetected,
      filteredByPolicy: BASE.filteredByPolicy,
      filteredByCap: BASE.filteredByCap,
      tokensSpent: BASE.tokensSpent,
      bucket: BASE.bucket,
      pluginVersion: BASE.pluginVersion,
    })
  })

  it('returns null when the marker line is missing', () => {
    const text = `🤖 MR-auto-review · run completed
SHA reviewed: abc
Timestamp: 2026-05-20T15:30:00Z
Comments published: 1 (of 1 detected; 0 filtered by policy; 0 filtered by cap)
Tokens spent: 1
Bucket: TINY
Plugin version: 0.1.0`
    assert.equal(parseMarkerNote(text), null)
  })

  it('returns null when a required field is missing', () => {
    const text = '*marker: run-completed*\nNo other fields here.'
    assert.equal(parseMarkerNote(text), null)
  })

  it('tolerates extra whitespace and italics wrapper', () => {
    const messy = composeMarkerNote(BASE).replace('Bucket: MEDIUM', 'Bucket:    MEDIUM')
    const parsed = parseMarkerNote(messy)
    assert.equal(parsed?.bucket, 'MEDIUM')
  })

  it('handles a plain (non-italic) marker line', () => {
    const text = composeMarkerNote(BASE).replace('*marker: run-completed*', 'marker: run-completed')
    const parsed = parseMarkerNote(text)
    assert.equal(parsed?.headSha, BASE.headSha)
  })

  it('parses HUGE bucket without trouble', () => {
    const huge = composeMarkerNote({ ...BASE, bucket: 'HUGE' })
    assert.equal(parseMarkerNote(huge)?.bucket, 'HUGE')
  })

  it('parses semver with pre-release suffix', () => {
    const pre = composeMarkerNote({ ...BASE, pluginVersion: '0.3.0-rc.1' })
    assert.equal(parseMarkerNote(pre)?.pluginVersion, '0.3.0-rc.1')
  })

  it('returns null on random unrelated text', () => {
    assert.equal(parseMarkerNote('hello world'), null)
    assert.equal(parseMarkerNote(''), null)
  })
})
