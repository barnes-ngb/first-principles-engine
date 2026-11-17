import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from './AppShell'
import { UserProfile } from '../core/types/enums'

/**
 * LOCAL-BUILD-001 — the Build Studio nav entry.
 *
 * The rule under test is that the MENU and the ROUTE GUARD read one predicate,
 * so the menu can never advertise a door the guard will bounce. The guard's own
 * behaviour is pinned by `buildStudioAccess.test.ts` against the pure rule;
 * this suite is about whether the shell actually asks it, and what it does with
 * each of the three answers.
 *
 * POSITIVE CONTROL: delete the `/build-studio` filter line in `NavContent` and
 * every "hides" case below fails.
 */

const profileRef = { current: UserProfile.Lincoln as UserProfile }
const optInRef = {
  current: { status: 'ready', enabled: true, childId: 'c1' } as {
    status: string
    enabled: boolean
    childId: string | null
  },
}
const childrenRef = {
  current: {
    activeChild: { id: 'c1', name: 'Lincoln' } as { id: string; name: string } | null,
    activeChildId: 'c1',
    childrenFamilyId: 'family-1' as string | null,
    isLoading: false,
    loadFailed: false,
    /** `useActiveChild`'s affirmative identity fact. */
    profileChildResolved: true,
  },
}

vi.mock('../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: profileRef.current }),
}))
vi.mock('../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    ...childrenRef.current,
    children: childrenRef.current.activeChild ? [childrenRef.current.activeChild] : [],
    setActiveChildId: () => {},
    isChildProfile: profileRef.current !== UserProfile.Parents,
  }),
}))
vi.mock('../core/auth/useAuth', () => ({ useAuth: () => ({ familyId: 'family-1' }) }))
vi.mock('../features/avatar/useAvatarProfile', () => ({ useAvatarProfile: () => null }))
vi.mock('../core/hooks/useChildSkillSnapshot', () => ({
  useChildSkillSnapshot: () => ({ snapshot: null, loaded: true }),
}))
vi.mock('../components/ProfileMenu', () => ({ default: () => <div>profile-menu</div> }))
vi.mock('../components/DebugPanel', () => ({ default: () => <div>debug-panel</div> }))
vi.mock('../features/avatar/AvatarThumbnail', () => ({ default: () => null }))
vi.mock('../features/build-studio/useBuildStudioOptIn', () => ({
  useBuildStudioOptIn: () => optInRef.current,
}))

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

beforeEach(() => {
  optInRef.current = { status: 'ready', enabled: true, childId: 'c1' }
  childrenRef.current = {
    activeChild: { id: 'c1', name: 'Lincoln' },
    activeChildId: 'c1',
    childrenFamilyId: 'family-1',
    isLoading: false,
    loadFailed: false,
    profileChildResolved: true,
  }
})

describe('the CHILD entry appears only on an answered, enabled opt-in', () => {
  it('shows it to the opted-in child', () => {
    renderAs(UserProfile.Lincoln)
    expect(screen.getAllByText('Build Studio').length).toBeGreaterThan(0)
  })

  it('links it at /build-studio', () => {
    renderAs(UserProfile.Lincoln)
    expect(screen.getAllByText('Build Studio')[0].closest('a')).toHaveAttribute(
      'href',
      '/build-studio',
    )
  })

  it('hides it when the opt-in says no', () => {
    optInRef.current = { status: 'ready', enabled: false, childId: 'c1' }
    renderAs(UserProfile.Lincoln)
    expect(screen.queryByText('Build Studio')).not.toBeInTheDocument()
  })

  it('hides it while the opt-in has not answered', () => {
    optInRef.current = { status: 'loading', enabled: false, childId: null }
    renderAs(UserProfile.Lincoln)
    expect(screen.queryByText('Build Studio')).not.toBeInTheDocument()
  })

  it('hides it when the opt-in read FAILED — not an open door', () => {
    optInRef.current = { status: 'failed', enabled: false, childId: 'c1' }
    renderAs(UserProfile.Lincoln)
    expect(screen.queryByText('Build Studio')).not.toBeInTheDocument()
  })

  it('hides it when the opt-in answer is about a DIFFERENT child', () => {
    // Shared family auth is family access, not sibling authorisation.
    optInRef.current = { status: 'ready', enabled: true, childId: 'c2' }
    renderAs(UserProfile.Lincoln)
    expect(screen.queryByText('Build Studio')).not.toBeInTheDocument()
  })

  it('hides it when the child profile did not resolve to its own document', () => {
    // `useActiveChild` falls back to the selected id, which can be a SIBLING.
    childrenRef.current = { ...childrenRef.current, profileChildResolved: false }
    renderAs(UserProfile.Lincoln)
    expect(screen.queryByText('Build Studio')).not.toBeInTheDocument()
  })

  it('hides it when the child id resolves to no child', () => {
    childrenRef.current = { ...childrenRef.current, activeChild: null }
    renderAs(UserProfile.Lincoln)
    expect(screen.queryByText('Build Studio')).not.toBeInTheDocument()
  })

  it('hides it when the children read failed', () => {
    childrenRef.current = { ...childrenRef.current, loadFailed: true, isLoading: true }
    renderAs(UserProfile.Lincoln)
    expect(screen.queryByText('Build Studio')).not.toBeInTheDocument()
  })

  it('hides it when the children list belongs to another family', () => {
    childrenRef.current = { ...childrenRef.current, childrenFamilyId: 'family-2' }
    renderAs(UserProfile.Lincoln)
    expect(screen.queryByText('Build Studio')).not.toBeInTheDocument()
  })
})

/**
 * The P2 repair. A parent gated on `enabled` had no nav entry on FIRST USE —
 * so the thing that grants access was behind the door it grants — and lost the
 * entry again the moment she turned it off, taking the saved versions with it.
 *
 * POSITIVE CONTROL: move the opt-in checks back above the parent branch in
 * `resolveBuildStudioAccess` and the first two cases here fail.
 */
describe('the PARENT entry is her door to granting and reviewing', () => {
  it('shows it to the parent when the child IS enrolled', () => {
    renderAs(UserProfile.Parents)
    expect(screen.getAllByText('Build Studio').length).toBeGreaterThan(0)
  })

  it('shows it to the parent BEFORE the child is enrolled', () => {
    optInRef.current = { status: 'ready', enabled: false, childId: 'c1' }
    renderAs(UserProfile.Parents)
    expect(screen.getAllByText('Build Studio').length).toBeGreaterThan(0)
  })

  it('shows it after she turns it off — her shelf must stay reachable', () => {
    optInRef.current = { status: 'ready', enabled: false, childId: null }
    renderAs(UserProfile.Parents)
    expect(screen.getAllByText('Build Studio').length).toBeGreaterThan(0)
  })

  it('still hides it while her opt-in read has not answered', () => {
    optInRef.current = { status: 'loading', enabled: false, childId: null }
    renderAs(UserProfile.Parents)
    expect(screen.queryByText('Build Studio')).not.toBeInTheDocument()
  })

  it('hides it when no child resolves at all', () => {
    childrenRef.current = { ...childrenRef.current, activeChild: null }
    renderAs(UserProfile.Parents)
    expect(screen.queryByText('Build Studio')).not.toBeInTheDocument()
  })
})

describe('the rest of the menu is untouched', () => {
  it('still shows the entries that were there before', () => {
    renderAs(UserProfile.Lincoln)
    for (const label of ['Today', 'My Books', 'Stonebridge', 'Game Workshop', 'Dad Lab']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
  })
})
