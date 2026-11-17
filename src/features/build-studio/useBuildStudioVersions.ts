// ── The shelf: one child's saved versions, read-only (LOCAL-BUILD-001) ───────
//
// ONE equality filter on `childId`, sorted in memory. That is deliberate and it
// is what keeps `firestore.indexes.json` untouched: a `where` plus an `orderBy`
// on a different field is a composite index, and this slice adds none.
//
// ── A read failure is not an empty shelf ────────────────────────────────────
//
// The three states are kept apart all the way to the screen, because they are
// three different sentences and only one of them is "you have not saved
// anything yet". A rejected read rendered as an empty list would tell a child
// his work is gone, which is the single worst thing this feature could say.

import { useEffect, useMemo, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'

import { buildStudioVersionsCollection } from '../../core/firebase/firestore'
import type { BuildStudioVersion } from '../../core/types/buildStudio'

export const VersionsStatus = {
  Loading: 'loading',
  Ready: 'ready',
  Failed: 'failed',
} as const
export type VersionsStatus = (typeof VersionsStatus)[keyof typeof VersionsStatus]

export interface BuildStudioVersionsRead {
  status: VersionsStatus
  /** Newest first. Empty while loading and on failure — read `status` first. */
  versions: BuildStudioVersion[]
  /** The child the answer is ABOUT, so a caller can refuse a stale one. */
  childId: string | null
  /** The failure, for a parent-readable line. */
  error: string | null
}

const UNSETTLED: BuildStudioVersionsRead = {
  status: VersionsStatus.Loading,
  versions: [],
  childId: null,
  error: null,
}

/**
 * Subscribe to one child's saved versions.
 *
 * Keyed by the subscription's identity, so a change of child reads as
 * `Loading` immediately rather than showing the previous child's shelf for a
 * frame — and the returned `childId` lets the caller assert the answer is about
 * the child it is rendering, which an `A → B → A` cannot fake away because the
 * key is rebuilt on every change.
 */
export function useBuildStudioVersions(
  familyId: string | null | undefined,
  childId: string | null | undefined,
): BuildStudioVersionsRead {
  const key = `${familyId ?? ''}\u0000${childId ?? ''}`
  const [read, setRead] = useState<{ key: string; value: BuildStudioVersionsRead }>({
    key: '',
    value: UNSETTLED,
  })

  useEffect(() => {
    if (!familyId || !childId) return
    const q = query(buildStudioVersionsCollection(familyId), where('childId', '==', childId))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const versions = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        setRead({
          key,
          value: {
            status: VersionsStatus.Ready,
            versions,
            childId,
            error: null,
          },
        })
      },
      (err) => {
        console.warn('[buildStudio] versions subscribe failed:', err)
        setRead({
          key,
          value: {
            status: VersionsStatus.Failed,
            versions: [],
            childId,
            error: err instanceof Error ? err.message : String(err),
          },
        })
      },
    )
    return unsubscribe
  }, [familyId, childId, key])

  const value = read.key === key ? read.value : UNSETTLED

  // Sorted here rather than in the listener so the comparison is in one place
  // and a stored row with a bad stamp sinks rather than throwing.
  return useMemo(
    () => ({
      ...value,
      versions: [...value.versions].sort((a, b) =>
        (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
      ),
    }),
    [value],
  )
}
