import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AppShell } from './AppShell'
import { UserProfile } from '../core/types/enums'

// ── Hook deps stubbed (AppShell pulls a lot of context) ───────────
const profileRef = { current: UserProfile.Parents as UserProfile }

vi.mock('../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: profileRef.current }),
}))
vi.mock('../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({ activeChild: { id: 'c1', name: 'Lincoln' }, activeChildId: 'c1' }),
}))
vi.mock('../core/auth/useAuth', () => ({ useAuth: () => ({ familyId: 'family-1' }) }))
vi.mock('../features/avatar/useAvatarProfile', () => ({ useAvatarProfile: () => null }))
vi.mock('../core/hooks/useChildSkillSnapshot', () => ({
  useChildSkillSnapshot: () => ({ snapshot: null, loaded: true }),
}))
vi.mock('../components/ProfileMenu', () => ({ default: () => <div>profile-menu</div> }))
vi.mock('../components/DebugPanel', () => ({ default: () => <div>debug-panel</div> }))
vi.mock('../features/avatar/AvatarThumbnail', () => ({ default: () => null }))

function renderAs(profile: UserProfile) {
  profileRef.current = profile
  return render(
    <MemoryRouter initialEntries={['/today']}>
      <AppShell>
        <div data-testid="page">today</div>
      </AppShell>
    </MemoryRouter>,
  )
}

/**
 * FEAT-132: the Watch Library got its own top-level nav entry (it was the 4th
 * tab inside Settings, where device testing couldn't find it). Curation is a
 * parent job, so the entry is parent-only — and there is deliberately no kid
 * entry, because the library is vetting, not watching.
 */
describe('AppShell — Watch Library nav entry (FEAT-132)', () => {
  it('shows the Watch Library entry for a parent', () => {
    renderAs(UserProfile.Parents)
    expect(screen.getAllByText('Watch Library').length).toBeGreaterThan(0)
  })

  it('links it at /watch, not into Settings', () => {
    renderAs(UserProfile.Parents)
    const link = screen.getAllByText('Watch Library')[0].closest('a')
    expect(link).toHaveAttribute('href', '/watch')
  })

  it('hides it from a kid profile — the library is vetting, not watching', () => {
    renderAs(UserProfile.Lincoln)
    expect(screen.queryByText('Watch Library')).not.toBeInTheDocument()
  })

  it('hides it from the younger kid profile too (capability, never a name)', () => {
    renderAs(UserProfile.London)
    expect(screen.queryByText('Watch Library')).not.toBeInTheDocument()
  })
})
