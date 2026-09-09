// ── The Foundations tab's create-only learner-model bootstrap (UX-286) ────
//
// Thin. Every decision it makes is the pure `shouldBootstrapLearnerModel`; every
// write it makes is the shared `bootstrapLearnerModel` (`learnerModels` only).
// What lives here is the once-per-(family, child) re-entry guard and the two bits
// of state the tab renders: is it running, and did it fail.
//
// The attempted guard is a ref, not state: two snapshot deliveries for the same
// child (a re-render, a `loading` flip, a second effect pass) must not produce a
// second seed. It is per-mount and cannot reach across tabs or devices — the
// floor under that case is `bootstrapLearnerModel`'s transaction, which in
// `create-only` mode leaves a document that appeared meanwhile exactly as it is.
//
// **Nothing here cancels on a dep change** (Codex round 1). An effect-scoped
// `cancelled` flag was wrong in the one way that mattered: the write creates the
// document, `useLearnerModel`'s `onSnapshot` delivers it, `model` changes, the
// effect re-runs, and its cleanup marked the in-flight run cancelled — so
// `bootstrapping` never cleared and the tab sat on *"Setting up …"* forever, most
// visibly for a freshly created `no-data` model, whose empty state is gated
// behind exactly that flag. The snapshot arriving IS this write's expected
// outcome, not a reason to discard its result.
//
// **And every piece of state here is keyed by (family, child)** (Codex rounds 2
// and 3 — the in-flight state is a keyed SET, for the same reason failures are:
// a single running key was replaced by a second child's overlapping bootstrap,
// so switching back to the first reported `bootstrapping: false` while its
// transaction was still running, and its attempted guard blocked a re-run, so the
// tab briefly showed the empty state for a child it was actively creating).
// The first fix for the above used a live-key ref plus a mounted ref, and both
// were their own hazard: under `StrictMode` the mount effect ran setup → cleanup
// → setup, so the mounted ref latched `false` for the life of the component and
// no result could ever be reported in development; and a parent switching child
// mid-write left a single shared `bootstrapping` boolean stuck true, because the
// new child's effect returned early without clearing it and the old child's run
// was then forbidden from clearing it. Both are gone rather than patched: the
// in-flight state IS the key that is running, so a stale run cannot clear a newer
// one (a functional update checks the key it started with), a newer run's start
// simply replaces it, and a child the hook is not bootstrapping reports `false`
// by construction. No mounted ref is needed — React 18 does not warn on a state
// update after unmount, and a keyed update to an unmounted tree is inert.

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
  /** True while the create-only write for THIS child is in flight. */
  bootstrapping: boolean
  /** True when the last attempt for THIS child threw. */
  failed: boolean
  /** Re-arm and run again — the "Try again" tap. */
  retry: () => void
}

/** Remove one key from a set of keys, preserving identity when it is absent. */
function without(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  if (!keys.has(key)) return keys
  const next = new Set(keys)
  next.delete(key)
  return next
}

export function useFoundationsBootstrap({
  familyId,
  childId,
  canEdit,
  model,
  loading,
}: UseFoundationsBootstrapArgs): UseFoundationsBootstrapResult {
  const attemptedRef = useRef<Set<string>>(new Set())
  /** Every key with a bootstrap in flight. A set, not one key — see the header. */
  const [runningKeys, setRunningKeys] = useState<ReadonlySet<string>>(() => new Set())
  /** Every key whose last attempt threw. Keyed so one child's failure is not another's. */
  const [failedKeys, setFailedKeys] = useState<ReadonlySet<string>>(() => new Set())
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
    const startedKey = key
    setRunningKeys((prev) => new Set(prev).add(startedKey))
    setFailedKeys((prev) => without(prev, startedKey))
    void (async () => {
      try {
        await bootstrapLearnerModel(familyId, childId, 'create-only')
        // Nothing is set from the result: the tab redraws from the
        // `useLearnerModel` snapshot, never from local optimistic state.
      } catch (err) {
        console.error('[foundations] bootstrap failed:', err)
        setFailedKeys((prev) => new Set(prev).add(startedKey))
      } finally {
        // Clears only its OWN key, so a concurrent run for another child is
        // untouched and each child reports its own truth.
        setRunningKeys((prev) => without(prev, startedKey))
      }
    })()
  }, [canEdit, loading, model, familyId, childId, key, retryNonce])

  const retry = useCallback(() => {
    attemptedRef.current.delete(key)
    setFailedKeys((prev) => without(prev, key))
    setRetryNonce((n) => n + 1)
  }, [key])

  return { bootstrapping: runningKeys.has(key), failed: failedKeys.has(key), retry }
}
