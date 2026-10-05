import { describe, expect, it } from 'vitest'

import type { BookPage, PageImage } from '../../core/types'
import { restoreImageTransform, restoreImageChanges } from './editorImageHistory'

const img = (overrides: Partial<PageImage> = {}): PageImage => ({
  id: 'img-1',
  url: 'https://example.com/pic.jpg',
  type: 'ai-generated',
  ...overrides,
})

const page = (images: PageImage[], overrides: Partial<BookPage> = {}): BookPage => ({
  id: 'page-1',
  pageNumber: 1,
  images,
  layout: 'full-image',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...overrides,
})

// ── restoreImageTransform ──────────────────────────────────────────────────

describe('restoreImageTransform', () => {
  it('restores geometry from snapshot to current', () => {
    const current = page([
      img({ position: { x: 50, y: 50, width: 30, height: 30 } }),
    ])
    const snapshot = page([
      img({ position: { x: 10, y: 20, width: 80, height: 60 } }),
    ])

    const result = restoreImageTransform(current, snapshot, 'img-1')
    expect(result.images).toBeDefined()
    const restored = result.images![0]
    expect(restored.position?.x).toBe(10)
    expect(restored.position?.y).toBe(20)
    expect(restored.position?.width).toBe(80)
    expect(restored.position?.height).toBe(60)
  })

  it('preserves zIndex from current, not snapshot', () => {
    const current = page([
      img({ position: { x: 0, y: 0, width: 100, height: 100, zIndex: 5 } }),
    ])
    const snapshot = page([
      img({ position: { x: 10, y: 10, width: 50, height: 50, zIndex: 2 } }),
    ])

    const result = restoreImageTransform(current, snapshot, 'img-1')
    expect(result.images![0].position?.zIndex).toBe(5)
  })

  it('returns empty object if image not in snapshot', () => {
    const current = page([img()])
    const snapshot = page([img({ id: 'img-2' })])

    const result = restoreImageTransform(current, snapshot, 'img-1')
    expect(result).toEqual({})
  })

  it('does not modify images with different ids', () => {
    const other = img({ id: 'img-2', position: { x: 99, y: 99, width: 10, height: 10 } })
    const current = page([
      img({ position: { x: 50, y: 50, width: 30, height: 30 } }),
      other,
    ])
    const snapshot = page([
      img({ position: { x: 10, y: 20, width: 80, height: 60 } }),
    ])

    const result = restoreImageTransform(current, snapshot, 'img-1')
    expect(result.images![1]).toBe(other)
  })

  it('restores default geometry when snapshot image has no position', () => {
    const current = page([
      img({ position: { x: 50, y: 50, width: 30, height: 30 } }),
    ])
    const snapshot = page([img()])

    const result = restoreImageTransform(current, snapshot, 'img-1')
    expect(result.images).toBeDefined()
    expect(result.images![0].position?.x).toBe(0)
    expect(result.images![0].position?.y).toBe(0)
  })
})

// ── restoreImageChanges ────────────────────────────────────────────────────

describe('restoreImageChanges', () => {
  it('reverses a position change', () => {
    const from = page([img({ position: { x: 0, y: 0, width: 100, height: 100 } })])
    const to = page([img({ position: { x: 20, y: 30, width: 50, height: 50 } })])
    const current = page([img({ position: { x: 0, y: 0, width: 100, height: 100 } })])

    const result = restoreImageChanges(current, from, to)
    expect(result.images![0].position?.x).toBe(20)
    expect(result.images![0].position?.y).toBe(30)
  })

  it('keeps newer text on the page', () => {
    const from = page([img({ label: 'old label' })])
    const to = page([img({ label: 'restored label' })])
    const current = page([img({ label: 'newer edit' })])

    const result = restoreImageChanges(current, from, to)
    expect(result.images![0].label).toBe('newer edit')
  })

  it('does not resurrect a removed image when current already removed it differently', () => {
    const from = page([img(), img({ id: 'img-2' })])
    const to = page([img()])
    const current = page([img({ id: 'img-3', url: 'new.jpg' })])

    const result = restoreImageChanges(current, from, to)
    expect(result.images!.some((i) => i.id === 'img-2')).toBe(false)
  })

  it('preserves images not involved in the operation', () => {
    const extra = img({ id: 'extra', url: 'extra.jpg', type: 'sticker' })
    const from = page([img({ label: 'old' })])
    const to = page([img({ label: 'new' })])
    const current = page([img({ label: 'old' }), extra])

    const result = restoreImageChanges(current, from, to)
    expect(result.images!.find((i) => i.id === 'extra')).toBeDefined()
  })

  it('restores a removed image that was present in to', () => {
    const restored = img({ id: 'restored-img', url: 'restored.jpg' })
    const from = page([img()])
    const to = page([img(), restored])
    const current = page([img()])

    const result = restoreImageChanges(current, from, to)
    expect(result.images!.find((i) => i.id === 'restored-img')).toBeDefined()
  })

  it('returns images array even with no changes', () => {
    const p = page([img()])
    const result = restoreImageChanges(p, p, p)
    expect(result.images).toBeDefined()
    expect(result.images).toHaveLength(1)
  })

  it('does not restore source fields when current has a newer source', () => {
    const from = page([img({ url: 'old.jpg', storagePath: 'old/path' })])
    const to = page([img({ url: 'restored.jpg', storagePath: 'restored/path' })])
    const current = page([img({ url: 'brand-new.jpg', storagePath: 'new/path' })])

    const result = restoreImageChanges(current, from, to)
    expect(result.images![0].url).toBe('brand-new.jpg')
  })
})
