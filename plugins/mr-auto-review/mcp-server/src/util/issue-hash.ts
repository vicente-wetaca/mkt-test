// Deterministic hash for MR-auto-review discussions. The hash lets the bot
// detect when it's about to re-post an issue that already exists on the MR
// (idempotency between re-runs). Spec: WET-4814 D32 + REQUESTS-001 §A.4.
//
// The hash deliberately excludes anything that varies between runs without
// changing the substance of the finding: timestamps, persona-style opening
// lines, randomness. It DOES include the agent that detected the issue —
// two reviewers that flag the same line for different reasons should produce
// two different discussions.

import { createHash } from 'node:crypto'

export interface IssueHashInput {
  filePath: string
  lineNumber: number
  severity: string
  /** The body text the bot will publish, WITHOUT the persona opening line or chrome. */
  bodyMarkdown: string
  /** The primary detector agent (the one whose output drives this discussion). */
  agentName: string
}

/**
 * Canonicalises a path before hashing: trims, strips a leading `./`, and
 * collapses repeated slashes. We intentionally do NOT lowercase — file systems
 * on some platforms are case-insensitive but our repos are not.
 *
 * @param raw - The path as it appears in the agent output.
 * @returns Canonical path used for hash composition.
 */
export function canonicaliseFilePath(raw: string): string {
  return raw.trim().replace(/^\.\//, '').replace(/\/+/g, '/')
}

/**
 * Normalises a markdown body for hashing: lowercases, removes emphasis chars
 * and quotes, collapses whitespace, trims. The goal is to make hashes stable
 * across cosmetic re-wordings (different quoting style, extra spaces).
 *
 * @param raw - Body markdown text.
 * @returns Normalised string used for hash composition.
 */
export function normaliseBody(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[*_`'"«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Computes a 16-character hex hash that uniquely identifies an MR issue from
 * the bot's point of view. Two runs that produce semantically the same finding
 * yield the same hash, so the bot can skip re-posting.
 *
 * @param input - Issue fields that define identity.
 * @returns 16 lowercase hex chars (truncated SHA-256).
 */
export function computeIssueHash(input: IssueHashInput): string {
  const key = [
    canonicaliseFilePath(input.filePath),
    input.lineNumber,
    input.severity,
    normaliseBody(input.bodyMarkdown),
    input.agentName,
  ].join('|')
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

// Regex that matches the bot's sign-off line. We accept either italics wrapper
// (`*…*`) or plain text, plus optional surrounding whitespace.
const ISSUE_HASH_LINE = /issue-hash\s*:\s*([a-f0-9]{8,})/gi

/**
 * Extracts all `issue-hash: <hex>` tokens from a body of text. Used by the
 * orchestrator to detect duplicates against previously-posted discussions.
 *
 * @param text - Free-form body text (the bot's prior comment, typically).
 * @returns Array of distinct hashes found, lowercased.
 */
export function extractIssueHashes(text: string): Array<string> {
  const seen = new Set<string>()
  let match: RegExpExecArray | null
  ISSUE_HASH_LINE.lastIndex = 0
  while ((match = ISSUE_HASH_LINE.exec(text)) !== null) {
    const hash = match[1]
    if (hash !== undefined) {
      seen.add(hash.toLowerCase())
    }
  }
  return [...seen]
}
