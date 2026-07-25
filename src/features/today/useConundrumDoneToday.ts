import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'

import { xpLedgerCollection, xpLedgerDocId } from '../../core/firebase/firestore'

/**
 * The dedup key both conundrum save paths stamp when awarding XP:
 * `KidConundrumResponse`'s audio/quick-pick save and its London drawing save.
 */
export function conundrumXpDedupKey(date: string): string {
  return `conundrum_${date}-xp`
}

/**
 * Read-only "did this kid answer today's conundrum?" (UX-C2b-1 / FEAT-118).
 *
 * The conundrum is the one ritual with no persisted done signal reachable from
 * `KidTodayView`: `KidConundrumResponse` keeps "saved" in component state (lost
 * on reload) and its artifacts carry no `dayLogId`, so the view's artifact query
 * can't see them. The one durable trace is the per-event XP ledger doc the save
 * writes, so this probes for that doc's existence.
 *
 * **This reads the `xpLedger` and never writes it.** The ledger stays a
 * propose-and-confirm invariant — this hook adds a single `getDoc` and no write
 * primitive is imported here at all.
 *
 * @param enabled pass `false` when there's no conundrum this week; the read is
 *   skipped entirely.
 */
export function useConundrumDoneToday(
  familyId: string,
  childId: string,
  today: string,
  enabled = true,
): boolean {
  const key = enabled && familyId && childId && today
    ? `${familyId}|${childId}|${today}`
    : ''

  const [done, setDone] = useState(false)
  // Reset during render (not in the effect body) so a stale `true` can't leak
  // across a day / child boundary while the new read is still in flight — and
  // so `react-hooks/set-state-in-effect` stays quiet.
  const [prevKey, setPrevKey] = useState(key)
  if (key !== prevKey) {
    setPrevKey(key)
    setDone(false)
  }

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const eventRef = doc(
      xpLedgerCollection(familyId),
      xpLedgerDocId(childId, conundrumXpDedupKey(today)),
    )
    getDoc(eventRef)
      .then((snap) => {
        if (!cancelled && snap.exists()) setDone(true)
      })
      .catch(() => {
        // A failed read just means "not known done" — never block the row.
      })
    return () => {
      cancelled = true
    }
  }, [key, familyId, childId, today])

  return done
}
