import { describe, it, expect, vi, beforeEach } from 'vitest'

import { generateStickerVersion } from './generateStickerVersion'
import type { Sticker } from '../../core/types'
import { StickerCategory } from '../../core/types/enums'

// ── Mocks ─────────────────────────────────────────────────────────

const addDocMock = vi.hoisted(() => vi.fn())

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
}))

vi.mock('../../core/firebase/firestore', () => ({
  stickerLibraryCollection: (familyId: string) => ({ familyId }),
}))

function makeSticker(overrides: Partial<Sticker> = {}): Sticker {
  return {
    id: 'src',
    url: 'https://example.com/src.png',
    storagePath: 'families/f/stickers/src.png',
    label: 'Wolf',
    category: StickerCategory.Custom,
    childId: null,
    createdAt: '2026-06-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('generateStickerVersion', () => {
  beforeEach(() => {
    addDocMock.mockReset()
    addDocMock.mockResolvedValue({ id: 'new-id' })
  })

  it('links a new themed version to any sticker via its sourceDrawingId', async () => {
    const enhanceSketch = vi
      .fn()
      .mockResolvedValue({ url: 'https://example.com/fancy.png', storagePath: 'p/fancy.png' })

    const res = await generateStickerVersion({
      familyId: 'f',
      source: makeSticker({ tags: ['animal'], childProfile: 'london' }),
      styleId: 'fantasy',
      sourceDrawingId: 'group-1',
      label: 'Wolf',
      enhanceSketch,
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    // The new version is linked + tagged with the chosen theme, never the original.
    expect(res.sticker.sourceDrawingId).toBe('group-1')
    expect(res.sticker.theme).toBe('fantasy')
    expect(res.sticker.isOriginal).toBeUndefined()
    expect(res.sticker.id).toBe('new-id')
    // Carries the source's tags/profile forward.
    expect(res.sticker.tags).toEqual(['animal'])
    expect(res.sticker.childProfile).toBe('london')
    expect(res.sticker.url).toBe('https://example.com/fancy.png')

    // enhanceSketch ran on the source's stored image.
    expect(enhanceSketch).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'f', sketchStoragePath: 'families/f/stickers/src.png' }),
    )
    // Persisted exactly one new sticker (always adds, never replaces).
    expect(addDocMock).toHaveBeenCalledTimes(1)
    const saved = addDocMock.mock.calls[0][1] as Sticker
    expect(saved.sourceDrawingId).toBe('group-1')
    expect(saved.theme).toBe('fantasy')
  })

  it('returns ok:false (and saves nothing) when the model produces no image', async () => {
    const enhanceSketch = vi.fn().mockResolvedValue(null)

    const res = await generateStickerVersion({
      familyId: 'f',
      source: makeSticker(),
      styleId: 'cartoon',
      sourceDrawingId: 'group-1',
      label: 'Wolf',
      enhanceSketch,
    })

    expect(res.ok).toBe(false)
    expect(addDocMock).not.toHaveBeenCalled()
  })
})
