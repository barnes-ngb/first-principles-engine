import { describe, expect, it, vi } from 'vitest'

import {
  TransientConnectivityError,
  isTransientConnectivityError,
  withTransientRetry,
} from './transientRetry'

// Firestore-shaped error factories.
const offlineError = () => {
  const e = new Error('Failed to get document because the client is offline.') as Error & {
    code?: string
  }
  e.code = 'unavailable'
  return e
}
const codedError = (code: string, message = 'boom') => {
  const e = new Error(message) as Error & { code?: string }
  e.code = code
  return e
}

// No real timers — tests inject an instant sleep.
const noSleep = () => Promise.resolve()

describe('isTransientConnectivityError', () => {
  it('classifies the Firestore offline / unavailable error as transient', () => {
    expect(isTransientConnectivityError(offlineError())).toBe(true)
    expect(isTransientConnectivityError(codedError('unavailable'))).toBe(true)
    expect(isTransientConnectivityError(codedError('deadline-exceeded'))).toBe(true)
    expect(
      isTransientConnectivityError(new Error('Could not reach Cloud Firestore backend')),
    ).toBe(true)
  })

  it('does NOT classify genuine faults as transient', () => {
    expect(isTransientConnectivityError(codedError('permission-denied'))).toBe(false)
    expect(isTransientConnectivityError(codedError('not-found'))).toBe(false)
    expect(isTransientConnectivityError(codedError('invalid-argument'))).toBe(false)
    expect(isTransientConnectivityError(new Error('bad JSON'))).toBe(false)
    expect(isTransientConnectivityError(null)).toBe(false)
    expect(isTransientConnectivityError('offline')).toBe(false)
  })
})

describe('withTransientRetry', () => {
  it('retries an offline rejection and succeeds on attempt 2 (never throws)', async () => {
    const work = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(offlineError())
      .mockResolvedValueOnce('plan')

    const result = await withTransientRetry(work, { sleep: noSleep })

    expect(result).toBe('plan')
    expect(work).toHaveBeenCalledTimes(2)
  })

  it('surfaces an honest, named error once retries exhaust', async () => {
    const work = vi.fn<() => Promise<never>>().mockRejectedValue(offlineError())

    await expect(
      withTransientRetry(work, { attempts: 3, sleep: noSleep }),
    ).rejects.toBeInstanceOf(TransientConnectivityError)
    expect(work).toHaveBeenCalledTimes(3)
  })

  it('escalates permission-denied immediately without retrying', async () => {
    const err = codedError('permission-denied')
    const work = vi.fn<() => Promise<never>>().mockRejectedValue(err)

    await expect(withTransientRetry(work, { sleep: noSleep })).rejects.toBe(err)
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('escalates not-found immediately without retrying', async () => {
    const err = codedError('not-found')
    const work = vi.fn<() => Promise<never>>().mockRejectedValue(err)

    await expect(withTransientRetry(work, { sleep: noSleep })).rejects.toBe(err)
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('leaves the success path unchanged — runs work once and passes the value through', async () => {
    const work = vi.fn<() => Promise<number>>().mockResolvedValue(42)

    const result = await withTransientRetry(work, { sleep: noSleep })

    expect(result).toBe(42)
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('backs off between transient retries (attempt count honored)', async () => {
    const onRetry = vi.fn()
    const work = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(offlineError())
      .mockRejectedValueOnce(offlineError())
      .mockResolvedValueOnce('ok')

    const result = await withTransientRetry(work, { sleep: noSleep, onRetry })

    expect(result).toBe('ok')
    expect(work).toHaveBeenCalledTimes(3)
    expect(onRetry).toHaveBeenCalledTimes(2)
  })
})
