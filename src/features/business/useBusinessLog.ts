import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { businessLogCollection } from '../../core/firebase/firestore'
import type { BusinessItemType, BusinessLogEntry } from '../../core/types/business'
import { sumBusinessLog, sumConfirmedBusinessLog } from './businessTotal'

/** Fields a caller supplies when logging a sale. The hook stamps the rest. */
export interface NewBusinessSale {
  childId: string
  amount: number
  itemType: BusinessItemType
  date: string
  note?: string
}

export interface UseBusinessLogResult {
  /** Sales/earnings entries, most-recent-first. */
  entries: BusinessLogEntry[]
  /** Derived money-in total across ALL entries (confirmed + pending). */
  total: number
  /**
   * Derived CONFIRMED money-in total (FEAT-30 chunk 4) — the honest figure the
   * thermometer climbs on. Sums only entries a parent has OK'd.
   */
  confirmedTotal: number
  loading: boolean
  error: string | null
  /** Append a sale. Writes via `addDoc` — the log is never mutated. */
  addSale: (sale: NewBusinessSale) => Promise<void>
  /** Parent-gated: mark a logged sale confirmed so it counts toward the goal. */
  confirmSale: (id: string) => Promise<void>
  /** Parent-gated: revert a confirmation (correction). */
  unconfirm: (id: string) => Promise<void>
  /** Parent-gated: delete a logged sale (correction). */
  removeSale: (id: string) => Promise<void>
}

/**
 * Subscribe to the Barnes Bros sales/earnings log for the family and expose a
 * derived money-in total (FEAT-30 chunk 2).
 *
 * The log is append-only: `addSale` uses `addDoc` and the total is always
 * recomputed from the entries, never stored. Entries carry no customer PII.
 */
export function useBusinessLog(): UseBusinessLogResult {
  const familyId = useFamilyId()
  const [entries, setEntries] = useState<BusinessLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!familyId) return

    const q = query(businessLogCollection(familyId), orderBy('date', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({
          ...(d.data() as BusinessLogEntry),
          id: d.id,
        }))
        setEntries(items)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('[BusinessLog] Snapshot error:', err)
        setError(err.message)
        setLoading(false)
      },
    )

    return unsubscribe
  }, [familyId])

  const total = useMemo(() => sumBusinessLog(entries), [entries])
  const confirmedTotal = useMemo(() => sumConfirmedBusinessLog(entries), [entries])

  const addSale = useCallback(
    async (sale: NewBusinessSale) => {
      if (!familyId) return
      const amount = Number(sale.amount)
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('Sale amount must be a non-negative number.')
      }
      const note = sale.note?.trim()
      await addDoc(businessLogCollection(familyId), {
        childId: sale.childId,
        amount,
        itemType: sale.itemType,
        date: sale.date,
        ...(note ? { note } : {}),
        createdAt: new Date().toISOString(),
        // `id` is supplied by the converter on read.
      } as Omit<BusinessLogEntry, 'id'> as BusinessLogEntry)
    },
    [familyId],
  )

  const confirmSale = useCallback(
    async (id: string) => {
      if (!familyId) return
      await updateDoc(doc(businessLogCollection(familyId), id), {
        confirmed: true,
        confirmedAt: new Date().toISOString(),
      })
    },
    [familyId],
  )

  const unconfirm = useCallback(
    async (id: string) => {
      if (!familyId) return
      await updateDoc(doc(businessLogCollection(familyId), id), {
        confirmed: false,
        confirmedAt: deleteField(),
      })
    },
    [familyId],
  )

  const removeSale = useCallback(
    async (id: string) => {
      if (!familyId) return
      await deleteDoc(doc(businessLogCollection(familyId), id))
    },
    [familyId],
  )

  return { entries, total, confirmedTotal, loading, error, addSale, confirmSale, unconfirm, removeSale }
}
