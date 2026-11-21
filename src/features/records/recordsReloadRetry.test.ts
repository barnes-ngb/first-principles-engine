import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  RELOAD_RETRY_BASE_MS,
  RELOAD_RETRY_MAX_MS,
  createRecordsReloadRetry,
  type ReloadGuard,
  type ReloadOutcome,
} from './recordsReloadRetry'

/**
 * The coordinator's ordering rule, in isolation. `isCurrent` is always true here on
 * purpose: it stands in for a page whose identity ref still holds the old value, so
 * only the coordinator's own epoch and sequence can tell a read is obsolete.
 */

const IDENTITY = {}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/**
 * A read shaped like the page's: guard before and after the fetch, apply only if
 * still the latest. `behave` is read when the fetch answers, so a retry of the same
 * read can behave differently from its first run.
 */
function guardedRead(label: string, applied: string[], gate: Promise<unknown>, behave: () => 'ok' | 'fail') {
  return async (isLatest: ReloadGuard): Promise<ReloadOutcome> => {
    if (!isLatest()) return 'dropped'
    await gate
    if (behave() === 'fail') return 'failed'
    if (!isLatest()) return 'dropped'
    applied.push(label)
    return 'applied'
  }
}

describe('recordsReloadRetry — ordering', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('an older success that answers after a newer failure applies nothing and leaves the retry', async () => {
    const retry = createRecordsReloadRetry(() => true)
    const applied: string[] = []
    const a = deferred<void>()
    const b = deferred<void>()
    let bBehaviour: 'ok' | 'fail' = 'fail'

    const aRun = retry.run(IDENTITY, guardedRead('A', applied, a.promise, () => 'ok'))
    const bRun = retry.run(IDENTITY, guardedRead('B', applied, b.promise, () => bBehaviour))

    b.resolve()
    expect(await bRun).toBe('failed') // B is the latest request and failed: retained
    a.resolve() // A's older, successful fetch finally lands
    expect(await aRun).toBe('superseded')
    expect(applied).toEqual([]) // A did not overwrite anything

    // The retry B left behind was not consumed by A's success: it still runs, with B's read.
    bBehaviour = 'ok'
    await vi.advanceTimersByTimeAsync(RELOAD_RETRY_BASE_MS)
    expect(applied).toEqual(['B'])
    await vi.advanceTimersByTimeAsync(RELOAD_RETRY_MAX_MS * 3)
    expect(applied).toEqual(['B']) // and success cleared it
  })

  it('an older read cannot overwrite a newer successful one', async () => {
    const retry = createRecordsReloadRetry(() => true)
    const applied: string[] = []
    const a = deferred<void>()
    const b = deferred<void>()

    const aRun = retry.run(IDENTITY, guardedRead('A', applied, a.promise, () => 'ok'))
    const bRun = retry.run(IDENTITY, guardedRead('B', applied, b.promise, () => 'ok'))
    b.resolve()
    expect(await bRun).toBe('applied')
    a.resolve()
    expect(await aRun).toBe('superseded')
    expect(applied).toEqual(['B'])
  })

  it('even a read that ignores its guard and reports applied cannot clear a later request’s retry', async () => {
    const retry = createRecordsReloadRetry(() => true)
    const a = deferred<void>()
    const b = deferred<void>()
    let bBehaviour: 'ok' | 'fail' = 'fail'
    const applied: string[] = []

    const aRun = retry.run(IDENTITY, async () => {
      await a.promise
      return 'applied' // no guard at all
    })
    const bRun = retry.run(IDENTITY, guardedRead('B', applied, b.promise, () => bBehaviour))
    b.resolve()
    await bRun
    a.resolve()
    expect(await aRun).toBe('applied')

    bBehaviour = 'ok'
    await vi.advanceTimersByTimeAsync(RELOAD_RETRY_BASE_MS)
    expect(applied).toEqual(['B']) // the retry B armed survived the older "success"
  })

  it('an older failure does not replace or arm a retry once a newer read is out', async () => {
    const retry = createRecordsReloadRetry(() => true)
    const applied: string[] = []
    const a = deferred<void>()
    const b = deferred<void>()

    const aRun = retry.run(IDENTITY, guardedRead('A', applied, a.promise, () => 'fail'))
    const bRun = retry.run(IDENTITY, guardedRead('B', applied, b.promise, () => 'ok'))
    a.resolve()
    expect(await aRun).toBe('superseded') // B owns the outcome
    await vi.advanceTimersByTimeAsync(RELOAD_RETRY_MAX_MS * 3)
    b.resolve()
    expect(await bRun).toBe('applied')
    await vi.advanceTimersByTimeAsync(RELOAD_RETRY_MAX_MS * 3)
    expect(applied).toEqual(['B']) // nothing was retried
  })

  it('after reset (unmount) a held read is not latest, even though the identity still reads as current', async () => {
    const retry = createRecordsReloadRetry(() => true)
    const applied: string[] = []
    const a = deferred<void>()
    const run = retry.run(IDENTITY, guardedRead('A', applied, a.promise, () => 'ok'))
    retry.reset()
    a.resolve()
    expect(await run).toBe('dropped')
    expect(applied).toEqual([]) // the guard refused the apply
  })

  it('an inactive identity invoked later registers nothing and cannot invalidate the current read', async () => {
    const OLD = {}
    const NEW = {}
    const retry = createRecordsReloadRetry((identity) => identity === NEW)
    const applied: string[] = []
    const held = deferred<void>()
    const oldRead = vi.fn(async () => 'applied' as ReloadOutcome)

    const currentRun = retry.run(NEW, guardedRead('NEW', applied, held.promise, () => 'ok'))
    expect(await retry.run(OLD, oldRead)).toBe('dropped') // retired closure, new invocation
    expect(oldRead).not.toHaveBeenCalled() // never even read

    held.resolve()
    expect(await currentRun).toBe('applied') // its sequence was not taken from it
    expect(applied).toEqual(['NEW'])
  })

  it('reset also drops a retained retry', async () => {
    const retry = createRecordsReloadRetry(() => true)
    const applied: string[] = []
    const done = Promise.resolve()
    expect(await retry.run(IDENTITY, guardedRead('B', applied, done, () => 'fail'))).toBe('failed')
    retry.reset()
    await vi.advanceTimersByTimeAsync(RELOAD_RETRY_MAX_MS * 3)
    expect(applied).toEqual([])
  })
})
