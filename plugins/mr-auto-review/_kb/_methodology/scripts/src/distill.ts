#!/usr/bin/env tsx
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { listRawMRIids, readRawMR } from './persistence.ts'
import { aggregateByConcern, extractPatterns, type ClassifiedComment } from './aggregator.ts'
import { generateConcernMD } from './md-generator.ts'
import type { Concern } from './classifier.ts'

const WORKTREE_ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
const KB_DIR = path.join(WORKTREE_ROOT, '.claude/plugins/MR-auto-review/_kb')
const MIN_RECURRENCES = 3

const CONCERNS: Array<Concern> = [
  'code-quality', 'tests', 'di', 'mongo-aggs', 'mongo-queries', 'apollo-cache',
  'monorepo', 'infra-protect', 'gitlab-ci', 'event-types', 'migrations', 'security',
  'perf-backend', 'perf-frontend', 'homogeneity', 'solid', 'mr-hygiene',
]

const RULE_CITATIONS: Record<Concern, Array<string>> = {
  'code-quality':   ['.claude/rules/code-style.md'],
  'tests':          ['.claude/rules/testing-standards.md'],
  'di':             ['.claude/rules/monorepo-architecture.md', '.claude/skills/dependency-injection/SKILL.md'],
  'mongo-aggs':     ['.claude/rules/mongodb-aggregations.md'],
  'mongo-queries':  ['.claude/rules/mongodb-aggregations.md'],
  'apollo-cache':   ['.claude/rules/apollo-cache-policy.md'],
  'monorepo':       ['.claude/rules/monorepo-architecture.md'],
  'infra-protect':  ['.claude/rules/infra-protection.md'],
  'gitlab-ci':      ['.claude/rules/gitlab-ci.md'],
  'event-types':    ['.claude/rules/monorepo-architecture.md#communication-patterns'],
  'migrations':     [],
  'security':       [],
  'perf-backend':   ['.claude/rules/mongodb-aggregations.md'],
  'perf-frontend':  [],
  'homogeneity':    ['CLAUDE.md'],
  'solid':          [],
  'mr-hygiene':     ['.dev/_docs/Tasks/__MANAGEMENT/plantilla.md'],
  'unknown':        [],
}

interface ExtractedMRSubset {
  iid: number
  comments: Array<{
    body: string
    concern: Concern
    severity: 'must-fix' | 'should-fix' | 'nit'
    outcome: 'fixed' | 'rejected' | 'unresolved'
    filePath: string | null
    line: number | null
  }>
}

async function main(): Promise<void> {
  const iids = listRawMRIids()
  if (iids.length === 0) {
    console.error('No raw MRs found. Run `npm run extract -- --all` first.')
    process.exit(1)
  }
  console.error(`Distilling from ${iids.length} MRs...`)

  const allComments: Array<ClassifiedComment> = []
  for (const iid of iids) {
    const mr = readRawMR<ExtractedMRSubset>(iid)
    for (const c of mr.comments) {
      allComments.push({ iid, body: c.body, concern: c.concern, severity: c.severity, outcome: c.outcome, filePath: c.filePath, line: c.line })
    }
  }

  const groups = aggregateByConcern(allComments)
  const today = new Date().toISOString().slice(0, 10)

  let totalPatterns = 0
  for (const concern of CONCERNS) {
    const items = groups[concern] ?? []
    const patterns = extractPatterns(items, { minRecurrences: MIN_RECURRENCES })
    totalPatterns += patterns.length

    const md = generateConcernMD({
      concern,
      corpusSize: iids.length,
      lastUpdated: today,
      methodologyVersion: 1,
      patterns,
      ruleCitations: RULE_CITATIONS[concern],
    })

    const target = path.join(KB_DIR, `${concern}.md`)
    writeFileSync(target, md)
    console.error(`  ${concern}: ${items.length} comments, ${patterns.length} patterns → ${target}`)
  }

  console.error(`Done. ${totalPatterns} total patterns across ${CONCERNS.length} concerns.`)
}

main().catch(err => { console.error(err); process.exit(1) })
