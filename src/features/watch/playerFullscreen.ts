/**
 * App-owned fullscreen for the Watch player (FEAT-102, folds into slice 3).
 *
 * YouTube's OWN fullscreen stays disabled (`fs=0`) — it puts the iframe in the
 * browser's top layer, ABOVE our end-stop overlay, which would defeat the C1
 * end-stop (FEAT-101). Instead the app drives fullscreen on the **player frame**
 * element (the wrapper around both the iframe host AND the completion overlay),
 * so the overlay still renders above the video in fullscreen and the end-stop
 * holds.
 *
 * Thin, guarded wrappers over the standard Fullscreen API so the component code
 * stays clean and the DOM-API branches are unit-testable. Best-effort
 * throughout: fullscreen can reject (no user gesture, unsupported surface — e.g.
 * iOS Safari doesn't fullscreen arbitrary elements) and that is never fatal.
 */

/** True iff the standard element Fullscreen API is available. */
export function fullscreenSupported(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof Element !== 'undefined' &&
    typeof Element.prototype.requestFullscreen === 'function'
  )
}

/** The element currently presented fullscreen, or null. */
export function currentFullscreenElement(): Element | null {
  return typeof document !== 'undefined' ? document.fullscreenElement : null
}

/** Request fullscreen on `el` (best-effort — a rejection is swallowed). */
export function requestFrameFullscreen(el: HTMLElement): void {
  const req = el.requestFullscreen
  if (typeof req !== 'function') return
  try {
    const result = req.call(el)
    if (result && typeof result.catch === 'function') result.catch(() => {})
  } catch {
    // requestFullscreen can throw/reject without a user gesture — non-fatal.
  }
}

/** Exit fullscreen if anything is currently fullscreen (best-effort). */
export function exitFullscreenIfActive(): void {
  if (typeof document === 'undefined' || !document.fullscreenElement) return
  const exit = document.exitFullscreen
  if (typeof exit !== 'function') return
  try {
    const result = exit.call(document)
    if (result && typeof result.catch === 'function') result.catch(() => {})
  } catch {
    // Best-effort teardown.
  }
}
