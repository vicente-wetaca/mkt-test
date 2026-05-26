// Tests for ranked-publish: ordering by (severity, confidence, detectorCount),
// stable ties, and over-cap reasoning.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { rankAndCapGroups, type RankableGroup } from '../../src/util/ranked-publish.ts'

/** Convenience to build a RankableGroup with sensible defaults. */
function g(id: string, severity: RankableGroup['severity'], confidence: RankableGroup['confidence'], detectorCount = 1): RankableGroup {
  return { groupId: id, severity, confidence, detectorCount }
}

describe('rankAndCapGroups', () => {
  it('publishes everything when groups.length ≤ cap', () => {
    const result = rankAndCapGroups({
      groups: [g('a', 'nit', 'low'), g('b', 'nit', 'low')],
      cap: 10,
    })
    assert.equal(result.toPublish.length, 2)
    assert.equal(result.overCap.length, 0)
  })

  it('orders by severity descending (must-fix > should-fix > nit)', () => {
    const result = rankAndCapGroups({
      groups: [g('nit', 'nit', 'high'), g('must', 'must-fix', 'low'), g('should', 'should-fix', 'medium')],
      cap: 3,
    })
    assert.deepEqual(result.toPublish.map((x) => x.groupId), ['must', 'should', 'nit'])
  })

  it('breaks ties on severity using confidence descending', () => {
    const result = rankAndCapGroups({
      groups: [g('low', 'must-fix', 'low'), g('high', 'must-fix', 'high'), g('mid', 'must-fix', 'medium')],
      cap: 3,
    })
    assert.deepEqual(result.toPublish.map((x) => x.groupId), ['high', 'mid', 'low'])
  })

  it('breaks ties on confidence using detectorCount descending', () => {
    const result = rankAndCapGroups({
      groups: [
        g('one', 'must-fix', 'high', 1),
        g('three', 'must-fix', 'high', 3),
        g('two', 'must-fix', 'high', 2),
      ],
      cap: 3,
    })
    assert.deepEqual(result.toPublish.map((x) => x.groupId), ['three', 'two', 'one'])
  })

  it('preserves input order on full ties (stable sort)', () => {
    const result = rankAndCapGroups({
      groups: [g('first', 'must-fix', 'high'), g('second', 'must-fix', 'high'), g('third', 'must-fix', 'high')],
      cap: 3,
    })
    assert.deepEqual(result.toPublish.map((x) => x.groupId), ['first', 'second', 'third'])
  })

  it('splits at cap and labels the rest over-cap-N', () => {
    const result = rankAndCapGroups({
      groups: [
        g('a', 'must-fix', 'high'),
        g('b', 'must-fix', 'high'),
        g('c', 'should-fix', 'medium'),
        g('d', 'should-fix', 'low'),
        g('e', 'nit', 'low'),
      ],
      cap: 2,
    })
    assert.deepEqual(result.toPublish.map((x) => x.groupId), ['a', 'b'])
    assert.deepEqual(
      result.overCap.map((x) => ({ id: x.group.groupId, reason: x.reason })),
      [
        { id: 'c', reason: 'over-cap-2' },
        { id: 'd', reason: 'over-cap-2' },
        { id: 'e', reason: 'over-cap-2' },
      ],
    )
  })

  it('cap=0 publishes nothing, all over-cap', () => {
    const result = rankAndCapGroups({
      groups: [g('a', 'must-fix', 'high'), g('b', 'must-fix', 'high')],
      cap: 0,
    })
    assert.equal(result.toPublish.length, 0)
    assert.equal(result.overCap.length, 2)
    assert.equal(result.overCap[0]?.reason, 'over-cap-0')
  })

  it('empty input yields empty output', () => {
    const result = rankAndCapGroups({ groups: [], cap: 5 })
    assert.equal(result.toPublish.length, 0)
    assert.equal(result.overCap.length, 0)
  })

  it('rejects negative cap', () => {
    assert.throws(() => rankAndCapGroups({ groups: [], cap: -1 }))
  })

  it('rejects non-integer cap', () => {
    assert.throws(() => rankAndCapGroups({ groups: [], cap: 1.5 }))
  })

  it('is generic over richer group types', () => {
    interface Rich extends RankableGroup {
      filePath: string
    }
    const result = rankAndCapGroups<Rich>({
      groups: [
        { groupId: 'a', severity: 'must-fix', confidence: 'high', detectorCount: 1, filePath: 'a.ts' },
        { groupId: 'b', severity: 'nit', confidence: 'low', detectorCount: 1, filePath: 'b.ts' },
      ],
      cap: 1,
    })
    // The TS type carries `filePath` through — compile-time check
    assert.equal(result.toPublish[0]?.filePath, 'a.ts')
    assert.equal(result.overCap[0]?.group.filePath, 'b.ts')
  })
})
