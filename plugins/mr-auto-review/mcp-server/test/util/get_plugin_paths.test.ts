// Tests for get_plugin_paths MCP tool: verifies plugin root walk-up and path composition.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { getPluginPaths } from '../../src/tools/util/get_plugin_paths.ts'

describe('getPluginPaths (MCP tool)', () => {
  // ##### TEST EXECUTION #####
  const result = getPluginPaths({})

  // ##### RESULT VERIFICATION #####
  it('returns absolute pluginRoot pointing at a directory containing .claude-plugin/plugin.json', () => {
    assert.ok(path.isAbsolute(result.pluginRoot), 'pluginRoot must be absolute')
    assert.ok(
      fs.existsSync(path.join(result.pluginRoot, '.claude-plugin', 'plugin.json')),
      'pluginRoot must contain .claude-plugin/plugin.json',
    )
  })

  it('composes scriptsLibrary / kbDir / agentsDir / hooksDir under pluginRoot', () => {
    assert.equal(result.scriptsLibrary, path.join(result.pluginRoot, 'scripts', 'library'))
    assert.equal(result.kbDir, path.join(result.pluginRoot, '_kb'))
    assert.equal(result.agentsDir, path.join(result.pluginRoot, 'agents'))
    assert.equal(result.hooksDir, path.join(result.pluginRoot, 'hooks'))
  })

  it('binaryPolicy points at scripts/binary-policy.yml under pluginRoot', () => {
    assert.equal(result.binaryPolicy, path.join(result.pluginRoot, 'scripts', 'binary-policy.yml'))
  })

  it('all composed paths actually exist on the filesystem', () => {
    assert.ok(fs.existsSync(result.scriptsLibrary), `scriptsLibrary missing: ${result.scriptsLibrary}`)
    assert.ok(fs.existsSync(result.kbDir), `kbDir missing: ${result.kbDir}`)
    assert.ok(fs.existsSync(result.agentsDir), `agentsDir missing: ${result.agentsDir}`)
    assert.ok(fs.existsSync(result.hooksDir), `hooksDir missing: ${result.hooksDir}`)
    assert.ok(fs.existsSync(result.binaryPolicy), `binaryPolicy missing: ${result.binaryPolicy}`)
  })
})
