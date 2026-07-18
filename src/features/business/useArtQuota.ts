import { useCallback, useEffect, useState } from 'react'
import { doc, increment, onSnapshot, setDoc } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { artQuotaCollection } from '../../core/firebase/firestore'
import { todayKey } from '../../core/utils/dateKey'

/**
 * Default per-child daily art-generation cap (FEAT-94). A named constant so it's
 * parent-adjustable later; today it's a fixed, light courtesy cap. Regenerate
 * counts toward it (each is a real paid call).
 */
export const DEFAULT_DAILY_ART_QUOTA = 10

/**
 * The friendly, non-shaming message shown when a kid hits the cap (charter: no
 * error styling, no shame language — it's a nudge to a grown-up, not a failure).
 */
export const ART_QUOTA_MESSAGE = "That's a lot of art today! Ask a grown-up if you need more. 🎨"

export interface UseArtQuotaResult {
  /** Generations recorded for this child today (0 when uncapped / unloaded). */
  count: number
  /** The daily cap in effect. */
  limit: number
  /** Generations left today (`Infinity` when uncapped). */
  remaining: number
  /** True when a capped child has reached the cap. Always false when uncapped. */
  atLimit: boolean
  /** Record one generation against today's counter. No-op when uncapped. */
  recordGeneration: () => Promise<void>
}

/**
 * Subscribe to (and increment) a child's daily art-generation counter (FEAT-94).
 *
 * The cap exists because image generation costs real money — but it's a *light*
 * cap, not a lock. Only **capped** actors (kid profiles) are limited; a parent
 * (`capped: false`) is uncapped, never reads the doc, and `recordGeneration` is
 * a no-op for them. The counter lives in a tiny per-day doc
 * (`artQuota/{childId}-{YYYY-MM-DD}`) written client-side under the existing
 * owner Firestore rule — deliberately not a security boundary, just a courtesy.
 */
export function useArtQuota(
  childId: string | null,
  { capped, limit = DEFAULT_DAILY_ART_QUOTA }: { capped: boolean; limit?: number },
): UseArtQuotaResult {
  const familyId = useFamilyId()
  const [count, setCount] = useState(0)

  const date = todayKey()
  const docId = childId ? `${childId}-${date}` : null

  // Uncapped actors (parents) never subscribe; the counter is derived to 0 for
  // them below rather than reset in the effect body (avoids a synchronous
  // setState in the effect).
  const active = capped && Boolean(familyId) && Boolean(docId)

  useEffect(() => {
    if (!active || !familyId || !docId) return
    const ref = doc(artQuotaCollection(familyId), docId)
    const unsubscribe = onSnapshot(
      ref,
      (snap) => setCount(snap.data()?.count ?? 0),
      (err) => {
        // A read failure must never block generation — fail open (count → 0).
        console.error('[ArtQuota] Snapshot error:', err)
        setCount(0)
      },
    )
    return unsubscribe
  }, [active, familyId, docId])

  const recordGeneration = useCallback(async () => {
    if (!capped || !familyId || !childId || !docId) return
    const ref = doc(artQuotaCollection(familyId), docId)
    // Atomic server-side increment so overlapping generations both count.
    await setDoc(
      ref,
      { childId, date, count: increment(1), updatedAt: new Date().toISOString() },
      { merge: true },
    )
  }, [capped, familyId, childId, docId, date])

  // Only a live subscription's count counts; an uncapped/inactive actor reads 0.
  const effectiveCount = active ? count : 0
  const remaining = capped ? Math.max(0, limit - effectiveCount) : Infinity
  const atLimit = capped && effectiveCount >= limit

  return { count: effectiveCount, limit, remaining, atLimit, recordGeneration }
}
