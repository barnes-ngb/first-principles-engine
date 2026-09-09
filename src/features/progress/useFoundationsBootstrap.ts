// ── The Foundations tab's create-only learner-model bootstrap (UX-286) ────
//
// Thin. Every decision it makes is the pure `shouldBootstrapLearnerModel`; every
// write it makes is the shared `bootstrapLearnerModel` (`learnerModels` only).
// What lives here is the once-per-(family, child) re-entry guard and the two bits
// of state the tab renders: is it running, and did it fail.
//
// The guard is a ref, not state: two snapshot deliveries for the same child (a
// re-render, a `loading` flip, a second effect pass) must not produce a second
// seed. It is per-mount and cannot reach across tabs or devices — the floor under
// that case is in `bootstrapLearnerModel` itself, which re-reads and merges rather
// than replaces.

import { useCallback, useEffect, useRef, useState } from 'react'

import { bootstrapLearnerModel } from '../../core/foundations/bootstrapLearnerModel'
import type { LearnerModel } from '../../core/types/learnerModel'
import { shouldBootstrapLearnerModel } from './foundationsBootstrap'

export interface UseFoundationsBootstrapArgs {
  familyId: string | undefined
  childId: string | undefined
  canEdit: boolean
  model: LearnerModel | null
  loading: boolean
}

export interface UseFoundationsBootstrapResult {
  /** True while the create-only write is in flight. */
  bootstrapping: boolean
  /** True when the last attempt for this child threw. */
  failed: boolean
  /** Re-arm and run again — the "Try again" tap. */
  retry: () => void
}

export function useFoundationsBootstrap({
  familyId,
  childId,
  canEdit,
  model,
  loading,
}: UseFoundationsBootstrapArgs): UseFoundationsBootstrapResult {
  const attemptedRef = useRef<Set<string>>(new Set())
  const [bootstrapping, setBootstrapping] = useState(false)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  // Bumped by `retry`. It is an effect dependency so re-arming actually re-runs
  // the effect — clearing the ref alone would not, since nothing else changed.
  const [retryNonce, setRetryNonce] = useState(0)

  const key = `${familyId ?? ''}|${childId ?? ''}`

  useEffect(() => {
    const shouldRun = shouldBootstrapLearnerModel({
      canEdit,
      loading,
      model,
      familyId,
      childId,
      alreadyAttempted: attemptedRef.current.has(key),
    })
    if (!shouldRun || !familyId || !childId) return

    // Mark BEFORE awaiting — a second render during the write must not start one.
    attemptedRef.current.add(key)
    let cancelled = false
    setBootstrapping(true)
    setFailedKey(null)
    void (async () => {
      try {
        await bootstrapLearnerModel(familyId, childId)
        // Nothing is set from the result: the tab redraws from the
        // `useLearnerModel` snapshot, never from local optimistic state.
      } catch (err) {
        console.error('[foundations] bootstrap failed:', err)
        if (!cancelled) setFailedKey(key)
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canEdit, loading, model, familyId, childId, key, retryNonce])

  const retry = useCallback(() => {
    attemptedRef.current.delete(key)
    setFailedKey(null)
    setRetryNonce((n) => n + 1)
  }, [key])

  return { bootstrapping, failed: failedKey === key, retry }
}
