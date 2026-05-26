// Tests for huge-partitions: ordering, specialist affinity, cost roll-up.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { computeHugePartitions } from '../../src/util/huge-partitions.ts'

const ALL_SPECIALISTS = [
  'R-code-quality',
  'R-tests',
  'R-mr-hygiene',
  'R-di',
  'R-monorepo',
  'R-solid',
  'R-homogeneity',
  'R-mongo-aggs',
  'R-mongo-queries',
  'R-event-types',
  'R-apollo-cache',
  'R-perf-frontend',
  'R-perf-backend',
  'R-infra-protect',
  'R-gitlab-ci',
  'R-security',
  'R-migrations',
  'R-regressions',
  'R-functional-completeness',
  'R-third-party-docs',
]

describe('computeHugePartitions', () => {
  it('returns one wave per module', () => {
    const result = computeHugePartitions({
      modules: [
        { module: 'services/payments', files: 5, paths: ['services/payments/x.ts'] },
        { module: 'frontend/web', files: 3, paths: ['frontend/web/y.tsx'] },
        { module: 'infra', files: 2, paths: ['infra/z.ts'] },
      ],
      candidateSpecialists: ALL_SPECIALISTS,
      hasTriage: true,
      hasTestsSummary: false,
    })
    assert.equal(result.total_waves, 3)
    assert.equal(result.waves.length, 3)
  })

  it('orders waves by file count descending', () => {
    const result = computeHugePartitions({
      modules: [
        { module: 'a', files: 2, paths: ['a/1'] },
        { module: 'b', files: 10, paths: ['b/1'] },
        { module: 'c', files: 5, paths: ['c/1'] },
      ],
      candidateSpecialists: ['R-code-quality'],
      hasTriage: false,
      hasTestsSummary: false,
    })
    assert.equal(result.waves[0]?.module, 'b')
    assert.equal(result.waves[1]?.module, 'c')
    assert.equal(result.waves[2]?.module, 'a')
  })

  it('preserves transversal specialists in every wave', () => {
    const result = computeHugePartitions({
      modules: [
        { module: 'services/payments', files: 5, paths: [] },
        { module: 'frontend/web', files: 3, paths: [] },
      ],
      candidateSpecialists: ['R-code-quality', 'R-tests', 'R-mr-hygiene', 'R-homogeneity'],
      hasTriage: false,
      hasTestsSummary: false,
    })
    for (const wave of result.waves) {
      assert.ok(wave.specialists.includes('R-code-quality'))
      assert.ok(wave.specialists.includes('R-tests'))
      assert.ok(wave.specialists.includes('R-mr-hygiene'))
      assert.ok(wave.specialists.includes('R-homogeneity'))
    }
  })

  it('filters module-specific specialists by affinity', () => {
    const result = computeHugePartitions({
      modules: [
        { module: 'services/payments', files: 5, paths: [] },
        { module: 'frontend/web', files: 3, paths: [] },
        { module: 'infra', files: 2, paths: [] },
      ],
      candidateSpecialists: [
        'R-perf-backend',  // affinity services/
        'R-apollo-cache',  // affinity frontend/
        'R-infra-protect', // affinity infra/
      ],
      hasTriage: false,
      hasTestsSummary: false,
    })
    const servicesWave = result.waves.find((w) => w.module === 'services/payments')
    const frontendWave = result.waves.find((w) => w.module === 'frontend/web')
    const infraWave = result.waves.find((w) => w.module === 'infra')
    assert.ok(servicesWave?.specialists.includes('R-perf-backend'))
    assert.ok(!servicesWave?.specialists.includes('R-apollo-cache'))
    assert.ok(frontendWave?.specialists.includes('R-apollo-cache'))
    assert.ok(!frontendWave?.specialists.includes('R-perf-backend'))
    assert.ok(infraWave?.specialists.includes('R-infra-protect'))
    assert.ok(!infraWave?.specialists.includes('R-apollo-cache'))
  })

  it('totals tokens and cost across all waves', () => {
    const result = computeHugePartitions({
      modules: [
        { module: 'services/x', files: 5, paths: [] },
        { module: 'services/y', files: 3, paths: [] },
      ],
      candidateSpecialists: ['R-code-quality', 'R-tests'],
      hasTriage: true,
      hasTestsSummary: false,
    })
    const sumOfWaves = result.waves.reduce((s, w) => s + w.estimated_tokens, 0)
    // total > sum of waves because triage adds tokens on top
    assert.ok(result.total_estimated_tokens > sumOfWaves)
    assert.ok(result.total_estimated_cost_usd > 0)
  })

  it('triage adds tokens to total but not to any individual wave', () => {
    const withTriage = computeHugePartitions({
      modules: [{ module: 'services/x', files: 5, paths: [] }],
      candidateSpecialists: ['R-code-quality'],
      hasTriage: true,
      hasTestsSummary: false,
    })
    const noTriage = computeHugePartitions({
      modules: [{ module: 'services/x', files: 5, paths: [] }],
      candidateSpecialists: ['R-code-quality'],
      hasTriage: false,
      hasTestsSummary: false,
    })
    // Individual wave tokens são igualeS — triage no entra por wave
    assert.equal(withTriage.waves[0]?.estimated_tokens, noTriage.waves[0]?.estimated_tokens)
    // Pero total con triage > total sin triage
    assert.ok(withTriage.total_estimated_tokens > noTriage.total_estimated_tokens)
  })

  it('R-monorepo is treated as transversal-ish (multi-prefix affinity)', () => {
    const result = computeHugePartitions({
      modules: [
        { module: 'packages/utils', files: 3, paths: [] },
        { module: 'shared/pricing', files: 2, paths: [] },
        { module: 'entities/order', files: 1, paths: [] },
      ],
      candidateSpecialists: ['R-monorepo'],
      hasTriage: false,
      hasTestsSummary: false,
    })
    for (const wave of result.waves) {
      assert.ok(wave.specialists.includes('R-monorepo'), `R-monorepo missing in ${wave.module}`)
    }
  })

  it('files paths are passed through to the wave entry', () => {
    const paths = ['services/x/a.ts', 'services/x/b.ts']
    const result = computeHugePartitions({
      modules: [{ module: 'services/x', files: 2, paths }],
      candidateSpecialists: [],
      hasTriage: false,
      hasTestsSummary: false,
    })
    assert.deepEqual(result.waves[0]?.files, paths)
  })

  it('perWaveBucket override respected in cost estimate', () => {
    const small = computeHugePartitions({
      modules: [{ module: 'services/x', files: 5, paths: [] }],
      candidateSpecialists: ['R-code-quality'],
      hasTriage: false,
      hasTestsSummary: false,
      perWaveBucket: 'SMALL',
    })
    const large = computeHugePartitions({
      modules: [{ module: 'services/x', files: 5, paths: [] }],
      candidateSpecialists: ['R-code-quality'],
      hasTriage: false,
      hasTestsSummary: false,
      perWaveBucket: 'LARGE',
    })
    assert.ok(large.waves[0]!.estimated_tokens > small.waves[0]!.estimated_tokens)
  })
})
