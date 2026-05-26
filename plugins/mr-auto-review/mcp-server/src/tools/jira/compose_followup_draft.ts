// jira_compose_followup_draft: thin MCP wrapper over composeJiraFollowupDraft.
// Validates input via Zod and exposes the pure function to the orchestrator.

import { z } from 'zod'

import { composeJiraFollowupDraft, type JiraDraft } from '../../util/jira-draft.js'

export const SeveritySchema = z.enum(['must-fix', 'should-fix', 'nit'])
export const ConfidenceSchema = z.enum(['high', 'medium', 'low'])
export const PrioritySchema = z.enum(['highest', 'high', 'medium', 'low', 'lowest'])

export const JiraOccurrenceSchema = z.object({
  filePath: z.string().min(1),
  lineNumber: z.number().int().positive(),
  excerpt: z.string().optional(),
})

export const JiraComposeFollowupDraftInputSchema = z.object({
  groupId: z.string().min(1),
  summary: z.string().min(1),
  mrIid: z.number().int().positive(),
  mrUrl: z.string().min(1),
  ticketId: z.string().min(1),
  occurrences: z.array(JiraOccurrenceSchema).min(1),
  suggestedFix: z.string().optional(),
  severity: SeveritySchema,
  confidence: ConfidenceSchema,
  extraLabels: z.array(z.string().min(1)).optional(),
  priority: PrioritySchema.optional(),
})

export type JiraComposeFollowupDraftInput = z.infer<typeof JiraComposeFollowupDraftInputSchema>

/**
 * MCP tool entry point. Validates input and delegates to the pure util.
 *
 * @param input - All draft fields.
 * @returns Draft ready to be approved by a human and passed to createJiraIssue.
 */
export function jiraComposeFollowupDraft(input: JiraComposeFollowupDraftInput): JiraDraft {
  const parsed = JiraComposeFollowupDraftInputSchema.parse(input)
  return composeJiraFollowupDraft(parsed)
}
