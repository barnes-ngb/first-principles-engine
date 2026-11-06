import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AppShell } from './AppShell'
import { UserProfile } from '../core/types/enums'
import { STONEBRIDGE_TOWN_PATH } from '../features/avatar/stonebridge/stonebridgeDestinations'

/**
 * The village's own menu entry — the whole of this slice's nav change.
 *
 * ── What it claims ───────────────────────────────────────────────────────────
 *
 * One SHARED entry, in the menu both profiles already use, pointing at the
 * canonical town page. It is additive: `My Hero`, `My Books`, `Today` and every
 * other existing entry are still there, nothing is replaced, nothing is
 * reordered away, and no capability, name, theme or age decides whether the
 * entry appears — which is the whole of the organizer's navigational choice and
 * is exactly the part a later edit could quietly undo.
 *
 * The route itself (that `/stonebridge` mounts the real page, ungated) is pinned
 * against the app's route table in `stonebridgeDestinations.test.tsx`; this is
 * the nav half, which only the shell can answer.
 */

const profileRef = { current: UserProfile.Parents as UserProfile }

vi.mock('../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: profileRef.current }),
}))
vi.mock('../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'c1', name: 'Lincoln' },
    activeChildId: 'c1',
    children: [{ id: 'c1', name: 'Lincoln' }],
    setActiveChildId: () => {},
    isChildProfile: false,
    isLoading: false,
    loadFailed: false,
  }),
}))
vi.mock('../core/auth/useAuth', () => ({ useAuth: () => ({ familyId: 'family-1' }) }))
vi.mock('../features/avatar/useAvatarProfile', () => ({ useAvatarProfile: () => null }))
vi.mock('../core/hooks/useChildSkillSnapshot', () => ({
  // No Mine calibration: the Knowledge Mine entry is hidden for a kid, and the
  // village entry must NOT follow it — the village is not gated on a scan.
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

describe('AppShell — the Stonebridge entry is shared and additive', () => {
  for (const profile of [UserProfile.Parents, UserProfile.Lincoln, UserProfile.London]) {
    it(`offers it to ${profile}, pointing at the canonical page`, () => {
      const { container } = renderAs(profile)
      expect(screen.getAllByText('Stonebridge').length).toBeGreaterThan(0)
      // The entry's destination, read from the rendered link rather than from
      // the array: the page it opens is the claim.
      expect(
        container.querySelector(`a[href="${STONEBRIDGE_TOWN_PATH}"]`),
        `${profile} has no link to ${STONEBRIDGE_TOWN_PATH}`,
      ).not.toBeNull()
    })
  }

  it('keeps every kid entry it had — nothing replaced, nothing dropped', () => {
    const { container } = renderAs(UserProfile.London)
    for (const label of ['Today', 'My Books', 'Books About Me', 'My Hero', 'Dad Lab']) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0)
    }
    // `My Hero` still goes to the hub, so the armor, the customizer and the
    // ceremonies are still one tap away.
    expect(container.querySelector('a[href="/avatar"]')).not.toBeNull()
  })

  it('keeps every parent entry it had', () => {
    renderAs(UserProfile.Parents)
    for (const label of ['Today', 'Books', 'Records', 'Settings', 'Progress']) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0)
    }
  })

  it('is not gated like the Knowledge Mine, which is the gated entry beside it', () => {
    // The negative control for "no new gate": with no calibration the Mine's
    // entry is hidden for a kid and the village's is not, so the two are
    // demonstrably on different rules rather than both happening to show.
    renderAs(UserProfile.Lincoln)
    expect(screen.queryByText('Knowledge Mine')).not.toBeInTheDocument()
    expect(screen.getAllByText('Stonebridge').length).toBeGreaterThan(0)
  })
})
