import type { Concern, Severity, Outcome } from './classifier.ts'

export interface ClassifiedComment {
  iid: number
  body: string
  concern: Concern
  severity: Severity
  outcome: Outcome
  filePath: string | null
  line: number | null
}

export type ConcernGroups = Partial<Record<Concern, Array<ClassifiedComment>>>

export function aggregateByConcern(comments: Array<ClassifiedComment>): ConcernGroups {
  const map: ConcernGroups = {}
  for (const c of comments) {
    if (!map[c.concern]) map[c.concern] = []
    map[c.concern]!.push(c)
  }
  return map
}

export interface Pattern {
  concern: Concern
  canonicalBody: string
  recurrences: number
  mrIids: Array<number>
  examples: Array<{ iid: number; body: string; filePath: string | null; line: number | null }>
}

function normalize(body: string): string {
  return body.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()
}

export function extractPatterns(comments: Array<ClassifiedComment>, opts: { minRecurrences: number }): Array<Pattern> {
  const byNorm: Record<string, Array<ClassifiedComment>> = {}
  for (const c of comments) {
    const k = `${c.concern}::${normalize(c.body)}`
    if (!byNorm[k]) byNorm[k] = []
    byNorm[k].push(c)
  }
  const out: Array<Pattern> = []
  for (const [, items] of Object.entries(byNorm)) {
    if (items.length < opts.minRecurrences) continue
    const first = items[0]!
    out.push({
      concern: first.concern,
      canonicalBody: first.body,
      recurrences: items.length,
      mrIids: items.map(i => i.iid),
      examples: items.slice(0, 3).map(i => ({ iid: i.iid, body: i.body, filePath: i.filePath, line: i.line }))
    })
  }
  return out.sort((a, b) => b.recurrences - a.recurrences)
}
