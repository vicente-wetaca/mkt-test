// Builds the draft for a Jira follow-up ticket from a group's triage data.
// The orchestrator persists these to _report/jira-followups.yml and then —
// after human approval — feeds them into mcp__claude_ai_Atlassian__createJiraIssue.
// Spec: WET-4814 D5 (severity×outcome=follow-up) + Wave 3.F.
//
// Localization: Wetaca's Jira project (WET) is Spanish-language. The summary
// must be provided in Spanish by the caller (the orchestrator translates from
// the triage `title`, which is already Spanish per the agent prompts). The
// description chrome (occurrences, severity, footer) is rendered in Spanish.
// Code identifiers, file paths, rule citations and the `suggestedFix` block
// stay verbatim — they are technical anchors, not prose.

export type Severity = 'must-fix' | 'should-fix' | 'nit'
export type Confidence = 'high' | 'medium' | 'low'
export type Priority = 'highest' | 'high' | 'medium' | 'low' | 'lowest'

export interface JiraOccurrence {
  filePath: string
  lineNumber: number
  excerpt?: string
}

export interface JiraDraftInput {
  /** Group identifier from triage, e.g. "G-007". */
  groupId: string
  /** One-line summary; used as Jira issue summary verbatim. */
  summary: string
  /** Merge request IID this draft originated from (used in description origin line). */
  mrIid: number
  /** Web URL of the MR. */
  mrUrl: string
  /** Origin ticket of the MR (e.g. "WET-4715" or "local-foo"). */
  ticketId: string
  /** All occurrences of this issue across the MR (≥1). */
  occurrences: Array<JiraOccurrence>
  /** Markdown of the recommended fix (the bot's WHY/FIX/ALTERNATIVA, optional). */
  suggestedFix?: string
  severity: Severity
  confidence: Confidence
  /** Extra labels to attach beyond the defaults. Order preserved. */
  extraLabels?: Array<string>
  /** Jira priority override. Default mapped from severity. */
  priority?: Priority
}

export interface JiraDraft {
  summary: string
  description: string
  labels: Array<string>
  priority: Priority
}

const SEVERITY_TO_PRIORITY: Record<Severity, Priority> = {
  'must-fix': 'high',
  'should-fix': 'medium',
  'nit': 'low',
}

const DEFAULT_LABELS = ['mr-auto-review', 'tech-debt', 'to-be-reviewed-sprint']

/**
 * Composes a Jira follow-up ticket draft. The description is formatted as
 * Jira-compatible markdown (Atlassian renders it consistently). Labels include
 * the canonical defaults plus any `extraLabels`. Priority defaults map by
 * severity (must-fix→high, should-fix→medium, nit→low) and can be overridden.
 *
 * @param input - Group + MR context + occurrences.
 * @returns Draft fields ready for createJiraIssue.
 * @throws Error when occurrences is empty (must be ≥1).
 */
export function composeJiraFollowupDraft(input: JiraDraftInput): JiraDraft {
  if (input.occurrences.length === 0) {
    throw new Error('composeJiraFollowupDraft: at least one occurrence is required')
  }

  const priority = input.priority ?? SEVERITY_TO_PRIORITY[input.severity]
  const labels = dedupePreserveOrder([...DEFAULT_LABELS, ...(input.extraLabels ?? [])])

  const occurrencesBlock = input.occurrences
    .map((o) => {
      const line = `- ${o.filePath}:${o.lineNumber}`
      if (o.excerpt === undefined || o.excerpt.trim().length === 0) return line
      return `${line}\n\n  \`\`\`\n  ${o.excerpt.trim().split('\n').join('\n  ')}\n  \`\`\``
    })
    .join('\n')

  const fixBlock = input.suggestedFix !== undefined && input.suggestedFix.trim().length > 0
    ? `\n\n**Fix sugerido**\n\n${input.suggestedFix.trim()}`
    : ''

  const description = [
    `Detectado en revisión automática del MR !${input.mrIid} (${input.ticketId}).`,
    '',
    `**Severidad**: ${input.severity}  |  **Confianza**: ${input.confidence}  |  **Ocurrencias detectadas**: ${input.occurrences.length}`,
    '',
    '**Ocurrencias**',
    '',
    occurrencesBlock,
    fixBlock,
    '',
    '---',
    `Origen: MR ${input.mrUrl} / Grupo ${input.groupId}`,
    '',
    `> Ticket redactado por **MR-auto-review** y aprobado por un humano antes de crearlo.`,
    `> Si no se asignó al sprint "To be reviewed" automáticamente, hazlo a mano (label \`to-be-reviewed-sprint\` queda como marcador).`,
  ].join('\n')

  return {
    summary: input.summary.trim(),
    description,
    labels,
    priority,
  }
}

/**
 * Removes duplicate strings while keeping the first occurrence in order.
 *
 * @param items - Array possibly containing duplicates.
 * @returns Array with each value appearing once, in first-occurrence order.
 */
function dedupePreserveOrder(items: Array<string>): Array<string> {
  const seen = new Set<string>()
  const out: Array<string> = []
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item)
      out.push(item)
    }
  }
  return out
}
