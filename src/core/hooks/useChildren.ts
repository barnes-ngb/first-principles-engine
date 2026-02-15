import { useCallback, useEffect, useState } from 'react'
import { addDoc, getDocs } from 'firebase/firestore'

import { useFamilyId } from '../auth/useAuth'
import { useProfile } from '../profile/useProfile'
import { childrenCollection } from '../firebase/firestore'
import type { Child } from '../types/domain'
import { UserProfile } from '../types/enums'

const ACTIVE_CHILD_KEY = 'fpe_active_child_id'

/** Canonical child names that correspond to profiles. */
export const PROFILE_CHILDREN: Array<{ profile: UserProfile; name: string }> = [
  { profile: UserProfile.Lincoln, name: 'Lincoln' },
  { profile: UserProfile.London, name: 'London' },
]

function matchChildToProfile(
  children: Child[],
  profile: UserProfile | null,
): string | undefined {
  if (!profile) return undefined
  const entry = PROFILE_CHILDREN.find((p) => p.profile === profile)
  if (!entry) return undefined
  return children.find(
    (c) => c.name.toLowerCase() === entry.name.toLowerCase(),
  )?.id
}

export interface UseChildrenResult {
  children: Child[]
  selectedChildId: string
  setSelectedChildId: (id: string) => void
  isLoading: boolean
  addChild: (child: Child) => void
}

/**
 * Shared hook for loading children, auto-creating from profiles,
 * and auto-selecting based on the active profile.
 *
 * Persists the selected child to localStorage so it survives
 * page navigation and browser refresh.
 */
export function useChildren(): UseChildrenResult {
  const familyId = useFamilyId()
  const { profile } = useProfile()
  const [children, setChildren] = useState<Child[]>([])
  const [selectedChildId, setSelectedChildIdState] = useState(
    () => localStorage.getItem(ACTIVE_CHILD_KEY) ?? '',
  )
  const [isLoading, setIsLoading] = useState(true)

  const setSelectedChildId = useCallback((id: string) => {
    localStorage.setItem(ACTIVE_CHILD_KEY, id)
    setSelectedChildIdState(id)
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const snap = await getDocs(childrenCollection(familyId))
      if (cancelled) return

      let loaded = snap.docs.map((d) => ({
        ...(d.data() as Child),
        id: d.id,
      }))

      // Auto-create children that match profiles but don't exist yet
      const missing = PROFILE_CHILDREN.filter(
        (pc) =>
          !loaded.some(
            (c) => c.name.toLowerCase() === pc.name.toLowerCase(),
          ),
      )

      if (missing.length > 0) {
        const created: Child[] = []
        for (const m of missing) {
          const data = { id: '', name: m.name, createdAt: new Date().toISOString() }
          const ref = await addDoc(childrenCollection(familyId), data)
          if (cancelled) return
          created.push({ ...data, id: ref.id })
        }
        loaded = [...loaded, ...created]
      }

      setChildren(loaded)

      // Restore persisted child or auto-select based on profile
      const persisted = localStorage.getItem(ACTIVE_CHILD_KEY)
      const profileMatch = matchChildToProfile(loaded, profile)
      setSelectedChildIdState((cur) => {
        // Keep current if still valid
        if (cur && loaded.some((c) => c.id === cur)) return cur
        // Restore persisted if valid
        if (persisted && loaded.some((c) => c.id === persisted)) return persisted
        // Fall back to profile match or first child
        const next = profileMatch ?? loaded[0]?.id ?? ''
        if (next) localStorage.setItem(ACTIVE_CHILD_KEY, next)
        return next
      })

      setIsLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [familyId, profile])

  const addChild = useCallback((child: Child) => {
    setChildren((prev) => [...prev, child])
    setSelectedChildId(child.id)
  }, [setSelectedChildId])

  return { children, selectedChildId, setSelectedChildId, isLoading, addChild }
}
