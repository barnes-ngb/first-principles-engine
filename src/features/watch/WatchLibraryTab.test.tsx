import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WatchVideo } from '../../core/types'

interface DialogProps {
  open: boolean
  video: WatchVideo | null
}

interface VetInStubProps {
  initial?: WatchVideo
  onSave: (v: Partial<WatchVideo>) => Promise<void>
  onCancel?: () => void
}

// ── Hoisted spies ───────────────────────────────────────────────────────────
const {
  videosRef,
  canEditRef,
  childrenRef,
  historyRef,
  historyStateRef,
  addVideoMock,
  updateVideoMock,
  retireVideoMock,
  restoreVideoMock,
  useWatchLibraryMock,
  useWatchHistoryMock,
  useChildrenMock,
  dialogProps,
  addDocMock,
  updateDocMock,
  onSnapshotMock,
} = vi.hoisted(() => ({
  videosRef: { current: [] as WatchVideo[] },
  canEditRef: { current: true },
  childrenRef: { current: [{ id: 'lincoln', name: 'Lincoln' }] as { id: string; name: string }[] },
  historyRef: { current: {} as Record<string, unknown> },
  historyStateRef: { current: { loading: false, error: null as string | null } },
  addVideoMock: vi.fn(),
  updateVideoMock: vi.fn(async () => undefined),
  retireVideoMock: vi.fn(async () => undefined),
  restoreVideoMock: vi.fn(async () => undefined),
  useWatchLibraryMock: vi.fn(),
  useWatchHistoryMock: vi.fn(),
  useChildrenMock: vi.fn(),
  dialogProps: { current: null as DialogProps | null },
  addDocMock: vi.fn(),
  updateDocMock: vi.fn(),
  onSnapshotMock: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: addDocMock,
  updateDoc: updateDocMock,
  onSnapshot: onSnapshotMock,
  doc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}))

vi.mock('./useWatchLibrary', () => ({
  useWatchLibrary: (...args: unknown[]) => {
    useWatchLibraryMock(...args)
    return {
      videos: videosRef.current,
      loading: false,
      error: null,
      addVideo: addVideoMock,
      updateVideo: updateVideoMock,
      retireVideo: retireVideoMock,
      restoreVideo: restoreVideoMock,
    }
  },
}))

vi.mock('../../core/hooks/useChildren', () => ({
  useChildren: () => {
    useChildrenMock()
    return { children: childrenRef.current }
  },
}))

// FEAT-139: the tab folds in a bounded watch-history look-back. Stubbed at the
// hook boundary (like `useWatchLibrary`) so this entry-point suite stays about
// the surface; the read's bound is asserted in `useWatchHistory.test.ts`.
vi.mock('./useWatchHistory', () => ({
  useWatchHistory: (...args: unknown[]) => {
    useWatchHistoryMock(...args)
    return {
      history: historyRef.current,
      loading: historyStateRef.current.loading,
      error: historyStateRef.current.error,
      windowDays: 90,
      since: '2026-05-13',
    }
  },
}))

vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ canEdit: canEditRef.current }),
}))

// Stub the form down to the props this entry-point test cares about.
vi.mock('./WatchVetInForm', () => ({
  default: ({ initial, onSave, onCancel }: VetInStubProps) => (
    <div data-testid={initial ? `edit-form-${initial.id}` : 'add-form'}>
      {/* Only the editor exposes a prefill probe / id-scoped save, so a query
          can never accidentally match the always-present add form above. */}
      {initial && <span data-testid="prefill-title">{initial.title}</span>}
      <button onClick={() => void onSave({ title: 'edited title' })}>
        {initial ? `stub-save-${initial.id}` : 'stub-add'}
      </button>
      {onCancel && <button onClick={onCancel}>stub-cancel</button>}
    </div>
  ),
}))
vi.mock('./WatchPlayerDialog', () => ({
  default: (props: DialogProps) => {
    dialogProps.current = props
    return props.open ? <div data-testid="player-dialog">{props.video?.title}</div> : null
  },
}))

import WatchLibraryTab from './WatchLibraryTab'

const video = (
  id: string,
  title: string,
  status?: WatchVideo['status'],
  over: Partial<WatchVideo> = {},
): WatchVideo => ({
  id,
  youtubeId: 'dQw4w9WgXcQ',
  title,
  plannedMinutes: 12,
  subjectBucket: 'SocialStudies',
  childId: 'both',
  addedBy: 'parent',
  vettedAt: '2026-07-18T00:00:00.000Z',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
  ...(status ? { status } : {}),
  ...over,
})

/** Open the Archive view (FEAT-139 — retired videos have their own tab). */
function openArchive() {
  fireEvent.click(screen.getByRole('tab', { name: /archive/i }))
}

beforeEach(() => {
  videosRef.current = [video('a', 'Ancient cities'), video('b', 'The water cycle')]
  canEditRef.current = true
  childrenRef.current = [{ id: 'lincoln', name: 'Lincoln' }]
  historyRef.current = {}
  historyStateRef.current = { loading: false, error: null }
  dialogProps.current = null
  addDocMock.mockClear()
  updateDocMock.mockClear()
  onSnapshotMock.mockClear()
  updateVideoMock.mockClear()
  retireVideoMock.mockClear()
  restoreVideoMock.mockClear()
  useWatchLibraryMock.mockClear()
  useWatchHistoryMock.mockClear()
  useChildrenMock.mockClear()
})

describe('WatchLibraryTab entry point', () => {
  it('renders a Watch action for each curated video', () => {
    render(<WatchLibraryTab />)
    expect(screen.getAllByRole('button', { name: /^watch$/i })).toHaveLength(2)
  })

  it('opens the player for exactly the chosen video (dialog closed until then)', () => {
    render(<WatchLibraryTab />)
    expect(dialogProps.current?.open).toBe(false)

    // Click the second card's Watch button.
    fireEvent.click(screen.getAllByRole('button', { name: /^watch$/i })[1])

    expect(dialogProps.current?.open).toBe(true)
    expect(dialogProps.current?.video?.id).toBe('b')
    expect(screen.getByTestId('player-dialog')).toHaveTextContent('The water cycle')
  })

  it('opening the player writes NOTHING (practice/preview only, D3)', () => {
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getAllByRole('button', { name: /^watch$/i })[0])
    expect(addDocMock).not.toHaveBeenCalled()
    expect(updateDocMock).not.toHaveBeenCalled()
  })
})

// ── FEAT-129: capability gate ───────────────────────────────────────────────

describe('WatchLibraryTab parent gate (FEAT-129)', () => {
  it('renders nothing for a non-parent profile', () => {
    canEditRef.current = false
    render(<WatchLibraryTab />)
    expect(screen.queryByText('Library')).not.toBeInTheDocument()
    expect(screen.queryByTestId('add-form')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^watch$/i })).not.toBeInTheDocument()
  })

  it('costs ZERO Firestore reads for a non-parent profile', async () => {
    canEditRef.current = false
    render(<WatchLibraryTab />)
    // The gate sits above the data hooks, so the library subscription is never
    // even constructed — not merely hidden after the fact.
    await waitFor(() => expect(useWatchLibraryMock).not.toHaveBeenCalled())
    expect(useChildrenMock).not.toHaveBeenCalled()
    expect(onSnapshotMock).not.toHaveBeenCalled()
    // FEAT-139: the history look-back sits under the same gate — a non-parent
    // never triggers the day-log read either.
    expect(useWatchHistoryMock).not.toHaveBeenCalled()
  })

  it('a parent profile DOES subscribe (the gate assertions are not vacuous)', () => {
    canEditRef.current = true
    render(<WatchLibraryTab />)
    expect(useWatchLibraryMock).toHaveBeenCalled()
    expect(screen.getByText('Library')).toBeInTheDocument()
  })

  it('gates no write affordance behind a name — only the capability', () => {
    canEditRef.current = false
    render(<WatchLibraryTab />)
    expect(screen.queryByRole('button', { name: /^archive$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
  })
})

// ── FEAT-129: edit ──────────────────────────────────────────────────────────

describe('WatchLibraryTab edit (FEAT-129)', () => {
  it('opens an inline editor prefilled with exactly the chosen video', () => {
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[1])

    expect(screen.getByTestId('edit-form-b')).toBeInTheDocument()
    expect(screen.getByTestId('prefill-title')).toHaveTextContent('The water cycle')
    // Only the edited row swaps into the form.
    expect(screen.queryByTestId('edit-form-a')).not.toBeInTheDocument()
  })

  it('saving patches that video by id and closes the editor', async () => {
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0])
    fireEvent.click(screen.getByRole('button', { name: 'stub-save-a' }))

    await waitFor(() => expect(updateVideoMock).toHaveBeenCalledTimes(1))
    expect(updateVideoMock).toHaveBeenCalledWith('a', { title: 'edited title' })
    await waitFor(() => expect(screen.queryByTestId('edit-form-a')).not.toBeInTheDocument())
  })

  it('cancel closes the editor without writing', () => {
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0])
    fireEvent.click(screen.getByRole('button', { name: 'stub-cancel' }))

    expect(screen.queryByTestId('edit-form-a')).not.toBeInTheDocument()
    expect(updateVideoMock).not.toHaveBeenCalled()
  })
})

// ── FEAT-129: retire (the "archive") ────────────────────────────────────────

describe('WatchLibraryTab retire (FEAT-129)', () => {
  // UX audit 2026-08 (UX-01) renamed the verb from "Remove" to "Archive" —
  // text only. Retire was always reversible and the Archive tab was always
  // where it landed; "Remove" was the one word in the feature that disagreed
  // with the data model. These cases pin the new wording AND the unchanged
  // propose→confirm behaviour behind it.
  it('a single Archive tap writes nothing — it proposes, then confirms', () => {
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getAllByRole('button', { name: /^archive$/i })[0])

    expect(retireVideoMock).not.toHaveBeenCalled()
    expect(screen.getByText(/stays in any week it was already planned into/i)).toBeInTheDocument()
  })

  it('never calls the affordance "Remove" — the write is reversible and the word says so', () => {
    render(<WatchLibraryTab />)
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /^archive$/i })[0])
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    // And the confirm promises the way back, matching what the chat already
    // tells a parent ("put it back from the Archive tab").
    expect(screen.getByText(/put it back any time/i)).toBeInTheDocument()
  })

  it('confirming retires exactly that video', async () => {
    render(<WatchLibraryTab />)
    // Arm the SECOND row, then confirm. The confirm action is named distinctly
    // from the row action so this can't accidentally re-arm the first row.
    fireEvent.click(screen.getAllByRole('button', { name: /^archive$/i })[1])
    fireEvent.click(screen.getByRole('button', { name: /move to archive/i }))

    await waitFor(() => expect(retireVideoMock).toHaveBeenCalledTimes(1))
    expect(retireVideoMock).toHaveBeenCalledWith('b')
  })

  it('cancelling the confirm writes nothing', () => {
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getAllByRole('button', { name: /^archive$/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(retireVideoMock).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: /^watch$/i })).toHaveLength(2)
  })

  // FEAT-139 moved retired videos out of the old inline "Show retired" switch
  // into their own Archive tab. The retire-don't-delete behaviour these three
  // cases pin down is unchanged — only where a retired video is found.
  it('keeps retired videos out of the active library entirely', () => {
    videosRef.current = [video('a', 'Ancient cities'), video('r', 'Retired one', 'retired')]
    render(<WatchLibraryTab />)

    expect(screen.queryByText('Retired one')).not.toBeInTheDocument()
    // No inline toggle survives — the archive is a view, not a filter.
    expect(screen.queryByRole('switch', { name: /show retired/i })).not.toBeInTheDocument()

    openArchive()
    expect(screen.getByText('Retired one')).toBeInTheDocument()
  })

  it('a retired video offers Put back, not Archive', () => {
    videosRef.current = [video('r', 'Retired one', 'retired')]
    render(<WatchLibraryTab />)
    openArchive()

    expect(screen.queryByRole('button', { name: /^archive$/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /put back/i }))
    expect(restoreVideoMock).toHaveBeenCalledWith('r')
  })

  it('a video retired after it was planned is still previewable here (never deleted)', () => {
    videosRef.current = [video('r', 'Retired one', 'retired')]
    render(<WatchLibraryTab />)
    openArchive()

    fireEvent.click(screen.getByRole('button', { name: /^watch$/i }))
    expect(dialogProps.current?.video?.id).toBe('r')
  })
})

// ── FEAT-139: search, filter, grouping ──────────────────────────────────────

describe('WatchLibraryTab search + filter + grouping (FEAT-139)', () => {
  const shelf = () => [
    video('a', 'Ancient cities', undefined, { subjectBucket: 'SocialStudies', childId: 'both' }),
    video('b', 'The water cycle', undefined, { subjectBucket: 'Science', childId: 'lincoln' }),
    video('c', 'Ancient volcanoes', undefined, {
      subjectBucket: 'Science',
      childId: 'london',
      why: 'Pairs with the lava lab',
    }),
  ]

  beforeEach(() => {
    videosRef.current = shelf()
    childrenRef.current = [
      { id: 'lincoln', name: 'Lincoln' },
      { id: 'london', name: 'London' },
    ]
  })

  it('groups the shelf by subject with per-bucket counts', () => {
    render(<WatchLibraryTab />)
    expect(screen.getByText('Science (2)')).toBeInTheDocument()
    expect(screen.getByText('Social Studies (1)')).toBeInTheDocument()
    // No empty buckets are rendered.
    expect(screen.queryByText(/^Math \(/)).not.toBeInTheDocument()
  })

  it('searches by title', () => {
    render(<WatchLibraryTab />)
    fireEvent.change(screen.getByLabelText(/search videos/i), { target: { value: 'water' } })

    expect(screen.getByText('The water cycle')).toBeInTheDocument()
    expect(screen.queryByText('Ancient cities')).not.toBeInTheDocument()
    expect(screen.getByText('Science (1)')).toBeInTheDocument()
  })

  it('searches the “why” line too', () => {
    render(<WatchLibraryTab />)
    fireEvent.change(screen.getByLabelText(/search videos/i), { target: { value: 'lava lab' } })

    expect(screen.getByText('Ancient volcanoes')).toBeInTheDocument()
    expect(screen.queryByText('The water cycle')).not.toBeInTheDocument()
  })

  it('filters by subject', () => {
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Social Studies' }))

    expect(screen.getByText('Ancient cities')).toBeInTheDocument()
    expect(screen.queryByText('The water cycle')).not.toBeInTheDocument()
  })

  it('filtering to a child KEEPS the videos marked Both', () => {
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getByRole('button', { name: 'London' }))

    // 'both' is shared, not a third bucket — it shows for either boy.
    expect(screen.getByText('Ancient cities')).toBeInTheDocument()
    expect(screen.getByText('Ancient volcanoes')).toBeInTheDocument()
    // …while the sibling's private entry drops out.
    expect(screen.queryByText('The water cycle')).not.toBeInTheDocument()
  })

  it('the other boy sees the same shared video', () => {
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Lincoln' }))

    expect(screen.getByText('Ancient cities')).toBeInTheDocument()
    expect(screen.getByText('The water cycle')).toBeInTheDocument()
    expect(screen.queryByText('Ancient volcanoes')).not.toBeInTheDocument()
  })

  it('search and filters compose', () => {
    render(<WatchLibraryTab />)
    fireEvent.change(screen.getByLabelText(/search videos/i), { target: { value: 'ancient' } })
    fireEvent.click(screen.getByRole('button', { name: 'Science' }))

    expect(screen.getByText('Ancient volcanoes')).toBeInTheDocument()
    expect(screen.queryByText('Ancient cities')).not.toBeInTheDocument()
  })

  it('a filtered-empty shelf says which filter is hiding things', () => {
    render(<WatchLibraryTab />)
    fireEvent.change(screen.getByLabelText(/search videos/i), { target: { value: 'zzzz' } })

    expect(screen.getByText(/no videos match those filters/i)).toBeInTheDocument()
    expect(screen.getByText(/“zzzz”/)).toBeInTheDocument()
    // Emphatically NOT the truly-empty wording.
    expect(screen.queryByText(/no videos yet/i)).not.toBeInTheDocument()
  })

  it('a truly-empty library says something different', () => {
    videosRef.current = []
    render(<WatchLibraryTab />)

    expect(screen.getByText(/no videos yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/no videos match those filters/i)).not.toBeInTheDocument()
  })

  it('an all-retired library points at the Archive rather than reading as empty', () => {
    videosRef.current = [video('r', 'Retired one', 'retired')]
    render(<WatchLibraryTab />)

    expect(screen.getByText(/everything is in the archive/i)).toBeInTheDocument()
    expect(screen.queryByText(/no videos yet/i)).not.toBeInTheDocument()
  })

  it('Clear filters restores the whole shelf', () => {
    render(<WatchLibraryTab />)
    fireEvent.change(screen.getByLabelText(/search videos/i), { target: { value: 'water' } })
    expect(screen.queryByText('Ancient cities')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(screen.getByText('Ancient cities')).toBeInTheDocument()
    expect(screen.getByText('Ancient volcanoes')).toBeInTheDocument()
  })

  it('offers a subject chip only for buckets actually on the shelf', () => {
    render(<WatchLibraryTab />)
    expect(screen.getByRole('button', { name: 'Science' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Math' })).not.toBeInTheDocument()
  })

  it('searching writes NOTHING — find-ability is a read', () => {
    render(<WatchLibraryTab />)
    fireEvent.change(screen.getByLabelText(/search videos/i), { target: { value: 'water' } })
    fireEvent.click(screen.getByRole('button', { name: 'Science' }))

    expect(updateVideoMock).not.toHaveBeenCalled()
    expect(retireVideoMock).not.toHaveBeenCalled()
    expect(addDocMock).not.toHaveBeenCalled()
    expect(updateDocMock).not.toHaveBeenCalled()
  })
})

// ── FEAT-139: the archive view ──────────────────────────────────────────────

describe('WatchLibraryTab archive view (FEAT-139)', () => {
  beforeEach(() => {
    videosRef.current = [
      video('a', 'Ancient cities'),
      video('r1', 'Retired one', 'retired'),
      video('r2', 'Retired two', 'retired'),
    ]
  })

  it('counts the retired set on the tab', () => {
    render(<WatchLibraryTab />)
    expect(screen.getByRole('tab', { name: 'Archive (2)' })).toBeInTheDocument()
  })

  it('lists exactly the retired set — no active video leaks in', () => {
    render(<WatchLibraryTab />)
    openArchive()

    expect(screen.getByText('Retired one')).toBeInTheDocument()
    expect(screen.getByText('Retired two')).toBeInTheDocument()
    expect(screen.queryByText('Ancient cities')).not.toBeInTheDocument()
  })

  it('un-retire is a write, and only from the archive', () => {
    render(<WatchLibraryTab />)
    expect(screen.queryByRole('button', { name: /put back/i })).not.toBeInTheDocument()

    openArchive()
    fireEvent.click(screen.getAllByRole('button', { name: /put back/i })[1])
    expect(restoreVideoMock).toHaveBeenCalledWith('r2')
  })

  it('a restored video is back in the active library (and so back in the picker)', () => {
    // `restoreVideo` writes `status: 'active'`; the subscription re-renders it.
    // `activeVideos` is the single predicate the library list AND the picker use,
    // so an entry the library shows is an entry the picker offers.
    videosRef.current = [video('r1', 'Retired one', 'active')]
    render(<WatchLibraryTab />)

    expect(screen.getByText('Retired one')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Archive (0)' })).toBeInTheDocument()
  })

  it('does not offer vet-in from the archive', () => {
    render(<WatchLibraryTab />)
    expect(screen.getByTestId('add-form')).toBeInTheDocument()
    openArchive()
    expect(screen.queryByTestId('add-form')).not.toBeInTheDocument()
  })

  it('an empty archive says nothing is deleted', () => {
    videosRef.current = [video('a', 'Ancient cities')]
    render(<WatchLibraryTab />)
    openArchive()
    expect(screen.getByText(/nothing archived/i)).toBeInTheDocument()
  })

  it('switching views drops any half-armed retire confirm', () => {
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))
    expect(screen.getByText(/stays in any week it was already planned into/i)).toBeInTheDocument()

    openArchive()
    fireEvent.click(screen.getByRole('tab', { name: /^library$/i }))

    expect(screen.queryByText(/stays in any week it was already planned into/i)).not.toBeInTheDocument()
    expect(retireVideoMock).not.toHaveBeenCalled()
  })
})

// ── FEAT-139: a pre-FEAT-129 doc (no `status` field) ────────────────────────

describe('WatchLibraryTab back-compat: an absent status reads as active (FEAT-139)', () => {
  it('lists a status-less video in the library, never the archive', () => {
    const legacy = video('legacy', 'Pre-FEAT-129 video')
    expect(legacy.status).toBeUndefined()
    videosRef.current = [legacy]
    render(<WatchLibraryTab />)

    expect(screen.getByText('Pre-FEAT-129 video')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Archive (0)' })).toBeInTheDocument()

    openArchive()
    expect(screen.queryByText('Pre-FEAT-129 video')).not.toBeInTheDocument()
    expect(screen.getByText(/nothing archived/i)).toBeInTheDocument()
  })

  it('offers Archive (not Put back) for a status-less video', () => {
    videosRef.current = [video('legacy', 'Pre-FEAT-129 video')]
    render(<WatchLibraryTab />)

    expect(screen.getByRole('button', { name: /^archive$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /put back/i })).not.toBeInTheDocument()
  })
})

// ── FEAT-139: watch history ─────────────────────────────────────────────────

describe('WatchLibraryTab watch history (FEAT-139)', () => {
  beforeEach(() => {
    videosRef.current = [video('a', 'Ancient cities'), video('b', 'The water cycle')]
    childrenRef.current = [
      { id: 'lincoln', name: 'Lincoln' },
      { id: 'london', name: 'London' },
    ]
  })

  it('shows who watched it and when', () => {
    historyRef.current = {
      a: { videoId: 'a', lastWatchedOn: '2026-08-04', childIds: ['lincoln'], times: 1 },
    }
    render(<WatchLibraryTab />)
    expect(screen.getByText('Watched by Lincoln · 2026-08-04')).toBeInTheDocument()
  })

  it('names the window instead of claiming a video was never watched', () => {
    historyRef.current = {}
    render(<WatchLibraryTab />)
    expect(screen.getAllByText('Not watched in the last 90 days')).toHaveLength(2)
    expect(screen.queryByText(/never watched/i)).not.toBeInTheDocument()
  })

  it('reports both boys for a shared video', () => {
    historyRef.current = {
      a: { videoId: 'a', lastWatchedOn: '2026-08-09', childIds: ['lincoln', 'london'], times: 3 },
    }
    render(<WatchLibraryTab />)
    expect(screen.getByText('Watched by Lincoln & London · 2026-08-09 · 3×')).toBeInTheDocument()
  })

  it('history is a read — rendering it writes nothing', () => {
    historyRef.current = {
      a: { videoId: 'a', lastWatchedOn: '2026-08-04', childIds: ['lincoln'], times: 1 },
    }
    render(<WatchLibraryTab />)
    expect(addDocMock).not.toHaveBeenCalled()
    expect(updateDocMock).not.toHaveBeenCalled()
    expect(updateVideoMock).not.toHaveBeenCalled()
  })

  // Codex P2 (PR #1660): a failed read yields the same empty index a successful
  // read that found nothing does, so without carrying the error the negative
  // wording would present a broken lookup as a confident negative.
  it('claims NOTHING when the look-back failed — a broken read is not a negative', () => {
    historyStateRef.current = { loading: false, error: 'permission-denied' }
    historyRef.current = {}
    render(<WatchLibraryTab />)

    expect(screen.queryByText(/not watched in the last/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/watched by/i)).not.toBeInTheDocument()
    // The shelf itself stays fully usable — history failing is not fatal.
    expect(screen.getByText('Ancient cities')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^watch$/i })).toHaveLength(2)
  })

  it('claims nothing while the look-back is still loading either', () => {
    historyStateRef.current = { loading: true, error: null }
    render(<WatchLibraryTab />)

    expect(screen.queryByText(/not watched in the last/i)).not.toBeInTheDocument()
    expect(screen.getByText('Ancient cities')).toBeInTheDocument()
  })

  it('a successful read that found nothing DOES say so (the guard is not vacuous)', () => {
    historyStateRef.current = { loading: false, error: null }
    historyRef.current = {}
    render(<WatchLibraryTab />)

    expect(screen.getAllByText('Not watched in the last 90 days')).toHaveLength(2)
  })

  it('carries into the archive too', () => {
    videosRef.current = [video('r', 'Retired one', 'retired')]
    historyRef.current = {
      r: { videoId: 'r', lastWatchedOn: '2026-07-01', childIds: ['london'], times: 1 },
    }
    render(<WatchLibraryTab />)
    openArchive()
    expect(screen.getByText('Watched by London · 2026-07-01')).toBeInTheDocument()
  })
})
