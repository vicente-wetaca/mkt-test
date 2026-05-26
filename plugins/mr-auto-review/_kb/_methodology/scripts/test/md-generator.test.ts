import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateConcernMD } from '../src/md-generator.ts'

test('generates KB markdown with header and patterns', () => {
  const md = generateConcernMD({
    concern: 'tests',
    corpusSize: 40,
    lastUpdated: '2026-05-18',
    methodologyVersion: 1,
    patterns: [
      {
        concern: 'tests',
        canonicalBody: 'Falta test del caso error',
        recurrences: 5,
        mrIids: [1, 2, 3, 4, 5],
        examples: [
          { iid: 1, body: 'Falta test del caso error.', filePath: 'foo.spec.ts', line: 10 }
        ]
      }
    ],
    ruleCitations: ['.claude/rules/testing-standards.md#result-handling']
  })

  assert.ok(md.includes('# KB: tests'))
  assert.ok(md.includes('corpus_size | 40'))
  assert.ok(md.includes('Falta test del caso error'))
  assert.ok(md.includes('!1, !2, !3'))
  assert.ok(md.includes('.claude/rules/testing-standards.md'))
})
