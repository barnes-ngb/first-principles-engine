import { useCallback, useEffect, useState } from 'react'
import { doc, onSnapshot, query, runTransaction } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { catalogOrdersCollection, db } from '../../core/firebase/firestore'
import type { CatalogOrder, CatalogOrderStatus } from '../../core/types/business'
import { nextOrderStatus } from '../../core/types/business'

export interface UseCatalogOrdersResult {
  /** The family's orders, most-recently-placed first. */
  orders: CatalogOrder[]
  loading: boolean
  error: string | null
  /**
   * Advance an order one step forward in the flow (new → making → ready →
   * delivered). Forward-only: a no-op when already `delivered`. NOT parent-gated
   * — the making is the kids' work (design §6). The `current` arg is only the
   * button's optimistic view; the actual step is computed inside a transaction
   * from the STORED status, so two devices (or a stale tab) can never regress
   * the queue.
   */
  advanceStatus: (id: string, current: CatalogOrderStatus) => Promise<void>
}

/**
 * Subscribe to the Barnes Bros order queue for the family and expose the
 * forward-only status stepper (FEAT-88). Orders are WRITTEN by the public
 * `submitCatalogOrder` endpoint (server-side, admin SDK) — this hook never
 * creates one; it reads the queue and advances fulfillment status.
 *
 * Mirrors `useCatalogProducts`' auto-ID + converter + `families/{familyId}`
 * conventions and is **family-scoped** — a catalog is the family's storefront,
 * not per-child, so there is no `childId` filter. Newest-first ordering is done
 * client-side (avoids a composite index), same as the catalog.
 */
export function useCatalogOrders(): UseCatalogOrdersResult {
  const familyId = useFamilyId()
  const [orders, setOrders] = useState<CatalogOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!familyId) return

    const q = query(catalogOrdersCollection(familyId))

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => ({
            ...(d.data() as CatalogOrder),
            id: d.id,
          }))
          // Order client-side (newest first) — avoids a composite index.
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        setOrders(items)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('[CatalogOrders] Snapshot error:', err)
        setError(err.message)
        setLoading(false)
      },
    )

    return unsubscribe
  }, [familyId])

  const advanceStatus = useCallback(
    async (id: string, current: CatalogOrderStatus) => {
      if (!familyId) return
      // Optimistic fast-path: if the button's view already shows delivered,
      // skip the round-trip. The transaction below is still authoritative.
      if (!nextOrderStatus(current)) return
      const ref = doc(catalogOrdersCollection(familyId), id)
      // Compute the step from the STORED status inside a transaction so a
      // concurrent advance (two devices / a stale tab) can never regress the
      // queue — the write is monotonic regardless of the caller's stale view.
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists()) return
        const stored = snap.data().status
        const next = nextOrderStatus(stored)
        if (!next) return // already delivered — forward-only, nothing to do
        tx.update(ref, { status: next, updatedAt: new Date().toISOString() })
      })
    },
    [familyId],
  )

  return { orders, loading, error, advanceStatus }
}
