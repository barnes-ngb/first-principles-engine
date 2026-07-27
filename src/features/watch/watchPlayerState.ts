/**
 * Pure end-stop + error-mapping logic for the Watch Vehicle player (slice 2).
 *
 * Kept out of the component so the safety-critical decisions — "is this the end?
 * then stop and load nothing" and "how do we name a playback failure" — are
 * unit-testable without the live IFrame API loaded.
 */

/**
 * YouTube `PlayerState` numeric codes (a stable YouTube contract). We keep our
 * own copy so the end-stop can be reasoned about without `window.YT`. An
 * `as const` object, not an `enum` (erasableSyntaxOnly).
 */
export const WATCH_PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const
export type WatchPlayerState = (typeof WATCH_PLAYER_STATE)[keyof typeof WATCH_PLAYER_STATE]

/**
 * The heart of the vehicle: `ENDED` is the only state that hands control back to
 * the app. Everything else (playing / paused / buffering / cued) is normal
 * playback the app leaves alone.
 */
export function isEndedState(state: number): boolean {
  return state === WATCH_PLAYER_STATE.ENDED
}

/**
 * The one containment hole a `sandbox` attribute cannot close (FEAT-130).
 *
 * Pausing a YouTube embed raises a grid of suggestions over the video. With
 * `rel=0` those are same-channel rather than the open recommendation feed, but
 * there is **no embed parameter that removes them**, and tapping one loads that
 * video *inside* the frame — an in-frame player action, not a popup or a top-level
 * navigation, so neither the sandbox nor the CSP sees it.
 *
 * What we can do is notice. Every state change re-reads the loaded id; if it is
 * no longer the video the parent planned, the app stops the player and covers the
 * frame — the same move the end-stop makes.
 *
 * Returns `false` when the id is unknown (an older API surface, a destroyed
 * player, a state change before metadata lands) — a guard that cannot read the id
 * must never claim drift, or it would interrupt correct playback.
 */
export function isForeignVideo(
  loadedId: string | null | undefined,
  plannedId: string | null | undefined,
): boolean {
  if (!loadedId || !plannedId) return false
  return loadedId !== plannedId
}

export interface WatchErrorMessage {
  /** Friendly, non-blaming — shown to the child. */
  kid: string
  /** Precise, parent-visible — the no-silent-failure detail. */
  detail: string
}

const KID_UNAVAILABLE =
  "That video isn't available right now — tell a grown-up so we can pick another."

/**
 * Map a YouTube `onError` data code to a kid-facing + parent-visible message.
 * Codes: 2 = bad id, 5 = HTML5 player error, 100 = removed/private,
 * 101/150 = embedding disabled by the owner.
 */
export function mapPlayerError(code: number): WatchErrorMessage {
  switch (code) {
    case 2:
      return { kid: KID_UNAVAILABLE, detail: `The video link looks wrong (code 2).` }
    case 5:
      return {
        kid: KID_UNAVAILABLE,
        detail: `This video can't play in the embedded player (code 5).`,
      }
    case 100:
      return {
        kid: KID_UNAVAILABLE,
        detail: `The video was removed or made private (code 100).`,
      }
    case 101:
    case 150:
      return {
        kid: KID_UNAVAILABLE,
        detail: `The owner doesn't allow this video to be embedded (code ${code}).`,
      }
    default:
      return { kid: KID_UNAVAILABLE, detail: `The video couldn't be played (code ${code}).` }
  }
}
