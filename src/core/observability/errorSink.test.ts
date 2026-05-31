import { describe, expect, it, vi } from 'vitest'

import { createErrorReporter } from './errorSink'
import { ErrorSource } from './scrubError'
import type { RawErrorInput } from './scrubError'

function makeInput(over: Partial<RawErrorInput> = {}): RawErrorInput {
  return {
    name: 'TypeError',
    message: 'boom',
    source: ErrorSource.WindowError,
    ...over,
  }
}

describe('createErrorReporter (ARCH-11)', () => {
  it('writes once per error and de-dupes identical errors within the window', async () => {
    const write = vi.fn()
    let t = 0
    const report = createErrorReporter(
      {
        write,
        now: () => t,
        getContext: () => ({}),
        getAnonUserId: () => 'auser0000',
      },
      { dedupeWindowMs: 1000, maxWritesPerWindow: 100, rateWindowMs: 1000 },
    )

    expect(await report(makeInput())).toBe(true)
    expect(await report(makeInput())).toBe(false) // identical → de-duped
    expect(write).toHaveBeenCalledTimes(1)

    t = 1500 // past the dedupe window → allowed again
    expect(await report(makeInput())).toBe(true)
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('rate-limits a flood of distinct errors (render-loop guard)', async () => {
    const write = vi.fn()
    const report = createErrorReporter(
      {
        write,
        now: () => 0,
        getContext: () => ({}),
        getAnonUserId: () => null,
      },
      { dedupeWindowMs: 0, maxWritesPerWindow: 3, rateWindowMs: 10_000 },
    )

    let written = 0
    for (let i = 0; i < 10; i++) {
      if (await report(makeInput({ message: `boom ${i}` }))) written++
    }
    expect(written).toBe(3)
    expect(write).toHaveBeenCalledTimes(3)
  })

  it('tags records with anonymized ids only — never raw ids or names', async () => {
    const write = vi.fn()
    const report = createErrorReporter({
      write,
      now: () => 42,
      getContext: () => ({
        childId: 'child-raw-123',
        sensitiveTerms: ['London'],
      }),
      getAnonUserId: () => 'auser',
    })

    await report(makeInput({ message: 'London fell over' }))
    const rec = write.mock.calls[0][0]
    expect(rec.anonUserId).toBe('auser')
    expect(rec.anonChildId).not.toBe('child-raw-123')
    expect(rec.anonChildId).toMatch(/^a[0-9a-f]{8}$/)
    expect(JSON.stringify(rec)).not.toContain('London')
    expect(JSON.stringify(rec)).not.toContain('child-raw-123')
    expect(rec.clientTs).toBe(42)
  })

  it('never throws when the write fails', async () => {
    const report = createErrorReporter({
      write: () => {
        throw new Error('firestore down')
      },
      now: () => 0,
      getContext: () => ({}),
      getAnonUserId: () => null,
    })
    await expect(report(makeInput())).resolves.toBe(false)
  })
})
