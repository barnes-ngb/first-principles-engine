import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WatchVideo } from '../../core/types'
import type { YTNamespace, YTPlayerOptions } from './youtubeIframeApi'

interface FakePlayer {
  playVideo: ReturnType<typeof vi.fn>
  pauseVideo: ReturnType<typeof vi.fn>
  stopVideo: ReturnType<typeof vi.fn>
  loadVideoById: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  getVideoData: ReturnType<typeof vi.fn>
}

// ── Hoisted capture + write spies ───────────────────────────────────────────
const { capture, apiState, fsMock, addDocMock, setDocMock, updateDocMock } = vi.hoisted(() => ({
  capture: {
    options: null as YTPlayerOptions | null,
    player: null as FakePlayer | null,
    /** The element handed to `YT.Player` — FEAT-130 makes this our own iframe. */
    element: null as unknown,
  },
  apiState: {
    status: 'ready' as 'loading' | 'ready' | 'error',
    yt: null as YTNamespace | null,
    error: null as string | null,
  },
  fsMock: {
    fullscreenSupported: vi.fn(() => true),
    currentFullscreenElement: vi.fn((): Element | null => null),
    requestFrameFullscreen: vi.fn(),
    exitFullscreenIfActive: vi.fn(),
  },
  addDocMock: vi.fn(),
  setDocMock: vi.fn(),
  updateDocMock: vi.fn(),
}))

// Assert the player NEVER writes anything (no hours/artifact/concept/XP — D3/§8).
vi.mock('firebase/firestore', () => ({
  addDoc: addDocMock,
  setDoc: setDocMock,
  updateDoc: updateDocMock,
  doc: vi.fn(),
  collection: vi.fn(),
}))

vi.mock('./youtubeIframeApi', () => ({
  useYouTubeIframeApi: () => apiState,
}))

vi.mock('./playerFullscreen', () => ({
  fullscreenSupported: fsMock.fullscreenSupported,
  currentFullscreenElement: fsMock.currentFullscreenElement,
  requestFrameFullscreen: fsMock.requestFrameFullscreen,
  exitFullscreenIfActive: fsMock.exitFullscreenIfActive,
}))

import WatchPlayer from './WatchPlayer'

function makeFakePlayer(): FakePlayer {
  return {
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    stopVideo: vi.fn(),
    loadVideoById: vi.fn(),
    destroy: vi.fn(),
    // Default: the planned video is what's loaded (no drift).
    getVideoData: vi.fn(() => ({ video_id: VIDEO.youtubeId })),
  }
}

/** A fake `YT` whose Player constructor captures its element, options + instance. */
function fakeYT(): YTNamespace {
  return {
    Player: vi.fn(function (el: unknown, options: YTPlayerOptions) {
      capture.element = el
      capture.options = options
      const player = makeFakePlayer()
      capture.player = player
      return player
    }) as unknown as YTNamespace['Player'],
    PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  }
}

/** The player iframe the component built and handed to the API. */
function playerIframe(): HTMLIFrameElement {
  const el = capture.element as HTMLIFrameElement | null
  expect(el).toBeInstanceOf(HTMLIFrameElement)
  return el!
}

const VIDEO: WatchVideo = {
  id: 'w1',
  youtubeId: 'dQw4w9WgXcQ',
  title: 'How people first made cities',
  plannedMinutes: 12,
  subjectBucket: 'SocialStudies',
  childId: 'both',
  addedBy: 'parent',
  vettedAt: '2026-07-18T00:00:00.000Z',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
}

/** Drive the captured onStateChange with a YouTube state code. */
function emitState(data: number) {
  act(() => {
    capture.options?.events?.onStateChange?.({ target: capture.player!, data })
  })
}

beforeEach(() => {
  capture.options = null
  capture.player = null
  capture.element = null
  apiState.status = 'ready'
  apiState.yt = fakeYT()
  apiState.error = null
  fsMock.fullscreenSupported.mockReturnValue(true)
  fsMock.currentFullscreenElement.mockReturnValue(null)
  fsMock.requestFrameFullscreen.mockClear()
  fsMock.exitFullscreenIfActive.mockClear()
  addDocMock.mockClear()
  setDocMock.mockClear()
  updateDocMock.mockClear()
})

describe('WatchPlayer', () => {
  // FEAT-130: assert the ACTUAL rendered src, not the playerVars object we hand
  // a third-party constructor — the src is what the browser loads.
  it('mounts the player on the nocookie host with the locked, child-safe params', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)

    const url = new URL(playerIframe().src)
    expect(url.origin).toBe('https://www.youtube-nocookie.com')
    expect(url.pathname).toBe('/embed/dQw4w9WgXcQ')

    const p = url.searchParams
    expect(p.get('autoplay')).toBe('0')
    expect(p.get('rel')).toBe('0')
    expect(p.get('modestbranding')).toBe('1')
    expect(p.get('iv_load_policy')).toBe('3')
    expect(p.get('playsinline')).toBe('1')
    // fs=0: no fullscreen button — YouTube fullscreen would put the iframe above
    // the end-stop overlay and defeat it (Codex P1).
    expect(p.get('fs')).toBe('0')
    // Required for the API to attach to an iframe we built ourselves.
    expect(p.get('enablejsapi')).toBe('1')
    // Bind the JS API handshake to our page.
    expect(p.get('origin')).toBe(window.location.origin)
  })

  // ── FEAT-130 containment ──────────────────────────────────────────────────

  it('sandboxes the frame so no YouTube chrome can open a way out', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)
    const tokens = (playerIframe().getAttribute('sandbox') ?? '').split(/\s+/).filter(Boolean)

    // Load-bearing: the player is JS, and the JS API handshake is origin-targeted.
    expect(tokens).toContain('allow-scripts')
    expect(tokens).toContain('allow-same-origin')

    // The whole point. Every YouTube click-out (logo, title, channel avatar,
    // share, "Watch on YouTube") is a popup; top-navigation would take the app
    // itself to YouTube. Neither is granted.
    expect(tokens).not.toContain('allow-popups')
    expect(tokens).not.toContain('allow-popups-to-escape-sandbox')
    expect(tokens).not.toContain('allow-top-navigation')
    expect(tokens).not.toContain('allow-top-navigation-by-user-activation')
  })

  it('does not delegate fullscreen or the share sheet to the frame', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)
    const iframe = playerIframe()
    // No allowfullscreen: YouTube fullscreen would lift the frame above our overlay.
    expect(iframe.hasAttribute('allowfullscreen')).toBe(false)
    expect(iframe.getAttribute('allow') ?? '').not.toContain('web-share')
  })

  it('renders no click-out affordance of our own — the only link is the video', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)
    expect(document.querySelectorAll('a').length).toBe(0)
    expect(screen.queryByText(/watch on youtube/i)).not.toBeInTheDocument()
  })

  // THE DRIFT GUARD: the one hole sandbox can't close — a pause-screen
  // suggestion tap swaps the video *inside* the frame (no popup, no navigation).
  it('stops and covers the frame when a suggestion swaps in a different video', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)

    capture.player!.getVideoData.mockReturnValue({ video_id: 'someOtherId' })
    emitState(1) // PLAYING — but it's no longer the planned video

    expect(capture.player!.stopVideo).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/stick with the one we planned/i)).toBeInTheDocument()
    // Never "All done!" — a foreign video must not read as completion.
    expect(screen.queryByText(/all done/i)).not.toBeInTheDocument()
    expect(capture.player!.loadVideoById).not.toHaveBeenCalled()
  })

  it('a foreign video that ENDS does not complete the planned item', () => {
    const onComplete = vi.fn()
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} onComplete={onComplete} />)

    capture.player!.getVideoData.mockReturnValue({ video_id: 'someOtherId' })
    emitState(0) // ENDED — for the wrong video

    expect(screen.getByText(/stick with the one we planned/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mark it done/i })).not.toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('never claims drift when the loaded id cannot be read (no false interruption)', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)

    capture.player!.getVideoData.mockReturnValue(undefined)
    emitState(1) // PLAYING
    expect(screen.queryByText(/stick with the one we planned/i)).not.toBeInTheDocument()

    capture.player!.getVideoData.mockImplementation(() => {
      throw new Error('destroyed')
    })
    emitState(0) // ENDED — the end-stop must still run
    expect(screen.getByText(/all done/i)).toBeInTheDocument()
  })

  it('shows the PARENT-authored title, never the YouTube title (D4)', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)
    expect(screen.getByText('How people first made cities')).toBeInTheDocument()
  })

  it('THE END-STOP: on ENDED it stops the player, shows completion, and loads NOTHING', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)

    emitState(0) // ENDED

    expect(capture.player!.stopVideo).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/all done/i)).toBeInTheDocument()
    // The crux: nothing unplanned ever loads.
    expect(capture.player!.loadVideoById).not.toHaveBeenCalled()
  })

  it('leaves normal playback alone (PLAYING/PAUSED/BUFFERING do not stop or complete)', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)

    emitState(1) // PLAYING
    emitState(2) // PAUSED
    emitState(3) // BUFFERING

    expect(capture.player!.stopVideo).not.toHaveBeenCalled()
    expect(screen.queryByText(/all done/i)).not.toBeInTheDocument()
  })

  it('Done returns to where the child came from + leaves fullscreen (only forward action)', () => {
    const onDone = vi.fn()
    render(<WatchPlayer video={VIDEO} onDone={onDone} />)

    emitState(0)
    fsMock.exitFullscreenIfActive.mockClear() // ignore the ENDED-driven exit
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(fsMock.exitFullscreenIfActive).toHaveBeenCalled()
  })

  // FEAT-104: the PLANNED Today flow supplies onComplete + a note slot; the
  // LIBRARY practice flow supplies neither and therefore writes nothing.
  it('planned flow: the completion button fires onComplete (not onDone) and renders the note slot', () => {
    const onDone = vi.fn()
    const onComplete = vi.fn()
    render(
      <WatchPlayer
        video={VIDEO}
        onDone={onDone}
        onComplete={onComplete}
        doneLabel="Mark it done"
        completionExtra={<div>what we saw</div>}
      />,
    )
    emitState(0) // ENDED
    expect(screen.getByText('what we saw')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /mark it done/i }))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('footer copy reflects whether the session counts (Codex P2)', () => {
    const { rerender } = render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)
    // Library/practice: honest "doesn't count".
    expect(screen.getByText(/doesn't count hours/i)).toBeInTheDocument()
    // Planned Today: it DOES count on "Mark it done" — never the "doesn't count" copy.
    rerender(<WatchPlayer video={VIDEO} onDone={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.queryByText(/doesn't count hours/i)).not.toBeInTheDocument()
    expect(screen.getByText(/count your time/i)).toBeInTheDocument()
  })

  it('library flow (no onComplete): the player itself still writes NOTHING through completion', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)
    emitState(0) // ENDED
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }))
    // The player never touches Firestore — planned crediting lives in the shell.
    expect(addDocMock).not.toHaveBeenCalled()
    expect(setDocMock).not.toHaveBeenCalled()
    expect(updateDocMock).not.toHaveBeenCalled()
  })

  it('offers an app-owned "Make it big" fullscreen toggle (YouTube fs stays off)', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /make it big/i }))
    expect(fsMock.requestFrameFullscreen).toHaveBeenCalledTimes(1)
    // Requested on the frame element, not the bare iframe host.
    expect(fsMock.requestFrameFullscreen.mock.calls[0][0]).toBeInstanceOf(HTMLElement)
  })

  it('hides the fullscreen toggle when the Fullscreen API is unsupported', () => {
    fsMock.fullscreenSupported.mockReturnValue(false)
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /make it big/i })).not.toBeInTheDocument()
  })

  it('ENDED while fullscreen still shows the completion panel, exits, and loads NOTHING', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)

    // Go fullscreen (app-owned).
    fireEvent.click(screen.getByRole('button', { name: /make it big/i }))
    expect(fsMock.requestFrameFullscreen).toHaveBeenCalledTimes(1)

    emitState(0) // ENDED while fullscreen

    expect(capture.player!.stopVideo).toHaveBeenCalledTimes(1)
    expect(fsMock.exitFullscreenIfActive).toHaveBeenCalled() // left fullscreen on end
    expect(screen.getByText(/all done/i)).toBeInTheDocument() // completion still shows
    expect(capture.player!.loadVideoById).not.toHaveBeenCalled() // nothing unplanned loads
  })

  it('shows a friendly kid message + parent-visible detail for an unavailable video', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)

    act(() => {
      capture.options?.events?.onError?.({ target: capture.player!, data: 100 })
    })

    expect(screen.getByText(/tell a grown-up/i)).toBeInTheDocument()
    expect(screen.getByText(/removed or made private/i)).toBeInTheDocument()
  })

  it('shows a named error (never a blank screen) when the API script fails to load', () => {
    apiState.status = 'error'
    apiState.yt = null
    apiState.error = 'The video player failed to load.'
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)
    expect(screen.getByText(/player couldn't load/i)).toBeInTheDocument()
  })

  it('shows a loading state while the API arrives', () => {
    apiState.status = 'loading'
    apiState.yt = null
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)
    expect(screen.getByText(/getting the video ready/i)).toBeInTheDocument()
  })

  it('writes NOTHING — no hours, artifact, concept state, or XP (D3/§8)', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)
    emitState(1) // PLAYING
    emitState(0) // ENDED

    expect(addDocMock).not.toHaveBeenCalled()
    expect(setDocMock).not.toHaveBeenCalled()
    expect(updateDocMock).not.toHaveBeenCalled()
  })
})

/**
 * FEAT-132: the completion panel lives inside a fixed 16:9 frame. With
 * `completionExtra` present (the planned-Today "what we saw" note) its content
 * is taller than the frame — on a real device that clipped the heading off the
 * top and the action button off the bottom, leaving no way to finish. It must
 * scroll instead, WITHOUT weakening the end-stop: still opaque, still covering
 * the whole frame, still inside the frame so it stays above the video in
 * app-owned fullscreen.
 *
 * jsdom does no layout, so "not clipped" is asserted as the CSS contract that
 * makes overflowing content reachable, plus the cover invariants.
 */
describe('WatchPlayer — completion panel does not clip its content (FEAT-132)', () => {
  const panel = () => screen.getByTestId('watch-completion-panel')

  function renderPlannedAndEnd() {
    render(
      <WatchPlayer
        video={VIDEO}
        onDone={vi.fn()}
        onComplete={vi.fn()}
        doneLabel="Mark it done"
        completionExtra={<div>what we saw</div>}
      />,
    )
    emitState(0) // ENDED
  }

  it('scrolls its content rather than clipping it', () => {
    renderPlannedAndEnd()
    expect(getComputedStyle(panel()).overflowY).toBe('auto')
  })

  it('starts overflowing content at the top so the heading is reachable', () => {
    renderPlannedAndEnd()
    // A plain `center` would push the heading above the scroll origin, where it
    // can never be scrolled back into view.
    expect(getComputedStyle(panel()).justifyContent).toBe('safe center')
  })

  it('keeps the heading and the action button both in the panel', () => {
    renderPlannedAndEnd()
    expect(panel()).toContainElement(screen.getByText(/All done/))
    expect(panel()).toContainElement(screen.getByRole('button', { name: /mark it done/i }))
    expect(panel()).toContainElement(screen.getByText('what we saw'))
  })

  it('still covers the whole frame, opaquely, above the video', () => {
    renderPlannedAndEnd()
    const style = getComputedStyle(panel())
    expect(style.position).toBe('absolute')
    expect(style.inset).toBe('0')
    expect(style.zIndex).toBe('3')
    expect(style.backgroundColor).not.toBe('')
    expect(style.backgroundColor).not.toBe('transparent')
  })

  it('stays INSIDE the fullscreen frame — outside it would fall below YouTube', () => {
    renderPlannedAndEnd()
    // The frame is the element app-owned fullscreen is requested on; only its
    // subtree paints there, so the overlay must be a descendant of it.
    const frame = playerIframe().closest('div')?.parentElement
    expect(frame).not.toBeNull()
    expect(frame).toContainElement(panel())
  })
})
