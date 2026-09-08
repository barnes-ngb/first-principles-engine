// ── Who may spend a paid image call from Ask AI, and what they read (UX-189) ──
//
// Two absences compounding, and the audit measured both. The image `IconButton`
// and all six handlers carried **no capability check**, on a route that is
// nav-gated only — `ShellyChatPage` computes `isParent` and threads it into six
// other things, and this was not one of them. And
// `grep -rn "artQuota|useArtQuota|recordGeneration" src/features/shelly-chat/`
// returned **zero matches**, so this was the one paid generator in the app
// standing outside FEAT-175's "one counter, five surfaces" accounting.
//
// For a parent, the missing quota is correct and by design: every host passes
// `{ capped: isChildProfile }` and parent doors are uncapped. It is the two
// together that mattered — a child at `/chat` reached a `gpt-image-1.5` call
// that was neither refused nor counted, so the number FEAT-175 describes as
// "the honest total of what they spent on art that week across every surface"
// was not.
//
// This module holds the words. The gate and the meter are wired in
// `useShellyChatFlows`, at the ONE funnel every path already runs through
// (`handleGenerateImageDirect`), so a seventh path added later inherits both.

/**
 * What a child reads instead of a generated picture.
 *
 * **A refusal offers a way forward, never a wall** (FEAT-195's rule, and the
 * charter's no-shame one). It names a real place — the Stickers page and the
 * Book Editor are the app's own kid art doors, both metered by this same weekly
 * counter — rather than saying no and stopping. It does not say "you are not
 * allowed"; Ask AI is simply a grown-up's screen, which is already true of the
 * nav.
 *
 * Kid voice, held to the shared readability bar (`src/test/kidReadability.ts`):
 * short lines, nothing over two syllables by the proxy. This is the boys'
 * surface when they reach it, so it is written for London, not for Shelly.
 */
export const CHAT_IMAGE_KID_NOTICE = [
  'Making pictures here is a grown-up job.',
  'Make your own on the Stickers page.',
  'You can make some in a book too.',
].join(' ')

/**
 * What a capped child reads at the weekly cap.
 *
 * Deliberately re-exported from the ONE place that owns it rather than reworded
 * here: a second phrasing of the cap is a second cap as far as a reader is
 * concerned, and FEAT-175's message is already non-shaming by construction.
 */
export { ART_QUOTA_MESSAGE } from '../business/useArtQuota'

/**
 * May this profile spend a paid image call from Ask AI?
 *
 * `isParent` is a required argument rather than an ambient assumption, the same
 * shape as `resolveRecordWriteAction` (UX-188) and `resolveCurriculumAction`
 * (FEAT-135). **Fails closed** — an unwired caller refuses.
 *
 * `atLimit` comes from the shared `useArtQuota`, which is false for an uncapped
 * (parent) actor by construction, so the cap branch is unreachable for a parent
 * without this module knowing anything about who is capped.
 */
export type ChatImageGate =
  | { ok: true }
  | { ok: false; reason: 'not-permitted' | 'at-limit'; notice: string }

export function resolveChatImageGate(
  isParent: boolean,
  atLimit: boolean,
  quotaMessage: string,
): ChatImageGate {
  if (!isParent) {
    return { ok: false, reason: 'not-permitted', notice: CHAT_IMAGE_KID_NOTICE }
  }
  if (atLimit) return { ok: false, reason: 'at-limit', notice: quotaMessage }
  return { ok: true }
}
