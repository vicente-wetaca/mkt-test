import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'

const WORKTREE_ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
const RAW_DIR = path.join(WORKTREE_ROOT, '.dev/MR-auto-review/_research/raw')

export function ensureRawDir(): void {
  mkdirSync(RAW_DIR, { recursive: true })
}

export function writeRawMR(iid: number, data: unknown): string {
  ensureRawDir()
  const file = path.join(RAW_DIR, `${iid}.json`)
  writeFileSync(file, JSON.stringify(data, null, 2))
  return file
}

export function readRawMR<T = unknown>(iid: number): T {
  const file = path.join(RAW_DIR, `${iid}.json`)
  return JSON.parse(readFileSync(file, 'utf8')) as T
}

export function listRawMRIids(): Array<number> {
  if (!existsSync(RAW_DIR)) return []
  return readdirSync(RAW_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => parseInt(f.replace('.json', ''), 10))
    .filter(n => !Number.isNaN(n))
}
