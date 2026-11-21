/**
 * The client-side driver of automatic Build Studio credit (LOCAL-VISION-007).
 *
 * ── What it is, and what it is not ──────────────────────────────────────────
 *
 * A NEW eligible Apple Dash save leaves one tiny pending job
 * (`buildStudioCreditJobs`) in its own save transaction. This hook works that
 * queue for ONE child: while it is mounted it lists the child's pending jobs and
 * works them one at a time through `reconcileBuildStudioCreditJobsForChild`, which
 * composes the ordinary credit writer. It decides nothing itself.
 *
 * **This is a client workflow. There is no server worker.** Pending work is
 * processed only while the child's Build Studio page or the parent's Records view
 * is open. A credit that could not finish (offline, a failed read or write, a
 * reload) stays pending and finishes when either view is next open or the
 * connection returns. The owner approved this automatic path as a narrow exception
 * to confirm-before-write (see `buildStudioHoursCreditWrites.ts` and CLAUDE.md).
 *
 * ── One lifecycle, bounded ──────────────────────────────────────────────────
 *
 *   • ONE timer chain per mounted child (never an interval), so passes can never
 *     overlap: the next is scheduled only after the previous finished. A trigger
 *     that arrives mid-pass is remembered and run once afterwards.
 *   • Idle cadence {@link IDLE_MS}; after a pass that left work pending, or could
 *     not read, exponential backoff from {@link RETRY_BASE_MS} to
 *     {@link RETRY_MAX_MS}. A hidden tab does not poll; becoming visible, or the
 *     browser coming back online, runs a pass at once.
 *   • Each pass reads one bounded page of the child's QUEUE, ordered by document
 *     id, continuing after the last row the previous pass examined (finished or
 *     not), so held rows cannot starve healthy ones. After the last page the sweep
 *     starts over; a sweep that ended with rows still pending backs off. It never
 *     lists or rescans saved games or archives.
 *   • Unmount, or a different family/child, clears the timer and listeners (the
 *     cursor belongs to the scope); a pass already running stops at its next job
 *     boundary. If a job it already had in flight commits, the caller's original
 *     refresh closure is still told once (it guards the actual family/range/parent
 *     scope itself); a changed family or a disabled worker is not told.
 *
 * The component is the only caller. It holds no `useState`: nothing here is shown,
 * so nothing — and no credit detail — can reach a child's screen.
 */

import { useEffect, useRef } from 'react'

import { reconcileBuildStudioCreditJobsForChild } from '../../core/firebase/buildStudioHoursCreditWrites'

/** Cadence when nothing is pending. */
export const IDLE_MS = 30_000
/** First retry delay after a pass that left work pending; doubles per failure. */
export const RETRY_BASE_MS = 5_000
export const RETRY_MAX_MS = 120_000
/** A save nudge or reconnect waits this long, so a burst of triggers is one pass. */
export const TRIGGER_DELAY_MS = 400

export interface UseBuildStudioAutoCreditArgs {
  /** Both must be the protected, confirmed scope. Either missing/`enabled: false` = idle. */
  familyId: string | null | undefined
  childId: string | null | undefined
  enabled: boolean
  /**
   * Changes when something that could have created a job happened (a new saved
   * version on the shelf). Runs a pass soon without restarting the lifecycle.
   */
  nudgeKey?: string | number
  /** A credit is on record after a pass. Called only for the scope still on screen. */
  onSettled?: () => unknown | Promise<unknown>
}

const isHidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden'

export function useBuildStudioAutoCredit({
  familyId,
  childId,
  enabled,
  nudgeKey,
  onSettled,
}: UseBuildStudioAutoCreditArgs): void {
  const onSettledRef = useRef(onSettled)
  const triggerRef = useRef<(() => void) | null>(null)
  const latestRef = useRef({ familyId, enabled })
  useEffect(() => {
    onSettledRef.current = onSettled
    latestRef.current = { familyId, enabled }
  })

  useEffect(() => {
    if (!enabled || !familyId || !childId) return undefined
    const sameFamilyStillOn = () => latestRef.current.enabled && latestRef.current.familyId === familyId
    let cancelled = false
    let running = false
    let again = false
    let failures = 0
    // Where the next pass continues in the queue (a document id), and whether any
    // row of the current sweep was left pending. Both belong to THIS scope only:
    // a switch re-runs this effect and starts at the top with its own cursor.
    let cursor: string | null = null
    let sweepRetrying = false
    let retiredNotify: UseBuildStudioAutoCreditArgs['onSettled'] = undefined
    let timer: ReturnType<typeof setTimeout> | null = null

    const clear = () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
    const schedule = (ms: number) => {
      if (cancelled) return
      clear()
      timer = setTimeout(() => void run(), ms)
    }

    async function run(): Promise<void> {
      timer = null
      if (cancelled) return
      if (running) {
        again = true
        return
      }
      // A hidden tab does not poll; `visibilitychange` runs a pass when it is back.
      if (isHidden()) {
        schedule(IDLE_MS)
        return
      }
      running = true
      let next = IDLE_MS
      try {
        const result = await reconcileBuildStudioCreditJobsForChild({
          familyId: familyId as string,
          childId: childId as string,
          after: cursor,
          isCurrent: () => !cancelled,
        })
        // A credit that committed for this scope is a fact about the family, even if
        // the child on screen changed while the job was in flight. The caller's
        // closure (captured when it was current) guards itself against a real
        // family/range/parent change; here only a changed family, or a disabled
        // worker, withholds it. No timer, state or new work follows a retired scope.
        if (result.settled > 0 && (!cancelled || sameFamilyStillOn())) {
          try {
            await (cancelled ? retiredNotify : onSettledRef.current)?.()
          } catch {
            /* the credit is recorded; the caller owns a failed refresh. The job is gone
               and may be the last one, so nothing here would ask again: the Records page
               retains the failed re-read and retries it itself (`recordsReloadRetry.ts`). */
          }
        }
        if (cancelled) return
        const wrapped = !result.nextCursor
        sweepRetrying = sweepRetrying || result.retrying > 0
        if (result.listed === 'failed') {
          // Same page again, with backoff.
          failures += 1
          next = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failures - 1))
        } else if (!wrapped) {
          // Step past every row examined, finished or not, so held or malformed
          // rows early in the queue cannot starve the healthy ones behind them.
          cursor = result.nextCursor
          next = RETRY_BASE_MS
        } else {
          cursor = null
          if (sweepRetrying) {
            // The sweep ended with rows still pending: back off before the next one.
            failures += 1
            next = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failures - 1))
          } else {
            failures = 0
            next = result.more ? RETRY_BASE_MS : IDLE_MS
          }
          sweepRetrying = false
        }
      } catch {
        failures += 1
        next = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failures - 1))
      } finally {
        running = false
      }
      if (cancelled) return
      if (again) {
        again = false
        next = Math.min(next, TRIGGER_DELAY_MS)
      }
      schedule(next)
    }

    const trigger = () => {
      if (cancelled) return
      if (running) {
        again = true
        return
      }
      schedule(TRIGGER_DELAY_MS)
    }
    triggerRef.current = trigger

    const onVisible = () => {
      if (!isHidden()) trigger()
    }
    window.addEventListener('online', trigger)
    document.addEventListener('visibilitychange', onVisible)
    // Recovery after a reload or reopening: the first pass is immediate.
    schedule(0)

    return () => {
      // Keep the closure that was current for THIS scope (cleanup runs before the
      // next render's refs update), for a job that settles after the switch.
      retiredNotify = onSettledRef.current
      cancelled = true
      clear()
      if (triggerRef.current === trigger) triggerRef.current = null
      window.removeEventListener('online', trigger)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, familyId, childId])

  // A new saved version nudges the SAME lifecycle; it never restarts it.
  const lastNudge = useRef(nudgeKey)
  useEffect(() => {
    if (lastNudge.current === nudgeKey) return
    lastNudge.current = nudgeKey
    triggerRef.current?.()
  }, [nudgeKey])
}
