import { act, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from './AppShell'
import { UserProfile } from '../core/types/enums'
import {
  beginLibraryReturnFlow,
  endLibraryReturnFlow,
  getLibraryIdentityEpoch,
  getLibraryReturnFlow,
} from '../features/avatar/stonebridge/libraryReturnFlow'

/**
 * The shell's half of the Library-return identity watch: the children READ.
 *
 * Why here, and why it is not enough to watch the identity string: the observer
 * above the gates (`App.tsx`) keys on `family | profile | selected child`, and
 * the selected child is an id in a shared store. It survives a read that is
 * still in flight and a read that REJECTED — `useChildren` keeps the previous
 * answer's list beside the failure — so a failed family read leaves that key
 * reading exactly what it read before, with `activeChild` still a whole object
 * whose id still matches the journey. Gating the control on that only hid it;
 * the journey stayed in module memory and was handed back when the flag
 * cleared. The shell reports the read it already makes for the app bar, which
 * is the one read mounted across the hub as well as the shelf — including the
 * window in which the village board is closing on its way to a departure that
 * does not exist yet, which is why the expiry moves the identity EPOCH and not
 * just the flow.
 *
 * The shelf's own control carries the same watch against its own read; that
 * half, and the whole journey over a real router, are in
 * `features/avatar/stonebridge/libraryReturn.route.test.tsx`.
 */

const fx = vi.hoisted(() => ({ isLoading: false, loadFailed: false }))

vi.mock('../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: UserProfile.Lincoln }),
}))
vi.mock('../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'c1', name: 'Lincoln' },
    activeChildId: 'c1',
    children: [{ id: 'c1', name: 'Lincoln' }],
    setActiveChildId: () => {},
    isChildProfile: true,
    // Reported exactly as `useChildren` reports it: `isLoading` stays TRUE
    // beside a failure, because a failed read is not an empty family.
    isLoading: fx.isLoading,
    loadFailed: fx.loadFailed,
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

const ORIGIN = { familyId: 'family-1', childId: 'c1', missionId: 'library_hut' }

/** A journey, begun against the epoch the module has actually observed. */
function begin() {
  return beginLibraryReturnFlow({ ...ORIGIN, observedEpoch: getLibraryIdentityEpoch() })
}

/**
 * The shelf under the real shell, as a FRESH element each call.
 *
 * Deliberately a function: re-rendering with the same element object lets React
 * bail out of the subtree, and this suite's whole mechanism is a re-render that
 * reports a different read.
 */
const shell = () => (
  <MemoryRouter initialEntries={['/books']}>
    <AppShell>
      <div data-testid="page">the shelf</div>
    </AppShell>
  </MemoryRouter>
)

beforeEach(() => {
  fx.isLoading = false
  fx.loadFailed = false
  endLibraryReturnFlow()
})

describe('AppShell — an unknown children read ends a Library return', () => {
  it('a read that FAILS under a live journey ends it permanently', () => {
    const view = render(shell())
    expect(begin()).not.toBeNull()
    const tapped = getLibraryIdentityEpoch()

    act(() => {
      fx.isLoading = true
      fx.loadFailed = true
      view.rerender(shell())
    })

    // Ended, not hidden — the child object and the selected id never changed.
    expect(getLibraryReturnFlow()).toBeNull()
    // And the epoch moved with it, so a departure tapped before the failure
    // cannot create a journey after it.
    expect(beginLibraryReturnFlow({ ...ORIGIN, observedEpoch: tapped })).toBeNull()

    // The read works again: a page that works, not a journey resuming.
    act(() => {
      fx.isLoading = false
      fx.loadFailed = false
      view.rerender(shell())
    })
    expect(getLibraryReturnFlow()).toBeNull()

    // The positive control: a fresh, deliberate trip after the recovery is a
    // perfectly good journey, so what expired was the old one and not the
    // feature.
    expect(begin()).not.toBeNull()
  })

  it('and a re-read that goes back in flight under it ends it too', () => {
    // The retry, and any other re-read: this observer HAS seen its own read
    // settle, so going unknown again is an identity it can no longer vouch for
    // — the same verdict as a failure, reached without one.
    const view = render(shell())
    expect(begin()).not.toBeNull()

    act(() => {
      fx.isLoading = true
      view.rerender(shell())
    })
    expect(getLibraryReturnFlow()).toBeNull()

    // And it is reported once, not once per render, however long it stays there.
    const after = getLibraryIdentityEpoch()
    act(() => {
      view.rerender(shell())
    })
    expect(getLibraryIdentityEpoch()).toBe(after)
  })

  it('and so does a shell that MOUNTS into a failed read', () => {
    // The shape a remount reaches: the child came back to the shelf from the
    // reader, or the page was re-entered, and this observer has never seen the
    // read settle. A failure is an affirmative answer — the identity is unknown
    // and will not become known on its own — so it counts immediately.
    fx.isLoading = true
    fx.loadFailed = true
    expect(begin()).not.toBeNull()
    render(shell())
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('but a read that has merely not answered YET keeps it', () => {
    // The negative control, and the reason the two unresolved states are not
    // collapsed: `useChildren` holds `isLoading` per hook instance, so EVERY
    // fresh mount starts here — including the one the journey was created for.
    fx.isLoading = true
    fx.loadFailed = false
    const flow = begin()
    render(shell())
    expect(getLibraryReturnFlow()).toBe(flow)
  })
})
