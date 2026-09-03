import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { useArtQuotaMock, activeChildHolder } = vi.hoisted(() => ({
  useArtQuotaMock: vi.fn(() => ({
    count: 0,
    limit: 25,
    remaining: 25,
    atLimit: false,
    recordGeneration: vi.fn(async () => undefined),
  })),
  activeChildHolder: {
    value: {
      activeChild: undefined as { id: string } | undefined,
      isChildProfile: false,
      activeChildId: '',
    },
  },
}))

vi.mock('../business/useArtQuota', () => ({
  useArtQuota: useArtQuotaMock,
  DEFAULT_WEEKLY_ART_QUOTA: 100,
}))

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => activeChildHolder.value,
}))

import { recordStickerArtGeneration } from './useStickerArtQuota'
import { recordBookArtGeneration, useBookArtQuota } from './useBookArtQuota'

beforeEach(() => {
  useArtQuotaMock.mockClear()
  activeChildHolder.value = {
    activeChild: undefined,
    isChildProfile: false,
    activeChildId: '',
  }
})

describe('useBookArtQuota', () => {
  it('caps by capability, never by name — a kid profile is capped', () => {
    activeChildHolder.value = {
      activeChild: { id: 'child-lincoln' },
      isChildProfile: true,
      activeChildId: 'child-lincoln',
    }

    renderHook(() => useBookArtQuota())

    expect(useArtQuotaMock).toHaveBeenCalledWith('child-lincoln', { capped: true })
  })

  it('a parent is uncapped', () => {
    activeChildHolder.value = {
      activeChild: { id: 'child-lincoln' },
      isChildProfile: false,
      activeChildId: 'child-lincoln',
    }

    renderHook(() => useBookArtQuota())

    expect(useArtQuotaMock).toHaveBeenCalledWith('child-lincoln', { capped: false })
  })

  it('binds to the RESOLVED child, so a fast first tap cannot test the sibling’s budget', () => {
    // A kid profile before `useChildren` has loaded: `activeChildId` may still
    // hold the sibling a parent picked last on this device, but `activeChild`
    // is undefined. Null there fails open — the correct direction for a
    // courtesy cap.
    activeChildHolder.value = {
      activeChild: undefined,
      isChildProfile: true,
      activeChildId: 'child-london',
    }

    renderHook(() => useBookArtQuota())

    expect(useArtQuotaMock).toHaveBeenCalledWith(null, { capped: true })
  })
})

describe('recordBookArtGeneration', () => {
  it('is the SAME helper the sticker doors use — not a second counter', () => {
    expect(recordBookArtGeneration).toBe(recordStickerArtGeneration)
  })

  it('returns void synchronously, so no book generator can await the counter', () => {
    // FEAT-167's contract. A Firestore write settles only on server ack; a
    // caller that could await it would hang offline on art already paid for.
    const neverSettles = () => new Promise<void>(() => {})
    expect(recordBookArtGeneration(neverSettles)).toBeUndefined()
  })

  it('a counter that rejects is logged, never surfaced', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      recordBookArtGeneration(async () => {
        throw new Error('offline')
      })
      // Let the rejection land on the wrapper's own `.catch`.
      await Promise.resolve()
      await Promise.resolve()
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('is a no-op for an uncapped caller that passes nothing', () => {
    expect(() => recordBookArtGeneration(undefined)).not.toThrow()
  })
})
