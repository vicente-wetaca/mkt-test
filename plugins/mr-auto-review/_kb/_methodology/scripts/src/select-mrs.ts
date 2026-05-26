#!/usr/bin/env tsx
import { writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { listMergedMRs, getMRChanges } from './gitlab-client.ts'
import { passesFilters, type FilterableMR } from './filter.ts'
import { classifyAreaFromFiles, stratifySample, type StratifiableMR } from './stratify.ts'

const WORKTREE_ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
const SINCE = '2025-11-19'   // 6 months back from 2026-05-19
const UNTIL = '2026-05-19'
const MIN_REVIEWERS = 2
const MIN_COMMENTS = 5
const CAP = 40
const OUTPUT = path.join(WORKTREE_ROOT, '.dev/MR-auto-review/_research/selection.json')

async function main(): Promise<void> {
  console.error(`Listing merged MRs ${SINCE}..${UNTIL}...`)
  const raw = await listMergedMRs({ since: SINCE, until: UNTIL })
  console.error(`Found ${raw.length} merged MRs.`)

  const filterable: Array<FilterableMR & { reviewerUsernames: Array<string>; title: string }> = raw.map(m => ({
    iid: m.iid,
    author: m.author.username,
    reviewers: m.reviewers.map(r => r.username),
    humanCommentCount: m.user_notes_count,
    mergedAt: m.merged_at,
    reviewerUsernames: m.reviewers.map(r => r.username),
    title: m.title,
  }))

  const passing = filterable.filter(m => passesFilters(m, { since: SINCE, until: UNTIL, minReviewers: MIN_REVIEWERS, minComments: MIN_COMMENTS }))
  console.error(`${passing.length} MRs pass filters (≥${MIN_REVIEWERS} reviewers, ≥${MIN_COMMENTS} comments).`)

  console.error('Classifying area for each (this hits API once per MR for changes)...')
  const withArea: Array<StratifiableMR & { title: string }> = []
  for (const m of passing) {
    const changes = await getMRChanges(m.iid)
    const files = changes.changes.map(c => c.new_path ?? c.old_path)
    const area = classifyAreaFromFiles(files)
    withArea.push({ iid: m.iid, area, title: m.title })
  }

  const sample = stratifySample(withArea, { cap: CAP, ratios: { backend: 1/3, frontend: 1/3, infra: 1/3 } })

  mkdirSync(path.dirname(OUTPUT), { recursive: true })
  writeFileSync(OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), since: SINCE, until: UNTIL, totalCandidates: passing.length, sample }, null, 2))
  console.error(`Wrote ${sample.length} selected MRs to ${OUTPUT}`)
  console.log(sample.map(s => s.iid).join('\n'))
}

main().catch(err => { console.error(err); process.exit(1) })
