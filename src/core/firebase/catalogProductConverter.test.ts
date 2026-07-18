import { describe, expect, it, vi } from 'vitest'

import type { CatalogProduct } from '../types/business'

// firestore.ts calls initializeFirestore() at module load and uses collection/doc
// inside its helpers. Mock the firebase surface so importing the module (for the
// real converter) doesn't require a live Firebase app.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ withConverter: vi.fn(() => ({})) })),
  doc: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
}))
vi.mock('./firebase', () => ({ app: {} }))

import { catalogProductConverter } from './firestore'

const NOW = '2026-07-18T00:00:00.000Z'

function snapshotOf(data: Record<string, unknown>, id: string) {
  return { id, data: () => data } as unknown as Parameters<
    typeof catalogProductConverter.fromFirestore
  >[0]
}

describe('catalogProductConverter', () => {
  it('round-trips a full product, taking the document id from the snapshot', () => {
    const product: CatalogProduct = {
      id: 'ignored-on-write',
      title: 'Seed Vault Kit',
      type: 'StarterKit',
      description: 'A garden defense kit.',
      priceCents: 1500,
      images: [{ url: 'https://x/cover.png', alt: 'kit cover' }],
      sourceRef: { kind: 'kitRoster', id: 'kit-1' },
      madeBy: ['Lincoln'],
      status: 'listed',
      createdAt: NOW,
      updatedAt: NOW,
    }

    const wire = catalogProductConverter.toFirestore(product)
    const back = catalogProductConverter.fromFirestore(
      snapshotOf(wire as Record<string, unknown>, 'prod-1'),
      {},
    )

    expect(back.id).toBe('prod-1')
    expect(back.title).toBe('Seed Vault Kit')
    expect(back.type).toBe('StarterKit')
    expect(back.priceCents).toBe(1500)
    expect(back.images).toHaveLength(1)
    expect(back.images[0]).toMatchObject({ url: 'https://x/cover.png', alt: 'kit cover' })
    expect(back.sourceRef).toEqual({ kind: 'kitRoster', id: 'kit-1' })
    expect(back.madeBy).toEqual(['Lincoln'])
    expect(back.status).toBe('listed')
  })

  it('round-trips an unpriced draft with empty images (placeholder path)', () => {
    const product: CatalogProduct = {
      id: 'x',
      title: 'New Kit',
      type: 'StarterKit',
      description: '',
      priceCents: 0,
      images: [],
      madeBy: ['London'],
      status: 'draft',
      createdAt: NOW,
      updatedAt: NOW,
    }

    const wire = catalogProductConverter.toFirestore(product) as Record<string, unknown>
    // sourceRef is optional and absent — stripUndefined must not emit the key.
    expect('sourceRef' in wire).toBe(false)

    const back = catalogProductConverter.fromFirestore(snapshotOf(wire, 'prod-2'), {})
    expect(back.images).toEqual([])
    expect(back.priceCents).toBe(0)
    expect(back.sourceRef).toBeUndefined()
    expect(back.status).toBe('draft')
  })
})
