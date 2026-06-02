import { stripUndefined } from '../../core/firebase/firestore'
import type { XpLedgerSources } from '../../core/types'

/**
 * Zero-sources default — mirrors the fresh-doc default `addXpEvent` uses when no
 * cumulative xpLedger doc exists yet (`addXpEvent.ts`). Kept here so the admin
 * "Recalculate XP" path falls back identically rather than writing `undefined`.
 */
const ZERO_SOURCES: XpLedgerSources = { routines: 0, quests: 0, books: 0 }

/**
 * Build the cumulative `xpLedger/{childId}` doc payload for the admin
 * "Recalculate XP" action.
 *
 * This is the formerly-protected economy surface: it writes the cumulative XP
 * doc directly. The contract is **guard/strip undefined only** — it preserves
 * `childId` / `totalXp` / `sources` semantics exactly and never alters values:
 * - `sources` falls back to the same zero-default a fresh doc would get when the
 *   existing doc has no `sources` field (which would otherwise write `undefined`
 *   and be rejected by Firestore).
 * - `stripUndefined` removes any remaining undefined keys as belt-and-suspenders.
 *
 * Note: cumulative docs intentionally omit `dedupKey` (that field is per-event
 * only — see `addXpEvent.ts`), so it is not added here.
 */
export function buildRecalcLedgerDoc(
  childId: string,
  realTotal: number,
  existingSources: XpLedgerSources | undefined,
): Record<string, unknown> {
  return stripUndefined({
    childId,
    totalXp: realTotal,
    sources: existingSources ?? { ...ZERO_SOURCES },
    lastUpdatedAt: new Date().toISOString(),
  })
}
