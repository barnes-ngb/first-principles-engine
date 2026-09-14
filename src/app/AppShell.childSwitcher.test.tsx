import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { AppShell } from './AppShell'
import { UserProfile } from '../core/types/enums'

/**
 * UX-324 — the shell renders the active child's name in two places (the mobile
 * header, and `NavContent`, which is the desktop sidebar and the mobile drawer).
 * Both were inert chips styled exactly like every tappable chip in the app. The
 * property this file pins is that they AGREE: two chips that look alike and
 * behave differently is the bug being re-created.
 *
 * `UX-425` narrowed *where* rather than *whether*. The owner counted four child
 * controls on one screen, so the mobile **drawer** — which shares `NavContent`
 * with the desktop sidebar and opens directly under the header's own chip —
 * passes `showChildChip={false}`. The two sites left are one per viewport: the
 * header below 900px, the sidebar above, never both visible at once. Both are
 * still the one component, so the agreement property is unchanged.
 *
 * It also split the rule in two: `canSwitchChild` (may this parent change
 * child) is what `CHILD_SWITCHER_ENABLED` gates, and `canOpenChildMenu` (is
 * there a menu at all) is true for any parent and ungated, because the menu is
 * now the app's only *Add a child…* door.
 */

const profileRef = { current: UserProfile.Parents as UserProfile }
const activeChildRef = {
  current: {
    activeChild: { id: 'c1', name: 'Lincoln' },
    activeChildId: 'c1',
    children: [
      { id: 'c1', name: 'Lincoln' },
      { id: 'c2', name: 'London' },
    ],
    setActiveChildId: vi.fn(),
    isChildProfile: false,
  },
}

/**
 * UX-330 — the switcher ships OFF behind `CHILD_SWITCHER_ENABLED`. The blocks
 * that exercise the switchable path force it on; the last block reads the
 * shipped constant. The mock delegates to the **real** `canSwitchChild` and
 * only supplies the `enabled` argument the chip omits, so these still test the
 * rule rather than a stub — `undefined` falls through to its default.
 */
const forceSwitcherEnabled: { current: boolean | undefined } = { current: undefined }
vi.mock('../components/childSwitcher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/childSwitcher')>()
  return {
    ...actual,
    canSwitchChild: (
      audience: import('../components/childSwitcher').ChildSwitcherAudience,
    ) => actual.canSwitchChild(audience, forceSwitcherEnabled.current),
  }
})

vi.mock('../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: profileRef.current }),
}))
vi.mock('../core/hooks/useActiveChild', () => ({
  useActiveChild: () => activeChildRef.current,
}))
vi.mock('../core/auth/useAuth', () => ({ useAuth: () => ({ familyId: 'family-1' }) }))
vi.mock('../features/avatar/useAvatarProfile', () => ({ useAvatarProfile: () => null }))
vi.mock('../core/hooks/useChildSkillSnapshot', () => ({
  useChildSkillSnapshot: () => ({ snapshot: null, loaded: true }),
}))
vi.mock('../components/ProfileMenu', () => ({ default: () => <div>profile-menu</div> }))
vi.mock('../components/DebugPanel', () => ({ default: () => <div>debug-panel</div> }))
vi.mock('../features/avatar/AvatarThumbnail', () => ({ default: () => null }))

const SWITCHER = 'Switch child — currently Lincoln'

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/today']}>
      <AppShell>
        <div data-testid="page">page</div>
      </AppShell>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  forceSwitcherEnabled.current = true
  profileRef.current = UserProfile.Parents
  activeChildRef.current = {
    activeChild: { id: 'c1', name: 'Lincoln' },
    activeChildId: 'c1',
    children: [
      { id: 'c1', name: 'Lincoln' },
      { id: 'c2', name: 'London' },
    ],
    setActiveChildId: vi.fn(),
    isChildProfile: false,
  }
})

describe('AppShell child chips (UX-324, switch forced on)', () => {
  it('renders the switcher at BOTH name-chip sites for a parent', () => {
    renderShell()
    // Mobile header + sidebar nav. Both are the same component, so neither can
    // be the tappable-looking one that does nothing.
    expect(screen.getAllByRole('button', { name: SWITCHER })).toHaveLength(2)
  })

  it('renders read-only name chips at BOTH sites for a child profile', () => {
    profileRef.current = UserProfile.Lincoln
    activeChildRef.current = { ...activeChildRef.current, isChildProfile: true }
    renderShell()

    expect(screen.getAllByText('Lincoln').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: SWITCHER })).not.toBeInTheDocument()
  })

  it('gives a single-child family a menu with no child in it (UX-425)', async () => {
    activeChildRef.current = {
      ...activeChildRef.current,
      children: [{ id: 'c1', name: 'Lincoln' }],
    }
    renderShell()

    // The chip is a control at both sites — but the only thing behind it is the
    // add row, because `canSwitchChild` still refuses a one-entry list.
    expect(screen.getAllByRole('button', { name: SWITCHER })).toHaveLength(2)
    await userEvent.click(screen.getAllByRole('button', { name: SWITCHER })[0])
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      'Add a child…',
    ])
  })

  it('the mobile DRAWER draws no chip of its own (UX-425)', async () => {
    renderShell()
    // Before the drawer opens: header + desktop sidebar, one per viewport.
    expect(screen.getAllByRole('button', { name: SWITCHER })).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))

    // Queried inside the drawer's own paper rather than by a count, because
    // opening it marks the rest of the app `aria-hidden` — a role query would
    // then report zero everywhere and pass whatever the drawer held.
    const drawer = document.querySelector('.MuiDrawer-paper') as HTMLElement | null
    expect(drawer, 'the drawer did not open').not.toBeNull()
    // It really is the nav (so the assertion below is not about an empty box)…
    expect(within(drawer!).getByRole('link', { name: 'Today' })).toBeInTheDocument()
    // …and it carries no chip. The header's is visible above it, which is what
    // the owner's screenshot showed and why this one went.
    expect(within(drawer!).queryByLabelText(SWITCHER)).not.toBeInTheDocument()
    expect(within(drawer!).queryByTestId('ArrowDropDownIcon')).not.toBeInTheDocument()
    expect(within(drawer!).queryByText('Lincoln')).not.toBeInTheDocument()
  })
})

describe('AppShell child chips as they SHIP (FIX-231 — the switch is ON)', () => {
  beforeEach(() => {
    // Read the shipped `CHILD_SWITCHER_ENABLED`, not a forced value.
    forceSwitcherEnabled.current = undefined
  })

  it('renders the real switcher at BOTH sites for a parent with two children', () => {
    renderShell()

    // Positively, so the assertion cannot pass vacuously: the caret at both
    // sites is the affordance, and both are the same component.
    expect(screen.getAllByTestId('ArrowDropDownIcon')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: SWITCHER })).toHaveLength(2)
  })

  it('renders the read-only chip at BOTH sites for a child profile', () => {
    profileRef.current = UserProfile.Lincoln
    activeChildRef.current = { ...activeChildRef.current, isChildProfile: true }
    renderShell()

    expect(screen.getAllByText('Lincoln').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('ArrowDropDownIcon')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SWITCHER })).not.toBeInTheDocument()
  })
})

describe('AppShell child chips with the switch forced back OFF (UX-330)', () => {
  beforeEach(() => {
    forceSwitcherEnabled.current = false
  })

  it('offers no CHILD at either site, for a parent with two children', () => {
    renderShell()

    // Both sites still name the child — the shell is not silent about whose day
    // it is. What the constant takes away is the ability to change him.
    expect(screen.getAllByText('Lincoln')).toHaveLength(2)
    expect(screen.queryByRole('menuitem', { name: 'London' })).not.toBeInTheDocument()
    expect(activeChildRef.current.setActiveChildId).not.toHaveBeenCalled()
  })

  it('KEEPS the add door — the kill switch is over switching, not adding', async () => {
    // UX-425 moved `AddChildDialog`'s only host into this menu. If the constant
    // also closed the menu, flipping a switch that says nothing about adding
    // children would quietly make it impossible to add one.
    renderShell()

    await userEvent.click(screen.getAllByRole('button', { name: SWITCHER })[0])
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      'Add a child…',
    ])
  })

  it('still gives a child profile a chip with nothing to press', () => {
    profileRef.current = UserProfile.Lincoln
    activeChildRef.current = { ...activeChildRef.current, isChildProfile: true }
    renderShell()

    expect(screen.getAllByText('Lincoln')).toHaveLength(2)
    expect(screen.queryByTestId('ArrowDropDownIcon')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SWITCHER })).not.toBeInTheDocument()
  })
})
