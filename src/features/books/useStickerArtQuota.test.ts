import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// The Stickers surface must ask the EXISTING Kit Builder counter (FEAT-165 owner
// decision: one per-child budget across both surfaces, not a second allowance;
// the window went daily → weekly in FEAT-175). These spies record exactly what
// `useStickerArtQuota` asks it.
const { useArtQuotaMock, useActiveChildMock } = vi.hoisted(() => ({
  useArtQuotaMock: vi.fn(),
  useActiveChildMock: vi.fn(),
}))

vi.mock('../business/useArtQuota', () => ({
  useArtQuota: useArtQuotaMock,
  DEFAULT_WEEKLY_ART_QUOTA: 100,
  ART_QUOTA_MESSAGE: "That's a lot of art this week! Ask a grown-up if you need more. 🎨",
}))

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: useActiveChildMock,
}))

import { recordStickerArtGeneration, useStickerArtQuota } from './useStickerArtQuota'

const quotaResult = {
  count: 0,
  limit: 10,
  remaining: 10,
  atLimit: false,
  recordGeneration: vi.fn(),
}

describe('useStickerArtQuota (FEAT-165)', () => {
  beforeEach(() => {
    useArtQuotaMock.mockReset()
    useArtQuotaMock.mockReturnValue(quotaResult)
    useActiveChildMock.mockReset()
  })

  it('caps a kid profile against the shared per-child art counter', () => {
    useActiveChildMock.mockReturnValue({
      activeChildId: 'child-1',
      activeChild: { id: 'child-1', name: 'Lincoln' },
      isChildProfile: true,
    })

    renderHook(() => useStickerArtQuota())

    expect(useArtQuotaMock).toHaveBeenCalledWith('child-1', { capped: true })
  })

  it('leaves a parent uncapped (capability, never a name)', () => {
    useActiveChildMock.mockReturnValue({
      activeChildId: 'child-1',
      activeChild: { id: 'child-1', name: 'Lincoln' },
      isChildProfile: false,
    })

    renderHook(() => useStickerArtQuota())

    expect(useArtQuotaMock).toHaveBeenCalledWith('child-1', { capped: false })
  })

  it('passes a null child when none has resolved yet, so the cap fails open', () => {
    useActiveChildMock.mockReturnValue({
      activeChildId: '',
      activeChild: undefined,
      isChildProfile: true,
    })

    renderHook(() => useStickerArtQuota())

    expect(useArtQuotaMock).toHaveBeenCalledWith(null, { capped: true })
  })

  // Codex P2, PR #1713: `selectedChildId` is seeded from localStorage and
  // shared across profiles, and `useActiveChild` only resolves a kid to their
  // OWN child once the roster loads — so mid-load a kid profile can still be
  // holding the sibling a parent picked last. Binding to the resolved `Child`
  // (not the raw id) keeps a capped actor off the wrong kid's counter.
  it('never binds a capped kid to a sibling id left over from a parent session', () => {
    useActiveChildMock.mockReturnValue({
      activeChildId: 'sibling-from-localstorage',
      activeChild: undefined, // roster still loading — nothing resolved yet
      isChildProfile: true,
    })

    renderHook(() => useStickerArtQuota())

    expect(useArtQuotaMock).toHaveBeenCalledWith(null, { capped: true })
    expect(useArtQuotaMock).not.toHaveBeenCalledWith(
      'sibling-from-localstorage',
      expect.anything(),
    )
  })

  it('returns the shared hook result unchanged (no second allowance)', () => {
    useActiveChildMock.mockReturnValue({
      activeChildId: 'child-1',
      activeChild: { id: 'child-1', name: 'Lincoln' },
      isChildProfile: true,
    })

    const { result } = renderHook(() => useStickerArtQuota())

    expect(result.current).toBe(quotaResult)
  })
})

describe('recordStickerArtGeneration (FEAT-165)', () => {
  it('counts one generation when a recorder is supplied', () => {
    const record = vi.fn().mockResolvedValue(undefined)

    recordStickerArtGeneration(record)

    expect(record).toHaveBeenCalledTimes(1)
  })

  it('is a no-op for an uncapped surface that passes nothing', () => {
    expect(recordStickerArtGeneration(undefined)).toBeUndefined()
  })

  it('fails open: a counter write that rejects never breaks the art flow', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const record = vi.fn().mockRejectedValue(new Error('offline'))

    expect(recordStickerArtGeneration(record)).toBeUndefined()
    // The rejection is handled asynchronously, and never reaches the caller.
    await Promise.resolve()

    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  // ── FEAT-167: fire-and-forget by construction ───────────────────────────
  // The wrapper cannot merely *not throw* — nothing bounds a promise that never
  // settles, and a Firestore write resolves only on server ack, so offline it
  // stays pending forever. These hold the shape that makes an awaiting caller
  // impossible rather than merely discouraged.

  it('returns void, not a promise — a door cannot wait on the counter', () => {
    const record = vi.fn().mockReturnValue(new Promise<void>(() => {}))

    const returned: unknown = recordStickerArtGeneration(record)

    expect(returned).toBeUndefined()
    // Not thenable: even `await recordStickerArtGeneration(...)` resumes on the
    // next microtask instead of waiting on the write.
    expect(typeof (returned as { then?: unknown } | undefined)?.then).toBe('undefined')
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('a counter write that never settles still lets an awaiting caller continue', async () => {
    const record = vi.fn().mockReturnValue(new Promise<void>(() => {}))
    let reachedTheLineAfter = false

    // Written the *wrong* way on purpose: this is the shape FEAT-165 shipped
    // and FEAT-167 makes harmless.
    await recordStickerArtGeneration(record)
    reachedTheLineAfter = true

    expect(reachedTheLineAfter).toBe(true)
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('still logs — and never rethrows — a recorder that throws synchronously', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const record = vi.fn(() => {
      throw new Error('no auth')
    }) as unknown as () => Promise<void>

    expect(() => recordStickerArtGeneration(record)).not.toThrow()

    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
