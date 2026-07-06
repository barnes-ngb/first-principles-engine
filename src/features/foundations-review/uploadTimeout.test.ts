import { afterEach, describe, expect, it, vi } from 'vitest'

import { UploadTimeoutError, withTimeout } from './uploadTimeout'

afterEach(() => {
  vi.useRealTimers()
})

describe('withTimeout', () => {
  it('passes through a value that settles before the ceiling', async () => {
    const out = await withTimeout(async () => 'ok', 1000)
    expect(out).toBe('ok')
  })

  it('passes through a rejection that settles before the ceiling', async () => {
    await expect(withTimeout(async () => Promise.reject(new Error('boom')), 1000)).rejects.toThrow(
      'boom',
    )
  })

  it('rejects with UploadTimeoutError and aborts when work never settles', async () => {
    vi.useFakeTimers()
    let aborted = false
    const p = withTimeout((signal) => {
      signal.addEventListener('abort', () => {
        aborted = true
      })
      return new Promise<never>(() => {}) // never settles
    }, 120_000)
    const assertion = expect(p).rejects.toBeInstanceOf(UploadTimeoutError)
    await vi.advanceTimersByTimeAsync(120_000)
    await assertion
    expect(aborted).toBe(true)
  })
})
