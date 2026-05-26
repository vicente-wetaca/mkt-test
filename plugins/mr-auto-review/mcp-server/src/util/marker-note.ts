// Marker note that the bot posts at the end of a successful run, and the
// parser that reads it back. Spec: WET-4814 D33 + REQUESTS-001 §A.5 (decision
// E.2 — visible text, NOT HTML comments). The marker is parseable so the
// wrapper can detect "last successful run" and implement incremental review.

export type Bucket = 'TINY' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'HUGE'

export interface MarkerNoteInput {
  /** SHA reviewed (head_sha of the MR at run time). */
  headSha: string
  /** ISO 8601 UTC timestamp when the run completed. */
  timestamp: string
  /** Comments actually posted in this run. */
  publishedCount: number
  /** Total issues detected by the agents (pre-filter). */
  totalDetected: number
  /** Detected but filtered out by selection / outcome / confidence. */
  filteredByPolicy: number
  /** Detected and selected, but trimmed by the hard cap. */
  filteredByCap: number
  /** Total tokens consumed by the run (rough estimate is fine). */
  tokensSpent: number
  bucket: Bucket
  /** Plugin semver as declared in the manifest. */
  pluginVersion: string
}

export interface ParsedMarkerNote {
  headSha: string
  timestamp: string
  publishedCount: number
  totalDetected: number
  filteredByPolicy: number
  filteredByCap: number
  tokensSpent: number
  bucket: Bucket
  pluginVersion: string
}

/**
 * Composes the visible marker note body. Format is fixed so that the parser
 * can read it back; do NOT reorder lines without updating parseMarkerNote.
 *
 * @param input - Run summary fields.
 * @returns Markdown body ready to pass to gitlab_create_mr_note.
 */
export function composeMarkerNote(input: MarkerNoteInput): string {
  return [
    '🤖 MR-auto-review · run completed',
    `SHA reviewed: ${input.headSha}`,
    `Timestamp: ${input.timestamp}`,
    `Comments published: ${input.publishedCount} (of ${input.totalDetected} detected; ${input.filteredByPolicy} filtered by policy; ${input.filteredByCap} filtered by cap)`,
    `Tokens spent: ${input.tokensSpent}`,
    `Bucket: ${input.bucket}`,
    `Plugin version: ${input.pluginVersion}`,
    '',
    '*marker: run-completed*',
  ].join('\n')
}

const RX_HEAD_SHA = /SHA\s+reviewed\s*:\s*([A-Za-z0-9]+)/i
const RX_TIMESTAMP = /Timestamp\s*:\s*([0-9T:.+Z-]+)/i
const RX_COMMENTS =
  /Comments\s+published\s*:\s*(\d+)\s*\(of\s+(\d+)\s+detected\s*;\s*(\d+)\s+filtered\s+by\s+policy\s*;\s*(\d+)\s+filtered\s+by\s+cap\)/i
const RX_TOKENS = /Tokens\s+spent\s*:\s*(\d+)/i
const RX_BUCKET = /Bucket\s*:\s*(TINY|SMALL|MEDIUM|LARGE|HUGE)/i
const RX_VERSION = /Plugin\s+version\s*:\s*([\w.+-]+)/i
const RX_MARKER = /marker\s*:\s*run-completed/i

/**
 * Parses a marker note body. Returns null when the marker line is absent or
 * the body lacks the required fields. The regexes are tolerant to extra
 * whitespace and capitalisation, but the line structure must be preserved.
 *
 * @param body - The note body as read from GitLab.
 * @returns Parsed run summary or null when not a marker note.
 */
export function parseMarkerNote(body: string): ParsedMarkerNote | null {
  if (!RX_MARKER.test(body)) return null

  const sha = RX_HEAD_SHA.exec(body)?.[1]
  const ts = RX_TIMESTAMP.exec(body)?.[1]
  const counts = RX_COMMENTS.exec(body)
  const tokens = RX_TOKENS.exec(body)?.[1]
  const bucket = RX_BUCKET.exec(body)?.[1]?.toUpperCase() as Bucket | undefined
  const version = RX_VERSION.exec(body)?.[1]

  if (
    sha === undefined ||
    ts === undefined ||
    counts === null ||
    tokens === undefined ||
    bucket === undefined ||
    version === undefined
  ) {
    return null
  }
  return {
    headSha: sha,
    timestamp: ts,
    publishedCount: Number.parseInt(counts[1] ?? '0', 10),
    totalDetected: Number.parseInt(counts[2] ?? '0', 10),
    filteredByPolicy: Number.parseInt(counts[3] ?? '0', 10),
    filteredByCap: Number.parseInt(counts[4] ?? '0', 10),
    tokensSpent: Number.parseInt(tokens, 10),
    bucket,
    pluginVersion: version,
  }
}
