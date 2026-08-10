import { doc, updateDoc } from 'firebase/firestore'

import { activityConfigsCollection } from './firestore'

/**
 * Set ONE activity config's `defaultMinutes` (FEAT-135).
 *
 * The narrow, single-field sibling of `updateActivityConfigPosition` — same
 * shape, same collection, one field plus the `updatedAt` stamp. This is the
 * only write behind the Shelly-chat `setActivityMinutes` action, and it is
 * deliberately dumb: it takes an already-resolved doc id and an
 * already-validated number and writes them. Resolution (does this id name a
 * real config for this family?) and validation (integer, 5–120) happen upstream
 * in `parseChatActions` + `useShellyChatActions`, before a confirm card is ever
 * shown.
 *
 * **What this does NOT touch, by construction:**
 * - No `dayLog` — not today's, not this week's, not a past one.
 * - No applied week is re-planned; no `plannedMinutes` on an existing block moves.
 * - Nothing retroactive. `defaultMinutes` is the number FUTURE plans read (via
 *   the planner's config load / `activityConfigsToRoutineText`). Hours already
 *   recorded are a child's school record — a forward-looking preference change
 *   must never restate history.
 *
 * Idempotent: re-writing the same number is a harmless no-op overwrite.
 */
export async function updateActivityConfigMinutes(
  familyId: string,
  activityConfigId: string,
  minutes: number,
): Promise<void> {
  const ref = doc(activityConfigsCollection(familyId), activityConfigId)
  await updateDoc(ref, {
    defaultMinutes: minutes,
    updatedAt: new Date().toISOString(),
  })
}
