// estimate_cost: thin MCP wrapper around the cost-tracker util so the
// orchestrator (running as the main agent) can ask for a cost estimate and
// a decision in a single call.

import { z } from 'zod'

import {
  estimateRunCost,
  decideCostAction,
  type CostEstimateOutput,
  type CostDecisionResult,
  type Bucket,
} from '../../util/cost-tracker.js'

export const EstimateCostInputSchema = z.object({
  bucket: z.enum(['TINY', 'SMALL', 'MEDIUM', 'LARGE', 'HUGE']),
  specialistsCount: z.number().int().nonnegative(),
  hasTriage: z.boolean(),
  hasTestsSummary: z.boolean(),
  mode: z.enum(['assisted', 'unattended']),
  multiplier: z.number().positive().optional(),
})

export type EstimateCostInput = z.infer<typeof EstimateCostInputSchema>

export interface EstimateCostOutput extends CostEstimateOutput {
  decision: CostDecisionResult
}

/**
 * Runs the estimate + the decide step together. The orchestrator persists
 * both to `_state/orchestrator-state.yml` and acts on `decision.decision`.
 *
 * @param input - Bucket + team composition + mode + multiplier.
 * @returns Estimate fields plus the decision verdict.
 */
export function estimateCost(input: EstimateCostInput): EstimateCostOutput {
  const parsed = EstimateCostInputSchema.parse(input)
  const estimate = estimateRunCost({
    bucket: parsed.bucket as Bucket,
    specialistsCount: parsed.specialistsCount,
    hasTriage: parsed.hasTriage,
    hasTestsSummary: parsed.hasTestsSummary,
  })
  const decision = decideCostAction(estimate, parsed.mode, parsed.multiplier ?? 1.5)
  return { ...estimate, decision }
}
