// Test helpers for the GitLab tools. Stubs globalThis.fetch with a queue of
// canned responses and records calls. Each beforeEach() of a test file should
// call stubFetch() to get a fresh stub for that test.

export interface FakeCall {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

export interface Stub {
  /** Records of all fetch calls made via this stub. */
  calls: Array<FakeCall>
  /** Queue a response to be returned by the next fetch call. */
  enqueue: (status: number, body: unknown) => void
  /** Restore the original globalThis.fetch. */
  restore: () => void
}

/**
 * Replaces globalThis.fetch with a queued stub. Returns a handle with .enqueue and .calls.
 * Always pair with stub.restore() in an afterEach or rely on the next beforeEach to overwrite.
 *
 * @returns Stub handle.
 */
export function stubFetch(): Stub {
  const original = globalThis.fetch
  const calls: Array<FakeCall> = []
  const queue: Array<{ status: number; body: unknown }> = []

  const fakeFetch: typeof fetch = async (url, init) => {
    const initObj = init ?? {}
    const headerObj: Record<string, string> = {}
    const hdrs = initObj.headers
    if (hdrs !== undefined && hdrs !== null) {
      // RequestInit.headers can be Headers | Record | Array; flatten to Record
      if (hdrs instanceof Headers) {
        hdrs.forEach((v, k) => {
          headerObj[k] = v
        })
      } else if (Array.isArray(hdrs)) {
        for (const [k, v] of hdrs) {
          headerObj[k] = v
        }
      } else {
        Object.assign(headerObj, hdrs as Record<string, string>)
      }
    }
    calls.push({
      url: String(url),
      method: initObj.method ?? 'GET',
      headers: headerObj,
      body: typeof initObj.body === 'string' ? initObj.body : undefined,
    })
    const next = queue.shift()
    if (next === undefined) {
      throw new Error(`stubFetch: queue empty (call ${calls.length} to ${url})`)
    }
    // 204/205/304 cannot carry a body per the Fetch spec; pass null in that case
    const noBodyStatus = next.status === 204 || next.status === 205 || next.status === 304
    const bodyString = typeof next.body === 'string' ? next.body : JSON.stringify(next.body)
    return new Response(noBodyStatus ? null : bodyString, {
      status: next.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  globalThis.fetch = fakeFetch

  return {
    calls,
    enqueue: (status, body) => {
      queue.push({ status, body })
    },
    restore: () => {
      globalThis.fetch = original
    },
  }
}
