import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useChildSkillSnapshot } from '../../core/hooks/useChildSkillSnapshot'
import { canAccessKnowledgeMine } from './knowledgeMineAccess'

/**
 * Route guard for /quest. Holds children without calibration data for ANY Mine
 * domain by silently redirecting to the kid home, so a direct link can't bypass
 * the launcher-tile gate. This mirrors the generic hub-entry gate; per-quest
 * domain precision (Reading vs Math) lives inside KnowledgeMinePage (ARCH-16).
 * Graceful — no error page, no "you can't" messaging.
 */
export default function RequireKnowledgeMineAccess({
  children,
}: {
  children: ReactNode
}) {
  const familyId = useFamilyId()
  const { activeChildId } = useActiveChild()
  const { snapshot, loaded } = useChildSkillSnapshot(familyId, activeChildId || undefined)

  // Wait for the snapshot load to resolve before deciding — never bounce an
  // eligible child mid-load.
  if (!loaded) return null
  if (!canAccessKnowledgeMine(snapshot)) return <Navigate to="/today" replace />
  return <>{children}</>
}
