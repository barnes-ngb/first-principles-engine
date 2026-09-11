import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, beforeEach, vi } from 'vitest'

/**
 * UX-362 — Today's name chip is the SAME chip as the shell's.
 *
 * `ContextBar` used to draw its own `<Chip label={activeChild.name}
 * color="primary" variant="outlined" />` with no `onClick`: the exact defect
 * `UX-324` wrote `ChildSwitcherChip` to fix, live on the page a parent opens
 * first. What this file pins is not that the chip renders — it is that the
 * chip and the page's own `ChildSelector` **cannot disagree**, because both
 * resolve through the one `useActiveChild`.
 *
 * So this test uses the **real** `useActiveChild`, the real
 * `activeChildStore` and the real `canSwitchChild`. Only the Firestore edges
 * are mocked: `useChildren`'s document load and the avatar profile read. A
 * harness that mocked the hook could not fail on the thing being asserted.
 */

const profileRef = { current: 'parents' }
vi.mock('../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: profileRef.current, canEdit: profileRef.current === 'parents' }),
}))
vi.mock('../core/auth/useAuth', () => ({
  useAuth: () => ({ familyId: 'family-1' }),
  useFamilyId: () => 'family-1',
}))
vi.mock('../features/avatar/useAvatarProfile', () => ({ useAvatarProfile: () => null }))

// The children the family has. `useChildren`'s Firestore read is the one thing
// stubbed; the selection itself runs through the real shared store.
const CHILDREN = [
  { id: 'c1', name: 'Lincoln' },
  { id: 'c2', name: 'London' },
]
vi.mock('../core/hooks/useChildren', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/hooks/useChildren')>()
  const react = await import('react')
  const store = await import('../core/hooks/activeChildStore')
  return {
    ...actual,
    useChildren: () => {
      const selectedChildId = react.useSyncExternalStore(
        store.subscribeActiveChildId,
        store.getActiveChildId,
      )
      return {
        children: CHILDREN,
        selectedChildId,
        setSelectedChildId: store.setActiveChildIdShared,
        isLoading: false,
        addChild: vi.fn(),
      }
    },
  }
})

import ContextBar from './ContextBar'
import ChildSelector from './ChildSelector'
import { useActiveChild } from '../core/hooks/useActiveChild'
import { setActiveChildIdShared } from '../core/hooks/activeChildStore'

/**
 * Today's shape: `ContextBar` is handed `useActiveChild().activeChild` as a
 * prop while the chip inside it reads the hook itself. That split is exactly
 * what could drift, so the harness reproduces it rather than passing a literal.
 */
function TodayLikeHarness({ withSelector = true }: { withSelector?: boolean }) {
  const { activeChild, activeChildId, children, setActiveChildId, isChildProfile } =
    useActiveChild()
  return (
    <MemoryRouter>
      <ContextBar page="today" activeChild={activeChild} dateKey="2026-09-11" />
      {withSelector && !isChildProfile && (
        <div data-testid="selector">
          <ChildSelector
            children={children}
            selectedChildId={activeChildId}
            onSelect={setActiveChildId}
          />
        </div>
      )}
    </MemoryRouter>
  )
}

beforeEach(() => {
  profileRef.current = 'parents'
  setActiveChildIdShared('c1')
})

describe('ContextBar renders the one child switcher (UX-362)', () => {
  it('gives a parent the real switcher, not an inert look-alike chip', () => {
    render(<TodayLikeHarness />)

    expect(
      screen.getByRole('button', { name: 'Switch child — currently Lincoln' }),
    ).toBeInTheDocument()
    // The caret is the affordance; asserted positively so the negative
    // assertions elsewhere cannot pass vacuously.
    expect(screen.getByTestId('ArrowDropDownIcon')).toBeInTheDocument()
  })

  it('the chip and the page selector move together — they cannot disagree', async () => {
    render(<TodayLikeHarness />)

    const selector = screen.getByTestId('selector')
    // Before: the selector marks Lincoln, and the chip names him.
    expect(within(selector).getByText('London').closest('.MuiChip-root')).toHaveClass(
      'MuiChip-outlined',
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Switch child — currently Lincoln' }),
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'London' }))

    // The chip followed — which also proves the `activeChild` PROP the bar is
    // handed followed, since the accessible name is built from it.
    expect(
      screen.getByRole('button', { name: 'Switch child — currently London' }),
    ).toBeInTheDocument()
    // …and so did the selector, from the same store, without a second write.
    expect(
      within(screen.getByTestId('selector')).getByText('London').closest('.MuiChip-root'),
    ).toHaveClass('MuiChip-filled')
  })

  it('a selection made in the page selector moves the chip too', async () => {
    render(<TodayLikeHarness />)

    await userEvent.click(within(screen.getByTestId('selector')).getByText('London'))

    expect(
      screen.getByRole('button', { name: 'Switch child — currently London' }),
    ).toBeInTheDocument()
  })
})

describe('ContextBar for a kid profile — capability, never a name (UX-362)', () => {
  beforeEach(() => {
    profileRef.current = 'lincoln'
  })

  it('renders the read-only chip and no selector at all', () => {
    render(<TodayLikeHarness />)

    expect(screen.getByText('Lincoln')).toBeInTheDocument()
    expect(screen.queryByTestId('ArrowDropDownIcon')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Switch child/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('selector')).not.toBeInTheDocument()
  })

  it('resolves to his OWN child however the shared store is set', () => {
    // The kid path is not "whatever was last selected" — `useActiveChild`
    // locks a child profile to his own record, which is what makes the
    // read-only chip honest rather than merely inert.
    setActiveChildIdShared('c2')
    render(<TodayLikeHarness />)

    expect(screen.getByText('Lincoln')).toBeInTheDocument()
    expect(screen.queryByText('London')).not.toBeInTheDocument()
  })
})
