import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { useArtQuotaMock, activeChildHolder } = vi.hoisted(() => ({
  useArtQuotaMock: vi.fn(() => ({
    count: 0,
    limit: 100,
    remaining: 100,
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

import { recordStickerArtGeneration } from '../books/useStickerArtQuota'
import { canReserveWorkshopArt, recordWorkshopArtGeneration, useWorkshopArtQuota } from './useWorkshopArtQuota'

beforeEach(() => {
  useArtQuotaMock.mockClear()
  activeChildHolder.value = { activeChild: undefined, isChildProfile: false, activeChildId: '' }
})

describe('useWorkshopArtQuota (FEAT-184)', () => {
  it('caps by capability, never by name — a kid profile is capped', () => {
    activeChildHolder.value = { activeChild: { id: 'child-a' }, isChildProfile: true, activeChildId: 'child-a' }
    renderHook(() => useWorkshopArtQuota())
    expect(useArtQuotaMock).toHaveBeenCalledWith('child-a', { capped: true })
  })

  it('a parent is uncapped', () => {
    activeChildHolder.value = { activeChild: { id: 'child-a' }, isChildProfile: false, activeChildId: 'child-a' }
    renderHook(() => useWorkshopArtQuota())
    expect(useArtQuotaMock).toHaveBeenCalledWith('child-a', { capped: false })
  })

  it('binds to the RESOLVED child, so a fast first tap cannot test the sibling’s budget', () => {
    activeChildHolder.value = { activeChild: undefined, isChildProfile: true, activeChildId: 'child-b' }
    renderHook(() => useWorkshopArtQuota())
    expect(useArtQuotaMock).toHaveBeenCalledWith(null, { capped: true })
  })

  it('is the same counter every other surface writes — one function, re-exported', () => {
    expect(recordWorkshopArtGeneration).toBe(recordStickerArtGeneration)
  })
})

describe('canReserveWorkshopArt — a batch is reserved whole or refused whole', () => {
  it('reserves when the week can cover every picture', () => {
    expect(canReserveWorkshopArt(9, 9)).toBe(true)
    expect(canReserveWorkshopArt(9, 100)).toBe(true)
  })

  it('refuses the whole batch when one picture would not fit — never a half-spend', () => {
    expect(canReserveWorkshopArt(9, 8)).toBe(false)
    expect(canReserveWorkshopArt(15, 0)).toBe(false)
  })

  it('a parent reads Infinity and is never refused', () => {
    expect(canReserveWorkshopArt(15, Infinity)).toBe(true)
  })

  it('a batch of nothing costs nothing', () => {
    expect(canReserveWorkshopArt(0, 0)).toBe(true)
  })
})
