// compute_huge_partitions: thin MCP wrapper around the partition planner.
// The orchestrator calls this when bucket=HUGE and distinctModules>=3, to
// get an ordered wave plan that respects per-module specialist affinity.

import { z } from 'zod'

import {
  computeHugePartitions,
  type ComputeHugePartitionsOutput,
} from '../../util/huge-partitions.js'

export const StratifyModuleSchema = z.object({
  module: z.string().min(1),
  files: z.number().int().nonnegative(),
  paths: z.array(z.string().min(1)),
})

export const ComputeHugePartitionsInputSchema = z.object({
  modules: z.array(StratifyModuleSchema).min(1),
  candidateSpecialists: z.array(z.string().min(1)),
  hasTriage: z.boolean(),
  hasTestsSummary: z.boolean(),
  perWaveBucket: z.enum(['TINY', 'SMALL', 'MEDIUM', 'LARGE', 'HUGE']).optional(),
})

export type ComputeHugePartitionsInput = z.infer<typeof ComputeHugePartitionsInputSchema>

/**
 * MCP tool entry. Validates input and delegates to the util.
 *
 * @param input - Stratify modules + planned team.
 * @returns Wave plan + totals.
 */
export function computeHugePartitionsTool(
  input: ComputeHugePartitionsInput,
): ComputeHugePartitionsOutput {
  const parsed = ComputeHugePartitionsInputSchema.parse(input)
  return computeHugePartitions(parsed)
}
