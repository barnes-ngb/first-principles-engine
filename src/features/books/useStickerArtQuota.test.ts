import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// The Stickers surface must ask the EXISTING Kit Builder counter (FEAT-165 owner
// decision: one per-child daily budget across both surfaces, not a second
// allowance). These spies record exactly what `useStickerArtQuota` asks it.
const { useArtQuotaMock, useActiveChildMock } = vi.hoisted(() => ({
  useArtQuotaMock: vi.fn(),
  useActiveChildMock: vi.fn(),
}))

vi.mock('../business/useArtQuota', () => ({
  useArtQuota: useArtQuotaMock,
  DEFAULT_DAILY_ART_QUOTA: 10,
  ART_QUOTA_MESSAGE: "That's a lot of art today! Ask a grown-up if you need more. 🎨",
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
  it('counts one generation when a recorder is supplied', async () => {
    const record = vi.fn().mockResolvedValue(undefined)

    await recordStickerArtGeneration(record)

    expect(record).toHaveBeenCalledTimes(1)
  })

  it('is a no-op for an uncapped surface that passes nothing', async () => {
    await expect(recordStickerArtGeneration(undefined)).resolves.toBeUndefined()
  })

  it('fails open: a counter write that rejects never breaks the art flow', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const record = vi.fn().mockRejectedValue(new Error('offline'))

    await expect(recordStickerArtGeneration(record)).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
