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
