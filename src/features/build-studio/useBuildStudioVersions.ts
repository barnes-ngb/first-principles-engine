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
//
// ── An answer belongs to ONE subscription ───────────────────────────────────
//
// Every stored value is tagged with the request object it came from, and every
// callback is retired by its own cleanup before `unsubscribe`. So `A → B → A`
// cannot reuse the first A's list, and a snapshot already in flight when the
// child changed or Try again was tapped cannot overwrite the newest answer.

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
 * ONE subscription's identity.
 *
 * An OBJECT, not a string key. A string built from the family, child and
 * project is identical for two different subscriptions, which is what let an
 * `A → B → A` reuse A's first answer — and let a callback from before the
 * switch overwrite the newest one. Object identity cannot be re-created by
 * accident, so A's first answer is not an answer about A's second subscription.
 */
interface VersionsRequest {
  familyId: string | null
  childId: string | null
  projectId: string | null
  /** The retry this request belongs to, so a retry is a new subscription. */
  attempt: number
}

/**
 * Subscribe to one child's saved versions.
 *
 * Identified by the subscription, so a change of child — or a retry — reads as
 * `Loading` immediately rather than showing the previous answer for a frame,
 * and the returned `childId` lets the caller assert the answer is about the
 * child it is rendering.
 */
export function useBuildStudioVersions(
  familyId: string | null | undefined,
  childId: string | null | undefined,
  projectId: string | null | undefined,
): BuildStudioVersionsRead {
  const [read, setRead] = useState<{
    request: VersionsRequest | null
    value: Omit<BuildStudioVersionsRead, 'retry'>
  }>({ request: null, value: UNSETTLED })
  /** Bumped by `retry`, so a fresh request is minted and the effect re-runs. */
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => {
    setRead({ request: null, value: UNSETTLED })
    setAttempt((n) => n + 1)
  }, [])

  /**
   * The request this render wants. `attempt` is in it, so *Try again* mints a
   * new identity and therefore a new subscription. A memo React drops can only
   * cost a fresh read, which is safe.
   */
  const request: VersionsRequest = useMemo(
    () => ({
      familyId: familyId ?? null,
      childId: childId ?? null,
      projectId: projectId ?? null,
      attempt,
    }),
    [familyId, childId, projectId, attempt],
  )

  useEffect(() => {
    const { familyId: family, childId: child, projectId: project } = request
    if (!family || !child || !project) return
    // This subscription's own retirement, closed over by both callbacks and
    // set BEFORE `unsubscribe`: a snapshot already queued when the child
    // changed, or when Try again was tapped, must not overwrite the newest
    // answer.
    let retired = false
    // ONE equality filter, sorted and project-filtered in memory. Two equality
    // filters would also be index-free, but keeping it to one removes the
    // question entirely — `firestore.indexes.json` is untouched either way.
    const q = query(buildStudioVersionsCollection(family), where('childId', '==', child))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (retired) return
        const versions = snap.docs
          .map((d) => ({ ...d.data(), id: d.id }))
          // The project filter lives HERE as well as at the open action, so a
          // same-child row from another project is never on this shelf to be
          // tapped in the first place.
          .filter((v) => versionBelongsTo(v, child, project))
        setRead({
          request,
          value: {
            status: VersionsStatus.Ready,
            versions,
            childId: child,
            projectId: project,
            error: null,
          },
        })
      },
      (err) => {
        if (retired) return
        console.warn('[buildStudio] versions subscribe failed:', err)
        setRead({
          request,
          value: {
            status: VersionsStatus.Failed,
            versions: [],
            childId: child,
            projectId: project,
            error: err instanceof Error ? err.message : String(err),
          },
        })
      },
    )
    return () => {
      retired = true
      unsubscribe()
    }
  }, [request])

  /**
   * Only a value tagged with the request this render wants is an answer. A
   * value from any earlier subscription — including one for the same family,
   * child and project — is not settled.
   */
  const value = read.request === request ? read.value : UNSETTLED

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
