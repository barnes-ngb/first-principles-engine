import { useCallback, useEffect, useState } from 'react'
import { addDoc, doc, onSnapshot, query, updateDoc } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { catalogProductsCollection } from '../../core/firebase/firestore'
import type { CatalogProduct } from '../../core/types/business'

/**
 * Fields a caller supplies when creating a product. The hook stamps `createdAt`
 * / `updatedAt`; the converter supplies `id` on read.
 */
export type NewCatalogProduct = Omit<CatalogProduct, 'id' | 'createdAt' | 'updatedAt'>

export interface UseCatalogProductsResult {
  /** The family's catalog products, most-recently-created first. */
  products: CatalogProduct[]
  loading: boolean
  error: string | null
  /** Create a product (`addDoc`). Returns the new auto-ID. */
  createProduct: (product: NewCatalogProduct) => Promise<string>
  /** Patch a product in place (`updateDoc`). Re-stamps `updatedAt`. */
  updateProduct: (id: string, patch: Partial<Omit<CatalogProduct, 'id'>>) => Promise<void>
}

/**
 * Subscribe to the Barnes Bros product catalog for the family and expose
 * create / update (FEAT-81 slice 1). Mirrors `useBusinessLog`'s auto-ID +
 * converter + `families/{familyId}` conventions and is **family-scoped** — a
 * catalog is the family's storefront, not per-child (design §8 decision 1), so
 * unlike `useKitRosters` there is no `childId` filter. Which kids are credited
 * lives in each product's `madeBy`, not the query.
 *
 * There are no deletes: `status: 'retired'` retires a product (the collection is
 * additive, same posture as the append-only `businessLog`).
 */
export function useCatalogProducts(): UseCatalogProductsResult {
  const familyId = useFamilyId()
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!familyId) return

    const q = query(catalogProductsCollection(familyId))

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => ({
            ...(d.data() as CatalogProduct),
            id: d.id,
          }))
          // Order client-side (newest first) — avoids a composite index.
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        setProducts(items)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('[CatalogProducts] Snapshot error:', err)
        setError(err.message)
        setLoading(false)
      },
    )

    return unsubscribe
  }, [familyId])

  const createProduct = useCallback(
    async (product: NewCatalogProduct) => {
      if (!familyId) throw new Error('createProduct: no family')
      const now = new Date().toISOString()
      const ref = await addDoc(catalogProductsCollection(familyId), {
        ...product,
        createdAt: now,
        updatedAt: now,
        // `id` is supplied by the converter on read.
      } as Omit<CatalogProduct, 'id'> as CatalogProduct)
      return ref.id
    },
    [familyId],
  )

  const updateProduct = useCallback(
    async (id: string, patch: Partial<Omit<CatalogProduct, 'id'>>) => {
      if (!familyId) return
      await updateDoc(doc(catalogProductsCollection(familyId), id), {
        ...patch,
        updatedAt: new Date().toISOString(),
      })
    },
    [familyId],
  )

  return { products, loading, error, createProduct, updateProduct }
}
