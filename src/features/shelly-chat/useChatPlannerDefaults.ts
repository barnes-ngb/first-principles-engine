// ── Read-only planner-defaults subscribe for the Shelly portal (FEAT-150) ────
//
// The chat drafts next week through the planner's own generator, so it has to
// hand that generator the planner's own per-subject minute defaults. Without
// them a week drafted here and the same week drafted in Plan My Week would
// disagree about how long reading takes — for a family that has tuned those
// numbers, that is the difference between a plan that fits the morning and one
// that doesn't.
//
// Deliberately a plain read of one settings doc, in the shape of its siblings
// (`useChatActivityConfigs`, `useChatWeekDays`, `useChatWatchLibrary`): opening
// a chat tab must not create a settings document or start a save loop. The
// planner still owns writing these; the chat only reads them.

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'

import { db } from '../../core/firebase/firestore'
import { DEFAULT_SUBJECT_MINUTES } from '../../core/types/planning'
import type { SubjectTimeDefaults } from '../../core/types/planning'

/**
 * The family's baseline merged with nothing — a stable identity so a consumer
 * that memoises on this value doesn't churn every render while the doc loads.
 */
const BASELINE: SubjectTimeDefaults = { ...DEFAULT_SUBJECT_MINUTES }

/**
 * Subscribe to one child's planner subject-time defaults.
 *
 * Returns the app baseline (`DEFAULT_SUBJECT_MINUTES`) while loading, when the
 * child has no overrides, and on error — the same value the planner falls back
 * to, so the two surfaces agree on the default case as well as the tuned one.
 */
export function useChatPlannerDefaults(
  familyId: string,
  childId: string,
): SubjectTimeDefaults {
  // Keyed by the subscription's identity, the pattern every sibling read in this
  // folder uses: a child switch reads as the baseline IMMEDIATELY, with no
  // synchronous setState in the effect, so a previous child's tuned minutes can
  // never shape the next child's drafted week.
  const key = `${familyId}\u0000${childId}`
  const [loaded, setLoaded] = useState<{ key: string; defaults: SubjectTimeDefaults }>({
    key: '',
    defaults: BASELINE,
  })

  useEffect(() => {
    if (!familyId || !childId) return

    const ref = doc(db, `families/${familyId}/settings/plannerDefaults_${childId}`)
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const overrides = snap.exists()
          ? (snap.data().subjectTimeDefaults as SubjectTimeDefaults | undefined)
          : undefined
        // Merged the planner's way round: the family's overrides win over the
        // app baseline, and a subject with no override keeps the baseline.
        setLoaded({ key, defaults: { ...DEFAULT_SUBJECT_MINUTES, ...(overrides ?? {}) } })
      },
      (err) => {
        console.warn('[shellyChat] planner defaults subscribe failed:', err)
        setLoaded({ key, defaults: BASELINE })
      },
    )

    return unsubscribe
  }, [familyId, childId, key])

  return loaded.key === key ? loaded.defaults : BASELINE
}
