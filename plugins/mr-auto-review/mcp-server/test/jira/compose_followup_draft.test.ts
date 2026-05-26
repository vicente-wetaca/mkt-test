// Tests for jira_compose_followup_draft MCP tool: smoke + input validation.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  jiraComposeFollowupDraft,
  type JiraComposeFollowupDraftInput,
} from '../../src/tools/jira/compose_followup_draft.ts'

const BASE: JiraComposeFollowupDraftInput = {
  groupId: 'G-001',
  summary: 'A summary',
  mrIid: 1,
  mrUrl: 'https://example.test/-/merge_requests/1',
  ticketId: 'WET-1234',
  occurrences: [{ filePath: 'a.ts', lineNumber: 1 }],
  severity: 'should-fix',
  confidence: 'medium',
}

describe('jiraComposeFollowupDraft', () => {
  it('smoke: produces a draft for a minimal input', () => {
    const draft = jiraComposeFollowupDraft(BASE)
    assert.equal(draft.summary, 'A summary')
    assert.equal(draft.priority, 'medium')
    assert.ok(draft.labels.includes('mr-auto-review'))
    assert.ok(draft.description.includes('WET-1234'))
  })

  it('rejects empty summary', () => {
    assert.throws(() => jiraComposeFollowupDraft({ ...BASE, summary: '' }))
  })

  it('rejects zero IID', () => {
    assert.throws(() => jiraComposeFollowupDraft({ ...BASE, mrIid: 0 }))
  })

  it('rejects empty occurrences', () => {
    assert.throws(() => jiraComposeFollowupDraft({ ...BASE, occurrences: [] }))
  })

  it('rejects invalid severity', () => {
    assert.throws(() =>
      // @ts-expect-error testing runtime rejection
      jiraComposeFollowupDraft({ ...BASE, severity: 'critical' }),
    )
  })

  it('rejects negative line numbers', () => {
    assert.throws(() =>
      jiraComposeFollowupDraft({
        ...BASE,
        occurrences: [{ filePath: 'a.ts', lineNumber: -1 }],
      }),
    )
  })
})
