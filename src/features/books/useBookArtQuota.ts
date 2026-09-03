import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useArtQuota } from '../business/useArtQuota'
import type { UseArtQuotaResult } from '../business/useArtQuota'

/**
 * The Book Editor's answer to "is there budget for another image?" (FEAT-168).
 *
 * The mirror of {@link useStickerArtQuota}, for the other kid-reachable surface
 * that spends paid image calls: the page-illustration generator, the reimagine
 * flow, the in-editor sticker picker, and the illustrate-the-whole-book loop.
 * It is a thin wrapper over the FEAT-94 `useArtQuota`, deliberately **not** a
 * second allowance — the same per-child, per-week doc
 * (`artQuota/{childId}-wk-{weekStart}`) the Kit Builder and the Stickers page
 * write, so a kid's number stays the honest total of what they spent on
 * art that week across every surface (owner decision, 2026-08-29; the window
 * went daily → weekly in FEAT-175). The cap default stays
 * `DEFAULT_WEEKLY_ART_QUOTA`.
 *
 * **Capability, never name.** A capped actor is one acting as a kid profile
 * (`isChildProfile`). A parent is uncapped, never subscribes to the doc, and
 * `recordGeneration` is a no-op for them. Nothing here reads `isLincoln`, a
 * child's name, or any profile string.
 *
 * Fails open by construction: with no resolved child the underlying hook stays
 * inactive, so `atLimit` is false and a kid's book is never blocked by a
 * counter we could not read.
 *
 * **The counter binds to `activeChild`, not `activeChildId`** — the same reason
 * `useStickerArtQuota` does (Codex P2, PR #1713): until `useChildren` has
 * loaded, a kid profile's `activeChildId` can still hold the *sibling* a parent
 * picked last on this device. Reading the id off the resolved `Child` passes
 * `null` during that window instead of a stranger's id, and null fails open.
 */
export function useBookArtQuota(): UseArtQuotaResult {
  const { activeChild, isChildProfile } = useActiveChild()
  return useArtQuota(activeChild?.id ?? null, { capped: isChildProfile })
}

/**
 * Count one paid generation against the week's counter (FEAT-168).
 *
 * Deliberately **the same function** the four sticker doors call, re-exported
 * here under a surface-neutral name so a reader of the Book Editor isn't told
 * they are recording a "sticker" while illustrating page 7 of a book. Not a
 * second helper and not a copy: `recordBookArtGeneration` *is*
 * `recordStickerArtGeneration`.
 *
 * It returns `void`, synchronously, and never a promise — FEAT-167's contract.
 * A Firestore write resolves only on server ack, so awaited offline it never
 * settles; that wedged three sticker doors in production on art that had
 * already been generated and paid for. The book's generators must never wait on
 * the counter either, and returning `void` removes the hazard rather than
 * asking each new call site to remember a keyword.
 */
export { recordStickerArtGeneration as recordBookArtGeneration } from './useStickerArtQuota'
