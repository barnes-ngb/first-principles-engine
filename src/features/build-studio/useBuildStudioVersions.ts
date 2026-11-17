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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'

import { buildStudioVersionsCollection } from '../../core/firebase/firestore'
import { buildStudioVersionDocId } from '../../core/types/buildStudio'
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
  /** The project the answer is ABOUT. Same reason, and it is also filtered on. */
  projectId: string | null
  /** The failure, for a parent-readable line. */
  error: string | null
  /** Run the read again after a failure. Always wired, by both audiences. */
  retry: () => void
}

const UNSETTLED: Omit<BuildStudioVersionsRead, 'retry'> = {
  status: VersionsStatus.Loading,
  versions: [],
  childId: null,
  projectId: null,
  error: null,
}

/**
 * Is this stored row really this child's, in this project?
 *
 * Three facts, all of which must agree: the `childId` field, the `projectId`
 * field, and the document id, which is `{childId}__{projectId}__{versionId}` by
 * construction. The id check is what catches a row whose fields were written
 * under one identity and whose path says another — and it is the same predicate
 * the open action uses, so the shelf and the import cannot disagree about which
 * rows belong here.
 */
export function versionBelongsTo(
  version: BuildStudioVersion,
  childId: string,
  projectId: string,
): boolean {
  if (!version.versionId) return false
  if (version.childId !== childId) return false
  if (version.projectId !== projectId) return false
  return version.id === buildStudioVersionDocId(childId, projectId, version.versionId)
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
  projectId: string | null | undefined,
): BuildStudioVersionsRead {
  const key = `${familyId ?? ''}\u0000${childId ?? ''}\u0000${projectId ?? ''}`
  const [read, setRead] = useState<{
    key: string
    value: Omit<BuildStudioVersionsRead, 'retry'>
  }>({ key: '', value: UNSETTLED })
  /** Bumped by `retry`, so the subscribe effect runs again. */
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => {
    setRead({ key: '', value: UNSETTLED })
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!familyId || !childId || !projectId) return
    // ONE equality filter, sorted and project-filtered in memory. Two equality
    // filters would also be index-free, but keeping it to one removes the
    // question entirely — `firestore.indexes.json` is untouched either way.
    const q = query(buildStudioVersionsCollection(familyId), where('childId', '==', childId))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const versions = snap.docs
          .map((d) => ({ ...d.data(), id: d.id }))
          // The project filter lives HERE as well as at the open action, so a
          // same-child row from another project is never on this shelf to be
          // tapped in the first place.
          .filter((v) => versionBelongsTo(v, childId, projectId))
        setRead({
          key,
          value: {
            status: VersionsStatus.Ready,
            versions,
            childId,
            projectId,
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
            projectId,
            error: err instanceof Error ? err.message : String(err),
          },
        })
      },
    )
    return unsubscribe
  }, [familyId, childId, projectId, key, attempt])

  const value = read.key === key ? read.value : UNSETTLED

  // Sorted here rather than in the listener so the comparison is in one place
  // and a stored row with a bad stamp sinks rather than throwing.
  return useMemo(
    () => ({
      ...value,
      versions: [...value.versions].sort((a, b) =>
        (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
      ),
      retry,
    }),
    [value, retry],
  )
}
