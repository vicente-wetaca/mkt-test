#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { getMR, listNotes, listDiscussions, getMRChanges } from './gitlab-client.ts'
import { classifyComment, type CommentClassification } from './classifier.ts'
import { writeRawMR } from './persistence.ts'

const WORKTREE_ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
const SELECTION_PATH = path.join(WORKTREE_ROOT, '.dev/MR-auto-review/_research/selection.json')

interface ExtractedComment extends CommentClassification {
  noteId: number
  authorUsername: string
  body: string
  filePath: string | null
  line: number | null
  resolved: boolean
  isDiscussion: boolean
  createdAt: string
}

interface ExtractedMR {
  iid: number
  title: string
  author: string
  reviewers: Array<string>
  description: string | null
  baseSha: string
  headSha: string
  mergedAt: string | null
  filesChanged: Array<string>
  totalLoc: number
  comments: Array<ExtractedComment>
}

async function extract(iid: number): Promise<ExtractedMR> {
  const [mr, notes, discussions, changes] = await Promise.all([
    getMR(iid),
    listNotes(iid),
    listDiscussions(iid),
    getMRChanges(iid),
  ])

  const filesChanged = changes.changes.map(c => c.new_path ?? c.old_path)
  const totalLoc = changes.changes.reduce((acc, c) => acc + (c.diff?.split('\n').length ?? 0), 0)

  const comments: Array<ExtractedComment> = []

  // Plain notes (non-discussion, rare)
  for (const n of notes) {
    if (n.system) continue
    const cls = classifyComment({ body: n.body, filePath: null, authorUsername: n.author.username, resolved: false, followingDiff: '' })
    comments.push({ noteId: n.id, authorUsername: n.author.username, body: n.body, filePath: null, line: null, resolved: false, isDiscussion: false, createdAt: n.created_at, ...cls })
  }

  // Discussions (where line-level comments live)
  for (const d of discussions) {
    for (const n of d.notes) {
      if (n.system) continue
      const filePath = n.position?.new_path ?? n.position?.old_path ?? null
      const line = n.position?.new_line ?? n.position?.old_line ?? null
      const cls = classifyComment({ body: n.body, filePath, authorUsername: n.author.username, resolved: n.resolved ?? false, followingDiff: '' })
      comments.push({ noteId: n.id, authorUsername: n.author.username, body: n.body, filePath, line, resolved: n.resolved ?? false, isDiscussion: true, createdAt: n.created_at, ...cls })
    }
  }

  return {
    iid: mr.iid,
    title: mr.title,
    author: mr.author.username,
    reviewers: mr.reviewers.map(r => r.username),
    description: mr.description,
    baseSha: mr.diff_refs.base_sha,
    headSha: mr.diff_refs.head_sha,
    mergedAt: mr.merged_at,
    filesChanged,
    totalLoc,
    comments,
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: npm run extract -- <iid> | --all (reads selection.json)')
    process.exit(1)
  }

  let iids: Array<number>
  if (arg === '--all') {
    const sel = JSON.parse(readFileSync(SELECTION_PATH, 'utf8'))
    iids = sel.sample.map((s: { iid: number }) => s.iid)
  } else {
    iids = [parseInt(arg, 10)]
  }

  for (const iid of iids) {
    try {
      console.error(`Extracting MR !${iid}...`)
      const data = await extract(iid)
      const filePath = writeRawMR(iid, data)
      console.error(`  → ${filePath} (${data.comments.length} comments)`)
    } catch (err) {
      console.error(`  ! Failed MR !${iid}:`, (err as Error).message)
    }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
