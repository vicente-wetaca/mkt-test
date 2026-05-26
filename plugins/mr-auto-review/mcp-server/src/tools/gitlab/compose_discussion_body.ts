// gitlab_compose_discussion_body: assembles the canonical body for a bot
// discussion (prefix + content + sign-off + feedback prompt) and returns the
// deterministic issue-hash alongside, so the orchestrator can publish the body
// AND register the hash in a single call. Spec: WET-4814 D31+D32 (REQUESTS-001
// §A.3 + §A.4 + decision E.2 — all chrome is visible, no HTML comments).

import { z } from 'zod'

import { computeIssueHash } from '../../util/issue-hash.js'

export const SeveritySchema = z.enum(['must-fix', 'should-fix', 'nit'])
export const ConfidenceSchema = z.enum(['high', 'medium', 'low'])

export const GitlabComposeDiscussionBodyInputSchema = z.object({
  /** The detector agent ID that drives this discussion, e.g. "R-gitlab-ci".
   *  Rendered in the prefix and the sign-off; also part of the hash. */
  agentName: z.string().min(1),
  /** Optional single-line italic opener that lets the agent's persona speak
   *  (≤120 chars recommended). Per AGENT-CATALOG.md "Reglas de la persona"
   *  line 56: the agent prefixes one short line of opening when posting to
   *  GitLab. Rendered between the prefix and the substantive body as
   *  `_<opener>_`. Does NOT affect the issue-hash (cosmetic only). */
  personaOpener: z.string().min(1).max(240).optional(),
  severity: SeveritySchema,
  /** Group identifier assigned by R-triage, e.g. "G-007". */
  groupId: z.string().min(1),
  /** The substantive body of the issue, WITHOUT chrome. Markdown allowed. */
  bodyMarkdown: z.string().min(1),
  /** All detectors that converged on this group, including the primary. */
  detectors: z.array(z.string().min(1)).min(1),
  confidence: ConfidenceSchema,
  /** File path the issue refers to (canonical form is computed internally). */
  filePath: z.string().min(1),
  /** 1-based line number. */
  lineNumber: z.number().int().positive(),
})

export type GitlabComposeDiscussionBodyInput = z.infer<typeof GitlabComposeDiscussionBodyInputSchema>

export interface GitlabComposeDiscussionBodyOutput {
  /** Full body markdown ready to pass to gitlab_create_discussion. */
  body: string
  /** Deterministic 16-char hash embedded in the sign-off; reusable as key. */
  issueHash: string
}

const FEEDBACK_PROMPT =
  '> Si este comentario no es útil, reacciona con 👎 — nos ayuda a calibrar.'

/**
 * Composes the canonical bot discussion body. The body always carries three
 * visible chrome elements:
 *   1. First line: emoji + product + agent + severity.
 *   2. Sign-off (italics): group / detectors / confidence / severity / issue-hash.
 *   3. Feedback prompt (block-quote with 👎).
 *
 * Between the prefix and the substantive body, an optional italic `personaOpener`
 * gives the agent's persona one line of voice (D25, AGENT-CATALOG.md line 56).
 *
 * @param input - Issue fields + chrome metadata + optional persona opener.
 * @returns The full body and the issue-hash for indexing.
 */
export function gitlabComposeDiscussionBody(
  input: GitlabComposeDiscussionBodyInput,
): GitlabComposeDiscussionBodyOutput {
  const parsed = GitlabComposeDiscussionBodyInputSchema.parse(input)
  const issueHash = computeIssueHash({
    filePath: parsed.filePath,
    lineNumber: parsed.lineNumber,
    severity: parsed.severity,
    bodyMarkdown: parsed.bodyMarkdown,
    agentName: parsed.agentName,
  })

  const prefix = `🤖 **MR-auto-review** · ${parsed.agentName} · ${parsed.severity}`
  const signoff =
    `*Group: ${parsed.groupId} · ` +
    `Detected by: ${parsed.detectors.join(', ')} · ` +
    `Confidence: ${parsed.confidence} · ` +
    `Severity: ${parsed.severity} · ` +
    `issue-hash: ${issueHash}*`

  const openerLine =
    parsed.personaOpener !== undefined ? `_${parsed.personaOpener.trim()}_` : null
  const bodyParts: Array<string> = [prefix, '']
  if (openerLine !== null) {
    bodyParts.push(openerLine, '')
  }
  bodyParts.push(parsed.bodyMarkdown.trim(), '', '---', signoff, '', FEEDBACK_PROMPT)
  const body = bodyParts.join('\n')

  return { body, issueHash }
}
