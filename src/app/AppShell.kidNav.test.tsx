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
  useActiveChild: () => ({ activeChild: { id: 'c1', name: 'London' }, activeChildId: 'c1' }),
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
 * FEAT-186 (London audit #9, owner decision).
 *
 * The kid nav's `My Stuff` opened `/records/portfolio` — the PARENT Portfolio:
 * "Demo Night Highlights", Year/Month selects, a search box, Subject/Type
 * filters and a markdown export. Harmless and read-only, and useless to a
 * six-year-old. The decision was to drop the nav entry rather than build a kid
 * gallery in a wording run; the gallery is filed as a candidate.
 *
 * The ROUTE is deliberately untouched: a parent still reaches the Portfolio
 * from Records, and a typed URL still resolves. Only the kid's nav entry is
 * gone — this is the nav declining to advertise a destination, not a guard.
 */
describe('AppShell — no `My Stuff` in the kid nav (FEAT-186)', () => {
  it('does not offer it to a kid profile', () => {
    renderAs(UserProfile.London)
    expect(screen.queryByText('My Stuff')).not.toBeInTheDocument()
  })

  it('does not offer it to the older kid profile either (capability, never a name)', () => {
    renderAs(UserProfile.Lincoln)
    expect(screen.queryByText('My Stuff')).not.toBeInTheDocument()
  })

  it('leaves no kid link pointing at the parent Portfolio at all', () => {
    const { container } = renderAs(UserProfile.London)
    expect(container.querySelector('a[href="/records/portfolio"]')).toBeNull()
  })

  it('still gives a kid the surfaces that are for him', () => {
    renderAs(UserProfile.London)
    // A sample of the kid nav, so a stray filter can never empty it silently.
    for (const label of ['Today', 'My Books', 'Books About Me', 'My Hero', 'Dad Lab']) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0)
    }
  })

  it('a parent keeps Records, which is where the Portfolio lives', () => {
    renderAs(UserProfile.Parents)
    expect(screen.getAllByText('Records').length).toBeGreaterThan(0)
  })
})
