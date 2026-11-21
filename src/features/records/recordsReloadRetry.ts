/**
 * A page-scoped retry for the parent Records re-read (Build Studio automatic credit).
 *
 * ── Why it exists ───────────────────────────────────────────────────────────
 *
 * An automatic credit deletes its pending job when it settles, then asks Records
 * to re-read. If that one read fails there is no later job to ask again, so the
 * credited row would stay off the screen until someone reloaded. This coordinator
 * RETAINS a failed re-read until one succeeds, with no adult step and no control.
 *
 * ── What it guarantees ──────────────────────────────────────────────────────
 *
 *   • It belongs to the PAGE, not to the Build Studio card or its worker, so it
 *     survives a selected-child switch (the card is keyed by child and remounts) and
 *     a late settle from the previous child's worker. The Records read is
 *     family-wide, so the child is not part of what it retries.
 *   • It is bound to the page's guarded identity (family, range, parent capability).
 *     `reset()` — called when that identity changes and on unmount — drops the
 *     pending retry, the timer and the listeners, and retires every read already in
 *     flight: a result that answers after a reset changes nothing here.
 *   • ONE timer at a time. Retry delays double from {@link RELOAD_RETRY_BASE_MS} to
 *     {@link RELOAD_RETRY_MAX_MS} and then repeat at that ceiling until a read
 *     succeeds; a retry never runs beside another read (a tick that finds one in
 *     flight leaves the outcome to it), and a hidden tab waits for visibility.
 *   • Duplicate failures while one is retained do not stack timers or restart the
 *     delay. A read that started BEFORE a successful one cannot arm a retry.
 *
 * ── Ordering: only the latest requested read may apply ──────────────────────
 *
 * Reads can overlap (two workers settle close together) and answer out of order.
 * Each read is handed a generation guard, `isLatest()`, true only while ALL of
 * these hold: no `reset()` has happened since it started (epoch), no read was
 * requested after it (sequence), and the page identity is still the one it was
 * started for. The sequence is taken synchronously when the read is requested,
 * before its async fetch, so a read cannot apply "before the coordinator knows
 * its sequence". The caller checks the guard before AND after its fetch and
 * applies only if it is still true. Consequences:
 *
 *   • An older read that answers after a newer one started applies nothing, so it
 *     can neither overwrite the newer read's data nor — if the newer read failed —
 *     consume the retry that read left behind.
 *   • After `reset()` (identity change OR unmount) the guard is false for every
 *     read already out, even where the page's own identity ref still holds the old
 *     value, which only the epoch can tell.
 *   • Even a read that ignores its guard and reports `applied` cannot clear a retry
 *     armed by a LATER request, and an older failure never replaces a newer one.
 *
 * It decides nothing about WHAT is read or applied: the caller's `read` does the
 * guarded read and apply, and reports `applied`, `failed` or `dropped` (nothing
 * applied, nothing to retry). `run` itself may also answer `superseded`: a newer
 * read was requested, which owns the outcome — this one reports at once and never
 * waits for it.
 */

export const RELOAD_RETRY_BASE_MS = 5_000
export const RELOAD_RETRY_MAX_MS = 60_000
/** Reconnecting or becoming visible retries after this short settle, not at once. */
export const RELOAD_NUDGE_MS = 400

export type ReloadOutcome = 'applied' | 'failed' | 'dropped' | 'superseded'
/** True only while this read is still the latest request of the current epoch and identity. */
export type ReloadGuard = () => boolean
export type ReloadRead = (isLatest: ReloadGuard) => Promise<ReloadOutcome>

export interface RecordsReloadRetry {
  /** Run one guarded read for `identity`; a failure is retained and retried. */
  run(identity: object, read: ReloadRead): Promise<ReloadOutcome>
  /** The page's identity changed, or the page is going away. */
  reset(): void
}

const isHidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden'

export function createRecordsReloadRetry(isCurrent: (identity: object) => boolean): RecordsReloadRetry {
  let epoch = 0
  let seq = 0
  let appliedSeq = 0
  let inFlight = 0
  let failures = 0
  // `seq` is the request that armed it: only a LATER success may clear it.
  let pending: { identity: object; read: ReloadRead; seq: number } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let listening = false

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const schedule = (ms: number) => {
    clearTimer()
    timer = setTimeout(tick, ms)
  }
  const nudge = () => {
    if (pending && inFlight === 0 && !isHidden()) schedule(RELOAD_NUDGE_MS)
  }
  const listen = () => {
    if (listening || typeof window === 'undefined') return
    listening = true
    window.addEventListener('online', nudge)
    document.addEventListener('visibilitychange', nudge)
  }
  const unlisten = () => {
    if (!listening) return
    listening = false
    window.removeEventListener('online', nudge)
    document.removeEventListener('visibilitychange', nudge)
  }
  const clearPending = () => {
    pending = null
    clearTimer()
    unlisten()
  }

  /** After any outcome: drop a retired retry, or make sure a live one has a timer. */
  const settle = () => {
    if (!pending) return
    if (!isCurrent(pending.identity)) {
      clearPending()
      return
    }
    if (timer === null && inFlight === 0) {
      schedule(Math.min(RELOAD_RETRY_MAX_MS, RELOAD_RETRY_BASE_MS * 2 ** Math.max(0, failures - 1)))
    }
  }

  const exec = async (identity: object, read: ReloadRead): Promise<ReloadOutcome> => {
    // Taken synchronously, before the read's first await.
    const myEpoch = epoch
    const mySeq = ++seq
    const isLatest: ReloadGuard = () => myEpoch === epoch && mySeq === seq && isCurrent(identity)
    inFlight += 1
    let outcome: ReloadOutcome
    try {
      outcome = await read(isLatest)
    } catch {
      outcome = 'failed'
    }
    // Retired by a reset while in flight: it changes nothing, and `inFlight` was
    // already zeroed by the reset.
    if (myEpoch !== epoch) return 'dropped'
    inFlight -= 1
    if (outcome === 'applied') {
      appliedSeq = Math.max(appliedSeq, mySeq)
      // Only a LATER request than the one that armed the retry may clear it.
      if (!pending || mySeq > pending.seq) {
        failures = 0
        clearPending()
      }
    } else if (mySeq !== seq) {
      // A newer read was requested; it owns the outcome (its own failure arms the
      // retry, its own success clears it). An older answer touches neither.
      settle()
      return 'superseded'
    } else if (outcome === 'failed' && mySeq > appliedSeq && isCurrent(identity)) {
      failures += 1
      pending = { identity, read, seq: mySeq }
      listen()
    }
    settle()
    return outcome
  }

  function tick() {
    timer = null
    if (!pending) return
    if (!isCurrent(pending.identity)) {
      clearPending()
      return
    }
    if (isHidden()) {
      // No polling in a hidden tab; `visibilitychange` nudges when it is back.
      schedule(RELOAD_RETRY_MAX_MS)
      return
    }
    // Never beside another read: that read's outcome clears or re-arms the retry.
    if (inFlight > 0) return
    void exec(pending.identity, pending.read)
  }

  return {
    run: (identity, read) => exec(identity, read),
    reset: () => {
      epoch += 1
      inFlight = 0
      failures = 0
      clearPending()
    },
  }
}
