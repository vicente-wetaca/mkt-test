import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyAreaFromFiles, stratifySample, type StratifiableMR } from '../src/stratify.ts'

test('classifies as backend when most files are in services/ or modules/', () => {
  assert.equal(classifyAreaFromFiles(['services/payments/src/foo.ts', 'modules/wetaca-core/src/bar.ts']), 'backend')
})

test('classifies as frontend when most files are in frontend/', () => {
  assert.equal(classifyAreaFromFiles(['frontend/web/src/foo.tsx', 'frontend/web/src/bar.ts']), 'frontend')
})

test('classifies as infra when most files are in infra/ or .gitlab', () => {
  assert.equal(classifyAreaFromFiles(['infra/src/foo.ts', '.gitlab/ci.gitlab.yml']), 'infra')
})

test('uses majority when mixed', () => {
  assert.equal(classifyAreaFromFiles(['frontend/web/x.ts', 'frontend/web/y.ts', 'services/z.ts']), 'frontend')
})

test('falls back to backend when no obvious area', () => {
  assert.equal(classifyAreaFromFiles(['unknown/path.ts']), 'backend')
})

test('stratifySample returns cap items with 1/3 per area when supply allows', () => {
  const mrs: Array<StratifiableMR> = []
  for (let i = 0; i < 30; i++) mrs.push({ iid: i, area: 'backend' })
  for (let i = 30; i < 60; i++) mrs.push({ iid: i, area: 'frontend' })
  for (let i = 60; i < 90; i++) mrs.push({ iid: i, area: 'infra' })

  const sample = stratifySample(mrs, { cap: 30, ratios: { backend: 1/3, frontend: 1/3, infra: 1/3 } })
  assert.equal(sample.length, 30)
  const counts = sample.reduce<Record<string, number>>((acc, m) => { acc[m.area] = (acc[m.area] ?? 0) + 1; return acc }, {})
  assert.equal(counts['backend'], 10)
  assert.equal(counts['frontend'], 10)
  assert.equal(counts['infra'], 10)
})

test('stratifySample fills shortage from other areas when one is under-supplied', () => {
  const mrs: Array<StratifiableMR> = []
  for (let i = 0; i < 30; i++) mrs.push({ iid: i, area: 'backend' })
  for (let i = 30; i < 40; i++) mrs.push({ iid: i, area: 'frontend' })
  // only 2 infra available
  mrs.push({ iid: 100, area: 'infra' }, { iid: 101, area: 'infra' })

  const sample = stratifySample(mrs, { cap: 30, ratios: { backend: 1/3, frontend: 1/3, infra: 1/3 } })
  assert.equal(sample.length, 30)
  assert.equal(sample.filter(m => m.area === 'infra').length, 2)
  // shortage of 8 from infra fills from backend/frontend equally
})
