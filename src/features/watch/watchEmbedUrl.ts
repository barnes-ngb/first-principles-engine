/**
 * The locked embed URL + iframe hardening for the Watch Vehicle player
 * (FEAT-130 containment pass over the FEAT-101/102 player).
 *
 * Kept pure and separate from the component so the safety-critical string —
 * "which host, which params, which sandbox tokens" — is asserted directly rather
 * than inferred from a `playerVars` object we hand to a third-party constructor.
 *
 * ## Why we build the URL ourselves
 *
 * The IFrame Player API will happily create its own `<iframe>` when handed a
 * `<div>` — which is what the player did through FEAT-102 — but it gives us **no
 * hook to set attributes on the iframe it creates**, and the attribute we need is
 * `sandbox`. So we create the iframe, set `src` from here, and hand the API the
 * finished element (a documented Player-API path: an existing iframe whose `src`
 * carries `enablejsapi=1`). The API still drives the end-stop; it just no longer
 * owns the element.
 *
 * ## What the sandbox actually buys
 *
 * Every YouTube-chrome click-out — the logo in the control bar, the title and
 * channel avatar in the top overlay, the share menu, "Watch on YouTube" — is a
 * `target="_blank"` / `window.open` popup. Omitting `allow-popups` blocks all of
 * them; omitting `allow-top-navigation*` stops the frame from navigating *our*
 * page to YouTube. That is the difference between "we don't render a link out"
 * (already true) and "there is no link out" (this change).
 *
 * `allow-scripts` + `allow-same-origin` together are normally the combination to
 * avoid — but that warning is about **same-origin** framed content, which can
 * reach up and strip its own `sandbox` attribute off the parent DOM. This frame
 * is cross-origin (`youtube-nocookie.com`), so it cannot touch our document, and
 * both tokens are load-bearing: the player is JavaScript, and the JS API's
 * postMessage handshake is origin-targeted, so an opaque origin would break it.
 */

export const WATCH_EMBED_HOST = 'https://www.youtube-nocookie.com'

/**
 * Locked player params. Ordered as they appear in the rendered `src`.
 *
 * `controls=1` is deliberate and not merely the default: `controls=0` would hide
 * the YouTube logo along with the whole control bar, but it would also take away
 * pause and the scrub bar from a 6- and a 10-year-old. The sandbox neutralises
 * the logo, so the kids keep their controls.
 */
export const WATCH_EMBED_PARAMS: Readonly<Record<string, string>> = {
  enablejsapi: '1', // required for the API to attach to an iframe we made
  autoplay: '0', // nothing plays until the kid presses play (T2)
  rel: '0', // narrows suggestions to the same channel — see the caveat below
  modestbranding: '1', // legacy no-op since 2023, kept as declared intent
  iv_load_policy: '3', // no video annotations
  playsinline: '1', // play inline on iOS, never fullscreen-hijack
  disablekb: '0', // keyboard controls remain (accessibility)
  fs: '0', // no YouTube fullscreen — it would lift the frame above our end-stop
  controls: '1', // keep play/pause/scrub (see note above)
}

/**
 * Sandbox tokens for the player iframe.
 *
 * Deliberately **absent**: `allow-popups` (kills every click-out to YouTube),
 * `allow-top-navigation` and `allow-top-navigation-by-user-activation` (kills
 * navigating the app itself away), `allow-forms`, `allow-modals`,
 * `allow-downloads`.
 */
export const WATCH_IFRAME_SANDBOX = 'allow-scripts allow-same-origin'

/**
 * Minimal Permissions-Policy delegation. `encrypted-media` is the one capability
 * some YouTube content genuinely needs to play. Notably omitted: `web-share`
 * (the share sheet is an exit), `autoplay`, `picture-in-picture`, `fullscreen`.
 */
export const WATCH_IFRAME_ALLOW = 'encrypted-media'

/**
 * Build the nocookie embed URL for a vetted video.
 *
 * @param youtubeId - The validated id (the library never stores a free-form URL).
 * @param origin - The parent page origin, passed through as YouTube's `origin`
 *   param so the JS API handshake is bound to our page. Omitted when unknown
 *   (e.g. a non-browser render) rather than guessed.
 */
export function buildWatchEmbedUrl(youtubeId: string, origin?: string | null): string {
  const params = new URLSearchParams(WATCH_EMBED_PARAMS)
  if (origin) params.set('origin', origin)
  return `${WATCH_EMBED_HOST}/embed/${encodeURIComponent(youtubeId)}?${params.toString()}`
}

/** The current page origin, or `null` outside a browser. */
export function currentOrigin(): string | null {
  return typeof window === 'undefined' ? null : (window.location?.origin ?? null)
}
