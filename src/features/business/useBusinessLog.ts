import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDoc, onSnapshot, orderBy, query } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { businessLogCollection } from '../../core/firebase/firestore'
import type { BusinessItemType, BusinessLogEntry } from '../../core/types/business'
import { sumBusinessLog } from './businessTotal'

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
  /** Derived money-in total (sum of the additive log — never stored). */
  total: number
  loading: boolean
  error: string | null
  /** Append a sale. Writes via `addDoc` — the log is never mutated. */
  addSale: (sale: NewBusinessSale) => Promise<void>
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

  return { entries, total, loading, error, addSale }
}
