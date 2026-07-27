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
  addVideoMock,
  updateVideoMock,
  retireVideoMock,
  restoreVideoMock,
  useWatchLibraryMock,
  useChildrenMock,
  dialogProps,
  addDocMock,
  updateDocMock,
  onSnapshotMock,
} = vi.hoisted(() => ({
  videosRef: { current: [] as WatchVideo[] },
  canEditRef: { current: true },
  addVideoMock: vi.fn(),
  updateVideoMock: vi.fn(async () => undefined),
  retireVideoMock: vi.fn(async () => undefined),
  restoreVideoMock: vi.fn(async () => undefined),
  useWatchLibraryMock: vi.fn(),
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
    return { children: [{ id: 'lincoln', name: 'Lincoln' }] }
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

const video = (id: string, title: string, status?: WatchVideo['status']): WatchVideo => ({
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
})

beforeEach(() => {
  videosRef.current = [video('a', 'Ancient cities'), video('b', 'The water cycle')]
  canEditRef.current = true
  dialogProps.current = null
  addDocMock.mockClear()
  updateDocMock.mockClear()
  onSnapshotMock.mockClear()
  updateVideoMock.mockClear()
  retireVideoMock.mockClear()
  restoreVideoMock.mockClear()
  useWatchLibraryMock.mockClear()
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
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
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

// ── FEAT-129: retire (the "remove") ─────────────────────────────────────────

describe('WatchLibraryTab retire (FEAT-129)', () => {
  it('a single Remove tap writes nothing — it proposes, then confirms', () => {
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getAllByRole('button', { name: /^remove$/i })[0])

    expect(retireVideoMock).not.toHaveBeenCalled()
    expect(screen.getByText(/stays in any week it was already planned into/i)).toBeInTheDocument()
  })

  it('confirming retires exactly that video', async () => {
    render(<WatchLibraryTab />)
    // Arm the SECOND row, then confirm. The confirm action is named distinctly
    // from the row action so this can't accidentally re-arm the first row.
    fireEvent.click(screen.getAllByRole('button', { name: /^remove$/i })[1])
    fireEvent.click(screen.getByRole('button', { name: /remove from library/i }))

    await waitFor(() => expect(retireVideoMock).toHaveBeenCalledTimes(1))
    expect(retireVideoMock).toHaveBeenCalledWith('b')
  })

  it('cancelling the confirm writes nothing', () => {
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getAllByRole('button', { name: /^remove$/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(retireVideoMock).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: /^watch$/i })).toHaveLength(2)
  })

  it('hides retired videos by default and offers a toggle to show them', () => {
    videosRef.current = [video('a', 'Ancient cities'), video('r', 'Retired one', 'retired')]
    render(<WatchLibraryTab />)

    expect(screen.queryByText('Retired one')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: /show retired/i }))
    expect(screen.getByText('Retired one')).toBeInTheDocument()
  })

  it('a retired video offers Put back, not Remove', () => {
    videosRef.current = [video('r', 'Retired one', 'retired')]
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getByRole('switch', { name: /show retired/i }))

    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /put back/i }))
    expect(restoreVideoMock).toHaveBeenCalledWith('r')
  })

  it('a video retired after it was planned is still previewable here (never deleted)', () => {
    videosRef.current = [video('r', 'Retired one', 'retired')]
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getByRole('switch', { name: /show retired/i }))

    fireEvent.click(screen.getByRole('button', { name: /^watch$/i }))
    expect(dialogProps.current?.video?.id).toBe('r')
  })
})
