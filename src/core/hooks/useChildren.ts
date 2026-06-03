import { useCallback, useEffect, useState } from 'react'
import { addDoc, getDocs } from 'firebase/firestore'

import { useFamilyId } from '../auth/useAuth'
import { useProfile } from '../profile/useProfile'
import { childrenCollection } from '../firebase/firestore'
import type { Child } from '../types'
import { UserProfile } from '../types/enums'

const ACTIVE_CHILD_KEY = 'fpe_active_child_id'

/**
 * Canonical profile children. `birthdate`/`grade` are the real identity values
 * (ARCH-15) used to (1) populate a brand-new child doc on auto-create and
 * (2) pre-fill the Settings identity editor so backfilling an existing doc is
 * one tap (the parent still confirms with Save — propose → confirm → write).
 * These are identity DATA, never gates.
 */
export const PROFILE_CHILDREN: Array<{
  profile: UserProfile
  name: string
  birthdate: string
  grade: string
}> = [
  { profile: UserProfile.Lincoln, name: 'Lincoln', birthdate: '2015-09-30', grade: '4th grade' },
  { profile: UserProfile.London, name: 'London', birthdate: '2020-02-20', grade: '1st grade' },
]

/**
 * Canonical identity defaults for a child matched by name, or `undefined` for
 * a non-profile child. Used to pre-fill the Settings editor; never written
 * without the parent confirming.
 */
export function getCanonicalIdentity(
  name: string,
): { birthdate: string; grade: string } | undefined {
  const entry = PROFILE_CHILDREN.find(
    (p) => p.name.toLowerCase() === name.trim().toLowerCase(),
  )
  return entry ? { birthdate: entry.birthdate, grade: entry.grade } : undefined
}

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

function childTimestamp(c: Child): number {
  const createdAt = (c as Child & { createdAt?: string }).createdAt
  const t = createdAt ? Date.parse(createdAt) : NaN
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
}

export function dedupeChildrenByName(children: Child[]): Child[] {
  const byName = new Map<string, Child>()
  for (const child of children) {
    const key = child.name.trim().toLowerCase()
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, child)
      continue
    }
    // Keep the earlier-created doc so the canonical ID is stable.
    if (childTimestamp(child) < childTimestamp(existing)) {
      byName.set(key, child)
    }
  }
  return Array.from(byName.values())
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

      // Dedupe by lowercased name. Concurrent mounts in earlier sessions
      // could race auto-create and produce duplicate Lincoln/London docs.
      // Keep the oldest doc per name so the canonical ID stays stable.
      loaded = dedupeChildrenByName(loaded)

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
          // Brand-new doc: seed real identity (birthdate/grade) alongside name.
          // This is doc creation, not a record edit — existing docs are backfilled
          // by the parent via the Settings identity editor (propose → confirm).
          const data = {
            id: '',
            name: m.name,
            birthdate: m.birthdate,
            grade: m.grade,
            createdAt: new Date().toISOString(),
          }
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
