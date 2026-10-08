import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * StickersPage is the host that OPENS the game-art door (FEAT-239).
 *
 * The door reaches parents and children alike — a kid making a sprite from
 * their own drawing is the point of it — because the conversion spends nothing,
 * writes nothing, and reads only a picture this page is already showing. So the
 * gate is the page's existing family/profile/child identity and nothing else:
 * no name, no `canEdit`, no art quota.
 */
const { useStickerArtQuotaMock, actor } = vi.hoisted(() => ({
  useStickerArtQuotaMock: vi.fn(),
  actor: { isChildProfile: true, profile: 'lincoln' as string | undefined, familyId: 'family-1' as string | undefined },
}))

vi.mock('../useStickerArtQuota', () => ({
  useStickerArtQuota: useStickerArtQuotaMock,
  recordStickerArtGeneration: vi.fn(),
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => actor.familyId }))

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-1', name: 'Lincoln' },
    activeChildId: 'child-1',
    children: [{ id: 'child-1', name: 'Lincoln' }],
    isChildProfile: actor.isChildProfile,
  }),
}))

vi.mock('../../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: actor.profile }),
}))

vi.mock('../../../components/Page', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../SketchScanner', () => ({ default: () => <div /> }))

vi.mock('../../settings/StickerLibraryTab', () => ({
  default: ({
    enableGameArt,
    gameArtContextKey,
    editContextKey,
    capReached,
  }: {
    enableGameArt?: boolean
    gameArtContextKey?: string
    editContextKey?: string
    capReached?: boolean
  }) => (
    <div
      data-testid="library"
      data-game-art={String(!!enableGameArt)}
      data-game-art-key={gameArtContextKey ?? ''}
      data-edit-key={editContextKey ?? ''}
      data-cap={String(!!capReached)}
    />
  ),
}))

import StickersPage from '../StickersPage'

const library = () => screen.getByTestId('library')

beforeEach(() => {
  actor.isChildProfile = true
  actor.profile = 'lincoln'
  actor.familyId = 'family-1'
  useStickerArtQuotaMock.mockReset()
  useStickerArtQuotaMock.mockReturnValue({
    count: 0,
    limit: 100,
    remaining: 100,
    atLimit: false,
    recordGeneration: vi.fn(),
  })
})

describe('StickersPage opens the game-art door', () => {
  it('enables it for a child profile, keyed to the resolved identity', () => {
    render(<StickersPage />)

    expect(library()).toHaveAttribute('data-game-art', 'true')
    expect(library()).toHaveAttribute('data-game-art-key', 'family-1|lincoln|child-1')
  })

  it('enables it for a parent too', () => {
    actor.isChildProfile = false
    actor.profile = 'parents'
    render(<StickersPage />)

    expect(library()).toHaveAttribute('data-game-art', 'true')
    expect(library()).toHaveAttribute('data-game-art-key', 'family-1|parents|child-1')
  })

  /**
   * One identity, read from one value. Two keys composed separately from the
   * same three parts are two things that can disagree, and the library retires
   * its big preview when either changes.
   */
  it('runs as the SAME identity as the saved-version editor', () => {
    render(<StickersPage />)
    expect(library().getAttribute('data-game-art-key')).toBe(
      library().getAttribute('data-edit-key'),
    )
  })

  it('does not open it without a family to read in', () => {
    actor.familyId = undefined
    render(<StickersPage />)

    expect(library()).toHaveAttribute('data-game-art', 'false')
    expect(library()).toHaveAttribute('data-game-art-key', '')
  })

  /**
   * The conversion is local arithmetic and the export is a file, so the weekly
   * art budget — which governs paid generation — may not gate it. Asserted at
   * the cap, where the paid doors do stand down.
   */
  it('still opens it at the weekly art cap', () => {
    useStickerArtQuotaMock.mockReturnValue({
      count: 100,
      limit: 100,
      remaining: 0,
      atLimit: true,
      recordGeneration: vi.fn(),
    })
    render(<StickersPage />)

    expect(library()).toHaveAttribute('data-cap', 'true')
    expect(library()).toHaveAttribute('data-game-art', 'true')
  })
})
