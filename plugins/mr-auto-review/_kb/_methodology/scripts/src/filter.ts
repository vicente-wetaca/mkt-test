const BOT_USERNAMES = new Set(['gitlab-bot', 'wetaca-bot', 'dependabot', 'renovate-bot'])

export interface FilterableMR {
  iid: number
  author: string
  reviewers: Array<string>
  humanCommentCount: number
  mergedAt: string | null
}

export interface FilterOptions {
  since: string         // ISO date
  until: string         // ISO date
  minReviewers: number
  minComments: number
}

export function passesFilters(mr: FilterableMR, opts: FilterOptions): boolean {
  if (mr.mergedAt === null) return false
  if (mr.mergedAt < opts.since || mr.mergedAt > opts.until) return false
  if (mr.humanCommentCount < opts.minComments) return false

  const distinct = new Set(
    mr.reviewers.filter(r => r !== mr.author && !BOT_USERNAMES.has(r))
  )
  if (distinct.size < opts.minReviewers) return false

  return true
}
