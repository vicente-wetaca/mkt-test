// Tests for the GitLab REST client: injects a fake fetch and verifies header injection,
// retry/backoff on transient errors, and non-retryable error propagation.
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { gitlabRequest, GitlabApiError } from '../../src/tools/gitlab/client.ts'
import { _resetCredentialsCache } from '../../src/tools/gitlab/auth.ts'

interface FakeCall {
  url: string
  init: RequestInit
}

beforeEach(() => {
  _resetCredentialsCache({
    apiBase: 'https://gitlab.test/api/v4',
    projectPath: 'foo/bar',
    projectPathEncoded: 'foo%2Fbar',
    token: 'glpat-fake',
    tokenFromEnv: false,
  })
})

/**
 * Creates a fake fetch that returns the given responses in order. Records calls.
 *
 * @param responses - Sequence of (status, body) pairs. After exhausted, throws.
 */
function makeFakeFetch(responses: Array<{ status: number; body: string }>): {
  fn: typeof fetch
  calls: Array<FakeCall>
} {
  const calls: Array<FakeCall> = []
  let i = 0
  const fn: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = responses[i++]
    if (next === undefined) {
      throw new Error('Fake fetch exhausted')
    }
    // 204/205/304 cannot carry a body per the Fetch spec; pass null in that case
    const status = next.status
    const noBodyStatus = status === 204 || status === 205 || status === 304
    return new Response(noBodyStatus ? null : next.body, {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { fn, calls }
}

describe('gitlabRequest', () => {
  it('injects PRIVATE-TOKEN header from credentials', async () => {
    const { fn, calls } = makeFakeFetch([{ status: 200, body: '{"ok":true}' }])
    await gitlabRequest('GET', '/projects/foo/test', undefined, { fetchImpl: fn })
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.url, 'https://gitlab.test/api/v4/projects/foo/test')
    const headers = calls[0]?.init.headers as Record<string, string>
    assert.equal(headers['PRIVATE-TOKEN'], 'glpat-fake')
    assert.equal(headers['Content-Type'], 'application/json')
  })

  it('parses JSON body of 2xx responses', async () => {
    const { fn } = makeFakeFetch([{ status: 200, body: '{"hello":"world"}' }])
    const result = await gitlabRequest<{ hello: string }>('GET', '/x', undefined, {
      fetchImpl: fn,
    })
    assert.deepEqual(result, { hello: 'world' })
  })

  it('serialises a body as JSON for POST', async () => {
    const { fn, calls } = makeFakeFetch([{ status: 201, body: '{"id":42}' }])
    await gitlabRequest('POST', '/x', { foo: 'bar' }, { fetchImpl: fn })
    assert.equal(calls[0]?.init.body, JSON.stringify({ foo: 'bar' }))
  })

  it('retries on 503 then succeeds', async () => {
    const { fn, calls } = makeFakeFetch([
      { status: 503, body: 'unavailable' },
      { status: 200, body: '{"ok":true}' },
    ])
    const result = await gitlabRequest('GET', '/x', undefined, {
      fetchImpl: fn,
      // shrink the test backoff: still 500ms, but only 1 retry needed
    })
    assert.deepEqual(result, { ok: true })
    assert.equal(calls.length, 2)
  })

  it('retries on 429 then succeeds', async () => {
    const { fn, calls } = makeFakeFetch([
      { status: 429, body: 'rate limited' },
      { status: 200, body: '{"ok":true}' },
    ])
    await gitlabRequest('GET', '/x', undefined, { fetchImpl: fn })
    assert.equal(calls.length, 2)
  })

  it('does NOT retry on 401 — throws GitlabApiError immediately', async () => {
    const { fn, calls } = makeFakeFetch([{ status: 401, body: 'unauthorized' }])
    await assert.rejects(
      () => gitlabRequest('GET', '/x', undefined, { fetchImpl: fn }),
      (err: unknown) => {
        assert.ok(err instanceof GitlabApiError)
        assert.equal((err as GitlabApiError).status, 401)
        return true
      },
    )
    assert.equal(calls.length, 1)
  })

  it('does NOT retry on 404 — throws GitlabApiError immediately', async () => {
    const { fn, calls } = makeFakeFetch([{ status: 404, body: 'not found' }])
    await assert.rejects(
      () => gitlabRequest('GET', '/x', undefined, { fetchImpl: fn }),
      GitlabApiError,
    )
    assert.equal(calls.length, 1)
  })

  it('exhausts retries on persistent 500 then throws', async () => {
    const { fn, calls } = makeFakeFetch([
      { status: 500, body: 'err' },
      { status: 500, body: 'err' },
      { status: 500, body: 'err' },
      { status: 500, body: 'err' },
    ])
    await assert.rejects(
      () => gitlabRequest('GET', '/x', undefined, { fetchImpl: fn, maxRetries: 3 }),
      GitlabApiError,
    )
    assert.equal(calls.length, 4) // 1 initial + 3 retries
  })

  it('error message includes status + path but never the token', async () => {
    const { fn } = makeFakeFetch([{ status: 403, body: 'forbidden secret' }])
    try {
      await gitlabRequest('GET', '/secret-path', undefined, { fetchImpl: fn })
      assert.fail('Expected throw')
    } catch (err) {
      assert.ok(err instanceof GitlabApiError)
      const message = (err as Error).message
      assert.ok(message.includes('403'), 'message must include status')
      assert.ok(message.includes('/secret-path'), 'message must include path')
      assert.ok(!message.includes('glpat-fake'), 'message must NOT include token')
    }
  })

  it('handles empty body on 204 No Content', async () => {
    const { fn } = makeFakeFetch([{ status: 204, body: '' }])
    const result = await gitlabRequest('PUT', '/x', undefined, { fetchImpl: fn })
    assert.equal(result, undefined)
  })

  it('returns raw string when response body is non-JSON', async () => {
    const { fn } = makeFakeFetch([{ status: 200, body: 'plain text content' }])
    const result = await gitlabRequest<string>('GET', '/x', undefined, { fetchImpl: fn })
    assert.equal(result, 'plain text content')
  })
})
