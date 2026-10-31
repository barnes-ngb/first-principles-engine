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
  /**
   * The read FAILED, as opposed to "has not answered yet".
   *
   * Optional and additive so every existing consumer and test mock is unchanged
   * — an absent field reads as `false`, which is what they all meant. It exists
   * because the two states were indistinguishable: a rejected `getDocs` (or a
   * rejected seed) left `isLoading` true for the rest of the session with
   * nothing to say so, and a surface that GATES on an unsettled read — the
   * UX-273 composer does — would wait for an answer that is never coming.
   *
   * `isLoading` deliberately stays TRUE alongside it. The identity really is
   * unknown, so every existing safety that keys on "not settled" keeps holding:
   * nothing is selected, no custody is consumed, and no surface may treat the
   * failure as an affirmative empty result.
   */
  loadFailed?: boolean
  /**
   * Run the same load again, and clear the failure while it runs.
   *
   * Optional for the same compatibility reason. It re-runs THIS hook's effect
   * through a generation dependency rather than reaching into Firestore itself,
   * so the retry has exactly the semantics of the first attempt — same dedupe,
   * same seeding, same selection — and a load made obsolete by a retry, an
   * identity change or an unmount is still discarded by that attempt's own
   * cancellation flag.
   */
  retryLoad?: () => void
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
  const [loadFailed, setLoadFailed] = useState(false)
  /** Bumped by `retryLoad`; the effect's own dependency, so the retry IS the load. */
  const [loadAttempt, setLoadAttempt] = useState(0)

  const setSelectedChildId = useCallback((id: string) => {
    setActiveChildIdShared(id)
  }, [])

  const retryLoad = useCallback(() => {
    // Back to "waiting for an answer", which is the truthful state while the
    // second attempt runs, and the one every gate already handles.
    setLoadFailed(false)
    setIsLoading(true)
    setLoadAttempt((n) => n + 1)
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
      setLoadFailed(false)
    }

    // The rejection this catch exists for was unhandled: `getDocs` and
    // `seedProfileChildren` both reject on an offline start, a rules refusal or
    // a transaction that cannot commit, and with no catch the effect simply
    // stopped — `isLoading` stayed true for the rest of the session, no child
    // was ever selected, and nothing on screen said why. The identity stays
    // UNKNOWN here on purpose (`isLoading` is not cleared): the only thing that
    // changes is that the failure is now sayable, and retryable.
    load().catch(() => {
      // A load the user has already moved past — unmounted, identity changed,
      // or a retry started — must not report its failure over the newer one.
      if (cancelled) return
      setLoadFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [familyId, profile, loadAttempt])

  const addChild = useCallback((child: Child) => {
    // Reaches every mounted consumer, not just this one.
    addSharedChild(child)
    setSelectedChildId(child.id)
  }, [setSelectedChildId])

  return {
    children,
    selectedChildId,
    setSelectedChildId,
    isLoading,
    addChild,
    loadFailed,
    retryLoad,
  }
}
