export type Concern =
  | 'code-quality'
  | 'tests'
  | 'di'
  | 'mongo-aggs'
  | 'mongo-queries'
  | 'apollo-cache'
  | 'monorepo'
  | 'infra-protect'
  | 'gitlab-ci'
  | 'event-types'
  | 'migrations'
  | 'security'
  | 'perf-backend'
  | 'perf-frontend'
  | 'homogeneity'
  | 'solid'
  | 'mr-hygiene'
  | 'unknown'

export type Severity = 'must-fix' | 'should-fix' | 'nit'
export type Outcome = 'fixed' | 'rejected' | 'unresolved'

export interface CommentInput {
  body: string
  filePath: string | null
  authorUsername: string
  resolved: boolean
  followingDiff: string   // raw diff after the comment (for outcome inference)
}

export interface CommentClassification {
  concern: Concern
  severity: Severity
  outcome: Outcome
}

interface ConcernRule {
  concern: Concern
  patterns: Array<RegExp>
  pathHints: Array<RegExp>
}

const CONCERN_RULES: Array<ConcernRule> = [
  { concern: 'tests',         patterns: [/\btest\b/i, /\bspec\b/i, /\bcobertura\b/i, /\bmock(?:s|ed|ing)?\b/i, /\bjest\b/i],           pathHints: [/\.spec\.ts$/, /\.test\.ts$/, /\/test\//, /__tests__/] },
  { concern: 'mongo-aggs',    patterns: [/\$match\b/, /\$group\b/, /\$lookup\b/, /\$unwind\b/, /\baggregat(e|ion)\b/i, /\bpipeline\b/i], pathHints: [/pipeline/, /aggregation/] },
  { concern: 'mongo-queries', patterns: [/\.find\s*\(/, /\.findOne\s*\(/, /\.findOneAndUpdate\s*\(/, /\bindex(es|ed)?\b/i],            pathHints: [/repositories/] },
  { concern: 'apollo-cache',  patterns: [/\bfetchPolicy\b/, /\buseQuery\b/, /\bcache-first\b/, /\bno-cache\b/, /\bapollo\b/i],          pathHints: [/frontend\/web/] },
  { concern: 'di',            patterns: [/\bfunctionInjection\b/, /\bobjectInjection\b/, /\binyect(ar|ado|able)\b/i, /\binyecci[oó]n\b/i],   pathHints: [/use-cases/, /bootstrap/] },
  { concern: 'security',      patterns: [/\bsecret\b/i, /\btoken\b/i, /\bjwt\b/i, /\bcred?ential\b/i, /\bpassword\b/i, /\boauth\b/i, /\bcrypto\b/i, /\bbcrypt\b/i, /\bhash\b/i, /\binyecci[oó]n\b/i, /\binjection\b/i],                        pathHints: [/payment/, /auth/, /subscription-triggers/] },
  { concern: 'infra-protect', patterns: [/\bprodProtection\b/, /\bretainOnDelete\b/, /\bgetPolicyDocument\b/, /\bpulumi\b/i],            pathHints: [/^infra\/src\//] },
  { concern: 'gitlab-ci',     patterns: [/\benvironment\.name\b/, /\.gitlab-ci/, /\bgitlab-ci\b/i, /\bpipeline\b.*\bjob\b/i],            pathHints: [/\.gitlab-ci\.yml$/, /\.gitlab\//] },
  { concern: 'event-types',   patterns: [/\bevent\b.*\bemitter\b/i, /\brabbitmq\b/i, /\bamqp\b/i, /\bexchange\b/i],                       pathHints: [/event-types/] },
  { concern: 'migrations',    patterns: [/\bmigration\b/i, /\breversibility\b/i, /\bbackfill\b/i],                                       pathHints: [/^migrations\//] },
  { concern: 'perf-frontend', patterns: [/\bbundle\b/i, /\blazy\b/i, /\bre-?render\b/i, /\bcode.?split\b/i],                              pathHints: [/frontend\/web/] },
  { concern: 'perf-backend',  patterns: [/\bN\+1\b/, /\bperf(ormance)?\b/i, /\bslow\b/i, /\boptimiz/i],                                   pathHints: [/services\//, /modules\//] },
  { concern: 'mr-hygiene',    patterns: [/\bdescription\b.*\bmr\b/i, /\bticket\b.*\blink\b/i, /\bcommit\b.*\bmessage\b/i, /\benv\.example\b/i, /\.env\.example/], pathHints: [/\.env/, /env\.ts$/] },
  { concern: 'solid',         patterns: [/\bSOLID\b/, /\bgod class\b/i, /\bprimitive obsession\b/i, /\bfeature envy\b/i, /\bsingle responsibility\b/i],   pathHints: [] },
  { concern: 'monorepo',      patterns: [/\bshared\b.*\bpackage\b/i, /\bcoupling\b/i, /\bcircular\b/i],                                   pathHints: [/packages\//, /shared\//] },
  { concern: 'homogeneity',   patterns: [/\bya\s+existe\b/i, /\bsimilar\b.*\bpattern\b/i, /\bhomog(?:eneity|eneo|enious)\b/i],            pathHints: [] },
]

export function classifyComment(input: CommentInput): CommentClassification {
  let concern: Concern = 'unknown'
  for (const rule of CONCERN_RULES) {
    const bodyHit = rule.patterns.some(p => p.test(input.body))
    const pathHit = input.filePath !== null && rule.pathHints.some(p => p.test(input.filePath!))
    if (bodyHit || pathHit) { concern = rule.concern; break }
  }
  if (concern === 'unknown') {
    // generic fallback: any prose about TS code defaults to code-quality
    if (/\bany\b/i.test(input.body) || /\boptional chaining\b/i.test(input.body) || /\bnullish\b/i.test(input.body) || /\btype\b/i.test(input.body)) {
      concern = 'code-quality'
    }
  }

  // severity heuristic
  const lower = input.body.toLowerCase()
  let severity: Severity
  if (/\bnit:?\b/.test(lower) || /\boptional\b/.test(lower) || /\bcosmetic/.test(lower) || /\bprefer\b/.test(lower)) {
    severity = 'nit'
  } else if (/\bbug\b/.test(lower) || /\bbroken\b/.test(lower) || /\bcrash/.test(lower) || /\bsecurity\b/.test(lower) || /\bhardcod/.test(lower) || /\bhay que\b/.test(lower) || /\bantes de mergear\b/.test(lower) || /\bbloquea/.test(lower)) {
    severity = 'must-fix'
  } else {
    severity = 'should-fix'
  }

  // outcome inference
  let outcome: Outcome
  if (input.resolved) {
    outcome = input.followingDiff.trim().length > 0 ? 'fixed' : 'rejected'
  } else {
    outcome = 'unresolved'
  }

  return { concern, severity, outcome }
}
