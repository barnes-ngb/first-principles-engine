import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { addDocMock, updateDocMock, onSnapshotMock } = vi.hoisted(() => ({
  addDocMock: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({ id: 'prod-new' })),
  updateDocMock: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
  onSnapshotMock: vi.fn<(...args: unknown[]) => () => void>(() => () => undefined),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: addDocMock,
  updateDoc: updateDocMock,
  onSnapshot: onSnapshotMock,
  doc: vi.fn((_coll: unknown, id: string) => ({ __doc: id })),
  query: vi.fn((coll: unknown) => coll),
}))

vi.mock('../../core/firebase/firestore', () => ({
  catalogProductsCollection: vi.fn(() => ({ __collection: 'catalogProducts' })),
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'family-1',
}))

import type { CatalogProduct } from '../../core/types/business'
import { useCatalogProducts } from './useCatalogProducts'

/** Drive the stored onSnapshot success callback with fake docs. */
function emitSnapshot(products: CatalogProduct[]) {
  const onNext = onSnapshotMock.mock.calls[0][1] as (snap: unknown) => void
  onNext({
    docs: products.map((p) => ({ id: p.id, data: () => p })),
  })
}

beforeEach(() => {
  addDocMock.mockClear()
  updateDocMock.mockClear()
  onSnapshotMock.mockReset()
  onSnapshotMock.mockReturnValue(() => undefined)
})

const productAt = (id: string, createdAt: string): CatalogProduct => ({
  id,
  title: id,
  type: 'StarterKit',
  description: '',
  priceCents: 0,
  images: [],
  madeBy: ['Lincoln'],
  status: 'draft',
  createdAt,
  updatedAt: createdAt,
})

describe('useCatalogProducts', () => {
  it('lists products from the snapshot (id after the spread), newest-created first', async () => {
    const { result } = renderHook(() => useCatalogProducts())
    expect(result.current.loading).toBe(true)

    act(() => {
      emitSnapshot([
        productAt('older', '2026-07-15T00:00:00.000Z'),
        productAt('newest', '2026-07-17T00:00:00.000Z'),
        productAt('middle', '2026-07-16T00:00:00.000Z'),
      ])
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.products.map((p) => p.id)).toEqual(['newest', 'middle', 'older'])
  })

  it('creates a product via addDoc, stamping timestamps and returning the id', async () => {
    const { result } = renderHook(() => useCatalogProducts())

    let newId = ''
    await act(async () => {
      newId = await result.current.createProduct({
        title: 'Seed Vault Kit',
        type: 'StarterKit',
        description: '',
        priceCents: 0,
        images: [],
        sourceRef: { kind: 'kitRoster', id: 'kit-1' },
        madeBy: ['Lincoln'],
        status: 'draft',
      })
    })

    expect(newId).toBe('prod-new')
    expect(addDocMock).toHaveBeenCalledTimes(1)
    const payload = addDocMock.mock.calls[0][1] as Record<string, unknown>
    expect(payload.title).toBe('Seed Vault Kit')
    expect(payload.sourceRef).toEqual({ kind: 'kitRoster', id: 'kit-1' })
    expect(payload.madeBy).toEqual(['Lincoln'])
    expect(payload.createdAt).toBeTruthy()
    expect(payload.updatedAt).toBeTruthy()
  })

  it('updates a product via updateDoc, re-stamping updatedAt', async () => {
    const { result } = renderHook(() => useCatalogProducts())
    await act(async () => {
      await result.current.updateProduct('prod-1', { priceCents: 1500, status: 'listed' })
    })
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    const patch = updateDocMock.mock.calls[0][1] as Record<string, unknown>
    expect(patch.priceCents).toBe(1500)
    expect(patch.status).toBe('listed')
    expect(patch.updatedAt).toBeTruthy()
  })
})
