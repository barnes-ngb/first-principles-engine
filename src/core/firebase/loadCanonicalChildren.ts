/**
 * **The children a diagnostic should iterate** — `UX-394`.
 *
 * Every screen in the app reads its children through `useChildren`, which
 * applies `dedupeChildrenByName`: the oldest document per lowercased name, so
 * the duplicate Lincoln/London documents an earlier auto-create race produced
 * never reach a person. The one-shot surveys and backfills on the Dev tab did
 * not — each called `getDocs(childrenCollection(familyId))` and looped the raw
 * result, so the `UX-383` restore survey printed about twenty rows named
 * Lincoln and London against two real boys, and a backfill would happily have
 * written a `skillSnapshots` document under a ghost id, turning an inert stray
 * into one with records under it.
 *
 * So there is one read, and it applies the app's own rule. It is deliberately
 * the **same function** `useChildren` applies rather than a second copy of the
 * comparison: a diagnostic that disagrees with the app about which document is
 * the child is worse than no diagnostic.
 *
 * It narrows *which documents are looped*. It changes no number, no fold and no
 * record: a child the app shows is looped exactly as before.
 */

import { getDocs } from 'firebase/firestore'

import { childrenCollection } from './firestore'
import { dedupeChildrenByName } from '../hooks/useChildren'

/** The fields a survey or backfill needs off a `children` document. */
export interface CanonicalChildRow {
  id: string
  name: string
  createdAt?: string
}

/**
 * Load the family's children the way the app does — one document per name,
 * the oldest kept, so the id stays the one every other collection keys on.
 */
export async function loadCanonicalChildren(
  familyId: string,
): Promise<CanonicalChildRow[]> {
  const snap = await getDocs(childrenCollection(familyId))
  const rows: CanonicalChildRow[] = snap.docs.map((d) => {
    const data = d.data() as { name?: string; createdAt?: string }
    return { id: d.id, name: data.name ?? d.id, createdAt: data.createdAt }
  })
  return dedupeChildrenByName(rows)
}
