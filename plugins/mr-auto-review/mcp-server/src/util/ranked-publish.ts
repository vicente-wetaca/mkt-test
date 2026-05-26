// Ranking + hard cap for groups about to be published. Spec: WET-4814 D34
// (REQUESTS-001 §A.6). When the orchestrator has more publishable groups than
// the configured cap, this util picks the most-impactful ones and reports the
// rest with a stable reason string.
//
// Ranking key (descending): severity > confidence > n_detectors. Within ties,
// the original input order is preserved (stable sort).

export type Severity = 'must-fix' | 'should-fix' | 'nit'
export type Confidence = 'high' | 'medium' | 'low'

export interface RankableGroup {
  groupId: string
  severity: Severity
  confidence: Confidence
  /** Number of detector agents that converged on this group. */
  detectorCount: number
}

export interface RankAndCapInput<T extends RankableGroup> {
  groups: Array<T>
  /** Maximum groups to publish. Must be ≥ 0. */
  cap: number
}

export interface OverCapEntry<T extends RankableGroup> {
  group: T
  /** Stable reason string included in not-published.yml. */
  reason: string
}

export interface RankAndCapOutput<T extends RankableGroup> {
  toPublish: Array<T>
  overCap: Array<OverCapEntry<T>>
}

const SEVERITY_WEIGHT: Record<Severity, number> = {
  'must-fix': 3,
  'should-fix': 2,
  'nit': 1,
}
const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

/**
 * Ranks the groups by (severity, confidence, detectorCount) descending and
 * splits them at `cap`. The function is generic over RankableGroup subtypes
 * so callers can attach extra metadata without losing types.
 *
 * @param input - Groups to rank + cap value.
 * @returns Top-cap groups in toPublish, the rest in overCap with reason.
 * @throws Error when cap < 0.
 */
export function rankAndCapGroups<T extends RankableGroup>(
  input: RankAndCapInput<T>,
): RankAndCapOutput<T> {
  if (input.cap < 0 || !Number.isInteger(input.cap)) {
    throw new Error(`rankAndCapGroups: cap must be a non-negative integer, got ${input.cap}`)
  }

  // Decorate with index for stable ties, sort, undecorate
  const decorated = input.groups.map((group, idx) => ({ group, idx }))
  decorated.sort((a, b) => {
    const sevDiff = SEVERITY_WEIGHT[b.group.severity] - SEVERITY_WEIGHT[a.group.severity]
    if (sevDiff !== 0) return sevDiff
    const confDiff = CONFIDENCE_WEIGHT[b.group.confidence] - CONFIDENCE_WEIGHT[a.group.confidence]
    if (confDiff !== 0) return confDiff
    const detDiff = b.group.detectorCount - a.group.detectorCount
    if (detDiff !== 0) return detDiff
    // Tie-break: preserve original order
    return a.idx - b.idx
  })

  const ranked = decorated.map((d) => d.group)
  const toPublish = ranked.slice(0, input.cap)
  const overCap = ranked.slice(input.cap).map<OverCapEntry<T>>((group) => ({
    group,
    reason: `over-cap-${input.cap}`,
  }))

  return { toPublish, overCap }
}
