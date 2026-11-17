/**
 * Route guard for `/build-studio` (LOCAL-BUILD-001).
 *
 * The same predicate the nav entry and the page itself use
 * (`resolveBuildStudioAccess`), for the reason `RequireKnowledgeMineAccess`
 * shares one with the nav: a guard and a link that answer differently is a link
 * that goes nowhere, or a door a link forgot to hide.
 *
 * It **fails closed**, and it waits rather than bouncing: an unsettled read
 * renders nothing at all, so a child whose opt-in is still loading is not
 * redirected away from a surface he is entitled to. Anything that is not an
 * affirmative yes — a closed opt-in, a failed read, an unknown
 * profile-to-child resolution, a children list from another family — goes to
 * the kid home with no "you can't" messaging, exactly as the Mine's guard does.
 */

import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useProfile } from '../../core/profile/useProfile'
import {
  BuildStudioAccess,
  buildStudioIsOpen,
  resolveBuildStudioAccess,
} from './buildStudioAccess'
import { useBuildStudioOptIn } from './useBuildStudioOptIn'

export default function RequireBuildStudioAccess({ children }: { children: ReactNode }) {
  const { familyId } = useAuth()
  const { profile } = useProfile()
  const {
    activeChildId,
    activeChild,
    isChildProfile,
    isLoading,
    loadFailed,
    childrenFamilyId,
  } = useActiveChild()
  const optIn = useBuildStudioOptIn(familyId, activeChildId || null)

  const access = resolveBuildStudioAccess({
    familyId,
    profile,
    isChildProfile,
    childId: activeChildId,
    resolvedChild: activeChild ?? null,
    childrenLoading: isLoading,
    childrenLoadFailed: loadFailed,
    childrenFamilyId,
    optIn,
  })

  if (access === BuildStudioAccess.Unsettled) return null
  if (!buildStudioIsOpen(access)) return <Navigate to="/today" replace />
  return <>{children}</>
}
