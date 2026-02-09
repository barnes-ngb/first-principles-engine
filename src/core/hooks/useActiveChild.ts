import { useMemo } from 'react'

import { useProfile } from '../profile/useProfile'
import type { Child } from '../types/domain'
import { UserProfile } from '../types/enums'
import { PROFILE_CHILDREN, useChildren } from './useChildren'

export interface UseActiveChildResult {
  /** The resolved active child ID (locked for child profiles). */
  activeChildId: string
  /** The resolved active Child object, or undefined if not yet loaded. */
  activeChild: Child | undefined
  /** All children in the family. */
  children: Child[]
  /** Change active child. No-op for child profiles (Lincoln/London). */
  setActiveChildId: (id: string) => void
  /** True when the current profile is a child (Lincoln/London). */
  isChildProfile: boolean
  /** True while children are loading. */
  isLoading: boolean
  /** Add a new child to the list. */
  addChild: (child: Child) => void
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
  } = useChildren()

  const isChildProfile =
    profile === UserProfile.Lincoln || profile === UserProfile.London

  // For child profiles, always resolve to their own child regardless of selectedChildId
  const activeChildId = useMemo(() => {
    if (isChildProfile && children.length > 0) {
      const entry = PROFILE_CHILDREN.find((p) => p.profile === profile)
      if (entry) {
        const match = children.find(
          (c) => c.name.toLowerCase() === entry.name.toLowerCase(),
        )
        if (match) return match.id
      }
    }
    return selectedChildId
  }, [isChildProfile, children, profile, selectedChildId])

  const activeChild = useMemo(
    () => children.find((c) => c.id === activeChildId),
    [children, activeChildId],
  )

  // Child profiles cannot switch — provide a no-op setter
  const setActiveChildId = isChildProfile
    ? (_id: string) => {}
    : setSelectedChildId

  return {
    activeChildId,
    activeChild,
    children,
    setActiveChildId,
    isChildProfile,
    isLoading,
    addChild,
  }
}
