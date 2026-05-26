// Cost estimation + cap enforcement for /mr-review runs. Spec: WET-4814 D18 +
// REQUESTS-001 §A.8 (--estimate). The orchestrator calls `estimateRunCost` at
// pre-flight (after bucket calc) and after each significant step to decide
// whether to keep going (assisted mode = ask human) or to abort (unattended).
//
// Pricing is a rough rule-of-thumb; the exact figures are not load-bearing
// — the orchestrator's job is to FLAG runaway costs, not to bill them.

export type Bucket = 'TINY' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'HUGE'

export interface CostCap {
  /** Soft cap in tokens; gate humano if exceeded (or abort in unattended) */
  total: number
  input: number
  output: number
}

/**
 * Total cap per bucket. Source: D18. The orchestrator uses this both as the
 * preview number in the gate ("Bucket X, cap N") and as the threshold for
 * the unattended abort.
 */
export const BUCKET_CAPS: Record<Bucket, CostCap> = {
  TINY:   { input: 10_000,  output: 5_000,   total: 30_000 },
  SMALL:  { input: 30_000,  output: 15_000,  total: 100_000 },
  MEDIUM: { input: 100_000, output: 40_000,  total: 400_000 },
  LARGE:  { input: 300_000, output: 100_000, total: 1_500_000 },
  HUGE:   { input: 1_000_000, output: 300_000, total: 4_000_000 },
}

/** Per-specialist incremental token cost (sonnet, typical full review). */
const SONNET_PER_SPECIALIST_INPUT = 20_000
const SONNET_PER_SPECIALIST_OUTPUT = 5_000

/** R-triage uses Opus and processes everything. */
const TRIAGE_OPUS_INPUT = 40_000
const TRIAGE_OPUS_OUTPUT = 15_000

/** Run-tests-summary script overhead when active and not skipped. */
const TESTS_SUMMARY_INPUT = 20_000
const TESTS_SUMMARY_OUTPUT = 2_000

/** Rough pricing (USD per 1M tokens). Updated 2026-05-20 from Anthropic. */
const PRICING = {
  sonnet: { input: 3.0,  output: 15.0 },
  opus:   { input: 15.0, output: 75.0 },
  haiku:  { input: 0.80, output: 4.0 },
}

export interface CostEstimateInput {
  bucket: Bucket
  /** Number of R-* specialists planned for this run (excluding R-triage). */
  specialistsCount: number
  /** True if R-triage is in the plan (it always is in practice). */
  hasTriage: boolean
  /** True if run-tests-summary.sh will execute (R-tests active AND not --skip-tests). */
  hasTestsSummary: boolean
}

export interface CostEstimateOutput {
  bucket: Bucket
  estimated_input_tokens: number
  estimated_output_tokens: number
  estimated_total_tokens: number
  estimated_cost_usd: number
  cap: CostCap
  fits_in_cap: boolean
  /** Multiplier of cap reached. <1 = below, >=1 = over. */
  cap_ratio: number
}

/**
 * Computes a heuristic cost estimate for a run. The estimate is not exact;
 * its job is to anchor the orchestrator's decision to continue or abort.
 *
 * @param input - Bucket + planned team composition.
 * @returns Estimated tokens + USD cost + fit-in-cap flag.
 */
export function estimateRunCost(input: CostEstimateInput): CostEstimateOutput {
  const cap = BUCKET_CAPS[input.bucket]

  // Base bucket cost (the read of context, scripts output, etc.).
  // Use 60% of the cap input/output as the base footprint of pre-pass + reviewers' shared context.
  const baseInput = Math.round(cap.input * 0.4)
  const baseOutput = Math.round(cap.output * 0.4)

  const specInput = input.specialistsCount * SONNET_PER_SPECIALIST_INPUT
  const specOutput = input.specialistsCount * SONNET_PER_SPECIALIST_OUTPUT
  const triageInput = input.hasTriage ? TRIAGE_OPUS_INPUT : 0
  const triageOutput = input.hasTriage ? TRIAGE_OPUS_OUTPUT : 0
  const testsInput = input.hasTestsSummary ? TESTS_SUMMARY_INPUT : 0
  const testsOutput = input.hasTestsSummary ? TESTS_SUMMARY_OUTPUT : 0

  const estInput = baseInput + specInput + triageInput + testsInput
  const estOutput = baseOutput + specOutput + triageOutput + testsOutput
  const estTotal = estInput + estOutput

  // Sonnet for specialists, Opus for triage, sonnet's pricing dominates baseline.
  const sonnetCost =
    (baseInput + specInput + testsInput) / 1_000_000 * PRICING.sonnet.input +
    (baseOutput + specOutput + testsOutput) / 1_000_000 * PRICING.sonnet.output
  const opusCost =
    triageInput / 1_000_000 * PRICING.opus.input +
    triageOutput / 1_000_000 * PRICING.opus.output
  const totalCostUsd = Math.round((sonnetCost + opusCost) * 100) / 100

  return {
    bucket: input.bucket,
    estimated_input_tokens: estInput,
    estimated_output_tokens: estOutput,
    estimated_total_tokens: estTotal,
    estimated_cost_usd: totalCostUsd,
    cap,
    fits_in_cap: estTotal <= cap.total,
    cap_ratio: Math.round((estTotal / cap.total) * 100) / 100,
  }
}

/**
 * Decision helper for the orchestrator. Given an estimate, the configured
 * multiplier (default 1.5 in unattended), and the operating mode, returns
 * whether the run should be aborted, paused for human approval, or continue.
 *
 * @param estimate - Output of `estimateRunCost`.
 * @param mode - 'assisted' (human gate) or 'unattended' (auto abort).
 * @param multiplier - Cap multiplier (default 1.5).
 * @returns Decision string + reason.
 */
export type CostDecision = 'continue' | 'human-gate' | 'abort'

export interface CostDecisionResult {
  decision: CostDecision
  reason: string
  threshold_tokens: number
}

/**
 * Decides what to do given a cost estimate. Single threshold = `cap × multiplier`.
 * Below threshold → continue; above → human-gate (assisted) OR abort (unattended).
 *
 * @param estimate - Output of estimateRunCost.
 * @param mode - 'assisted' or 'unattended'.
 * @param multiplier - Multiplier of the cap that triggers the gate/abort. Default 1.5.
 */
export function decideCostAction(
  estimate: CostEstimateOutput,
  mode: 'assisted' | 'unattended',
  multiplier = 1.5,
): CostDecisionResult {
  const threshold = Math.round(estimate.cap.total * multiplier)
  if (estimate.estimated_total_tokens <= threshold) {
    return {
      decision: 'continue',
      reason: `estimated ${estimate.estimated_total_tokens} ≤ threshold ${threshold}`,
      threshold_tokens: threshold,
    }
  }
  return {
    decision: mode === 'unattended' ? 'abort' : 'human-gate',
    reason: `estimated ${estimate.estimated_total_tokens} > threshold ${threshold} (cap×${multiplier})`,
    threshold_tokens: threshold,
  }
}
