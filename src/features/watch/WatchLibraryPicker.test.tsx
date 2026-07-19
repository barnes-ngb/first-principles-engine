import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WatchVideo } from '../../core/types'
import type { NewWatchVideo } from './useWatchLibrary'

// WatchVetInForm (reused verbatim, no duplicate form logic) reads useChildren.
vi.mock('../../core/hooks/useChildren', () => ({
  useChildren: () => ({ children: [{ id: 'lincoln', name: 'Lincoln' }] }),
}))

import WatchLibraryPicker from './WatchLibraryPicker'

const ID = 'dQw4w9WgXcQ'

const video = (id: string, title: string): WatchVideo => ({
  id,
  youtubeId: ID,
  title,
  plannedMinutes: 12,
  subjectBucket: 'SocialStudies',
  childId: 'both',
  addedBy: 'parent',
  vettedAt: '2026-07-18T00:00:00.000Z',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
})

let onSelect: ReturnType<typeof vi.fn>
let onClose: ReturnType<typeof vi.fn>

beforeEach(() => {
  onSelect = vi.fn()
  onClose = vi.fn()
})

describe('WatchLibraryPicker — existing pick flow (characterization)', () => {
  it('renders a "Plan this" for each in-scope video and selects the chosen one', () => {
    render(
      <WatchLibraryPicker
        open
        onClose={onClose}
        videos={[video('a', 'Ancient cities'), video('b', 'The water cycle')]}
        onSelect={onSelect}
      />,
    )
    const buttons = screen.getAllByRole('button', { name: /plan this/i })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1])
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].id).toBe('b')
  })

  it('parent-gating: no inline vet-in affordance when onAddVideo is omitted', () => {
    render(
      <WatchLibraryPicker
        open
        onClose={onClose}
        videos={[video('a', 'Ancient cities')]}
        onSelect={onSelect}
      />,
    )
    expect(screen.queryByRole('button', { name: /add a new video/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /manage library/i })).toBeNull()
  })
})

describe('WatchLibraryPicker — inline vet-in (FEAT-107)', () => {
  it('opens the shared vet-in form and persists via onAddVideo, then collapses', async () => {
    const onAddVideo = vi.fn<(v: NewWatchVideo) => Promise<void>>(async () => undefined)
    const user = userEvent.setup()
    render(
      <WatchLibraryPicker
        open
        onClose={onClose}
        videos={[video('a', 'Ancient cities')]}
        onSelect={onSelect}
        onAddVideo={onAddVideo}
      />,
    )

    // The form is hidden until the parent opens it.
    expect(screen.queryByLabelText(/youtube link or video id/i)).toBeNull()
    await user.click(screen.getByRole('button', { name: /add a new video/i }))

    // The reused WatchVetInForm is now inline (same fields as Settings).
    fireEvent.change(screen.getByLabelText(/youtube link or video id/i), {
      target: { value: `https://youtu.be/${ID}` },
    })
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: 'How people first made cities' },
    })
    await user.click(screen.getByRole('button', { name: /add to library/i }))

    expect(onAddVideo).toHaveBeenCalledTimes(1)
    expect(onAddVideo).toHaveBeenCalledWith({
      youtubeId: ID,
      title: 'How people first made cities',
      plannedMinutes: 12,
      subjectBucket: 'SocialStudies',
      childId: 'both',
      addedBy: 'parent',
    })
    // Panel collapses after a successful save — the toggle label flips back from
    // "Cancel" to "Add a new video" (state-driven; the Collapse exit transition
    // itself doesn't settle synchronously in jsdom).
    expect(screen.getByRole('button', { name: /add a new video/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull()
  })

  it('a vetted-in video is selectable in the same session once the library re-renders it', async () => {
    const added = video('new', 'How people first made cities')
    const onAddVideo = vi.fn<(v: NewWatchVideo) => Promise<void>>(async () => undefined)
    const user = userEvent.setup()
    const { rerender } = render(
      <WatchLibraryPicker
        open
        onClose={onClose}
        videos={[video('a', 'Ancient cities')]}
        onSelect={onSelect}
        onAddVideo={onAddVideo}
      />,
    )

    await user.click(screen.getByRole('button', { name: /add a new video/i }))
    fireEvent.change(screen.getByLabelText(/youtube link or video id/i), {
      target: { value: ID },
    })
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: 'How people first made cities' },
    })
    await user.click(screen.getByRole('button', { name: /add to library/i }))
    expect(onAddVideo).toHaveBeenCalledTimes(1)

    // Upstream, useWatchLibrary's onSnapshot now includes the new video; the
    // picker re-renders with it and it is immediately selectable — no navigation.
    rerender(
      <WatchLibraryPicker
        open
        onClose={onClose}
        videos={[video('a', 'Ancient cities'), added]}
        onSelect={onSelect}
        onAddVideo={onAddVideo}
      />,
    )
    expect(screen.getByText('How people first made cities')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: /plan this/i })
    fireEvent.click(buttons[1])
    expect(onSelect).toHaveBeenCalledWith(added)
  })

  it('collapses an expanded vet-in panel when the picker is closed and reopened', async () => {
    const user = userEvent.setup()
    const props = {
      onClose,
      videos: [video('a', 'Ancient cities')],
      onSelect,
      onAddVideo: vi.fn<(v: NewWatchVideo) => Promise<void>>(async () => undefined),
    }
    const { rerender } = render(<WatchLibraryPicker open {...props} />)

    // Expand the inline form, then close via the close button (a real closure
    // path). handleClose resets `adding` even though the caller keeps the
    // component mounted and only flips `open`.
    await user.click(screen.getByRole('button', { name: /add a new video/i }))
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    rerender(<WatchLibraryPicker open={false} {...props} />)

    // Reopening starts a fresh session: the toggle is back to "Add a new video",
    // not the leftover "Cancel" over an empty form.
    rerender(<WatchLibraryPicker open {...props} />)
    expect(screen.getByRole('button', { name: /add a new video/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull()
  })

  it('offers a "Manage library" shortcut to Settings for bulk curation', async () => {
    const onManageLibrary = vi.fn()
    const user = userEvent.setup()
    render(
      <WatchLibraryPicker
        open
        onClose={onClose}
        videos={[]}
        onSelect={onSelect}
        onAddVideo={vi.fn(async () => undefined)}
        onManageLibrary={onManageLibrary}
      />,
    )
    await user.click(screen.getByRole('button', { name: /manage library/i }))
    expect(onManageLibrary).toHaveBeenCalledTimes(1)
  })
})
