// get_plugin_paths: returns absolute filesystem paths of the plugin's resources.
// Resolves the plugin root by walking up from this file until it finds .claude-plugin/plugin.json.
// Used by the orchestrator (Paso 2.2 library scripts) and specialists (Read KB)
// so they don't depend on cwd or on CLAUDE_PLUGIN_ROOT being exposed to sub-shells.

import { z } from 'zod'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

export const GetPluginPathsInputSchema = z.object({})
export type GetPluginPathsInput = z.infer<typeof GetPluginPathsInputSchema>

export interface GetPluginPathsOutput {
  pluginRoot: string
  scriptsLibrary: string
  binaryPolicy: string
  kbDir: string
  agentsDir: string
  hooksDir: string
}

const MAX_WALKUP_DEPTH = 10
const PLUGIN_MARKER = path.join('.claude-plugin', 'plugin.json')

/**
 * Walks up the directory tree from a starting directory until it finds a directory
 * that contains .claude-plugin/plugin.json. Throws if the marker is not found
 * within MAX_WALKUP_DEPTH levels.
 *
 * @param startDir - Directory to start walking up from.
 * @returns Absolute path of the plugin root.
 */
function findPluginRoot(startDir: string): string {
  let current = startDir
  for (let depth = 0; depth < MAX_WALKUP_DEPTH; depth++) {
    if (fs.existsSync(path.join(current, PLUGIN_MARKER))) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  throw new Error(
    `Could not locate plugin root: no ${PLUGIN_MARKER} found within ${MAX_WALKUP_DEPTH} levels above ${startDir}`,
  )
}

/**
 * Returns absolute paths of plugin-internal directories and files.
 * Pure function: O(walk-up depth) filesystem checks; no IO writes.
 *
 * @returns pluginRoot + composed paths for scripts/library, _kb, agents, hooks, binary-policy.yml.
 */
export function getPluginPaths(_input: GetPluginPathsInput = {}): GetPluginPathsOutput {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const pluginRoot = findPluginRoot(here)
  return {
    pluginRoot,
    scriptsLibrary: path.join(pluginRoot, 'scripts', 'library'),
    binaryPolicy: path.join(pluginRoot, 'scripts', 'binary-policy.yml'),
    kbDir: path.join(pluginRoot, '_kb'),
    agentsDir: path.join(pluginRoot, 'agents'),
    hooksDir: path.join(pluginRoot, 'hooks'),
  }
}
