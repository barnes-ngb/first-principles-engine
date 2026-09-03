import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useArtQuota } from '../business/useArtQuota'
import type { UseArtQuotaResult } from '../business/useArtQuota'

/**
 * The Game Workshop's answer to "is there budget for this game's pictures?"
 * (FEAT-184 — audit #6, UX-100's residual).
 *
 * The mirror of `useStickerArtQuota` / `useBookArtQuota`, for what the 2026-09
 * London audit called *the largest uncapped paid surface a kid can reach*: a
 * board game spends up to nine image calls, an adventure up to eleven, a card
 * game up to fifteen — all behind one "Create My Game!" tap, and before this
 * with no cap, no hint and no confirm. A thin wrapper over the FEAT-94
 * `useArtQuota`, deliberately **not** a second allowance: the same per-child,
 * per-week doc (`artQuota/{childId}-wk-{weekStart}`) the Kit Builder, the
 * Stickers page and the Book Editor write, so a kid's number stays the honest
 * total of what they spent on art that week across every surface.
 *
 * **Capability, never name.** A capped actor is one acting as a kid profile
 * (`isChildProfile`). A parent is uncapped, never subscribes to the doc, and
 * `recordGeneration` is a no-op for them. Nothing here reads `isLincoln`, a
 * child's name, or any profile string.
 *
 * Fails open by construction: with no resolved child the underlying hook stays
 * inactive, so `atLimit` is false and a kid's game is never blocked by a
 * counter we could not read. **The counter binds to `activeChild`, not
 * `activeChildId`** — the same reason the two sibling wrappers do (Codex P2,
 * PR #1713): until `useChildren` has loaded, a kid profile's `activeChildId`
 * can still hold the sibling a parent picked last on this device.
 *
 * **The three writing calls are not art.** `TaskType.Workshop` writes the game,
 * the adventure tree and the card list; those are LLM text calls, not image
 * calls, and this counter does not see them (owner decision, 2026-09-03).
 */
export function useWorkshopArtQuota(): UseArtQuotaResult {
  const { activeChild, isChildProfile } = useActiveChild()
  return useArtQuota(activeChild?.id ?? null, { capped: isChildProfile })
}

/**
 * A game's pictures are a batch, and a batch is reserved whole before any of it
 * is spent (the FEAT-168 shape): if the week's budget cannot cover every
 * picture the game will make, none is made — the game is still created, with
 * no art, and "Regenerate Art" in My Games can make the set later. A board
 * with a background and no cards is a worse outcome than a board with none.
 * Uncapped actors read `Infinity` here, so this is a no-op for a parent.
 *
 * Pure and exported so the rule is testable without React.
 */
export function canReserveWorkshopArt(count: number, remaining: number): boolean {
  const n = Math.max(0, Math.floor(count))
  return n <= remaining
}

/**
 * Count one paid generation against the week's counter (FEAT-184).
 *
 * The same function the sticker and book doors call, under a surface-neutral
 * name — not a second helper. It returns `void`, synchronously, and never a
 * promise (FEAT-167's contract): a Firestore write resolves only on server
 * ack, so awaited offline it never settles, and a game's art loop must never
 * wait on the counter for pictures it has already made and paid for.
 */
export { recordStickerArtGeneration as recordWorkshopArtGeneration } from '../books/useStickerArtQuota'
