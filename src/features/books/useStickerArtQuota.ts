import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useArtQuota } from '../business/useArtQuota'
import type { UseArtQuotaResult } from '../business/useArtQuota'

/**
 * The Stickers surface's answer to "is there budget for another image?" (FEAT-165).
 *
 * Every control on the Stickers page that spends a paid image call — "Create!",
 * "Add version", "Make more versions" — asks this **once, here**, and the page
 * hands the answer down to the three doors. It is a thin wrapper over the
 * existing FEAT-94 `useArtQuota`, deliberately **not** a second allowance: the
 * counter is the same per-child, per-day doc the Kit Builder writes
 * (`artQuota/{childId}-{YYYY-MM-DD}`), so a kid's daily number is the honest
 * total of what they spent on art that day across both surfaces (owner
 * decision, 2026-08-29). The cap default stays `DEFAULT_DAILY_ART_QUOTA`.
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
 */
export function useStickerArtQuota(): UseArtQuotaResult {
  const { activeChildId, isChildProfile } = useActiveChild()
  return useArtQuota(activeChildId || null, { capped: isChildProfile })
}

/**
 * Count one paid generation against the day's counter, without ever letting the
 * counting break the art (FEAT-165).
 *
 * The three sticker doors call this instead of awaiting `recordGeneration`
 * directly: the sticker is already generated and saved by the time we count, so
 * a failed counter write must not surface as "something went wrong" on a flow
 * that in fact succeeded. Under-counting is the safe direction (FEAT-94's
 * fail-open rule); the failure is logged, not shown. A no-op when the caller
 * passes nothing (an uncapped surface, e.g. the parent-only Settings tab).
 */
export async function recordStickerArtGeneration(
  recordGeneration?: () => Promise<void>,
): Promise<void> {
  if (!recordGeneration) return
  try {
    await recordGeneration()
  } catch (err) {
    console.error('[StickerArtQuota] Could not record a generation (failing open):', err)
  }
}
