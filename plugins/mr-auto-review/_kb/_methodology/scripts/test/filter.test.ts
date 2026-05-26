import { test } from 'node:test'
import assert from 'node:assert/strict'
import { passesFilters, type FilterableMR } from '../src/filter.ts'

const baseMR: FilterableMR = {
  iid: 1,
  author: 'alice',
  reviewers: ['bob', 'carol'],
  humanCommentCount: 5,
  mergedAt: '2026-04-15T10:00:00Z'
}

test('passes when ≥2 distinct human reviewers and ≥5 comments and within window', () => {
  assert.equal(passesFilters(baseMR, { since: '2026-04-01', until: '2026-05-01', minReviewers: 2, minComments: 5 }), true)
})

test('rejects when only 1 reviewer', () => {
  assert.equal(passesFilters({ ...baseMR, reviewers: ['bob'] }, { since: '2026-04-01', until: '2026-05-01', minReviewers: 2, minComments: 5 }), false)
})

test('rejects when reviewer == author (does not count)', () => {
  assert.equal(passesFilters({ ...baseMR, reviewers: ['alice', 'bob'] }, { since: '2026-04-01', until: '2026-05-01', minReviewers: 2, minComments: 5 }), false)
})

test('rejects when comment count below threshold', () => {
  assert.equal(passesFilters({ ...baseMR, humanCommentCount: 3 }, { since: '2026-04-01', until: '2026-05-01', minReviewers: 2, minComments: 5 }), false)
})

test('rejects when merged outside window', () => {
  assert.equal(passesFilters({ ...baseMR, mergedAt: '2026-03-15T10:00:00Z' }, { since: '2026-04-01', until: '2026-05-01', minReviewers: 2, minComments: 5 }), false)
})

test('rejects bot reviewers from count', () => {
  assert.equal(passesFilters({ ...baseMR, reviewers: ['gitlab-bot', 'bob'] }, { since: '2026-04-01', until: '2026-05-01', minReviewers: 2, minComments: 5 }), false)
})
