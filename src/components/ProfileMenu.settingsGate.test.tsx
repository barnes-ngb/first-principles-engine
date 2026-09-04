import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import ProfileMenu from './ProfileMenu'
import { UserProfile } from '../core/types/enums'

const profileRef = { current: UserProfile.Parents as UserProfile }
const navigate = vi.fn()

vi.mock('../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: profileRef.current, selectProfile: vi.fn() }),
}))
vi.mock('../core/auth/useAuth', () => ({ useAuth: () => ({ familyId: 'family-1' }) }))
vi.mock('../core/hooks/useChildren', () => ({ useChildren: () => ({ children: [] }) }))
vi.mock('../features/avatar/useAvatarProfile', () => ({ useAvatarProfile: () => null }))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

/** The pill's own label per profile — the menu is closed until it is tapped. */
const PILL_LABEL: Record<UserProfile, string> = {
  [UserProfile.Lincoln]: 'Lincoln',
  [UserProfile.London]: 'London',
  [UserProfile.Parents]: 'Parents',
}

function openMenuAs(profile: UserProfile) {
  profileRef.current = profile
  navigate.mockClear()
  const view = render(
    <MemoryRouter>
      <ProfileMenu />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText(PILL_LABEL[profile]))
  return view
}

/**
 * FEAT-186 / UX-76 — Settings was one tap from the profile pill.
 *
 * `/settings` is `parentOnly` in the nav and has no route guard, so the pill's
 * Settings item was the whole distance between a kid and the General tab: a
 * Theme select and the AI Features switches (`SettingsPage.tsx:160-200`). The
 * item is now gated on the parent profile — capability, never a name — which
 * makes the AI switches unreachable for a kid without a second gate on them.
 *
 * What is deliberately NOT changed here: the profile switcher itself. A kid can
 * still choose "Parents" from this menu, exactly as before; that is the family's
 * own trust model and its own decision, not this run's.
 */
describe('ProfileMenu — Settings is parent-only (UX-76)', () => {
  it('offers Settings to a parent', () => {
    openMenuAs(UserProfile.Parents)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('navigates to /settings when a parent taps it', () => {
    openMenuAs(UserProfile.Parents)
    fireEvent.click(screen.getByText('Settings'))
    expect(navigate).toHaveBeenCalledWith('/settings')
  })

  it('hides it from the younger kid profile', () => {
    openMenuAs(UserProfile.London)
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })

  it('hides it from the older kid profile too — capability, never a name', () => {
    openMenuAs(UserProfile.Lincoln)
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })

  it('still lets a kid switch profiles — only the Settings item is gated', () => {
    openMenuAs(UserProfile.London)
    for (const label of ['Lincoln', 'London', 'Parents']) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0)
    }
  })
})
