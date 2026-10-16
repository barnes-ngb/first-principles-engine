/**
 * The before-work page check's controller — one question at a time, and never
 * an answer about the wrong child.
 *
 * ── Why this is written with refs and a token ────────────────────────────────
 * The first version gated on React state and reset itself in an effect, and an
 * independent host test took it apart in the way that actually happens on a
 * phone: the parent taps **Upload**, the native file picker opens, they switch
 * child in the shell while it is open, and *then* pick a file. The picker's
 * `change` event fires on an input whose handler closed over the OLD render, so
 * the check ran — with the old callback's permission and the new child's id.
 * The same hole swallowed an A-B-A switch (scope matches again, so a
 * scope-equality check passes), a permission revoked mid-flight, and a callback
 * retained after unmount.
 *
 * Three rules follow, and all three are synchronous:
 *
 *  1. **Identity lives in a ref, updated during render, not in an effect.** An
 *     effect runs after paint, which is after a native picker can deliver a
 *     file. The identity is `family | child | date | capability`, and any change
 *     to it bumps a **generation** counter in the same render — so a request in
 *     flight is abandoned before any handler can run.
 *  2. **A selection is bound to the identity it was opened under.** `start`
 *     takes the `selectionToken` the caller held when it opened the camera or
 *     the picker, and refuses anything that is not the live one. A-B-A is
 *     covered because the token carries the generation, which never goes back.
 *  3. **What is rendered is stamped.** State carries the token it was produced
 *     under and is only exposed while that token is live, so a stale answer
 *     cannot flash for one frame on the way to being cleared.
 *
 * ── And the latch ────────────────────────────────────────────────────────────
 * One request at a time is enforced by a single `activeRequest` ref, released
 * in a `finally` **by its owner only**. The first version released it after the
 * await, so a throw on the way in (`URL.createObjectURL` is not implemented in
 * every browser and every test environment) latched the door shut forever: run
 * count stayed at zero and no retry was possible. A late failure from an
 * abandoned request now releases nothing and writes nothing, because it is not
 * the owner.
 *
 * It writes no learning or progress record: the only call it makes is
 * `useProspectivePageCheck`, and the server skips the workbook backfill for this
 * intent (`functions/src/ai/prospectiveCheck.ts`).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  BEFORE_WORK_CHECK_UNAVAILABLE,
  BEFORE_WORK_SEND_FAILED,
  BeforeWorkCheckStatus,
  inconclusiveBeforeWorkSummary,
  summarizeBeforeWorkCheck,
  type BeforeWorkCheckSummary,
} from './beforeWorkPageCheck'
import {
  useProspectivePageCheck,
  type ProspectivePageCheckOutcome,
} from '../../core/hooks/useProspectivePageCheck'
import type { CaptureContext } from '../../core/utils/contentNote'

export { BeforeWorkCheckStatus }

export interface BeforeWorkPageCheckContext {
  itemLabel?: string
  subjectBucket?: string
}

export interface UseBeforeWorkPageCheckOptions {
  familyId: string
  childId: string
  /** The day on screen. Part of the identity, so changing it retires the check. */
  dateKey: string
  /** Parent capability, read by the caller from the ONE canonical answer. */
  canCheck: boolean
  /**
   * Injected for tests only — the real one is `useProspectivePageCheck`. The
   * controller reaches a network through no other route.
   */
  runCheck?: (
    file: File,
    request: { familyId: string; childId: string; captureContext?: CaptureContext },
  ) => Promise<ProspectivePageCheckOutcome>
}

export interface UseBeforeWorkPageCheckResult {
  status: BeforeWorkCheckStatus
  /** The answer on screen, or null. Never an answer from another identity. */
  summary: BeforeWorkCheckSummary | null
  /** A local preview of the photo asked about, when one could be made. */
  photoPreviewUrl: string | null
  /** The row label this check was opened from, when it was opened from one. */
  itemLabel: string | null
  /** True once a cancel has been taken, so the caller can say what that means. */
  cancelled: boolean
  /**
   * WHO the check is about: family | child | day | capability, plus a counter
   * that advances whenever any of those change.
   *
   * This is what a host should compare its "is the sheet open" state against.
   * It does NOT change when the parent closes, cancels or retries, so a retry
   * cannot accidentally close the sheet it is retrying in — and because the
   * counter never goes back, an A-B-A switch does not re-open a sheet that was
   * closed on the way out.
   */
  scopeToken: string
  /**
   * WHICH picker session a selection belongs to: the scope token plus a session
   * counter that advances on every retirement — a scope change, a close, a
   * cancel, a retry, and each reopen.
   *
   * Hold it when you open the camera or the file picker, hand it back with the
   * file, and use it as the input's React `key` so the old element is detached
   * rather than left listening while a native picker sits on top of it.
   */
  selectionToken: string
  /**
   * Retire the current picker session and start a new one. Call it when the
   * sheet opens: a file chosen in a picker opened before the sheet was last
   * closed must not arrive as if it belonged to this one.
   */
  beginPickerSession: () => void
  /**
   * Start a check. Refused — silently, with nothing written and nothing shown —
   * when capability is gone, the component is unmounted, another request is in
   * flight, or `token` is not the live session.
   */
  start: (file: File, context?: BeforeWorkPageCheckContext, token?: string) => Promise<void>
  /**
   * Abandon the request, clear the screen and retire the picker session.
   * Claims nothing about the server.
   */
  cancel: () => void
  /** Drop the answer, retire the picker session, and go back to the entry. */
  close: () => void
}

interface CheckState {
  /** The `selectionToken` this state was produced under. */
  stamp: string
  status: BeforeWorkCheckStatus
  summary: BeforeWorkCheckSummary | null
  photoPreviewUrl: string | null
  itemLabel: string | null
  cancelled: boolean
}

const IDLE: CheckState = {
  stamp: '',
  status: BeforeWorkCheckStatus.Idle,
  summary: null,
  photoPreviewUrl: null,
  itemLabel: null,
  cancelled: false,
}

export function useBeforeWorkPageCheck({
  familyId,
  childId,
  dateKey,
  canCheck,
  runCheck,
}: UseBeforeWorkPageCheckOptions): UseBeforeWorkPageCheckResult {
  const { check } = useProspectivePageCheck()
  const runRef = useRef(runCheck ?? check)
  runRef.current = runCheck ?? check

  const [state, setState] = useState<CheckState>(IDLE)

  // ── Identity, resolved during render ───────────────────────────────────────
  const identity = `${familyId}|${childId}|${dateKey}|${canCheck ? 'parent' : 'no'}`
  const identityRef = useRef(identity)
  const generationRef = useRef(0)
  /**
   * The picker session counter.
   *
   * Advances on a scope change AND on every close, cancel, retry and reopen —
   * the lifecycle an independent host test found missing: the parent opened
   * Upload, closed the sheet, and the input (still mounted through the MUI exit
   * transition) delivered its file into a check that then ran. A ref, because
   * the gate must be correct the instant the handler fires; `pickerRenders`
   * exists only to make the new token reach the inputs' `key`.
   */
  const pickerSessionRef = useRef(0)
  const [, setPickerRenders] = useState(0)
  const activeRequest = useRef<number | null>(null)
  const requestSeq = useRef(0)
  const mounted = useRef(true)
  const previewUrl = useRef<string | null>(null)

  if (identityRef.current !== identity) {
    // A new child, day, family or capability. Bump BEFORE any handler can run:
    // an effect would be too late for a file picker that is already open, and
    // the bump is what makes A-B-A safe — neither counter ever returns to a
    // value a stale selection or a closed sheet could match.
    identityRef.current = identity
    generationRef.current += 1
    pickerSessionRef.current += 1
    // Whatever is on the wire is abandoned here. Its answer will find itself a
    // non-owner and publish nothing.
    activeRequest.current = null
  }

  // Two tokens, because they answer two different questions (see the result
  // type): the scope token is stable across close/cancel/retry, the selection
  // token is not.
  const scopeToken = `${identity}|${generationRef.current}`
  const selectionToken = `${scopeToken}|${pickerSessionRef.current}`
  const selectionTokenRef = useRef(selectionToken)
  selectionTokenRef.current = selectionToken
  const scopeTokenRef = useRef(scopeToken)
  scopeTokenRef.current = scopeToken
  const canCheckRef = useRef(canCheck)
  canCheckRef.current = canCheck

  // What may be SHOWN: only state produced under the live token. A stale answer
  // is never rendered for a frame on its way out.
  const visible = state.stamp === selectionToken ? state : IDLE

  const releasePreview = useCallback((url: string | null) => {
    if (!url) return
    try {
      URL.revokeObjectURL(url)
    } catch {
      // Revoking is cleanup; a browser without object URLs has nothing to free.
    }
    if (previewUrl.current === url) previewUrl.current = null
  }, [])

  // Unmount: refuse later work and free the preview. A callback retained by a
  // native picker from this mount can still fire, and this is what stops it.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      activeRequest.current = null
      releasePreview(previewUrl.current)
    }
  }, [releasePreview])

  // Housekeeping only — the identity change already retired everything that
  // matters synchronously above, and `visible` already hides the old answer.
  // This frees the object URL and drops the state object.
  useEffect(() => {
    setState((prev) => {
      if (prev.stamp === '' || prev.stamp === selectionToken) return prev
      releasePreview(prev.photoPreviewUrl)
      return IDLE
    })
  }, [selectionToken, releasePreview])

  /** Put state on screen, but only if this request still owns the door. */
  const publish = useCallback(
    (id: number, token: string, next: Omit<CheckState, 'stamp'>) => {
      if (!mounted.current) return false
      if (activeRequest.current !== id) return false
      if (selectionTokenRef.current !== token) return false
      setState({ ...next, stamp: token })
      return true
    },
    [],
  )

  const start = useCallback(
    async (file: File, context?: BeforeWorkPageCheckContext, token?: string) => {
      // ── The gate, asked of what is LIVE and never of a closure ─────────────
      //
      // `live` is read from a ref at call time; `selectionToken` is what THIS
      // closure was built under. A callback retained from an older render —
      // after a child switch, after an A-B-A, after capability was revoked —
      // carries an older token and is refused, which is the whole of rule 2.
      // It cannot become current again, because the generation inside the token
      // only ever increases.
      const live = selectionTokenRef.current
      if (!mounted.current) return
      if (!canCheckRef.current) return
      if (!familyId || !childId) return
      if (selectionToken !== live) return
      // And a selection opened under an identity (the camera / picker case)
      // must name the same one: the picker can deliver its file minutes later.
      if (token !== undefined && token !== live) return
      // One at a time. Synchronous, so two taps in one tick cannot both pass.
      if (activeRequest.current !== null) return

      const id = ++requestSeq.current
      activeRequest.current = id

      const itemLabel = context?.itemLabel ?? null
      let preview: string | null = null

      try {
        // The photo on screen is a LOCAL preview of the file just picked (no
        // copy is stored anywhere to fetch). It is cosmetic: a browser that
        // cannot make an object URL still gets the answer, because the first
        // version let this throw and latched the whole door shut.
        releasePreview(previewUrl.current)
        try {
          preview = URL.createObjectURL(file)
          previewUrl.current = preview
        } catch {
          preview = null
        }

        if (
          !publish(id, live, {
            status: BeforeWorkCheckStatus.Running,
            summary: null,
            photoPreviewUrl: preview,
            itemLabel,
            cancelled: false,
          })
        ) {
          return
        }

        const captureContext: CaptureContext | undefined =
          context?.itemLabel || context?.subjectBucket
            ? {
                ...(context.itemLabel ? { itemLabel: context.itemLabel } : {}),
                ...(context.subjectBucket ? { subjectBucket: context.subjectBucket } : {}),
              }
            : undefined

        const outcome = await runRef.current(file, {
          familyId,
          childId,
          ...(captureContext ? { captureContext } : {}),
        })

        publish(id, live, {
          status: BeforeWorkCheckStatus.Answered,
          summary: outcome.unsupported
            ? // Release skew: the service refused the task by name, so nothing
              // ran and "try again" is not the advice to give. Reachability is
              // the runner's to state and is stated there: `useAI.chat` turns a
              // callable rejection into `null`, so the shipped client reports
              // that refusal as a plain send failure and takes the branch below.
              inconclusiveBeforeWorkSummary(BEFORE_WORK_CHECK_UNAVAILABLE)
            : outcome.sendFailed
              ? inconclusiveBeforeWorkSummary(BEFORE_WORK_SEND_FAILED)
              : summarizeBeforeWorkCheck(outcome.results, {
                  ...(outcome.kind ? { kind: outcome.kind } : {}),
                }),
          photoPreviewUrl: preview,
          itemLabel,
          cancelled: false,
        })
      } catch {
        // The runner is documented never to throw; this is the belt for anything
        // on the way in. A late failure from an abandoned request publishes
        // nothing — `publish` checks ownership before it touches the screen.
        publish(id, live, {
          status: BeforeWorkCheckStatus.Answered,
          summary: inconclusiveBeforeWorkSummary(BEFORE_WORK_SEND_FAILED),
          photoPreviewUrl: preview,
          itemLabel,
          cancelled: false,
        })
      } finally {
        // Released by its OWNER only, on every exit — answer, failure, or a
        // throw before the call was even made. A request that was abandoned
        // (identity change, cancel, unmount) already lost ownership and must
        // not free a door that now belongs to a newer request.
        if (activeRequest.current === id) activeRequest.current = null
      }
    },
    [familyId, childId, selectionToken, publish, releasePreview],
  )

  /**
   * Retire the picker session: nothing chosen in a picker opened before this
   * moment may arrive as current. Synchronous (the ref) and then rendered (the
   * counter), so the inputs' `key` moves on too.
   */
  const retirePickerSession = useCallback(() => {
    pickerSessionRef.current += 1
    setPickerRenders((n) => n + 1)
  }, [])

  /** Abandon whatever is running, clear the screen, retire the session. */
  const clear = useCallback(
    (cancelled: boolean) => {
      activeRequest.current = null
      releasePreview(previewUrl.current)
      pickerSessionRef.current += 1
      setPickerRenders((n) => n + 1)
      // Stamped with the token that is live AFTER the retirement, so the
      // "stopped" line is visible while the retired session's own callbacks are
      // already refused.
      setState({
        ...IDLE,
        stamp: `${scopeTokenRef.current}|${pickerSessionRef.current}`,
        cancelled,
      })
    },
    [releasePreview],
  )

  const cancel = useCallback(() => clear(true), [clear])
  const close = useCallback(() => clear(false), [clear])

  return {
    status: visible.status,
    summary: visible.summary,
    photoPreviewUrl: visible.photoPreviewUrl,
    itemLabel: visible.itemLabel,
    cancelled: visible.cancelled,
    scopeToken,
    selectionToken,
    beginPickerSession: retirePickerSession,
    start,
    cancel,
    close,
  }
}
