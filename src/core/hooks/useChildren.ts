import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { getDocs } from 'firebase/firestore'

import { useFamilyId } from '../auth/useAuth'
import { useProfile } from '../profile/useProfile'
import { childrenCollection } from '../firebase/firestore'
import { seedProfileChildren } from '../firebase/seedProfileChildren'
import type { Child } from '../types'
import { UserProfile } from '../types/enums'
import {
  getActiveChildId,
  setActiveChildIdShared,
  subscribeActiveChildId,
} from './activeChildStore'
import {
  addSharedChild,
  getSharedChildren,
  setSharedChildren,
  subscribeSharedChildren,
} from './childrenStore'

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

function childTimestamp(c: { createdAt?: string }): number {
  const createdAt = c.createdAt
  const t = createdAt ? Date.parse(createdAt) : NaN
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
}

/**
 * The children the app shows: the **oldest** document per lowercased name.
 *
 * Generic over anything carrying a name and an optional `createdAt` so the
 * `UX-394` ghost survey can ask the same question of raw document rows without
 * a second copy of the rule — the survey and the app must never disagree about
 * which document is the child.
 */
export function dedupeChildrenByName<T extends { name: string; createdAt?: string }>(
  children: readonly T[],
): T[] {
  const byName = new Map<string, T>()
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
  // UX-362 (Codex round 2): the LIST is shared for the same reason the selected
  // id is. It used to be a per-instance `useState`, so `addChild` reached only
  // the instance whose selector was tapped and every other mounted consumer
  // held a list without the new child — resolving `activeChild` to `undefined`
  // and rendering its empty branch until a reload. See `childrenStore.ts`.
  const children = useSyncExternalStore(subscribeSharedChildren, getSharedChildren)
  // Selected child lives in a shared external store so every consumer
  // (AppShell header, Plan My Week selector, …) sees the same value and
  // re-renders together — see activeChildStore.ts.
  const selectedChildId = useSyncExternalStore(
    subscribeActiveChildId,
    getActiveChildId,
  )
  const [isLoading, setIsLoading] = useState(true)

  const setSelectedChildId = useCallback((id: string) => {
    setActiveChildIdShared(id)
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
      //
      // UX-394: this is the READ-side symptom hider and it stays — the ghosts
      // those earlier races produced are still in the collection, and clearing
      // them is a data delete, which is propose-and-confirm (the parent-only
      // survey on the Dev tab). What changed is the WRITE below, which can no
      // longer make another one.
      loaded = dedupeChildrenByName(loaded)

      // Auto-create children that match profiles but don't exist yet
      const missing = PROFILE_CHILDREN.filter(
        (pc) =>
          !loaded.some(
            (c) => c.name.toLowerCase() === pc.name.toLowerCase(),
          ),
      )

      if (missing.length > 0) {
        // UX-394 — deterministic id, create-only, one transaction. This used to
        // be an `addDoc` per missing name straight out of this effect: a
        // check-then-act with as many runners as there are mounts, which is
        // exactly how the family ended up with ~20 Lincoln/London documents.
        // A concurrent runner now addresses the same document and returns it.
        const created = await seedProfileChildren(familyId, missing)
        if (cancelled) return
        // Re-run the same rule over the merged list: a seed that collided with
        // a document written between the read and the transaction is the one
        // case this could otherwise double-count.
        loaded = dedupeChildrenByName([...loaded, ...created])
      }

      setSharedChildren(loaded)

      // Restore persisted child or auto-select based on profile. The shared
      // store is seeded from localStorage at import, so getActiveChildId()
      // already reflects the persisted choice. Only override when it's missing
      // or no longer points at a real child.
      const cur = getActiveChildId()
      if (!cur || !loaded.some((c) => c.id === cur)) {
        const profileMatch = matchChildToProfile(loaded, profile)
        const next = profileMatch ?? loaded[0]?.id ?? ''
        if (next) setActiveChildIdShared(next)
      }

      setIsLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [familyId, profile])

  const addChild = useCallback((child: Child) => {
    // Reaches every mounted consumer, not just this one.
    addSharedChild(child)
    setSelectedChildId(child.id)
  }, [setSelectedChildId])

  return { children, selectedChildId, setSelectedChildId, isLoading, addChild }
}
