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
}

// ── Hoisted capture + write spies ───────────────────────────────────────────
const { capture, apiState, addDocMock, setDocMock, updateDocMock } = vi.hoisted(() => ({
  capture: { options: null as YTPlayerOptions | null, player: null as FakePlayer | null },
  apiState: {
    status: 'ready' as 'loading' | 'ready' | 'error',
    yt: null as YTNamespace | null,
    error: null as string | null,
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

import WatchPlayer from './WatchPlayer'

function makeFakePlayer(): FakePlayer {
  return {
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    stopVideo: vi.fn(),
    loadVideoById: vi.fn(),
    destroy: vi.fn(),
  }
}

/** A fake `YT` whose Player constructor captures its options + instance. */
function fakeYT(): YTNamespace {
  return {
    Player: vi.fn(function (_el: unknown, options: YTPlayerOptions) {
      capture.options = options
      const player = makeFakePlayer()
      capture.player = player
      return player
    }) as unknown as YTNamespace['Player'],
    PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  }
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
  apiState.status = 'ready'
  apiState.yt = fakeYT()
  apiState.error = null
  addDocMock.mockClear()
  setDocMock.mockClear()
  updateDocMock.mockClear()
})

describe('WatchPlayer', () => {
  it('mounts the player on the nocookie host with the locked, child-safe params', () => {
    render(<WatchPlayer video={VIDEO} onDone={vi.fn()} />)

    expect(capture.options).not.toBeNull()
    expect(capture.options!.host).toBe('https://www.youtube-nocookie.com')
    expect(capture.options!.videoId).toBe('dQw4w9WgXcQ')
    const vars = capture.options!.playerVars!
    expect(vars.autoplay).toBe(0)
    expect(vars.rel).toBe(0)
    expect(vars.modestbranding).toBe(1)
    expect(vars.iv_load_policy).toBe(3)
    expect(vars.playsinline).toBe(1)
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

  it('Done returns to where the child came from (the only forward action)', () => {
    const onDone = vi.fn()
    render(<WatchPlayer video={VIDEO} onDone={onDone} />)

    emitState(0)
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
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
