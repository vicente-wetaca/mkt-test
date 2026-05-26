// Tests for jira-draft: composition of follow-up tickets.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { composeJiraFollowupDraft, type JiraDraftInput } from '../../src/util/jira-draft.ts'

const BASE: JiraDraftInput = {
  groupId: 'G-007',
  summary: 'Refactor: eliminate `as unknown as` casts in payments service',
  mrIid: 3762,
  mrUrl: 'https://gitlab.com/wetaca/wetaca.com/-/merge_requests/3762',
  ticketId: 'WET-4715',
  occurrences: [
    { filePath: 'services/payments/handlers/place-order.ts', lineNumber: 42 },
    { filePath: 'services/payments/handlers/refund.ts', lineNumber: 88 },
  ],
  severity: 'should-fix',
  confidence: 'high',
}

describe('composeJiraFollowupDraft', () => {
  it('returns summary trimmed and verbatim', () => {
    const draft = composeJiraFollowupDraft({ ...BASE, summary: '  trimmed  ' })
    assert.equal(draft.summary, 'trimmed')
  })

  it('default labels include mr-auto-review, tech-debt, to-be-reviewed-sprint', () => {
    const draft = composeJiraFollowupDraft(BASE)
    assert.ok(draft.labels.includes('mr-auto-review'))
    assert.ok(draft.labels.includes('tech-debt'))
    assert.ok(draft.labels.includes('to-be-reviewed-sprint'))
  })

  it('appends extraLabels in order without duplicates', () => {
    const draft = composeJiraFollowupDraft({
      ...BASE,
      extraLabels: ['payments', 'tech-debt', 'WET-4715'],
    })
    assert.deepEqual(draft.labels, [
      'mr-auto-review',
      'tech-debt',
      'to-be-reviewed-sprint',
      'payments',
      'WET-4715',
    ])
  })

  it('default priority maps must-fix → high, should-fix → medium, nit → low', () => {
    assert.equal(composeJiraFollowupDraft({ ...BASE, severity: 'must-fix' }).priority, 'high')
    assert.equal(composeJiraFollowupDraft({ ...BASE, severity: 'should-fix' }).priority, 'medium')
    assert.equal(composeJiraFollowupDraft({ ...BASE, severity: 'nit' }).priority, 'low')
  })

  it('honours explicit priority override', () => {
    const draft = composeJiraFollowupDraft({ ...BASE, severity: 'nit', priority: 'highest' })
    assert.equal(draft.priority, 'highest')
  })

  it('description cites MR IID, ticket, and each occurrence file:line', () => {
    const draft = composeJiraFollowupDraft(BASE)
    assert.ok(draft.description.includes('!3762'))
    assert.ok(draft.description.includes('WET-4715'))
    assert.ok(draft.description.includes('services/payments/handlers/place-order.ts:42'))
    assert.ok(draft.description.includes('services/payments/handlers/refund.ts:88'))
  })

  it('description carries severity, confidence, occurrence count (Spanish chrome)', () => {
    const draft = composeJiraFollowupDraft(BASE)
    assert.ok(draft.description.includes('Severidad'))
    assert.ok(draft.description.includes('should-fix'))
    assert.ok(draft.description.includes('Confianza'))
    assert.ok(draft.description.includes('high'))
    assert.ok(draft.description.includes('Ocurrencias detectadas'))
  })

  it('description includes origin URL of the MR', () => {
    const draft = composeJiraFollowupDraft(BASE)
    assert.ok(draft.description.includes(BASE.mrUrl))
  })

  it('description mentions the to-be-reviewed-sprint label hint', () => {
    const draft = composeJiraFollowupDraft(BASE)
    assert.ok(draft.description.includes('to-be-reviewed-sprint'))
  })

  it('includes suggested fix block when provided (Spanish header)', () => {
    const draft = composeJiraFollowupDraft({
      ...BASE,
      suggestedFix: 'WHY — invariant.\nFIX — use guards.\nALTERNATIVA — extract.',
    })
    assert.ok(draft.description.includes('**Fix sugerido**'))
    assert.ok(draft.description.includes('WHY — invariant'))
    assert.ok(draft.description.includes('FIX — use guards'))
  })

  it('omits suggested fix block when absent or whitespace', () => {
    const a = composeJiraFollowupDraft(BASE)
    const b = composeJiraFollowupDraft({ ...BASE, suggestedFix: '   \n\n   ' })
    assert.ok(!a.description.includes('**Fix sugerido**'))
    assert.ok(!b.description.includes('**Fix sugerido**'))
  })

  it('renders excerpt as indented code block for each occurrence with excerpt', () => {
    const draft = composeJiraFollowupDraft({
      ...BASE,
      occurrences: [
        {
          filePath: 'src/foo.ts',
          lineNumber: 10,
          excerpt: 'const x = config as unknown as Opts',
        },
      ],
    })
    assert.ok(draft.description.includes('src/foo.ts:10'))
    assert.ok(draft.description.includes('const x = config as unknown as Opts'))
  })

  it('rejects empty occurrences', () => {
    assert.throws(() => composeJiraFollowupDraft({ ...BASE, occurrences: [] }))
  })

  it('single-occurrence draft works (most common case)', () => {
    const draft = composeJiraFollowupDraft({
      ...BASE,
      occurrences: [{ filePath: 'src/x.ts', lineNumber: 1 }],
    })
    assert.ok(draft.description.includes('Ocurrencias detectadas**: 1'))
  })
})
