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
// that case is `bootstrapLearnerModel`'s transaction, which in `create-only` mode
// leaves a document that appeared meanwhile exactly as it is.
//
// **Nothing here cancels on a dep change** (Codex round 1). An effect-scoped
// `cancelled` flag was wrong in the one way that mattered: the write creates the
// document, `useLearnerModel`'s `onSnapshot` delivers it, `model` changes, the
// effect re-runs and its cleanup marked the in-flight run cancelled — so
// `setBootstrapping(false)` was skipped and the tab sat on *"Setting up …"*
// forever, most visibly for a freshly created `no-data` model, whose empty state
// is gated behind exactly that flag. The snapshot arriving IS the expected
// outcome of this write, not a reason to discard its result. So the result is
// discarded only when the run is no longer the live one — the child or family
// changed, or the component unmounted.

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
  /** The live (family, child) key, so a settled run knows whether it still owns the state. */
  const liveKeyRef = useRef('')
  const mountedRef = useRef(true)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  // Bumped by `retry`. It is an effect dependency so re-arming actually re-runs
  // the effect — clearing the ref alone would not, since nothing else changed.
  const [retryNonce, setRetryNonce] = useState(0)

  const key = `${familyId ?? ''}|${childId ?? ''}`
  liveKeyRef.current = key

  useEffect(
    () => () => {
      mountedRef.current = false
    },
    [],
  )

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
    const startedKey = key
    /** Still ours to report on? Not "did a dependency change" — see the header. */
    const stillLive = () => mountedRef.current && liveKeyRef.current === startedKey
    setBootstrapping(true)
    setFailedKey(null)
    void (async () => {
      try {
        await bootstrapLearnerModel(familyId, childId, 'create-only')
        // Nothing is set from the result: the tab redraws from the
        // `useLearnerModel` snapshot, never from local optimistic state.
      } catch (err) {
        console.error('[foundations] bootstrap failed:', err)
        if (stillLive()) setFailedKey(startedKey)
      } finally {
        if (stillLive()) setBootstrapping(false)
      }
    })()
  }, [canEdit, loading, model, familyId, childId, key, retryNonce])

  const retry = useCallback(() => {
    attemptedRef.current.delete(key)
    setFailedKey(null)
    setRetryNonce((n) => n + 1)
  }, [key])

  return { bootstrapping, failed: failedKey === key, retry }
}
