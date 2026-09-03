import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useArtQuota } from '../business/useArtQuota'
import type { UseArtQuotaResult } from '../business/useArtQuota'

/**
 * The Stickers surface's answer to "is there budget for another image?" (FEAT-165).
 *
 * Every control on the Stickers page that spends a paid image call — "Create!",
 * "Add version", "Make more versions", and "Make it fancy" in the From a
 * Drawing flow (FEAT-166) — asks this **once, here**, and the page hands the
 * answer down to the four doors. It is a thin wrapper over the
 * existing FEAT-94 `useArtQuota`, deliberately **not** a second allowance: the
 * counter is the same per-child, per-week doc the Kit Builder writes
 * (`artQuota/{childId}-wk-{weekStart}`), so a kid's number is the honest
 * total of what they spent on art that week across both surfaces (owner
 * decision, 2026-08-29; the window went daily → weekly in FEAT-175). The cap
 * default stays `DEFAULT_WEEKLY_ART_QUOTA`.
 *
 * **Capability, never name.** A capped actor is one acting as a kid profile
 * (`isChildProfile`) — the same class of check as Kit Builder's `capped =
 * !canEdit`. A parent is uncapped, never subscribes to the doc, and
 * `recordGeneration` is a no-op for them. Nothing here reads `isLincoln`, a
 * child's name, or any profile string.
 *
 * Fails open by construction: with no resolved child the underlying hook stays
 * inactive, so `atLimit` is false and a kid's drawing is never blocked by a
 * counter we could not read.
 *
 * **The counter binds to `activeChild`, not `activeChildId`** (Codex P2, PR
 * #1713). `useActiveChild` resolves a kid profile to their *own* child only
 * once `useChildren` has loaded the roster; until then it falls through to the
 * shared `selectedChildId`, which is seeded from localStorage and may still
 * hold the **sibling** a parent picked last on the same device. Reading the id
 * off the resolved `Child` means a capped actor passes `null` during that
 * window rather than a stranger's id — so a fast first tap can never test or
 * increment the wrong kid's budget. Null there fails open, which is the
 * correct direction for a courtesy cap.
 */
export function useStickerArtQuota(): UseArtQuotaResult {
  const { activeChild, isChildProfile } = useActiveChild()
  return useArtQuota(activeChild?.id ?? null, { capped: isChildProfile })
}

/**
 * Count one paid generation against the week's counter, without ever letting the
 * counting break the art (FEAT-165).
 *
 * The four sticker doors call this instead of awaiting `recordGeneration`
 * directly: the sticker is already generated and saved by the time we count, so
 * a failed counter write must not surface as "something went wrong" on a flow
 * that in fact succeeded. Under-counting is the safe direction (FEAT-94's
 * fail-open rule); the failure is logged, not shown. A no-op when the caller
 * passes nothing (an uncapped surface, e.g. the parent-only Settings tab).
 *
 * **Fire-and-forget by construction, not by convention (FEAT-167).** This
 * returns `void`, synchronously, and never a promise — so a door *cannot*
 * accidentally wait on the counter, however it is written. That is the whole
 * point: swallowing a rejection is not enough, because nothing can bound a
 * promise that never *settles*, and a Firestore write resolves only on server
 * ack — offline it stays pending indefinitely rather than failing. Awaited
 * (FEAT-165's shape, fixed in one door by FEAT-166 and in the other three by
 * FEAT-167), that left the door's `finally` unreachable: the busy flag never
 * cleared, the picker never closed, the list never refreshed — on top of an
 * image the kid had already generated, paid for and saved. A real success
 * dressed as a hang. Returning `void` removes the hazard rather than asking
 * four call sites to remember `void`; a stray `await` here waits one microtask
 * and nothing more.
 *
 * Both failure shapes are still caught and logged, exactly as before: a
 * rejected promise (the `.catch`) and a recorder that throws synchronously
 * (the `try`).
 */
export function recordStickerArtGeneration(recordGeneration?: () => Promise<void>): void {
  if (!recordGeneration) return
  try {
    // `Promise.resolve` so a recorder that returns nothing is still handled.
    void Promise.resolve(recordGeneration()).catch(logCounterFailure)
  } catch (err) {
    logCounterFailure(err)
  }
}

function logCounterFailure(err: unknown): void {
  console.error('[StickerArtQuota] Could not record a generation (failing open):', err)
}
