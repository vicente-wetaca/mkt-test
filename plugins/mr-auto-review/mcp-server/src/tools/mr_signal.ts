// mr_signal tool: appends a structured signal event to <workspace>/_signals/log.jsonl.
// Signals are used for escalation, ambiguity flagging, and knowledge-base gap reporting.

import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'

import { getWorkspaceBase } from '../util/workspace.js'
import { nowTimestamp } from '../util/timestamp.js'

// All supported signal types for inter-agent and human escalation
const SIGNAL_TYPES = [
  'SCOPE_EXPANSION_REQUEST',
  'AMBIGUITY_NEEDS_HUMAN',
  'BLOCKER_ESCALATION',
  'KB_GAP',
] as const

export const MrSignalInputSchema = z.object({
  ticketId: z
    .string()
    .regex(/^(WET-\d+|local-[a-z0-9-]+)$/, 'ticketId must match WET-\\d+ or local-[a-z0-9-]+'),
  agentName: z
    .string()
    .regex(/^R-[a-z][a-z0-9-]*$/, 'agentName must match R-[a-z][a-z0-9-]*'),
  signal: z.enum(SIGNAL_TYPES),
  payload: z.record(z.unknown()),
})

export type MrSignalInput = z.infer<typeof MrSignalInputSchema>

export interface MrSignalOutput {
  ok: true
  /** UUID generated via crypto.randomUUID() */
  signalId: string
}

/**
 * Appends a signal event as a JSONL line to the workspace's _signals/log.jsonl file.
 * Creates the _signals/ directory if it does not exist.
 *
 * @param input - ticketId, agentName, signal type enum, and arbitrary payload object.
 * @returns ok: true and a unique signalId.
 * @throws ZodError when signal type or other inputs are invalid.
 */
export async function mrSignal(input: MrSignalInput): Promise<MrSignalOutput> {
  const parsed = MrSignalInputSchema.parse(input)
  const { ticketId, agentName, signal, payload } = parsed

  const wsBase = getWorkspaceBase(ticketId)
  const signalsDir = path.join(wsBase, '_signals')
  const logPath = path.join(signalsDir, 'log.jsonl')

  // Ensure the _signals directory exists
  fs.mkdirSync(signalsDir, { recursive: true })

  const signalId = randomUUID()
  const entry = {
    id: signalId,
    timestamp: nowTimestamp(),
    agentName,
    signal,
    payload,
  }

  // Append a JSONL line (newline-delimited JSON)
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8')

  return { ok: true, signalId }
}
