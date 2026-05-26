// Tests for compute_huge_partitions MCP tool: smoke + Zod validation.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { computeHugePartitionsTool } from '../../src/tools/orchestrator/compute_huge_partitions.ts'

describe('computeHugePartitionsTool (MCP)', () => {
  it('smoke: returns waves + totals for a minimal input', () => {
    const result = computeHugePartitionsTool({
      modules: [{ module: 'services/x', files: 1, paths: ['services/x/a.ts'] }],
      candidateSpecialists: ['R-code-quality'],
      hasTriage: true,
      hasTestsSummary: false,
    })
    assert.equal(result.total_waves, 1)
    assert.ok(result.total_estimated_tokens > 0)
  })

  it('rejects empty modules array', () => {
    assert.throws(() =>
      computeHugePartitionsTool({
        modules: [],
        candidateSpecialists: ['R-code-quality'],
        hasTriage: true,
        hasTestsSummary: false,
      }),
    )
  })

  it('rejects negative file count', () => {
    assert.throws(() =>
      computeHugePartitionsTool({
        modules: [{ module: 'a', files: -1, paths: [] }],
        candidateSpecialists: [],
        hasTriage: false,
        hasTestsSummary: false,
      }),
    )
  })

  it('rejects invalid bucket override', () => {
    assert.throws(() =>
      // @ts-expect-error testing runtime rejection
      computeHugePartitionsTool({
        modules: [{ module: 'a', files: 1, paths: [] }],
        candidateSpecialists: [],
        hasTriage: false,
        hasTestsSummary: false,
        perWaveBucket: 'GIGA',
      }),
    )
  })
})
