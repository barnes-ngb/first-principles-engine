import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import BookReviewChat from '../BookReviewChat'
import { UserProfile } from '../../../core/types/enums'
import type { ReviewPhase } from '../useBookReview'

// ── Controllable mock state ───────────────────────────────────────

const navigateMock = vi.fn()

const actions = {
  playCurrentPage: vi.fn(async () => undefined),
  approveCurrentPage: vi.fn(async () => undefined),
  reviseCurrentPage: vi.fn(async () => undefined),
  skipRemaining: vi.fn(async () => undefined),
  gotoPage: vi.fn(async () => undefined),
  setRecording: vi.fn(),
}

interface ReviewState {
  phase: ReviewPhase
  isLoading: boolean
  error: string | null
  reviewedCount: number
  totalPages: number
  currentPageIndex: number
  imageRegenerating: boolean
}

let reviewState: ReviewState
let currentProfile: string = UserProfile.Parents

function makeBook() {
  return {
    id: 'book-1',
    title: 'Ember',
    coverImageUrl: 'cover.png',
    pages: [
      { id: 'p1', pageNumber: 1, text: 'Ember could not fly.', images: [{ id: 'i1', url: 'u1', type: 'ai-generated' }] },
      { id: 'p2', pageNumber: 2, text: 'She flapped her wings.', images: [{ id: 'i2', url: 'u2', type: 'ai-generated' }] },
    ],
  }
}

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigateMock,
  useParams: () => ({ bookId: 'book-1' }),
}))

vi.mock('../../../core/auth/useAuth', () => ({
  useFamilyId: () => 'family-1',
}))

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-1', name: 'Lincoln', birthdate: '2015-01-01', voiceInputEnhanced: true },
  }),
}))

vi.mock('../../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: currentProfile }),
}))

vi.mock('../../../components/VoiceInput', () => ({
  default: (props: { onTranscript: (t: string) => void; onCancel?: () => void }) => (
    <div>
      <button type="button" onClick={() => props.onTranscript('make it blue')}>
        voice-submit
      </button>
      <button type="button" onClick={() => props.onCancel?.()}>
        voice-cancel
      </button>
    </div>
  ),
}))

vi.mock('../useBookReview', async (orig) => ({
  ...(await orig<typeof import('../useBookReview')>()),
  useBookReview: () => ({
    book: makeBook(),
    currentPage: makeBook().pages[reviewState.currentPageIndex],
    currentPageIndex: reviewState.currentPageIndex,
    totalPages: reviewState.totalPages,
    phase: reviewState.phase,
    isLoading: reviewState.isLoading,
    error: reviewState.error,
    reviewedCount: reviewState.reviewedCount,
    imageRegenerating: reviewState.imageRegenerating,
    ...actions,
  }),
}))

// ── Tests ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  currentProfile = UserProfile.Parents
  reviewState = {
    phase: 'awaiting',
    isLoading: false,
    error: null,
    reviewedCount: 0,
    totalPages: 2,
    currentPageIndex: 0,
    imageRegenerating: false,
  }
})

describe('BookReviewChat', () => {
  it('renders the current page text and illustration', () => {
    render(<BookReviewChat />)
    expect(screen.getByText('Ember could not fly.')).toBeInTheDocument()
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument()
    expect(screen.getByAltText(/Page 1 illustration/)).toBeInTheDocument()
  })

  it('"Sounds good!" calls approveCurrentPage', async () => {
    render(<BookReviewChat />)
    await userEvent.click(screen.getByRole('button', { name: /Sounds good/ }))
    expect(actions.approveCurrentPage).toHaveBeenCalledTimes(1)
  })

  it('"Change this" reveals the VoiceInput', async () => {
    render(<BookReviewChat />)
    expect(screen.queryByText('voice-submit')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Change this/ }))
    expect(screen.getByText('voice-submit')).toBeInTheDocument()
    expect(actions.setRecording).toHaveBeenCalledWith(true)
  })

  it('VoiceInput onTranscript triggers reviseCurrentPage', async () => {
    render(<BookReviewChat />)
    await userEvent.click(screen.getByRole('button', { name: /Change this/ }))
    await userEvent.click(screen.getByText('voice-submit'))
    expect(actions.reviseCurrentPage).toHaveBeenCalledWith('make it blue')
  })

  it('"Skip the rest" calls skipRemaining', async () => {
    render(<BookReviewChat />)
    await userEvent.click(screen.getByRole('button', { name: /Skip the rest/ }))
    expect(actions.skipRemaining).toHaveBeenCalledTimes(1)
  })

  it('completed state shows the "All done!" summary with counts', () => {
    reviewState.phase = 'completed'
    reviewState.reviewedCount = 2
    reviewState.totalPages = 2
    render(<BookReviewChat />)
    expect(screen.getByText(/All done!/)).toBeInTheDocument()
    expect(screen.getByText(/You reviewed 2 of 2 pages/)).toBeInTheDocument()
  })

  it('parent profile shows Prev/Next navigation', () => {
    currentProfile = UserProfile.Parents
    render(<BookReviewChat />)
    expect(screen.getByRole('button', { name: /Prev/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Next/ })).toBeInTheDocument()
  })

  it('kid profile does NOT show Prev/Next navigation', () => {
    currentProfile = UserProfile.Lincoln
    render(<BookReviewChat />)
    expect(screen.queryByRole('button', { name: /Prev/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Next/ })).not.toBeInTheDocument()
  })

  it('revising state shows the spinner and hides the action buttons', () => {
    reviewState.phase = 'revising'
    render(<BookReviewChat />)
    expect(screen.getByText(/Fixing your page/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sounds good/ })).not.toBeInTheDocument()
  })
})
