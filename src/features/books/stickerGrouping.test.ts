import { describe, it, expect } from 'vitest'
import { groupStickers } from './stickerGrouping'
import type { Sticker } from '../../core/types'
import { StickerCategory } from '../../core/types/enums'

function makeSticker(overrides: Partial<Sticker>): Sticker {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    url: 'https://example.com/x.png',
    storagePath: 'families/f/stickers/x.png',
    label: 'A drawing',
    category: StickerCategory.Custom,
    childId: null,
    createdAt: '2026-06-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('groupStickers', () => {
  it('keeps stickers without sourceDrawingId standalone', () => {
    const a = makeSticker({ id: 'a' })
    const b = makeSticker({ id: 'b' })
    const { drawings, standalone } = groupStickers([a, b])
    expect(drawings).toHaveLength(0)
    expect(standalone.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('groups stickers sharing a sourceDrawingId into one drawing', () => {
    const original = makeSticker({ id: 'o', sourceDrawingId: 'd1', isOriginal: true })
    const fancy = makeSticker({ id: 'f', sourceDrawingId: 'd1', theme: 'fantasy' })
    const { drawings, standalone } = groupStickers([original, fancy])
    expect(standalone).toHaveLength(0)
    expect(drawings).toHaveLength(1)
    expect(drawings[0].sourceDrawingId).toBe('d1')
    expect(drawings[0].versions.map((s) => s.id)).toEqual(['o', 'f'])
  })

  it('puts the original first and uses it as the representative', () => {
    const fancy = makeSticker({ id: 'f', sourceDrawingId: 'd1', theme: 'space', createdAt: '2026-06-21T00:00:00.000Z' })
    const original = makeSticker({ id: 'o', sourceDrawingId: 'd1', isOriginal: true, createdAt: '2026-06-20T00:00:00.000Z' })
    const { drawings } = groupStickers([fancy, original])
    expect(drawings[0].versions[0].id).toBe('o')
    expect(drawings[0].representative.id).toBe('o')
  })

  it('orders themed versions oldest→newest after the original', () => {
    const original = makeSticker({ id: 'o', sourceDrawingId: 'd1', isOriginal: true, createdAt: '2026-06-20T00:00:00.000Z' })
    const v2 = makeSticker({ id: 'v2', sourceDrawingId: 'd1', theme: 'space', createdAt: '2026-06-22T00:00:00.000Z' })
    const v1 = makeSticker({ id: 'v1', sourceDrawingId: 'd1', theme: 'fantasy', createdAt: '2026-06-21T00:00:00.000Z' })
    const { drawings } = groupStickers([v2, original, v1])
    expect(drawings[0].versions.map((s) => s.id)).toEqual(['o', 'v1', 'v2'])
  })

  it('falls back to the earliest remaining version when the original is gone', () => {
    const v2 = makeSticker({ id: 'v2', sourceDrawingId: 'd1', theme: 'space', createdAt: '2026-06-22T00:00:00.000Z' })
    const v1 = makeSticker({ id: 'v1', sourceDrawingId: 'd1', theme: 'fantasy', createdAt: '2026-06-21T00:00:00.000Z' })
    const { drawings } = groupStickers([v2, v1])
    expect(drawings[0].representative.id).toBe('v1')
    expect(drawings[0].versions.map((s) => s.id)).toEqual(['v1', 'v2'])
  })

  it('separates standalone and grouped stickers in one pass', () => {
    const standalone = makeSticker({ id: 's' })
    const original = makeSticker({ id: 'o', sourceDrawingId: 'd1', isOriginal: true })
    const { drawings, standalone: loose } = groupStickers([standalone, original])
    expect(loose.map((s) => s.id)).toEqual(['s'])
    expect(drawings).toHaveLength(1)
  })

  it('preserves group order by first appearance in the input', () => {
    const d2 = makeSticker({ id: 'd2o', sourceDrawingId: 'd2', isOriginal: true })
    const d1 = makeSticker({ id: 'd1o', sourceDrawingId: 'd1', isOriginal: true })
    const { drawings } = groupStickers([d2, d1])
    expect(drawings.map((g) => g.sourceDrawingId)).toEqual(['d2', 'd1'])
  })

  it('returns empty groupings for an empty list', () => {
    expect(groupStickers([])).toEqual({ drawings: [], standalone: [] })
  })
})
