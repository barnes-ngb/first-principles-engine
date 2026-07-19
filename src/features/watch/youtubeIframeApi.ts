import { useEffect, useState } from 'react'

/**
 * YouTube IFrame Player API loader (Watch Vehicle slice 2, design FEAT-86 §4/D2).
 *
 * The Watch Vehicle's safety-critical end-stop — "video ends → stop, load
 * nothing" — is only possible via the IFrame **Player API** (`onStateChange` +
 * `stopVideo`); a bare cross-origin `<iframe>` cannot observe state or stop the
 * player (D2). So this module loads YouTube's `iframe_api` script exactly once
 * and hands the `YT` namespace back through a promise.
 *
 * The script is `https://www.youtube.com/iframe_api` (a `script-src` concern);
 * the net-new CSP is `frame-src`-only, so this load is unaffected. The player
 * itself is forced onto `https://www.youtube-nocookie.com` at construction.
 *
 * StrictMode-safe: React 19 double-mounts effects, so the loader is a module
 * singleton (one shared promise) guarded by an existing-`<script>` check — two
 * mounts never inject the script twice.
 */

// ── Minimal typings for the parts of the API we use ─────────────────────────
// We deliberately hand-roll these (no `@types/youtube` dependency) — only the
// player surface the end-stop touches is modeled.

export interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  loadVideoById(videoId: string): void
  destroy(): void
  getPlayerState?(): number
}

export interface YTPlayerEvent {
  target: YTPlayer
  data: number
}

export interface YTPlayerOptions {
  /** Force the nocookie host — the safety default (§4). */
  host?: string
  videoId?: string
  width?: string | number
  height?: string | number
  playerVars?: Record<string, string | number>
  events?: {
    onReady?: (event: YTPlayerEvent) => void
    onStateChange?: (event: YTPlayerEvent) => void
    onError?: (event: YTPlayerEvent) => void
  }
}

export interface YTPlayerConstructor {
  new (element: HTMLElement | string, options: YTPlayerOptions): YTPlayer
}

export interface YTNamespace {
  Player: YTPlayerConstructor
  PlayerState: {
    UNSTARTED: number
    ENDED: number
    PLAYING: number
    PAUSED: number
    BUFFERING: number
    CUED: number
  }
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

export const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api'
/** Guard against a wedged network — surfaces a named error, never a blank screen. */
export const IFRAME_API_LOAD_TIMEOUT_MS = 10_000

/** The single in-flight (or resolved) load promise. Null until first requested. */
let apiPromise: Promise<YTNamespace> | null = null

function apiReady(): YTNamespace | null {
  return typeof window !== 'undefined' && window.YT && window.YT.Player ? window.YT : null
}

/**
 * Load the YouTube IFrame Player API, resolving with the `YT` namespace.
 * Idempotent: repeated calls share one promise and inject at most one script.
 */
export function loadYouTubeIframeApi(
  timeoutMs: number = IFRAME_API_LOAD_TIMEOUT_MS,
): Promise<YTNamespace> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('The video player is unavailable here.'))
  }

  const alreadyReady = apiReady()
  if (alreadyReady) return Promise.resolve(alreadyReady)
  if (apiPromise) return apiPromise

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    let settled = false

    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      // Allow a later retry after a timeout.
      apiPromise = null
      reject(new Error('The video player took too long to load.'))
    }, timeoutMs)

    const finish = () => {
      const yt = apiReady()
      if (settled || !yt) return
      settled = true
      window.clearTimeout(timer)
      resolve(yt)
    }

    // YouTube invokes this global once the API is ready. Chain any prior handler
    // so we never clobber another consumer that set it first.
    const prior = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prior?.()
      finish()
    }

    // Script may already be present + parsed (cached / a prior mount).
    if (apiReady()) {
      finish()
      return
    }

    // Inject exactly once — the existing-tag check is the StrictMode belt to the
    // singleton-promise suspenders above.
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${IFRAME_API_SRC}"]`,
    )
    if (!existing) {
      const script = document.createElement('script')
      script.src = IFRAME_API_SRC
      script.async = true
      script.onerror = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        apiPromise = null
        // Remove the failed tag so a retry re-injects — otherwise the
        // existing-tag guard would skip injection and the next attempt would
        // only ever hit the timeout (no recovery without a page reload).
        script.remove()
        reject(new Error('The video player failed to load.'))
      }
      document.head.appendChild(script)
    }
  })

  return apiPromise
}

/** Test-only: drop the singleton so each case starts from a clean slate. */
export function __resetYouTubeIframeApiForTests(): void {
  apiPromise = null
}

export type IframeApiStatus = 'loading' | 'ready' | 'error'

export interface UseYouTubeIframeApiResult {
  status: IframeApiStatus
  yt: YTNamespace | null
  /** A named, human-facing reason when `status === 'error'` (never blank). */
  error: string | null
}

/**
 * Subscribe a component to the shared API load. Returns `ready` with the `YT`
 * namespace, `loading` while the script arrives, or `error` (with a named
 * message) on timeout / load failure.
 */
export function useYouTubeIframeApi(): UseYouTubeIframeApiResult {
  const [state, setState] = useState<UseYouTubeIframeApiResult>(() => {
    const yt = apiReady()
    return yt
      ? { status: 'ready', yt, error: null }
      : { status: 'loading', yt: null, error: null }
  })

  useEffect(() => {
    let active = true
    // The initializer already reflects an already-ready API. The loader resolves
    // immediately when `YT` is present, so we route every case through it (an
    // async `.then`, never a synchronous setState in the effect body).
    loadYouTubeIframeApi()
      .then((yt) => {
        if (active) setState({ status: 'ready', yt, error: null })
      })
      .catch((err: unknown) => {
        if (active) {
          setState({
            status: 'error',
            yt: null,
            error: err instanceof Error ? err.message : 'The video player failed to load.',
          })
        }
      })
    return () => {
      active = false
    }
  }, [])

  return state
}
