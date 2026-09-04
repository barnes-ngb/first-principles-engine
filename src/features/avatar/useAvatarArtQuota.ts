import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useArtQuota } from '../business/useArtQuota'
import type { UseArtQuotaResult } from '../business/useArtQuota'

/**
 * The Hero Hub photo panel's answer to "is there budget for another read?"
 * (FEAT-184 — audit #7).
 *
 * "Transform!" sends a photo to the picture model once (`extractFeatures`) and
 * reads back the traits the 3D character wears. It makes no picture, but it is
 * the same paid image call as a sticker, and it sat on the one surface built
 * *for* London with no cap, no hint and no confirm. A thin wrapper over the
 * FEAT-94 `useArtQuota`, deliberately **not** a second allowance: the same
 * per-child, per-week doc every other art surface writes, so one read counts
 * one against the week's honest total.
 *
 * **Capability, never name.** A capped actor is one acting as a kid profile
 * (`isChildProfile`); a parent is uncapped and `recordGeneration` is a no-op.
 * Fails open with no resolved child, and binds to `activeChild` rather than
 * `activeChildId` for the reason the sibling wrappers do (Codex P2, PR #1713).
 */
export function useAvatarArtQuota(): UseArtQuotaResult {
  const { activeChild, isChildProfile } = useActiveChild()
  return useArtQuota(activeChild?.id ?? null, { capped: isChildProfile })
}

/**
 * Count one paid read against the week's counter (FEAT-184). The same
 * function the sticker, book and workshop doors call — `void`, synchronous,
 * fire-and-forget by construction (FEAT-167), so the hero never waits on the
 * counter for a look it already has.
 */
export { recordStickerArtGeneration as recordAvatarArtGeneration } from '../books/useStickerArtQuota'
