// Tests for cost-tracker: estimate + decision under different modes.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  BUCKET_CAPS,
  estimateRunCost,
  decideCostAction,
} from '../../src/util/cost-tracker.ts'

describe('estimateRunCost', () => {
  it('returns the bucket caps verbatim in output', () => {
    const e = estimateRunCost({
      bucket: 'MEDIUM',
      specialistsCount: 3,
      hasTriage: true,
      hasTestsSummary: false,
    })
    assert.deepEqual(e.cap, BUCKET_CAPS.MEDIUM)
  })

  it('scales with number of specialists', () => {
    const a = estimateRunCost({ bucket: 'MEDIUM', specialistsCount: 1, hasTriage: true, hasTestsSummary: false })
    const b = estimateRunCost({ bucket: 'MEDIUM', specialistsCount: 5, hasTriage: true, hasTestsSummary: false })
    assert.ok(b.estimated_total_tokens > a.estimated_total_tokens)
  })

  it('triage adds opus tokens (counts in totals)', () => {
    const noTriage = estimateRunCost({ bucket: 'MEDIUM', specialistsCount: 3, hasTriage: false, hasTestsSummary: false })
    const withTriage = estimateRunCost({ bucket: 'MEDIUM', specialistsCount: 3, hasTriage: true, hasTestsSummary: false })
    assert.ok(withTriage.estimated_total_tokens > noTriage.estimated_total_tokens)
    assert.ok(withTriage.estimated_cost_usd > noTriage.estimated_cost_usd)
  })

  it('tests-summary adds tokens when present', () => {
    const a = estimateRunCost({ bucket: 'MEDIUM', specialistsCount: 3, hasTriage: true, hasTestsSummary: false })
    const b = estimateRunCost({ bucket: 'MEDIUM', specialistsCount: 3, hasTriage: true, hasTestsSummary: true })
    assert.ok(b.estimated_total_tokens > a.estimated_total_tokens)
  })

  it('fits_in_cap reflects total vs bucket cap', () => {
    const tiny = estimateRunCost({ bucket: 'TINY', specialistsCount: 1, hasTriage: true, hasTestsSummary: false })
    // TINY cap = 30K total. base 40% of 10K + 5K input + triage 40K + spec 25K = blowout
    assert.ok(tiny.estimated_total_tokens > tiny.cap.total)
    assert.equal(tiny.fits_in_cap, false)

    const huge = estimateRunCost({ bucket: 'HUGE', specialistsCount: 5, hasTriage: true, hasTestsSummary: true })
    // HUGE cap = 4M; estimate well under
    assert.ok(huge.estimated_total_tokens < huge.cap.total)
    assert.equal(huge.fits_in_cap, true)
  })

  it('cost is non-zero', () => {
    const e = estimateRunCost({ bucket: 'SMALL', specialistsCount: 2, hasTriage: true, hasTestsSummary: false })
    assert.ok(e.estimated_cost_usd > 0)
  })

  it('cap_ratio reflects how close the estimate is to the cap', () => {
    const e = estimateRunCost({ bucket: 'HUGE', specialistsCount: 1, hasTriage: false, hasTestsSummary: false })
    assert.ok(e.cap_ratio < 0.5) // small run in HUGE bucket
  })
})

describe('decideCostAction', () => {
  const sample = {
    bucket: 'MEDIUM' as const,
    estimated_input_tokens: 100_000,
    estimated_output_tokens: 50_000,
    estimated_total_tokens: 150_000,
    estimated_cost_usd: 1.0,
    cap: BUCKET_CAPS.MEDIUM,
    fits_in_cap: true,
    cap_ratio: 0.375,
  }

  it('returns continue when estimate is below threshold', () => {
    const result = decideCostAction(sample, 'assisted')
    assert.equal(result.decision, 'continue')
  })

  it('returns human-gate in assisted mode when over threshold', () => {
    // MEDIUM cap = 400K; threshold with 1.5x = 600K. So use estimate of 700K.
    const overEstimate = { ...sample, estimated_total_tokens: 700_000 }
    const result = decideCostAction(overEstimate, 'assisted')
    assert.equal(result.decision, 'human-gate')
  })

  it('returns abort in unattended mode when over threshold', () => {
    const overEstimate = { ...sample, estimated_total_tokens: 700_000 }
    const result = decideCostAction(overEstimate, 'unattended')
    assert.equal(result.decision, 'abort')
  })

  it('threshold scales with multiplier', () => {
    // estimate 500K; 1.0 multiplier on 400K cap → threshold 400K → over
    const e = { ...sample, estimated_total_tokens: 500_000 }
    assert.equal(decideCostAction(e, 'unattended', 1.0).decision, 'abort')
    // estimate 500K; 2.0 multiplier on 400K cap → threshold 800K → continue
    assert.equal(decideCostAction(e, 'unattended', 2.0).decision, 'continue')
  })

  it('threshold_tokens reports the resolved threshold', () => {
    const result = decideCostAction(sample, 'unattended', 1.5)
    assert.equal(result.threshold_tokens, 600_000)
  })

  it('reason includes the comparison values', () => {
    const result = decideCostAction(sample, 'assisted')
    assert.ok(result.reason.includes(String(sample.estimated_total_tokens)))
    assert.ok(result.reason.includes(String(result.threshold_tokens)))
  })
})

describe('BUCKET_CAPS', () => {
  it('caps are monotone non-decreasing from TINY to HUGE', () => {
    const order = ['TINY', 'SMALL', 'MEDIUM', 'LARGE', 'HUGE'] as const
    for (let i = 0; i < order.length - 1; i++) {
      const a = order[i]!
      const b = order[i + 1]!
      assert.ok(BUCKET_CAPS[a].total < BUCKET_CAPS[b].total, `${a} < ${b}`)
      assert.ok(BUCKET_CAPS[a].input < BUCKET_CAPS[b].input)
      assert.ok(BUCKET_CAPS[a].output < BUCKET_CAPS[b].output)
    }
  })
})
