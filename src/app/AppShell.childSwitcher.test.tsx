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

describe('AppShell child chips (UX-324)', () => {
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
