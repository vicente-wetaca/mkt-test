import { execSync } from 'node:child_process'

const GITLAB_BASE = 'https://gitlab.com/api/v4'
const PROJECT = encodeURIComponent('wetaca/wetaca.com')

function readToken(): string {
  const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim()
  const m = url.match(/oauth2:(glpat-[A-Za-z0-9_-]+)@/)
  if (!m || !m[1]) throw new Error('GitLab token not found in origin remote URL')
  return m[1]
}

const TOKEN = readToken()

export interface MRListItem {
  iid: number
  title: string
  state: string
  merged_at: string | null
  author: { username: string }
  reviewers: Array<{ username: string }>
  user_notes_count: number
  web_url: string
}

export interface MRDetail extends MRListItem {
  description: string | null
  diff_refs: { base_sha: string; head_sha: string; start_sha: string }
  changes_count: string
}

export interface Note {
  id: number
  body: string
  author: { username: string }
  created_at: string
  system: boolean
  resolvable: boolean
  resolved: boolean | null
}

export interface DiscussionPosition {
  base_sha: string
  start_sha: string
  head_sha: string
  position_type: 'text'
  new_path: string
  old_path: string
  new_line: number | null
  old_line: number | null
}

export interface Discussion {
  id: string
  notes: Array<Note & { position?: DiscussionPosition }>
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${GITLAB_BASE}${path}`, {
    headers: { 'PRIVATE-TOKEN': TOKEN }
  })
  if (!res.ok) {
    throw new Error(`GitLab ${res.status} on ${path}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

async function getAllPages<T>(path: string, perPage = 50): Promise<Array<T>> {
  const all: Array<T> = []
  let page = 1
  while (true) {
    const sep = path.includes('?') ? '&' : '?'
    const url = `${path}${sep}per_page=${perPage}&page=${page}`
    const batch = await get<Array<T>>(url)
    all.push(...batch)
    if (batch.length < perPage) break
    page += 1
  }
  return all
}

export async function listMergedMRs(opts: { since: string; until: string }): Promise<Array<MRListItem>> {
  return getAllPages<MRListItem>(
    `/projects/${PROJECT}/merge_requests?state=merged&updated_after=${opts.since}&updated_before=${opts.until}&order_by=updated_at`
  )
}

export async function getMR(iid: number): Promise<MRDetail> {
  return get<MRDetail>(`/projects/${PROJECT}/merge_requests/${iid}?include_diverged_commits_count=true`)
}

export async function listNotes(iid: number): Promise<Array<Note>> {
  return getAllPages<Note>(`/projects/${PROJECT}/merge_requests/${iid}/notes`)
}

export async function listDiscussions(iid: number): Promise<Array<Discussion>> {
  return getAllPages<Discussion>(`/projects/${PROJECT}/merge_requests/${iid}/discussions`)
}

export async function getMRChanges(iid: number): Promise<{ changes: Array<{ new_path: string; old_path: string; diff: string }> }> {
  return get(`/projects/${PROJECT}/merge_requests/${iid}/changes`)
}
