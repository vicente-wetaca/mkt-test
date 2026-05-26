// Partition planner for HUGE bucket runs (D15, Wave 4.7).
// Given the output of `stratify-by-module.sh` and the planned specialists,
// produces an ordered list of waves — each wave processes one top-level
// module. The orchestrator runs them sequentially with human re-approval
// between them (skipped in --unattended).

import { estimateRunCost, type Bucket } from './cost-tracker.js'

export interface StratifyModule {
  /** Top-level path segment, e.g. "services/payments", "frontend/web", "infra". */
  module: string
  /** Number of files modified in this module. */
  files: number
  /** Files list relative to repo root. */
  paths: Array<string>
}

export interface ComputeHugePartitionsInput {
  /** Modules from `stratify-by-module.json.modules` keyed entry list. */
  modules: Array<StratifyModule>
  /** Specialists that COULD activate for the entire diff. The util filters per-module. */
  candidateSpecialists: Array<string>
  /** Whether R-triage is in the plan. Always true in practice. */
  hasTriage: boolean
  /** Whether run-tests-summary will execute. */
  hasTestsSummary: boolean
  /** Bucket per ola (per-module). Default 'MEDIUM' (conservative). */
  perWaveBucket?: Bucket
}

export interface WavePlan {
  /** 1-based wave index. */
  wave: number
  /** Module covered by this wave. */
  module: string
  /** Files (paths) the wave operates on. */
  files: Array<string>
  /** Specialists activated for this wave (filtered from candidateSpecialists). */
  specialists: Array<string>
  /** Estimated tokens for this wave. */
  estimated_tokens: number
  /** Estimated USD cost for this wave. */
  estimated_cost_usd: number
}

export interface ComputeHugePartitionsOutput {
  waves: Array<WavePlan>
  total_waves: number
  total_estimated_tokens: number
  total_estimated_cost_usd: number
}

// Mapeo módulo → specialists relevantes (heurístico). Si un specialist no está
// aquí, se mantiene en TODAS las waves (transversal). Las keys NO llevan slash
// final — el matcher acepta tanto `module === key` como `module.startsWith(key + '/')`.
const MODULE_SPECIALIST_AFFINITY: Record<string, Set<string>> = {
  'services': new Set([
    'R-di',
    'R-mongo-aggs',
    'R-mongo-queries',
    'R-event-types',
    'R-perf-backend',
    'R-security',
    'R-migrations',
  ]),
  'frontend': new Set([
    'R-apollo-cache',
    'R-perf-frontend',
  ]),
  'packages': new Set(['R-monorepo']),
  'modules': new Set(['R-monorepo']),
  'shared': new Set(['R-monorepo']),
  'entities': new Set(['R-monorepo', 'R-mongo-queries']),
  'models': new Set(['R-monorepo', 'R-mongo-queries']),
  'infra': new Set(['R-infra-protect']),
  '.gitlab': new Set(['R-gitlab-ci']),
  'migrations': new Set(['R-migrations']),
}

const TRANSVERSAL = new Set<string>([
  'R-code-quality',
  'R-tests',
  'R-mr-hygiene',
  'R-homogeneity',
  'R-solid',
  'R-third-party-docs',
  'R-regressions',
  'R-functional-completeness',
])

/**
 * Filters the candidate specialist list to those that make sense for a given
 * module. Transversal specialists are always kept. Module-specific specialists
 * are kept only if the module matches their affinity prefix.
 *
 * @param module - Module path, e.g. "services/payments".
 * @param candidates - Full candidate list.
 * @returns Subset of candidates relevant to the module.
 */
function specialistsForModule(module: string, candidates: Array<string>): Array<string> {
  const relevant = new Set<string>()
  for (const candidate of candidates) {
    if (TRANSVERSAL.has(candidate)) {
      relevant.add(candidate)
      continue
    }
    // Search MODULE_SPECIALIST_AFFINITY for a prefix match. The module matches
    // a key iff `module === key` OR `module.startsWith(key + '/')`. The special
    // `.gitlab` key matches bare path or sub-paths (`.gitlab/...`).
    for (const [key, specialists] of Object.entries(MODULE_SPECIALIST_AFFINITY)) {
      const matches = module === key || module.startsWith(`${key}/`)
      if (matches && specialists.has(candidate)) {
        relevant.add(candidate)
        break
      }
    }
  }
  return [...relevant].sort()
}

/**
 * Builds the sequential wave plan for a HUGE-bucket run. Order: modules are
 * sorted by file count descending so the most-impactful ola goes first
 * (humano detecta problemas estructurales temprano).
 *
 * @param input - Stratify output + planned team + flags.
 * @returns Wave plan with cost estimates per wave and totals.
 */
export function computeHugePartitions(
  input: ComputeHugePartitionsInput,
): ComputeHugePartitionsOutput {
  const bucket: Bucket = input.perWaveBucket ?? 'MEDIUM'
  const sortedModules = [...input.modules].sort((a, b) => b.files - a.files)

  let totalTokens = 0
  let totalCost = 0
  const waves: Array<WavePlan> = sortedModules.map((m, idx) => {
    const specialists = specialistsForModule(m.module, input.candidateSpecialists)
    const cost = estimateRunCost({
      bucket,
      specialistsCount: specialists.length,
      hasTriage: false, // R-triage corre UNA vez al final, no por wave
      hasTestsSummary: input.hasTestsSummary,
    })
    totalTokens += cost.estimated_total_tokens
    totalCost += cost.estimated_cost_usd
    return {
      wave: idx + 1,
      module: m.module,
      files: m.paths,
      specialists,
      estimated_tokens: cost.estimated_total_tokens,
      estimated_cost_usd: cost.estimated_cost_usd,
    }
  })

  // Triage corre UNA vez al final (sobre todos los issues acumulados).
  if (input.hasTriage) {
    const triageCost = estimateRunCost({
      bucket: 'LARGE', // Bucket holístico para triage (lee TODOS los issues)
      specialistsCount: 0,
      hasTriage: true,
      hasTestsSummary: false,
    })
    totalTokens += triageCost.estimated_total_tokens
    totalCost += triageCost.estimated_cost_usd
  }

  return {
    waves,
    total_waves: waves.length,
    total_estimated_tokens: totalTokens,
    total_estimated_cost_usd: Math.round(totalCost * 100) / 100,
  }
}
