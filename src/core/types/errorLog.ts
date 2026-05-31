/**
 * ErrorLog — a single scrubbed client error record (ARCH-11).
 *
 * Stored at `families/{familyId}/errorLog/{autoId}`. Every field is the *shape*
 * of a failure only: no child names, content, sight words, evaluation text, or
 * record values ever reach this collection (see `src/core/observability`).
 */
export interface ErrorLog {
  id?: string
  /** Error class name (e.g. "TypeError", "FirebaseError"). */
  name: string
  /** Scrubbed error message. */
  message: string
  /** Scrubbed call stack (basenames + line:col), or null. */
  stack: string | null
  /** Scrubbed React component stack, or null. */
  componentStack: string | null
  /** SectionErrorBoundary label, or null. */
  section: string | null
  /** Route shape with id-like segments masked, or null. */
  route: string | null
  /** Where the error was captured. */
  source:
    | 'window.onerror'
    | 'unhandledrejection'
    | 'react-error-boundary'
    | 'react-section-boundary'
  /** Anonymized (hashed) user id — never the raw uid. */
  anonUserId: string | null
  /** Anonymized (hashed) active child id — never the raw child id. */
  anonChildId: string | null
  /** App build identifier (Vite build timestamp). */
  appBuild: string
  /** Truncated user agent (device/browser shape). */
  userAgent: string
  /** Client capture time (epoch ms) — used for ordering + dedupe. */
  clientTs: number
  /** Firestore serverTimestamp() (a Timestamp on read). */
  createdAt?: unknown
}
