import { describe, expect, it, vi } from 'vitest'

import type { CatalogOrder } from '../types/business'

// firestore.ts calls initializeFirestore() at module load and uses collection/doc
// inside its helpers. Mock the firebase surface so importing the module (for the
// real converter) doesn't require a live Firebase app.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ withConverter: vi.fn(() => ({})) })),
  doc: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
}))
vi.mock('./firebase', () => ({ app: {} }))

import { catalogOrderConverter } from './firestore'

const NOW = '2026-07-18T00:00:00.000Z'

function snapshotOf(data: Record<string, unknown>, id: string) {
  return { id, data: () => data } as unknown as Parameters<
    typeof catalogOrderConverter.fromFirestore
  >[0]
}

describe('catalogOrderConverter', () => {
  it('round-trips a full order, taking the document id from the snapshot', () => {
    const order: CatalogOrder = {
      id: 'ignored-on-write',
      customerName: 'Sam',
      items: [
        { productId: 'prod-1', title: 'Seed Vault Kit' },
        { productId: 'prod-2', title: 'Sticker Sheet' },
      ],
      note: "London's is blue please!",
      contact: 'text me @ 555',
      status: 'new',
      createdAt: NOW,
      updatedAt: NOW,
    }

    const wire = catalogOrderConverter.toFirestore(order)
    const back = catalogOrderConverter.fromFirestore(
      snapshotOf(wire as Record<string, unknown>, 'order-1'),
      {},
    )

    expect(back.id).toBe('order-1')
    expect(back.customerName).toBe('Sam')
    expect(back.items).toHaveLength(2)
    expect(back.items[0]).toEqual({ productId: 'prod-1', title: 'Seed Vault Kit' })
    expect(back.note).toBe("London's is blue please!")
    expect(back.contact).toBe('text me @ 555')
    expect(back.status).toBe('new')
  })

  it('round-trips an order with no optional fields (stripUndefined omits them)', () => {
    const order: CatalogOrder = {
      id: 'x',
      customerName: 'Alex',
      items: [{ productId: 'prod-9', title: 'Book' }],
      status: 'making',
      createdAt: NOW,
      updatedAt: NOW,
    }

    const wire = catalogOrderConverter.toFirestore(order) as Record<string, unknown>
    expect('note' in wire).toBe(false)
    expect('contact' in wire).toBe(false)

    const back = catalogOrderConverter.fromFirestore(snapshotOf(wire, 'order-2'), {})
    expect(back.note).toBeUndefined()
    expect(back.contact).toBeUndefined()
    expect(back.status).toBe('making')
  })
})
