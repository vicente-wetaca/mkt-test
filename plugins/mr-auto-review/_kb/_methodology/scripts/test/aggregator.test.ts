import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateByConcern, extractPatterns, type ClassifiedComment } from '../src/aggregator.ts'

const c = (concern: ClassifiedComment['concern'], body: string, mr = 1): ClassifiedComment => ({
  iid: mr, body, concern, severity: 'should-fix', outcome: 'fixed', filePath: 'x.ts', line: 1
})

test('aggregateByConcern groups by concern key', () => {
  const map = aggregateByConcern([c('tests','a'), c('tests','b'), c('di','c')])
  assert.equal(map['tests']?.length, 2)
  assert.equal(map['di']?.length, 1)
})

test('extractPatterns returns only patterns with ≥threshold recurrences', () => {
  const comments: Array<ClassifiedComment> = [
    c('tests','Falta test del caso error', 1),
    c('tests','Falta test del caso error', 2),
    c('tests','Falta test del caso error', 3),
    c('tests','solo aparece una vez', 4),
  ]
  const patterns = extractPatterns(comments, { minRecurrences: 3 })
  assert.equal(patterns.length, 1)
  assert.equal(patterns[0]?.recurrences, 3)
  assert.deepEqual(patterns[0]?.mrIids, [1, 2, 3])
})

test('extractPatterns normalizes case + punctuation when grouping', () => {
  const comments: Array<ClassifiedComment> = [
    c('di','Usa functionInjection.', 1),
    c('di','usa functionInjection', 2),
    c('di','USA FUNCTIONINJECTION!', 3),
  ]
  const patterns = extractPatterns(comments, { minRecurrences: 3 })
  assert.equal(patterns.length, 1)
})
