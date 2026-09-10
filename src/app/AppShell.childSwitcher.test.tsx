import { render, screen } from '@testing-library/react'
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

  it('renders read-only name chips at BOTH sites for a single-child family', () => {
    activeChildRef.current = {
      ...activeChildRef.current,
      children: [{ id: 'c1', name: 'Lincoln' }],
    }
    renderShell()
    expect(screen.queryByRole('button', { name: SWITCHER })).not.toBeInTheDocument()
    expect(screen.getAllByText('Lincoln').length).toBeGreaterThan(0)
  })
})

describe('AppShell child chips as they SHIP (UX-330 — switch off)', () => {
  beforeEach(() => {
    // Read the shipped `CHILD_SWITCHER_ENABLED`, not a forced value.
    forceSwitcherEnabled.current = undefined
  })

  it('renders the read-only chip at BOTH sites, even for a parent with two children', () => {
    renderShell()

    // Both sites still name the child — the shell is not silent about whose
    // day it is; it just does not claim to be a control.
    expect(screen.getAllByText('Lincoln')).toHaveLength(2)
    // No caret, no menu, nothing pressable — at either site.
    expect(screen.queryByTestId('ArrowDropDownIcon')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SWITCHER })).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
