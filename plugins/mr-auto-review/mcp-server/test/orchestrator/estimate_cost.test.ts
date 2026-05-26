// Tests for estimate_cost MCP tool: smoke + Zod validation.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { estimateCost } from '../../src/tools/orchestrator/estimate_cost.ts'

describe('estimateCost (MCP tool)', () => {
  it('returns both estimate fields and a decision verdict', () => {
    const result = estimateCost({
      bucket: 'MEDIUM',
      specialistsCount: 3,
      hasTriage: true,
      hasTestsSummary: false,
      mode: 'assisted',
    })
    assert.ok(result.estimated_total_tokens > 0)
    assert.ok(result.cap)
    assert.ok(['continue', 'human-gate', 'abort'].includes(result.decision.decision))
  })

  it('honours custom multiplier', () => {
    const tight = estimateCost({
      bucket: 'TINY',
      specialistsCount: 5,
      hasTriage: true,
      hasTestsSummary: true,
      mode: 'unattended',
      multiplier: 1.0,
    })
    // TINY cap is so low that a 5-specialist run always blows it
    assert.equal(tight.decision.decision, 'abort')
  })

  it('rejects invalid bucket', () => {
    assert.throws(() =>
      // @ts-expect-error testing runtime rejection
      estimateCost({
        bucket: 'GIGA',
        specialistsCount: 1,
        hasTriage: true,
        hasTestsSummary: false,
        mode: 'assisted',
      }),
    )
  })

  it('rejects negative specialistsCount', () => {
    assert.throws(() =>
      estimateCost({
        bucket: 'MEDIUM',
        specialistsCount: -1,
        hasTriage: true,
        hasTestsSummary: false,
        mode: 'assisted',
      }),
    )
  })

  it('rejects unknown mode', () => {
    assert.throws(() =>
      // @ts-expect-error testing runtime rejection
      estimateCost({
        bucket: 'MEDIUM',
        specialistsCount: 1,
        hasTriage: true,
        hasTestsSummary: false,
        mode: 'wild',
      }),
    )
  })
})
