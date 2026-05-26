// Tests for the path-validator security module (TDD — write before implementation)
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { validateInWorkspace, PathTraversalError } from '../src/policy/path-validator.ts'

// Create a fresh temp workspace for each test run.
// We store both the raw path and the realpath (macOS /var -> /private/var).
let ws: string
let wsReal: string
let outerDir: string

before(() => {
  outerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-outer-'))
  ws = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-ws-'))
  wsReal = fs.realpathSync(ws)
})

after(() => {
  fs.rmSync(ws, { recursive: true, force: true })
  fs.rmSync(outerDir, { recursive: true, force: true })
})

describe('validateInWorkspace', () => {
  it('happy path: simple relative path returns absolute path under workspace', () => {
    const result = validateInWorkspace(ws, 'R-tests/issue-foo.md')
    assert.equal(result, path.join(wsReal, 'R-tests/issue-foo.md'))
  })

  it('happy path: path with leading ./ is accepted', () => {
    const result = validateInWorkspace(ws, './R-tests/issue-foo.md')
    assert.equal(result, path.join(wsReal, 'R-tests/issue-foo.md'))
  })

  it('happy path: nested path stays inside workspace', () => {
    const result = validateInWorkspace(ws, 'a/b/c/file.md')
    assert.equal(result, path.join(wsReal, 'a/b/c/file.md'))
  })

  it('rejects path traversal with .. segment', () => {
    assert.throws(
      () => validateInWorkspace(ws, '../escape.md'),
      PathTraversalError,
    )
  })

  it('rejects nested traversal R-tests/../../escape.md', () => {
    assert.throws(
      () => validateInWorkspace(ws, 'R-tests/../../escape.md'),
      PathTraversalError,
    )
  })

  it('rejects absolute path outside workspace', () => {
    assert.throws(
      () => validateInWorkspace(ws, '/etc/passwd'),
      PathTraversalError,
    )
  })

  it('rejects path with NUL byte', () => {
    assert.throws(
      () => validateInWorkspace(ws, 'R-tests/issue\0.md'),
      PathTraversalError,
    )
  })

  it('rejects symlink that points outside workspace', () => {
    // Create a subdirectory inside workspace containing a symlink to outerDir
    const subDir = path.join(ws, 'sub')
    fs.mkdirSync(subDir, { recursive: true })

    // Create a file outside workspace
    const outerFile = path.join(outerDir, 'secret.md')
    fs.writeFileSync(outerFile, 'secret')

    // Create symlink inside workspace -> outerDir
    const symlinkPath = path.join(subDir, 'link')
    fs.symlinkSync(outerDir, symlinkPath)

    assert.throws(
      () => validateInWorkspace(ws, 'sub/link/secret.md'),
      PathTraversalError,
    )
  })

  it('throws PathTraversalError (not generic Error) for traversal attempts', () => {
    try {
      validateInWorkspace(ws, '../escape.md')
      assert.fail('Expected PathTraversalError to be thrown')
    } catch (err) {
      assert.ok(err instanceof PathTraversalError, `Expected PathTraversalError, got ${(err as Error).constructor.name}`)
    }
  })

  it('throws when workspace root is not absolute', () => {
    assert.throws(
      () => validateInWorkspace('relative/path', 'file.md'),
      Error,
    )
  })
})
