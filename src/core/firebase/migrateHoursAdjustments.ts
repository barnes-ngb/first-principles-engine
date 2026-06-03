import { getDocs, writeBatch } from 'firebase/firestore'

import { db, hoursAdjustmentsCollection } from './firestore'

// Firestore caps a write batch at 500 ops.
const BATCH_LIMIT = 500

/**
 * DATA-09 — one-time, idempotent, hours-neutral migration.
 *
 * Any existing `hoursAdjustments` doc with no `childId` is set to `'both'`.
 * Before DATA-09 the read filters folded unattributed (`!childId`) adjustments
 * into EVERY child's totals (the DATA-05 leak). The read filter is now explicit
 * (`childId === child || childId === 'both'`), so stamping the legacy
 * unattributed docs as `'both'` PRESERVES their prior count-for-both behavior —
 * no child's computed core/total hours changes.
 *
 * Only touches docs missing a `childId`; after one run there are none, so
 * re-running is a no-op (a single collection read, no writes).
 *
 * @returns the number of docs migrated (0 when nothing needed fixing).
 */
export async function migrateUnattributedAdjustments(
  familyId: string,
): Promise<number> {
  const snap = await getDocs(hoursAdjustmentsCollection(familyId))
  const unattributed = snap.docs.filter((d) => !d.data().childId)
  if (unattributed.length === 0) return 0

  for (let i = 0; i < unattributed.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const d of unattributed.slice(i, i + BATCH_LIMIT)) {
      batch.update(d.ref, { childId: 'both' })
    }
    await batch.commit()
  }

  console.log(
    `[DATA-09] Migrated ${unattributed.length} unattributed hours adjustment(s) to 'both' (hours-neutral)`,
  )
  return unattributed.length
}
