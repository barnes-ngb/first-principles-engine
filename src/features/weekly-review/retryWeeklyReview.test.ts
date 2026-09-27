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

import { retryWeeklyReview } from './retryWeeklyReview'

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
      { name: 'generateWeeklyReviewNow', opts: { timeout: 300_000 }, data: req },
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
