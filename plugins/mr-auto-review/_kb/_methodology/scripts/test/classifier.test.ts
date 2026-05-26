import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyComment, type CommentInput } from '../src/classifier.ts'

const base: CommentInput = {
  body: '',
  filePath: null,
  authorUsername: 'reviewer1',
  resolved: false,
  followingDiff: '',
}

test('detects tests concern by keyword', () => {
  const r = classifyComment({ ...base, body: 'Falta test que cubra el caso de error.' })
  assert.equal(r.concern, 'tests')
})

test('detects mongo-aggs concern by $match keyword', () => {
  const r = classifyComment({ ...base, body: 'El $match debería ir antes del $lookup para usar el índice.' })
  assert.equal(r.concern, 'mongo-aggs')
})

test('detects security concern by secret-related keywords', () => {
  const r = classifyComment({ ...base, body: 'No hardcodees el JWT secret, usa env var.' })
  assert.equal(r.concern, 'security')
})

test('detects code-quality on generic style comments', () => {
  const r = classifyComment({ ...base, body: 'Usa optional chaining en vez de && encadenado.' })
  assert.equal(r.concern, 'code-quality')
})

test('infers severity must-fix when tone is imperative + outcome resolved', () => {
  const r = classifyComment({ ...base, body: 'Esto es un bug, hay que arreglarlo antes de mergear.', resolved: true })
  assert.equal(r.severity, 'must-fix')
})

test('infers severity nit on optional/nit/cosmetic phrasing', () => {
  const r = classifyComment({ ...base, body: 'Nit: prefer spaces over tabs here.' })
  assert.equal(r.severity, 'nit')
})

test('falls back to should-fix when unclear', () => {
  const r = classifyComment({ ...base, body: 'Quizá podrías extraer esto a un helper.' })
  assert.equal(r.severity, 'should-fix')
})

test('outcome=fixed when comment is resolved AND there is a follow-up diff', () => {
  const r = classifyComment({ ...base, body: 'Cambia X.', resolved: true, followingDiff: 'diff stuff' })
  assert.equal(r.outcome, 'fixed')
})

test('outcome=rejected when resolved with no follow-up diff', () => {
  const r = classifyComment({ ...base, body: 'Cambia X.', resolved: true, followingDiff: '' })
  assert.equal(r.outcome, 'rejected')
})

test('outcome=unresolved otherwise', () => {
  const r = classifyComment({ ...base, body: 'Cambia X.', resolved: false })
  assert.equal(r.outcome, 'unresolved')
})
