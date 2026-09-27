import { getFunctions, httpsCallable } from 'firebase/functions'

/**
 * Ask the Cloud Function for this week's summary again (UX-420).
 *
 * `generateWeeklyReviewNow` already existed — it has had no client caller since
 * UX-219 removed *Regenerate* — and already takes `{familyId, childId, weekKey}`
 * and refuses a uid that is not the family. What it cannot tell apart is a kid
 * profile on the family's own account (kids share the family auth), so the
 * capability gate is the CONTROL's job, not this function's.
 *
 * Since FIX-255 the manual path never creates a positions snapshot: a reading
 * taken after the week closed is not that week's (UX-447). What a successful
 * call recovers is the week's hours/evidence record and its narrative; the page
 * sees both through its existing listener, so nothing is returned here.
 */
export interface RetryWeeklyReviewRequest {
  familyId: string
  childId: string
  weekKey: string
}

/**
 * Weeks with a call in flight, keyed `family|child|week`. Module-level rather
 * than component state, so a control that unmounts and remounts mid-call (a
 * route change and back) cannot start a second paid call for the same week —
 * the compliance-pack archive's guard, per week instead of global.
 */
const inFlight = new Set<string>()

export async function retryWeeklyReview(request: RetryWeeklyReviewRequest): Promise<void> {
  const key = `${request.familyId}|${request.childId}|${request.weekKey}`
  if (inFlight.has(key)) {
    throw new Error('A summary for this week is already being asked for.')
  }
  inFlight.add(key)
  try {
    const callable = httpsCallable<RetryWeeklyReviewRequest, { success: boolean }>(
      getFunctions(),
      'generateWeeklyReviewNow',
      // Assembly, an optional learner-model synthesis and one model call. The
      // default 70s is too tight for the synthesis beat on a busy day.
      { timeout: 300_000 },
    )
    await callable({
      familyId: request.familyId,
      childId: request.childId,
      weekKey: request.weekKey,
    })
  } finally {
    inFlight.delete(key)
  }
}
