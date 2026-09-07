import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useArtQuota } from '../business/useArtQuota'
import type { UseArtQuotaResult } from '../business/useArtQuota'

/**
 * Ask AI's answer to "is there budget for another image?" (UX-189).
 *
 * The **sixth** surface on FEAT-175's one counter, and deliberately not a second
 * allowance: the same per-child, per-week document
 * (`artQuota/{childId}-wk-{weekStart}`) the Kit Builder, the Stickers page, the
 * Book Editor, the Game Workshop and the Hero Hub photo panel all write. A
 * child's number stays the honest total of what they spent on art that week
 * across every surface — which, before this, it was not, because the chat's
 * image door was the one paid generator outside the accounting entirely.
 *
 * A byte-for-byte copy of `useStickerArtQuota`'s shape, including the reason it
 * binds to `activeChild` rather than `activeChildId` (Codex P2, PR #1713):
 * `useActiveChild` resolves a kid profile to their own child only once the
 * roster has loaded, and until then falls through to the shared
 * `selectedChildId`, which is seeded from localStorage and may still hold the
 * SIBLING a parent picked last on the same device. Reading the id off the
 * resolved `Child` means a capped actor passes `null` during that window rather
 * than a stranger's id, so a fast first tap can never test or increment the
 * wrong kid's budget. Null there fails open, the correct direction for a
 * courtesy cap.
 *
 * **Capability, never name.** A capped actor is one acting as a kid profile.
 * Parents are uncapped, never subscribe to the doc, and `recordGeneration` is a
 * no-op for them — which is why the counter and the UX-189 capability gate are
 * two separate rails rather than one: the gate is what refuses a child, and this
 * is what keeps the number honest if the gate is ever relaxed.
 */
export function useChatArtQuota(): UseArtQuotaResult {
  const { activeChild, isChildProfile } = useActiveChild()
  return useArtQuota(activeChild?.id ?? null, { capped: isChildProfile })
}

/**
 * Count one paid generation, without ever letting the counting break the chat.
 *
 * The same fire-and-forget writer the four sticker doors call, re-exported
 * rather than re-implemented (FEAT-167): it returns `void` synchronously and
 * never a promise, so this door *cannot* accidentally wait on a Firestore write
 * that, offline, never settles. Under-counting is the safe direction.
 */
export { recordStickerArtGeneration as recordChatArtGeneration } from '../books/useStickerArtQuota'
