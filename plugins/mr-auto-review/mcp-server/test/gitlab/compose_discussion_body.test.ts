// Tests for gitlab_compose_discussion_body: chrome layout + issue-hash round-trip.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { gitlabComposeDiscussionBody } from '../../src/tools/gitlab/compose_discussion_body.ts'
import { extractIssueHashes } from '../../src/util/issue-hash.ts'

const BASE = {
  agentName: 'R-tests',
  severity: 'must-fix' as const,
  groupId: 'G-007',
  bodyMarkdown: 'This `await` is missing inside the for loop.',
  detectors: ['R-tests', 'R-code-quality'],
  confidence: 'high' as const,
  filePath: 'services/payments/handlers/place-order.ts',
  lineNumber: 42,
}

describe('gitlabComposeDiscussionBody', () => {
  it('emits the canonical 3-element chrome layout', () => {
    const { body } = gitlabComposeDiscussionBody(BASE)
    const lines = body.split('\n')
    assert.equal(lines[0], '🤖 **MR-auto-review** · R-tests · must-fix')
    assert.ok(body.includes('---'))
    assert.ok(body.includes('*Group: G-007'))
    assert.ok(body.includes('Detected by: R-tests, R-code-quality'))
    assert.ok(body.includes('Confidence: high'))
    assert.ok(body.includes('Severity: must-fix'))
    assert.ok(body.includes('reacciona con 👎'))
  })

  it('embeds the deterministic issue-hash in the sign-off', () => {
    const { body, issueHash } = gitlabComposeDiscussionBody(BASE)
    assert.match(issueHash, /^[a-f0-9]{16}$/)
    assert.ok(body.includes(`issue-hash: ${issueHash}`))
    // round-trip: the extractor should find the same hash inside the body
    assert.deepEqual(extractIssueHashes(body), [issueHash])
  })

  it('is idempotent: same input → same hash and body', () => {
    const a = gitlabComposeDiscussionBody(BASE)
    const b = gitlabComposeDiscussionBody(BASE)
    assert.equal(a.body, b.body)
    assert.equal(a.issueHash, b.issueHash)
  })

  it('trims trailing whitespace from the substantive body', () => {
    const { body } = gitlabComposeDiscussionBody({ ...BASE, bodyMarkdown: '  body  \n\n  ' })
    assert.ok(body.includes('\nbody\n'))
    assert.ok(!body.includes('  body  '))
  })

  it('preserves markdown emphasis in the substantive body (only normalised in hash)', () => {
    const { body, issueHash } = gitlabComposeDiscussionBody({
      ...BASE,
      bodyMarkdown: '**bold** + `code`',
    })
    assert.ok(body.includes('**bold** + `code`'))
    assert.match(issueHash, /^[a-f0-9]{16}$/)
  })

  it('joins multiple detectors with comma-space', () => {
    const { body } = gitlabComposeDiscussionBody({
      ...BASE,
      detectors: ['R-tests', 'R-code-quality', 'R-di'],
    })
    assert.ok(body.includes('Detected by: R-tests, R-code-quality, R-di'))
  })

  it('rejects empty detectors array', () => {
    assert.throws(() => gitlabComposeDiscussionBody({ ...BASE, detectors: [] }))
  })

  it('rejects invalid severity', () => {
    assert.throws(() =>
      // @ts-expect-error testing runtime rejection
      gitlabComposeDiscussionBody({ ...BASE, severity: 'critical' }),
    )
  })

  it('rejects invalid confidence', () => {
    assert.throws(() =>
      // @ts-expect-error testing runtime rejection
      gitlabComposeDiscussionBody({ ...BASE, confidence: 'unsure' }),
    )
  })

  it('rejects zero/negative line numbers', () => {
    assert.throws(() => gitlabComposeDiscussionBody({ ...BASE, lineNumber: 0 }))
    assert.throws(() => gitlabComposeDiscussionBody({ ...BASE, lineNumber: -5 }))
  })

  it('feedback prompt is a markdown block-quote', () => {
    const { body } = gitlabComposeDiscussionBody(BASE)
    assert.ok(body.split('\n').some((l) => l.startsWith('> ')))
  })

  it('keeps the prefix bare (no persona name) regardless of persona presence', () => {
    const { body } = gitlabComposeDiscussionBody({
      ...BASE,
      personaOpener: 'Aniceto el Cenizo se cruza de brazos:',
    })
    assert.ok(body.startsWith('🤖 **MR-auto-review** · R-tests · must-fix'))
    // No "(" before "·" — prefix never wraps the persona
    const prefixLine = body.split('\n')[0]
    assert.ok(!prefixLine.includes('('))
  })

  it('renders the personaOpener as an italic one-liner between prefix and body', () => {
    const { body } = gitlabComposeDiscussionBody({
      ...BASE,
      personaOpener: 'Aniceto el Cenizo arquea una ceja:',
    })
    const lines = body.split('\n')
    assert.equal(lines[0], '🤖 **MR-auto-review** · R-tests · must-fix')
    assert.equal(lines[1], '')
    assert.equal(lines[2], '_Aniceto el Cenizo arquea una ceja:_')
    assert.equal(lines[3], '')
    assert.equal(lines[4], 'This `await` is missing inside the for loop.')
  })

  it('omits the opener line entirely when personaOpener is absent', () => {
    const { body } = gitlabComposeDiscussionBody(BASE)
    const lines = body.split('\n')
    assert.equal(lines[0], '🤖 **MR-auto-review** · R-tests · must-fix')
    assert.equal(lines[1], '')
    // body starts directly at line 2, no italic opener
    assert.equal(lines[2], 'This `await` is missing inside the for loop.')
  })

  it('trims whitespace around personaOpener', () => {
    const { body } = gitlabComposeDiscussionBody({
      ...BASE,
      personaOpener: '  Aniceto suspira:  ',
    })
    assert.ok(body.includes('_Aniceto suspira:_'))
    assert.ok(!body.includes('_  Aniceto suspira:  _'))
  })

  it('sign-off uses the agent ID only, never the personaOpener content', () => {
    const { body } = gitlabComposeDiscussionBody({
      ...BASE,
      personaOpener: 'Aniceto el Cenizo se cruza de brazos:',
    })
    assert.ok(body.includes('Detected by: R-tests, R-code-quality'))
    assert.ok(!body.includes('Detected by: Aniceto'))
  })

  it('personaOpener does NOT affect the issue-hash (cosmetic-only)', () => {
    const a = gitlabComposeDiscussionBody(BASE)
    const b = gitlabComposeDiscussionBody({ ...BASE, personaOpener: 'Aniceto el Cenizo:' })
    const c = gitlabComposeDiscussionBody({ ...BASE, personaOpener: 'Otra apertura:' })
    assert.equal(a.issueHash, b.issueHash)
    assert.equal(a.issueHash, c.issueHash)
  })

  it('rejects a personaOpener exceeding 240 characters', () => {
    assert.throws(() =>
      gitlabComposeDiscussionBody({ ...BASE, personaOpener: 'x'.repeat(241) }),
    )
  })
})
