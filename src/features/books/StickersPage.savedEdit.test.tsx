import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import StickersPage from './StickersPage'
import type { Child } from '../../core/types'

/**
 * What the Stickers page tells the library about WHO is editing
 * (SAVED-STICKER-EDITOR-003).
 *
 * The door is opt-in on an explicit identity, so the page is the thing that has
 * to supply one — and supply the same one whether the library's filter says
 * "All" or "For Lincoln", because that chip is a view and not an identity. The
 * library tab is stubbed here: this test is about the props that cross the
 * boundary, which is the only place the question is answered.
 */

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

const familyId = { current: 'family-1' }
vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => familyId.current,
}))

const LINCOLN: Child = { id: 'child-lincoln', name: 'Lincoln' } as Child
const LONDON: Child = { id: 'child-london', name: 'London' } as Child

const activeChild = { current: LINCOLN }
const profile = { current: 'parents' as string | null }
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: activeChild.current,
    activeChildId: activeChild.current?.id ?? '',
    children: [LINCOLN, LONDON],
    setActiveChildId: () => {},
    isChildProfile: profile.current !== 'parents',
    isLoading: false,
    addChild: () => {},
  }),
}))

vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: profile.current }),
}))

vi.mock('./useStickerArtQuota', () => ({
  useStickerArtQuota: () => ({
    atLimit: false,
    limit: 5,
    remaining: 5,
    recordGeneration: async () => {},
  }),
  recordStickerArtGeneration: () => {},
}))

/** The stub: it only reports the identity it was handed. */
vi.mock('../settings/StickerLibraryTab', () => ({
  default: (props: { enableSavedStickerEditing?: boolean; editContextKey?: string }) => (
    <div
      data-testid="library"
      data-enabled={String(!!props.enableSavedStickerEditing)}
      data-context={props.editContextKey ?? ''}
    />
  ),
}))

vi.mock('./MakeStickerDialog', () => ({ default: () => null }))
vi.mock('./SketchScanner', () => ({ default: () => null }))
vi.mock('./ArtHelpSheet', () => ({
  default: () => null,
  ArtHelpButton: () => null,
  GenerateHint: () => null,
}))

const library = () => screen.getByTestId('library')

beforeEach(() => {
  familyId.current = 'family-1'
  activeChild.current = LINCOLN
  profile.current = 'parents'
})

// ── Tests ─────────────────────────────────────────────────────────

describe('the identity the Stickers page supplies', () => {
  it('opts the door in with family, profile and the resolved child', () => {
    render(<StickersPage />)
    expect(library()).toHaveAttribute('data-enabled', 'true')
    expect(library()).toHaveAttribute('data-context', 'family-1|parents|child-lincoln')
  })

  it('supplies the same identity while the library filter says All', async () => {
    const user = userEvent.setup()
    render(<StickersPage />)
    const before = library().getAttribute('data-context')

    // The "For Lincoln" / "All" chips narrow what is shown; they do not change
    // who is editing, so the key must not move with them.
    await user.click(screen.getByRole('button', { name: 'For Lincoln' }))
    expect(library()).toHaveAttribute('data-context', before!)
    // The child row's "All" — the tag row has one of its own.
    await user.click(screen.getAllByRole('button', { name: 'All' })[0])
    expect(library()).toHaveAttribute('data-context', before!)
  })

  it('moves the identity when the child or the profile changes', () => {
    const { rerender } = render(<StickersPage />)
    const asParentOfLincoln = library().getAttribute('data-context')

    activeChild.current = LONDON
    rerender(<StickersPage />)
    const asParentOfLondon = library().getAttribute('data-context')
    expect(asParentOfLondon).not.toBe(asParentOfLincoln)

    profile.current = 'london'
    rerender(<StickersPage />)
    expect(library().getAttribute('data-context')).not.toBe(asParentOfLondon)
  })

  it('moves the identity when the family changes', () => {
    const { rerender } = render(<StickersPage />)
    const first = library().getAttribute('data-context')

    familyId.current = 'family-2'
    rerender(<StickersPage />)
    expect(library().getAttribute('data-context')).not.toBe(first)
  })

  it('leaves the door shut when there is no family to write in', () => {
    familyId.current = ''
    render(<StickersPage />)
    expect(library()).toHaveAttribute('data-enabled', 'false')
    expect(library()).toHaveAttribute('data-context', '')
  })
})
