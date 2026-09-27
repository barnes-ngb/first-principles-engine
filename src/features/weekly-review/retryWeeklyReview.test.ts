import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: unknown[] = []
let release: () => void = () => undefined
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (_fns: unknown, name: string, opts: unknown) => async (data: unknown) => {
    calls.push({ name, opts, data })
    await new Promise<void>((r) => (release = r))
    return { data: { success: true } }
  },
}))

import { RETRY_CLIENT_TIMEOUT_MS, retryWeeklyReview } from './retryWeeklyReview'

const req = { familyId: 'fam-1', childId: 'c1', weekKey: '2026-09-20' }

beforeEach(() => {
  calls.length = 0
})

describe('retryWeeklyReview (UX-420)', () => {
  it('calls the existing manual callable with exactly the child and week asked for', async () => {
    const done = retryWeeklyReview(req)
    await Promise.resolve()
    release()
    await done
    expect(calls).toEqual([
      { name: 'generateWeeklyReviewNow', opts: { timeout: 310_000 }, data: req },
    ])
  })

  it('refuses a second call for the same week while one is in flight, then allows it again', async () => {
    const first = retryWeeklyReview(req)
    await expect(retryWeeklyReview(req)).rejects.toThrow(/already being asked for/)
    await Promise.resolve()
    release()
    await first
    expect(calls).toHaveLength(1)

    const again = retryWeeklyReview(req)
    await Promise.resolve()
    release()
    await again
    expect(calls).toHaveLength(2)
  })
})

describe('the client waits a little longer than the server works (round 1, P2)', () => {
  it('the callable declares its own timeoutSeconds, and the client timeout sits just above it', () => {
    const source = readFileSync(
      join(import.meta.dirname, '../../../functions/src/ai/evaluate.ts'),
      'utf8',
    )
    const declared = /WEEKLY_REVIEW_NOW_TIMEOUT_SECONDS = (\d+);/.exec(source)
    expect(declared).not.toBeNull()
    expect(source).toMatch(/timeoutSeconds: WEEKLY_REVIEW_NOW_TIMEOUT_SECONDS/)
    const serverMs = Number(declared![1]) * 1000
    expect(RETRY_CLIENT_TIMEOUT_MS).toBeGreaterThan(serverMs)
    expect(RETRY_CLIENT_TIMEOUT_MS - serverMs).toBeLessThanOrEqual(30_000)
    // …and the literal the call passes (asserted above as 310_000) is that constant.
    expect(RETRY_CLIENT_TIMEOUT_MS).toBe(310_000)
  })
})
