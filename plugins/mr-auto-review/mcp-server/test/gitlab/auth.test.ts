// Tests for the auth module: parses GitLab https remotes with embedded glpat tokens.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { parseGitlabRemoteUrl } from '../../src/tools/gitlab/auth.ts'

describe('parseGitlabRemoteUrl', () => {
  it('parses oauth2:<token>@gitlab.com/<group>/<project>.git', () => {
    const creds = parseGitlabRemoteUrl(
      'https://oauth2:glpat-abc123XYZ@gitlab.com/wetaca/wetaca.com.git',
    )
    assert.equal(creds.apiBase, 'https://gitlab.com/api/v4')
    assert.equal(creds.projectPath, 'wetaca/wetaca.com')
    assert.equal(creds.projectPathEncoded, 'wetaca%2Fwetaca.com')
    assert.equal(creds.token, 'glpat-abc123XYZ')
    assert.equal(creds.tokenFromEnv, false)
  })

  it('parses bare <token>@host without explicit user', () => {
    const creds = parseGitlabRemoteUrl(
      'https://glpat-justtoken@gitlab.example.com/foo/bar.git',
    )
    assert.equal(creds.apiBase, 'https://gitlab.example.com/api/v4')
    assert.equal(creds.projectPath, 'foo/bar')
    assert.equal(creds.token, 'glpat-justtoken')
  })

  it('parses URL without .git suffix', () => {
    const creds = parseGitlabRemoteUrl(
      'https://oauth2:glpat-noext@gitlab.com/team/repo',
    )
    assert.equal(creds.projectPath, 'team/repo')
  })

  it('handles nested group path correctly', () => {
    const creds = parseGitlabRemoteUrl(
      'https://oauth2:glpat-x@gitlab.com/group/subgroup/project.git',
    )
    assert.equal(creds.projectPath, 'group/subgroup/project')
    assert.equal(creds.projectPathEncoded, 'group%2Fsubgroup%2Fproject')
  })

  it('rejects SSH remotes (no https prefix)', () => {
    assert.throws(
      () => parseGitlabRemoteUrl('git@gitlab.com:wetaca/wetaca.com.git'),
      /HTTPS/,
    )
  })

  it('rejects http (not https) remotes', () => {
    assert.throws(
      () => parseGitlabRemoteUrl('http://oauth2:glpat-x@gitlab.com/foo/bar.git'),
      /HTTPS/,
    )
  })

  it('rejects URLs without glpat- prefix', () => {
    assert.throws(
      () => parseGitlabRemoteUrl('https://oauth2:not-a-pat@gitlab.com/foo/bar.git'),
      /glpat- prefix/,
    )
  })

  it('rejects URLs without project path', () => {
    assert.throws(
      () => parseGitlabRemoteUrl('https://oauth2:glpat-x@gitlab.com/'),
      /HTTPS/,
    )
  })

  it('envToken takes precedence over the URL token', () => {
    const creds = parseGitlabRemoteUrl(
      'https://oauth2:glpat-fromurl@gitlab.com/foo/bar.git',
      'glpat-fromenv',
    )
    assert.equal(creds.token, 'glpat-fromenv')
    assert.equal(creds.tokenFromEnv, true)
    assert.equal(creds.projectPath, 'foo/bar')
  })

  it('accepts tokenless remote when envToken is provided', () => {
    const creds = parseGitlabRemoteUrl(
      'https://gitlab.com/foo/bar.git',
      'glpat-onlyenv',
    )
    assert.equal(creds.token, 'glpat-onlyenv')
    assert.equal(creds.tokenFromEnv, true)
    assert.equal(creds.projectPath, 'foo/bar')
  })

  it('rejects tokenless remote without envToken', () => {
    assert.throws(
      () => parseGitlabRemoteUrl('https://gitlab.com/foo/bar.git'),
      /No GitLab token available/,
    )
  })

  it('rejects empty envToken (treated as absent)', () => {
    assert.throws(
      () => parseGitlabRemoteUrl('https://gitlab.com/foo/bar.git', ''),
      /No GitLab token available/,
    )
  })

  it('rejects envToken that is not a glpat', () => {
    assert.throws(
      () =>
        parseGitlabRemoteUrl(
          'https://gitlab.com/foo/bar.git',
          'ghp_oopsGithubFormat',
        ),
      /glpat- prefix/,
    )
  })
})
