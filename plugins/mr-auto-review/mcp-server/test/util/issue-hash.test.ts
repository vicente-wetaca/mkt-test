// Tests for issue-hash utility: determinism + normalisation + extraction.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  computeIssueHash,
  extractIssueHashes,
  canonicaliseFilePath,
  normaliseBody,
} from '../../src/util/issue-hash.ts'

const BASE = {
  filePath: 'services/payments/handlers/place-order.ts',
  lineNumber: 42,
  severity: 'must-fix' as const,
  bodyMarkdown: 'This `await` is missing inside the for loop — payments may race.',
  agentName: 'R-tests',
}

describe('canonicaliseFilePath', () => {
  it('strips ./ prefix', () => {
    assert.equal(canonicaliseFilePath('./src/foo.ts'), 'src/foo.ts')
  })
  it('collapses multiple slashes', () => {
    assert.equal(canonicaliseFilePath('src//foo///bar.ts'), 'src/foo/bar.ts')
  })
  it('trims whitespace', () => {
    assert.equal(canonicaliseFilePath('  src/foo.ts  '), 'src/foo.ts')
  })
  it('does not lowercase (file systems are case-sensitive in this repo)', () => {
    assert.equal(canonicaliseFilePath('src/FooBar.tsx'), 'src/FooBar.tsx')
  })
})

describe('normaliseBody', () => {
  it('lowercases', () => {
    assert.equal(normaliseBody('AbC'), 'abc')
  })
  it('strips markdown emphasis chars and quotes', () => {
    assert.equal(normaliseBody('**bold** _italic_ `code` "quoted" \'apos\''), 'bold italic code quoted apos')
  })
  it('collapses whitespace', () => {
    assert.equal(normaliseBody('a\n\tb   c'), 'a b c')
  })
  it('trims edges', () => {
    assert.equal(normaliseBody('   hello   '), 'hello')
  })
})

describe('computeIssueHash', () => {
  it('returns 16 hex chars', () => {
    const hash = computeIssueHash(BASE)
    assert.match(hash, /^[a-f0-9]{16}$/)
  })

  it('is deterministic', () => {
    const a = computeIssueHash(BASE)
    const b = computeIssueHash(BASE)
    assert.equal(a, b)
  })

  it('is stable across cosmetic whitespace changes in body', () => {
    const a = computeIssueHash(BASE)
    const b = computeIssueHash({ ...BASE, bodyMarkdown: BASE.bodyMarkdown.replace(' ', '\n\t  ') })
    assert.equal(a, b)
  })

  it('is stable when body wraps content in **bold**', () => {
    const a = computeIssueHash(BASE)
    const b = computeIssueHash({ ...BASE, bodyMarkdown: `**${BASE.bodyMarkdown}**` })
    assert.equal(a, b)
  })

  it('is stable when path is prefixed with ./', () => {
    const a = computeIssueHash(BASE)
    const b = computeIssueHash({ ...BASE, filePath: `./${BASE.filePath}` })
    assert.equal(a, b)
  })

  it('changes when file changes', () => {
    const a = computeIssueHash(BASE)
    const b = computeIssueHash({ ...BASE, filePath: 'services/payments/handlers/other.ts' })
    assert.notEqual(a, b)
  })

  it('changes when line changes', () => {
    const a = computeIssueHash(BASE)
    const b = computeIssueHash({ ...BASE, lineNumber: 43 })
    assert.notEqual(a, b)
  })

  it('changes when severity changes', () => {
    const a = computeIssueHash(BASE)
    const b = computeIssueHash({ ...BASE, severity: 'should-fix' })
    assert.notEqual(a, b)
  })

  it('changes when agent changes', () => {
    const a = computeIssueHash(BASE)
    const b = computeIssueHash({ ...BASE, agentName: 'R-code-quality' })
    assert.notEqual(a, b)
  })

  it('changes when body substance changes', () => {
    const a = computeIssueHash(BASE)
    const b = computeIssueHash({ ...BASE, bodyMarkdown: 'Different finding entirely.' })
    assert.notEqual(a, b)
  })
})

describe('extractIssueHashes', () => {
  it('extracts a single hash from a sign-off line', () => {
    const text = '*Group: G-007 · Detected by: R-tests · Confidence: high · Severity: must-fix · issue-hash: 7f3e9a2b4c5d6e7f*'
    assert.deepEqual(extractIssueHashes(text), ['7f3e9a2b4c5d6e7f'])
  })

  it('handles different spacing around the colon', () => {
    assert.deepEqual(extractIssueHashes('issue-hash:abcd1234'), ['abcd1234'])
    assert.deepEqual(extractIssueHashes('issue-hash :  abcd1234'), ['abcd1234'])
    assert.deepEqual(extractIssueHashes('issue-hash :\tabcd1234'), ['abcd1234'])
  })

  it('lowercases the hash', () => {
    assert.deepEqual(extractIssueHashes('issue-hash: ABCD1234'), ['abcd1234'])
  })

  it('finds multiple hashes in a single body', () => {
    const text = `
      First note: issue-hash: aaaa1111
      Second:    issue-hash: bbbb2222
    `
    assert.deepEqual(new Set(extractIssueHashes(text)), new Set(['aaaa1111', 'bbbb2222']))
  })

  it('dedupes when the same hash appears twice', () => {
    const text = 'issue-hash: cafef00d ... issue-hash: cafef00d'
    assert.deepEqual(extractIssueHashes(text), ['cafef00d'])
  })

  it('returns empty array when no hash is present', () => {
    assert.deepEqual(extractIssueHashes('Just a regular human comment.'), [])
  })

  it('ignores tokens with fewer than 8 hex chars', () => {
    assert.deepEqual(extractIssueHashes('issue-hash: abc'), [])
  })

  it('works on full bot bodies wrapped in italics', () => {
    const body = [
      '🤖 **MR-auto-review** · R-tests · must-fix',
      '',
      'This await is missing inside the for loop.',
      '',
      '---',
      '*Group: G-007 · Detected by: R-tests, R-code-quality · Confidence: high · Severity: must-fix · issue-hash: 1234abcd5678ef90*',
      '',
      '> Si este comentario no es útil, reacciona con 👎 — nos ayuda a calibrar.',
    ].join('\n')
    assert.deepEqual(extractIssueHashes(body), ['1234abcd5678ef90'])
  })
})
