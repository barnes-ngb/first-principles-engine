import { useEffect } from 'react'

import { useAuth } from '../auth/useAuth'
import { useActiveChild } from '../hooks/useActiveChild'
import { setErrorReporterContext } from './reporter'

/**
 * Keeps the error reporter's context in sync with app state (ARCH-11). Supplies
 * the active child id (hashed before storage) and the set of children's names so
 * the scrubber can positively strip them from any reported text. Renders nothing.
 */
export default function ErrorReporterSync(): null {
  const { familyId } = useAuth()
  const { activeChildId, children } = useActiveChild()

  useEffect(() => {
    const terms = new Set<string>()
    for (const child of children) {
      const name = child.name.trim()
      if (!name) continue
      terms.add(name)
      for (const part of name.split(/\s+/)) {
        if (part.length >= 2) terms.add(part)
      }
    }
    setErrorReporterContext({
      childId: activeChildId ?? null,
      sensitiveTerms: [...terms],
    })
  }, [familyId, activeChildId, children])

  return null
}
