// ── Transient connectivity retry (FEAT-110) ──────────────────────────────────
//
// Mobile browsers suspend a backgrounded tab, which drops the Firestore socket.
// An in-flight read (`getDoc`/`getDocs`) then rejects with the transient
// `unavailable` code / "Failed to get document because the client is offline".
// Un-caught, that rejection reaches the app-root ErrorBoundary's global
// `unhandledrejection` listener and escalates a temporary blip into a full-page
// crash screen — even though the connection recovers a moment later.
//
// This wraps a read in a short bounded retry so a reconnect heals it before it
// ever surfaces. Genuine faults (`permission-denied`, `not-found`, malformed
// data) are NOT retried — they rethrow immediately and keep their behavior.
// Only when retries exhaust does it surface one honest, named error.

/** Firestore/Firebase error codes that a reconnect can heal. */
const TRANSIENT_CODES = new Set([
  'unavailable',
  'deadline-exceeded',
  // Fully-qualified variants some callable/SDK surfaces emit.
  'firestore/unavailable',
  'firestore/deadline-exceeded',
  'functions/unavailable',
  'functions/deadline-exceeded',
])

/**
 * True when `err` is a transient connectivity blip (offline / socket dropped /
 * backend briefly unreachable) rather than a genuine fault. Checks the Firebase
 * error `code` first, then falls back to the offline message text (some offline
 * rejections carry `code: 'unavailable'`, but the message is the surest tell).
 */
export function isTransientConnectivityError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: unknown }).code
  if (typeof code === 'string' && TRANSIENT_CODES.has(code)) return true
  const message = (err as { message?: unknown }).message
  if (typeof message === 'string') {
    const m = message.toLowerCase()
    if (
      m.includes('client is offline') ||
      m.includes('could not reach cloud firestore backend') ||
      m.includes('backend didn\'t respond') ||
      m.includes('network error')
    ) {
      return true
    }
  }
  return false
}

/**
 * Thrown by {@link withTransientRetry} only after every attempt was a transient
 * connectivity failure. Named so callers can distinguish "we're offline, this
 * will heal" from a genuine fault, and so the ErrorBoundary can classify it.
 */
export class TransientConnectivityError extends Error {
  /** The last underlying transient error, for telemetry. */
  readonly cause: unknown
  constructor(cause: unknown) {
    super('Still offline after several attempts. Check your connection and try again.')
    this.name = 'TransientConnectivityError'
    this.cause = cause
  }
}

export interface TransientRetryOptions {
  /** Total attempts including the first (default 3). */
  attempts?: number
  /** Base backoff in ms; doubles each retry (default 300 → 300, 600). */
  baseDelayMs?: number
  /** Classifier override (default {@link isTransientConnectivityError}). */
  isTransient?: (err: unknown) => boolean
  /** Sleep injection for tests (default real `setTimeout`). */
  sleep?: (ms: number) => Promise<void>
  /** Called before each retry with the 1-based attempt just failed. */
  onRetry?: (attempt: number, err: unknown) => void
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Run `work` with a short bounded retry for transient connectivity errors.
 *
 * - A transient failure retries after exponential backoff, up to `attempts`.
 * - A non-transient error (permission-denied, not-found, bad data) rethrows
 *   immediately — genuine faults escalate as they always did.
 * - If every attempt is transient, throws a single {@link TransientConnectivityError}.
 * - The success path is unchanged: `work` runs once and its value passes through.
 */
export async function withTransientRetry<T>(
  work: () => Promise<T>,
  options: TransientRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3
  const baseDelayMs = options.baseDelayMs ?? 300
  const isTransient = options.isTransient ?? isTransientConnectivityError
  const sleep = options.sleep ?? defaultSleep

  let lastErr: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await work()
    } catch (err) {
      if (!isTransient(err)) throw err
      lastErr = err
      if (attempt >= attempts) break
      options.onRetry?.(attempt, err)
      await sleep(baseDelayMs * 2 ** (attempt - 1))
    }
  }
  throw new TransientConnectivityError(lastErr)
}
