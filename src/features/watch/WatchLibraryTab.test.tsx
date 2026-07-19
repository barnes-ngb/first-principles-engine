import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WatchVideo } from '../../core/types'

interface DialogProps {
  open: boolean
  video: WatchVideo | null
}

// ── Hoisted spies ───────────────────────────────────────────────────────────
const { videosRef, addVideoMock, dialogProps, addDocMock, updateDocMock } = vi.hoisted(() => ({
  videosRef: { current: [] as WatchVideo[] },
  addVideoMock: vi.fn(),
  dialogProps: { current: null as DialogProps | null },
  addDocMock: vi.fn(),
  updateDocMock: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: addDocMock,
  updateDoc: updateDocMock,
  doc: vi.fn(),
  collection: vi.fn(),
}))

vi.mock('./useWatchLibrary', () => ({
  useWatchLibrary: () => ({
    videos: videosRef.current,
    loading: false,
    error: null,
    addVideo: addVideoMock,
    updateVideo: vi.fn(),
  }),
}))

vi.mock('../../core/hooks/useChildren', () => ({
  useChildren: () => ({ children: [{ id: 'lincoln', name: 'Lincoln' }] }),
}))

// Keep the form + player out of this entry-point test — stub them.
vi.mock('./WatchVetInForm', () => ({ default: () => null }))
vi.mock('./WatchPlayerDialog', () => ({
  default: (props: DialogProps) => {
    dialogProps.current = props
    return props.open ? <div data-testid="player-dialog">{props.video?.title}</div> : null
  },
}))

import WatchLibraryTab from './WatchLibraryTab'

const video = (id: string, title: string): WatchVideo => ({
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
})

beforeEach(() => {
  videosRef.current = [video('a', 'Ancient cities'), video('b', 'The water cycle')]
  dialogProps.current = null
  addDocMock.mockClear()
  updateDocMock.mockClear()
})

describe('WatchLibraryTab entry point', () => {
  it('renders a Watch action for each curated video', () => {
    render(<WatchLibraryTab />)
    expect(screen.getAllByRole('button', { name: /watch/i })).toHaveLength(2)
  })

  it('opens the player for exactly the chosen video (dialog closed until then)', () => {
    render(<WatchLibraryTab />)
    expect(dialogProps.current?.open).toBe(false)

    // Click the second card's Watch button.
    fireEvent.click(screen.getAllByRole('button', { name: /watch/i })[1])

    expect(dialogProps.current?.open).toBe(true)
    expect(dialogProps.current?.video?.id).toBe('b')
    expect(screen.getByTestId('player-dialog')).toHaveTextContent('The water cycle')
  })

  it('opening the player writes NOTHING (practice/preview only, D3)', () => {
    render(<WatchLibraryTab />)
    fireEvent.click(screen.getAllByRole('button', { name: /watch/i })[0])
    expect(addDocMock).not.toHaveBeenCalled()
    expect(updateDocMock).not.toHaveBeenCalled()
  })
})
