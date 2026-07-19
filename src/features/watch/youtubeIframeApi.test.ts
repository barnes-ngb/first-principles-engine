import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  IFRAME_API_SRC,
  __resetYouTubeIframeApiForTests,
  loadYouTubeIframeApi,
  type YTNamespace,
} from './youtubeIframeApi'

/** A minimal `YT` namespace good enough for the loader to resolve. */
function fakeYT(): YTNamespace {
  return {
    Player: function () {} as unknown as YTNamespace['Player'],
    PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  }
}

function scriptTags(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>(`script[src="${IFRAME_API_SRC}"]`),
  )
}

beforeEach(() => {
  __resetYouTubeIframeApiForTests()
  scriptTags().forEach((s) => s.remove())
  delete window.YT
  delete window.onYouTubeIframeAPIReady
})

afterEach(() => {
  vi.useRealTimers()
})

describe('loadYouTubeIframeApi', () => {
  it('injects the API script exactly once across concurrent calls (StrictMode double-mount)', () => {
    void loadYouTubeIframeApi()
    void loadYouTubeIframeApi() // a second mount must not inject again
    expect(scriptTags()).toHaveLength(1)
  })

  it('resolves with YT once onYouTubeIframeAPIReady fires', async () => {
    const p = loadYouTubeIframeApi()
    expect(scriptTags()).toHaveLength(1)

    // Simulate the script loading + YouTube signaling readiness.
    window.YT = fakeYT()
    window.onYouTubeIframeAPIReady?.()

    await expect(p).resolves.toBe(window.YT)
  })

  it('returns the existing namespace immediately if YT is already present', async () => {
    window.YT = fakeYT()
    const p = loadYouTubeIframeApi()
    await expect(p).resolves.toBe(window.YT)
    // No injection needed when the API is already there.
    expect(scriptTags()).toHaveLength(0)
  })

  it('rejects with a named error when the script fails to load (never blank)', async () => {
    const p = loadYouTubeIframeApi()
    const tag = scriptTags()[0]
    tag.onerror?.(new Event('error'))
    await expect(p).rejects.toThrow(/failed to load/i)
  })

  it('rejects with a named error when the API never becomes ready (timeout guard)', async () => {
    vi.useFakeTimers()
    const p = loadYouTubeIframeApi(5_000)
    const assertion = expect(p).rejects.toThrow(/took too long/i)
    await vi.advanceTimersByTimeAsync(5_000)
    await assertion
  })

  it('does not clobber a prior onYouTubeIframeAPIReady handler', async () => {
    const prior = vi.fn()
    window.onYouTubeIframeAPIReady = prior

    const p = loadYouTubeIframeApi()
    window.YT = fakeYT()
    window.onYouTubeIframeAPIReady?.()

    await expect(p).resolves.toBe(window.YT)
    expect(prior).toHaveBeenCalledTimes(1) // chained, not replaced
  })
})
