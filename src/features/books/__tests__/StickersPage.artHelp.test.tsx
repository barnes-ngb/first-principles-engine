import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The host wiring for FEAT-178: one "?" per surface, the audience resolved from
 * capability, and the hint standing down at the cap rather than doubling the
 * nudge.
 */
const { useStickerArtQuotaMock, isChildProfileMock } = vi.hoisted(() => ({
  useStickerArtQuotaMock: vi.fn(),
  isChildProfileMock: { value: true },
}))

vi.mock('../useStickerArtQuota', () => ({
  useStickerArtQuota: useStickerArtQuotaMock,
  recordStickerArtGeneration: vi.fn(),
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-1', name: 'Lincoln' },
    isChildProfile: isChildProfileMock.value,
  }),
}))

vi.mock('../../../core/profile/useProfile', () => ({ useProfile: () => ({ profile: 'lincoln' }) }))

vi.mock('../../../components/Page', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../SketchScanner', () => ({
  default: ({ audience }: { audience?: string }) => (
    <div data-testid="sketch-scanner" data-audience={audience} />
  ),
}))

vi.mock('../../settings/StickerLibraryTab', () => ({
  default: ({ audience }: { audience?: string }) => (
    <div data-testid="library" data-audience={audience} />
  ),
}))

import MakeStickerDialog from '../MakeStickerDialog'
import StickersPage from '../StickersPage'

const CAP_MESSAGE = /that's a lot of art this week/i

describe('StickersPage — the "?" (FEAT-178)', () => {
  beforeEach(() => {
    isChildProfileMock.value = true
    useStickerArtQuotaMock.mockReset()
    useStickerArtQuotaMock.mockReturnValue({
      count: 63,
      limit: 100,
      remaining: 37,
      atLimit: false,
      recordGeneration: vi.fn(),
    })
  })

  it('renders exactly one help button, not one per door', () => {
    // "Make a Sticker" itself renders twice on this page (UX-98). The help does
    // not follow it — one "?" for the surface.
    render(<StickersPage />)
    expect(screen.getAllByRole('button', { name: 'Make a Sticker' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'How this works' })).toHaveLength(1)
  })

  it('opens a sheet in the kid’s words, printing the live number', async () => {
    const user = userEvent.setup()
    render(<StickersPage />)

    await user.click(screen.getByRole('button', { name: 'How this works' }))

    expect(screen.getByText('Type a few words. Get one sticker.')).toBeInTheDocument()
    expect(screen.getByText('You have 37 left this week.')).toBeInTheDocument()
  })

  it('hands the same capability answer to the doors below', () => {
    render(<StickersPage />)
    expect(screen.getByTestId('sketch-scanner')).toHaveAttribute('data-audience', 'kid')
    expect(screen.getByTestId('library')).toHaveAttribute('data-audience', 'kid')
  })

  it('reads as a parent when the actor is not a kid profile', async () => {
    const user = userEvent.setup()
    isChildProfileMock.value = false
    render(<StickersPage />)

    expect(screen.getByTestId('library')).toHaveAttribute('data-audience', 'parent')
    await user.click(screen.getByRole('button', { name: 'How this works' }))
    expect(screen.getByText(/turns a few typed words into one cut-out picture/i)).toBeInTheDocument()
    // A parent is uncapped, so the sheet says so rather than counting them down.
    expect(screen.queryByText(/left this week/i)).toBeNull()
  })
})

describe('MakeStickerDialog — the hint under "Create!" (FEAT-178)', () => {
  it('reads the kid line for a kid profile', () => {
    render(<MakeStickerDialog open onClose={() => {}} familyId="f1" audience="kid" />)
    expect(screen.getByRole('button', { name: 'Create!' })).toBeInTheDocument()
    expect(screen.getByText('Makes 1 sticker. Uses 1 art.')).toBeInTheDocument()
  })

  it('reads the fuller parent line by default', () => {
    render(<MakeStickerDialog open onClose={() => {}} familyId="f1" />)
    // Never "your weekly art budget" — a parent is uncapped and never touches
    // the counter (Codex P2, PR #1739).
    expect(screen.getByText('One sticker from your words · 1 paid image call')).toBeInTheDocument()
  })

  it('is replaced at the cap, not doubled', () => {
    render(<MakeStickerDialog open onClose={() => {}} familyId="f1" audience="kid" capReached />)
    expect(screen.getByText(CAP_MESSAGE)).toBeInTheDocument()
    // The price of a tap the kid cannot make is not information they need.
    expect(screen.queryByText('Makes 1 sticker. Uses 1 art.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create!' })).toBeNull()
  })
})
