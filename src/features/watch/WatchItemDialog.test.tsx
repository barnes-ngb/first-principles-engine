import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// The real WatchPlayer pulls in the YouTube IFrame API; stub it — this suite
// only exercises the dialog's resolve/loading/unavailable branches.
vi.mock('./WatchPlayer', () => ({
  default: ({ video }: { video: { title: string } }) => <div>player:{video.title}</div>,
}))

import WatchItemDialog from './WatchItemDialog'
import type { WatchVideo } from '../../core/types'

const VIDEO: WatchVideo = {
  id: 'v1',
  youtubeId: 'abcdefghijk',
  title: 'The American Revolution',
  plannedMinutes: 12,
  subjectBucket: 'SocialStudies',
  childId: 'both',
  addedBy: 'parent',
  vettedAt: '2026-07-19T00:00:00.000Z',
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
}

describe('WatchItemDialog — unresolved video (Codex P2)', () => {
  it('renders the player when the video resolves', () => {
    render(<WatchItemDialog video={VIDEO} open onClose={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText(/player:The American Revolution/)).toBeInTheDocument()
  })

  it('shows a loading state (never an empty dialog) while the library resolves', () => {
    render(<WatchItemDialog video={null} open loading onClose={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText(/finding the video/i)).toBeInTheDocument()
  })

  it('shows an unavailable state with recovery copy when the video cannot be resolved', () => {
    render(<WatchItemDialog video={null} open onClose={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText(/isn't available right now/i)).toBeInTheDocument()
  })

  it('surfaces the library error when present', () => {
    render(
      <WatchItemDialog video={null} open error="network down" onClose={vi.fn()} onComplete={vi.fn()} />,
    )
    expect(screen.getByText(/network down/i)).toBeInTheDocument()
  })
})
