import { useMemo } from 'react'

import { useProfile } from '../profile/useProfile'
import type { Child } from '../types'
import { UserProfile } from '../types/enums'
import { PROFILE_CHILDREN, useChildren } from './useChildren'

export interface UseActiveChildResult {
  /** The resolved active child ID (locked for child profiles). */
  activeChildId: string
  /** The resolved active Child object, or undefined if not yet loaded. */
  activeChild: Child | undefined
  /** All children in the family. */
  children: Child[]
  /** Family whose read produced the current shared children list. */
  childrenFamilyId?: string | null
  /** Change active child. No-op for child profiles (Lincoln/London). */
  setActiveChildId: (id: string) => void
  /** True when the current profile is a child (Lincoln/London). */
  isChildProfile: boolean
  /** True while children are loading. */
  isLoading: boolean
  /** Add a new child to the list. */
  addChild: (child: Child) => void
  /**
   * The children read FAILED rather than not having answered yet.
   *
   * Forwarded verbatim from `useChildren`, optional and additive so existing
   * consumers and test mocks are untouched. `isLoading` stays true beside it:
   * a failed read is not an empty family, so a surface that gates on an
   * unsettled identity keeps gating — it can now just say so.
   */
  loadFailed?: boolean
  /** Run the children read again, clearing the failure while it runs. */
  retryLoad?: () => void
  /**
   * Did `activeChildId` come from the PROFILE's own identity mapping, rather
   * than from the fallback?
   *
   * Additive and optional, and it changes nothing for any existing consumer:
   * the fallback below is unchanged, so a child profile whose document is
   * missing still resolves to `selectedChildId` exactly as before.
   *
   * It exists because `activeChild.id === activeChildId` does **not** prove the
   * logged-in profile is that child — on a missing profile match the hook falls
   * back to whatever was selected, which for a child profile can be a SIBLING.
   * A surface that gates on *"is this the signed-in child's own record"* needs
   * an affirmative answer, and this is it:
   *
   *   • `true`  — a child profile matched its own `children` document through
   *     `PROFILE_CHILDREN`, or the viewer is the parents profile (whose
   *     identity question is a different one — a parent legitimately selects
   *     whichever child, and that is an explicit act, not a fallback).
   *   • `false` — a child profile did NOT match a document, so the id in hand
   *     is the fallback and proves nothing about who is signed in.
   *
   * `undefined` means the answer has not been reported (an older mock, a
   * consumer's stub), and every caller must treat that as "not proven".
   */
  profileChildResolved?: boolean
}

/**
 * Single source of truth for the active childId.
 *
 * - Lincoln/London profiles always resolve to their own childId (cannot switch).
 * - Parents profile can switch via setActiveChildId; defaults to profile-based
 *   auto-select from useChildren.
 */
export function useActiveChild(): UseActiveChildResult {
  const { profile } = useProfile()
  const {
    children,
    selectedChildId,
    setSelectedChildId,
    isLoading,
    addChild,
    loadFailed,
    retryLoad,
    childrenFamilyId,
  } = useChildren()

  const isChildProfile =
    profile === UserProfile.Lincoln || profile === UserProfile.London

  /**
   * The child this PROFILE is, when the profile is a child's and the family
   * really holds that document. `null` for the parents profile, and `null` for
   * a child profile with no matching document — which is the case the fallback
   * below hides and `profileChildResolved` exposes.
   *
   * Extracted from the resolution below rather than added beside it, so the two
   * answers cannot disagree about what matched.
   */
  const profileOwnChildId = useMemo(() => {
    if (!isChildProfile || children.length === 0) return null
    const entry = PROFILE_CHILDREN.find((p) => p.profile === profile)
    if (!entry) return null
    const match = children.find(
      (c) => c.name.toLowerCase() === entry.name.toLowerCase(),
    )
    return match ? match.id : null
  }, [isChildProfile, children, profile])

  // For child profiles, always resolve to their own child regardless of
  // selectedChildId. The fallback is UNCHANGED and deliberately so — every
  // other consumer depends on it.
  const activeChildId = useMemo(
    () => profileOwnChildId ?? selectedChildId,
    [profileOwnChildId, selectedChildId],
  )

  /**
   * Affirmative identity, for the surfaces that need it. See the field's own
   * docstring for why `activeChild.id === activeChildId` is not this answer.
   */
  const profileChildResolved = isChildProfile
    ? profileOwnChildId !== null && profileOwnChildId === activeChildId
    : profile === UserProfile.Parents

  const activeChild = useMemo(
    () => children.find((c) => c.id === activeChildId),
    [children, activeChildId],
  )

  // Child profiles cannot switch — provide a no-op setter
  const setActiveChildId = isChildProfile
    ? () => {}
    : setSelectedChildId

  return {
    activeChildId,
    activeChild,
    children,
    childrenFamilyId,
    setActiveChildId,
    isChildProfile,
    isLoading,
    addChild,
    loadFailed,
    retryLoad,
    profileChildResolved,
  }
}
