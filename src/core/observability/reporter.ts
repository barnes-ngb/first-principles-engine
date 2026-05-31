/**
 * reporter.ts — the live singleton that wires the pure `errorSink` to Firestore,
 * plus the global `window` handlers (ARCH-11).
 *
 * Capturing errors must never affect domain/compliance data: this only ever
 * `addDoc`s to the family's own `errorLog` collection, and silently drops if
 * there is no signed-in user. Nothing here can throw into the app.
 */
import { addDoc, serverTimestamp } from 'firebase/firestore'

import { getFirebaseAuth } from '../firebase/firebase'
import { errorLogsCollection, stripUndefined } from '../firebase/firestore'
import type { ErrorLog } from '../types/errorLog'
import { anonymizeId } from './anonymize'
import { createErrorReporter } from './errorSink'
import type { ErrorRecord, ReporterContext } from './errorSink'
import { ErrorSource } from './scrubError'

// ── App-supplied context (set from React; see ErrorReporterSync.tsx) ──────────
let context: ReporterContext = {}

/** Update the context used to scrub + tag reports (active child, names). */
export function setErrorReporterContext(ctx: ReporterContext): void {
  context = ctx ?? {}
}

function currentUid(): string | undefined {
  try {
    return getFirebaseAuth().currentUser?.uid ?? undefined
  } catch {
    return undefined
  }
}

async function writeRecord(record: ErrorRecord): Promise<void> {
  const familyId = currentUid()
  if (!familyId) return // not signed in → nowhere safe to write; drop.
  await addDoc(
    errorLogsCollection(familyId),
    stripUndefined({ ...record, createdAt: serverTimestamp() }) as unknown as ErrorLog,
  )
}

/** The shared reporter. Resolves true only when a record was actually written. */
export const reportError = createErrorReporter({
  write: writeRecord,
  now: () => Date.now(),
  getContext: () => context,
  getAnonUserId: () => {
    const uid = currentUid()
    return uid ? anonymizeId(uid) : null
  },
})

function currentRoute(): string | null {
  return typeof window !== 'undefined' ? window.location.pathname : null
}

let installed = false

/**
 * Register global handlers for uncaught errors and unhandled promise rejections.
 * Idempotent and safe to call before React mounts. Uses `addEventListener`
 * rather than assigning `window.onerror` so existing handlers are preserved.
 */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (event: ErrorEvent) => {
    void reportError({
      name: event.error?.name ?? 'Error',
      message: event.message ?? event.error?.message ?? '',
      stack: event.error?.stack ?? null,
      route: currentRoute(),
      source: ErrorSource.WindowError,
    })
  })

  window.addEventListener(
    'unhandledrejection',
    (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason
      const err = reason instanceof Error ? reason : null
      void reportError({
        name: err?.name ?? 'UnhandledRejection',
        message: err?.message ?? (typeof reason === 'string' ? reason : ''),
        stack: err?.stack ?? null,
        route: currentRoute(),
        source: ErrorSource.UnhandledRejection,
      })
    },
  )
}
