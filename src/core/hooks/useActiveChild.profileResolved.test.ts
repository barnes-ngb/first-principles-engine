import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Child } from '../types'
import { UserProfile } from '../types/enums'

/**
 * `profileChildResolved` — the affirmative identity fact (LOCAL-BUILD-001
 * repair #5).
 *
 * ── What was wrong ───────────────────────────────────────────────────────
 *
 * `useActiveChild` falls back to `selectedChildId` when a child profile matches
 * no `children` document. A feature that checked `activeChild.id ===
 * activeChildId` therefore proved only that the two agreed — which they do
 * perfectly when the id in hand is a SIBLING's. London signed in with no London
 * document, Lincoln selected, every id consistent, and a sibling's editor open.
 *
 * ── What this suite pins ─────────────────────────────────────────────────
 *
 * Both halves: the new fact answers correctly, AND the fallback every other
 * consumer depends on is unchanged.
 *
 * POSITIVE CONTROL: make `profileChildResolved` return `true` unconditionally
 * for a child profile and the "no matching document" cases fail.
 */

const LINCOLN: Child = { id: 'c-lincoln', name: 'Lincoln' } as Child
const LONDON: Child = { id: 'c-london', name: 'London' } as Child

const profileRef = { current: UserProfile.Lincoln as UserProfile | null }
const childrenRef = { current: [LINCOLN, LONDON] as Child[] }
const selectedRef = { current: 'c-lincoln' }

vi.mock('../profile/useProfile', () => ({
  useProfile: () => ({ profile: profileRef.current }),
}))

vi.mock('./useChildren', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useChildren')>()
  return {
    ...actual,
    useChildren: () => ({
      children: childrenRef.current,
      selectedChildId: selectedRef.current,
      setSelectedChildId: () => {},
      isLoading: false,
      addChild: () => {},
      loadFailed: false,
      retryLoad: () => {},
      childrenFamilyId: 'family-1',
    }),
  }
})

const { useActiveChild } = await import('./useActiveChild')

beforeEach(() => {
  profileRef.current = UserProfile.Lincoln
  childrenRef.current = [LINCOLN, LONDON]
  selectedRef.current = 'c-lincoln'
})

describe('a child profile that matches its own document', () => {
  it('resolves affirmatively', () => {
    const { result } = renderHook(() => useActiveChild())
    expect(result.current.activeChildId).toBe('c-lincoln')
    expect(result.current.profileChildResolved).toBe(true)
  })

  it('resolves for the other child profile too — capability, never a name', () => {
    profileRef.current = UserProfile.London
    const { result } = renderHook(() => useActiveChild())
    expect(result.current.activeChildId).toBe('c-london')
    expect(result.current.profileChildResolved).toBe(true)
  })

  it('ignores the selected id, as it always has', () => {
    // London signed in, Lincoln selected: the profile wins.
    profileRef.current = UserProfile.London
    selectedRef.current = 'c-lincoln'
    const { result } = renderHook(() => useActiveChild())
    expect(result.current.activeChildId).toBe('c-london')
  })
})

describe('a child profile with NO matching document', () => {
  beforeEach(() => {
    // The family holds Lincoln only; London's profile matches nothing.
    childrenRef.current = [LINCOLN]
    profileRef.current = UserProfile.London
    selectedRef.current = 'c-lincoln'
  })

  it('still falls back to the selected id — unchanged for every consumer', () => {
    const { result } = renderHook(() => useActiveChild())
    expect(result.current.activeChildId).toBe('c-lincoln')
  })

  it('and the resolved object still AGREES with it, which is the trap', () => {
    const { result } = renderHook(() => useActiveChild())
    expect(result.current.activeChild?.id).toBe(result.current.activeChildId)
  })

  it('but reports the identity as NOT resolved', () => {
    const { result } = renderHook(() => useActiveChild())
    expect(result.current.profileChildResolved).toBe(false)
  })

  it('reports not resolved when the family list is empty', () => {
    childrenRef.current = []
    const { result } = renderHook(() => useActiveChild())
    expect(result.current.profileChildResolved).toBe(false)
  })
})

describe('the parents profile', () => {
  it('is resolved by construction — selecting a child is an explicit act', () => {
    profileRef.current = UserProfile.Parents
    const { result } = renderHook(() => useActiveChild())
    expect(result.current.isChildProfile).toBe(false)
    expect(result.current.profileChildResolved).toBe(true)
  })

  it('is NOT resolved with no profile selected at all', () => {
    profileRef.current = null
    const { result } = renderHook(() => useActiveChild())
    expect(result.current.profileChildResolved).toBe(false)
  })
})
