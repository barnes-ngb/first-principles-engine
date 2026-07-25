import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'

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
 * writes, so this subscribes to that doc's existence.
 *
 * **This reads the `xpLedger` and never writes it.** The ledger stays a
 * propose-and-confirm invariant — this hook only ever subscribes, and no write
 * primitive is imported here at all.
 *
 * **Known limitation (Codex P2, needs an owner call):** the two save paths in
 * `KidConundrumResponse` build their dedup key from
 * `new Date().toISOString().slice(0, 10)` — a **UTC** date — while `today` here
 * is the local `YYYY-MM-DD` from `TodayPage`. In US Central an evening answer is
 * therefore filed under tomorrow's key, so this probe misses it that evening and
 * *false-positives* the next morning. The root fix is in the writer, which means
 * changing an `xpLedger` dedup key (a propose-and-confirm invariant, and a
 * double-award risk on the boundary day), so it is deliberately NOT done here.
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
    const eventRef = doc(
      xpLedgerCollection(familyId),
      xpLedgerDocId(childId, conundrumXpDedupKey(today)),
    )
    // A live subscription, NOT a one-shot read: `KidConundrumResponse` keeps
    // "saved" in its own local state and writes the ledger event
    // fire-and-forget, so nothing this hook depends on changes when the kid
    // answers. With a `getDoc` the row would stay unfolded and the finish-line
    // would not decrement until a page reload (Codex P1) — precisely the
    // "answer it and watch the number sit still" failure the chapter row's
    // same-day check exists to avoid.
    return onSnapshot(
      eventRef,
      (snap) => setDone(snap.exists()),
      () => {
        // A failed read just means "not known done" — never block the row.
      },
    )
  }, [key, familyId, childId, today])

  return done
}
