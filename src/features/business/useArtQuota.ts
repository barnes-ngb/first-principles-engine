import { useCallback, useEffect, useState } from 'react'
import { doc, increment, onSnapshot, setDoc } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { artQuotaCollection } from '../../core/firebase/firestore'
import { weekKeyFromDate } from '../../core/utils/dateKey'

/**
 * Default per-child **weekly** art-generation cap (FEAT-94). A named constant so
 * it's parent-adjustable later; today it's a fixed, light courtesy cap.
 * Regenerate counts toward it (each is a real paid call).
 *
 * **History — one number, one place, moved twice.** 10 at FEAT-94 (Kit Builder
 * only) → **25 by FEAT-168**, when the Book Editor's generators joined this
 * counter: a generated book spends **one paid call per illustrated page**, and a
 * book is 6 / 10 / 14 pages (`books/storyPageTargets.ts`), so at a daily 10 a
 * "Long" book could never finish — the cap would have broken the feature rather
 * than bounded it → **weekly 100 by FEAT-175**.
 *
 * **Why 100, and why a week** (owner, 2026-09-03: *"double what we have is too
 * narrow; some days it's a few books and some more. Maybe a weekly max."*). A
 * daily ceiling is the wrong shape for how the money is actually spent: a day
 * with two Long books was already over a 25-cap while a day with none simply
 * wasted it. Sized against the real unit — a Long book is 14 paid calls — 100 is
 * roughly **seven Long books a week**, or four books plus a normal week's
 * stickers, and is still a real ceiling rather than an open tap. Changing the
 * budget is editing this one line.
 */
export const DEFAULT_WEEKLY_ART_QUOTA = 100

/**
 * The friendly, non-shaming message shown when a kid hits the cap (charter: no
 * error styling, no shame language — it's a nudge to a grown-up, not a failure).
 */
export const ART_QUOTA_MESSAGE = "That's a lot of art this week! Ask a grown-up if you need more. 🎨"

export interface UseArtQuotaResult {
  /** Generations recorded for this child this week (0 when uncapped / unloaded). */
  count: number
  /** The weekly cap in effect. */
  limit: number
  /** Generations left this week (`Infinity` when uncapped). */
  remaining: number
  /** True when a capped child has reached the cap. Always false when uncapped. */
  atLimit: boolean
  /** Record one generation against this week's counter. No-op when uncapped. */
  recordGeneration: () => Promise<void>
}

/**
 * Subscribe to (and increment) a child's **weekly** art-generation counter
 * (FEAT-94; the window went daily → weekly in FEAT-175).
 *
 * The cap exists because image generation costs real money — but it's a *light*
 * cap, not a lock. Only **capped** actors (kid profiles) are limited; a parent
 * (`capped: false`) is uncapped, never reads the doc, and `recordGeneration` is
 * a no-op for them. The counter lives in a tiny per-week doc
 * (`artQuota/{childId}-wk-{weekStart}`) written client-side under the existing
 * owner Firestore rule — deliberately not a security boundary, just a courtesy.
 *
 * **The window is the app's own week**, not a second definition of one:
 * `weekKeyFromDate` → `getWeekRange`, the Sunday-start Sun–Sat week that hours,
 * compliance, records and the weekly review already share. No ISO weeks, no
 * Monday start.
 *
 * **The `wk-` segment in the doc id is load-bearing.** A plain
 * `{childId}-{weekStart}` for a Sunday is byte-identical to that Sunday's
 * *legacy daily* doc (FEAT-94 → FEAT-168 wrote `{childId}-{YYYY-MM-DD}`), so a
 * leftover Sunday count would silently seed the new week. Legacy daily docs stay
 * where they are: inert, unread, never migrated, never deleted.
 *
 * **No per-day sub-cap, deliberately.** A kid *can* spend the whole week's
 * budget on Sunday. That is the accepted trade-off of the owner's ask — the
 * point of a weekly ceiling is that the days are allowed to vary — not an
 * oversight, and a daily floor added "to be safe" would rebuild the shape this
 * change removes.
 */
export function useArtQuota(
  childId: string | null,
  { capped, limit = DEFAULT_WEEKLY_ART_QUOTA }: { capped: boolean; limit?: number },
): UseArtQuotaResult {
  const familyId = useFamilyId()
  const [count, setCount] = useState(0)
  // Bumped at the week boundary so a page left mounted rolls over to the new
  // week's counter without needing an unrelated render (FEAT-94 / FEAT-175).
  // `weekKeyFromDate` is recomputed on the tick render.
  const [weekTick, setWeekTick] = useState(0)

  const weekStart = weekKeyFromDate(new Date())
  const docId = childId ? `${childId}-wk-${weekStart}` : null

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

  // Roll the subscription over to the new week's doc at the week boundary even
  // if nothing else re-renders (a capped kid at the cap has no live control to
  // trigger one). Re-arms after each tick. Only capped actors need this.
  //
  // The boundary is the next Sunday-at-local-midnight, matching `getWeekRange`'s
  // `weekStartsOn = 0` — so a page left mounted across Saturday night moves to
  // the new week, and one left mounted across an ordinary midnight does not.
  useEffect(() => {
    if (!capped) return
    const now = new Date()
    const nextWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    // `getDay()` is 0 on Sunday, so this is always 1–7 days out: Saturday rolls
    // tomorrow, Sunday rolls in a full week. Never 0 — a 0 ms timer would spin.
    nextWeekStart.setDate(nextWeekStart.getDate() + (7 - nextWeekStart.getDay()))
    // +1s cushion so `weekKeyFromDate` is safely on the new local week when it
    // fires. Max delay is 7 days, well inside setTimeout's 32-bit ms ceiling.
    const ms = nextWeekStart.getTime() - now.getTime() + 1000
    const timer = setTimeout(() => setWeekTick((n) => n + 1), ms)
    return () => clearTimeout(timer)
  }, [capped, weekTick])

  const recordGeneration = useCallback(async () => {
    if (!capped || !familyId || !childId || !docId) return
    const ref = doc(artQuotaCollection(familyId), docId)
    // Atomic server-side increment so overlapping generations both count.
    await setDoc(
      ref,
      { childId, weekStart, count: increment(1), updatedAt: new Date().toISOString() },
      { merge: true },
    )
  }, [capped, familyId, childId, docId, weekStart])

  // Only a live subscription's count counts; an uncapped/inactive actor reads 0.
  const effectiveCount = active ? count : 0
  const remaining = capped ? Math.max(0, limit - effectiveCount) : Infinity
  const atLimit = capped && effectiveCount >= limit

  return { count: effectiveCount, limit, remaining, atLimit, recordGeneration }
}
