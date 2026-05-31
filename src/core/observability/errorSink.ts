/**
 * errorSink — the rate-limited, de-duplicated path from a raw error to a
 * persisted (scrubbed) record (ARCH-11).
 *
 * This file is intentionally pure: it depends only on `scrubError`, `anonymize`,
 * and `buildInfo`, and takes its side-effects (the Firestore write, the clock,
 * the app context) as injected dependencies. That makes the dedupe / rate-limit
 * behaviour exhaustively testable without touching Firebase (see
 * `errorSink.test.ts`). The real singleton + global handlers are wired in
 * `reporter.ts`.
 */
import { anonymizeId } from './anonymize'
import { APP_BUILD } from './buildInfo'
import { scrubError } from './scrubError'
import type { RawErrorInput, ScrubbedError } from './scrubError'

export interface ReporterContext {
  /** Active child id — hashed before storage, never persisted raw. */
  childId?: string | null
  /** Terms stripped from all reported text (child names, family name). */
  sensitiveTerms?: readonly string[]
}

export interface ErrorRecord extends ScrubbedError {
  anonUserId: string | null
  anonChildId: string | null
  appBuild: string
  userAgent: string
  clientTs: number
}

export interface ReporterDeps {
  write: (record: ErrorRecord) => Promise<void> | void
  now: () => number
  getContext: () => ReporterContext
  /** Provider for the (already anonymized) current user id, or null. */
  getAnonUserId: () => string | null
}

export interface ReporterLimits {
  /** Window (ms) in which an identical error is treated as a duplicate. */
  dedupeWindowMs?: number
  /** Max writes allowed within `rateWindowMs` (render-loop flood guard). */
  maxWritesPerWindow?: number
  rateWindowMs?: number
}

const DEFAULT_LIMITS: Required<ReporterLimits> = {
  dedupeWindowMs: 60_000,
  maxWritesPerWindow: 20,
  rateWindowMs: 60_000,
}

function signature(s: ScrubbedError): string {
  return `${s.source}|${s.name}|${s.message}|${s.route ?? ''}|${s.section ?? ''}`
}

/**
 * Build a reporter. Returns `report(input)` which resolves to `true` only when a
 * record was actually written (i.e. not dropped by dedupe / rate-limit / error).
 * `report` never throws — error reporting must not be able to crash the app.
 */
export function createErrorReporter(
  deps: ReporterDeps,
  limits: ReporterLimits = {},
): (input: RawErrorInput) => Promise<boolean> {
  const cfg = { ...DEFAULT_LIMITS, ...limits }
  const lastSeen = new Map<string, number>()
  let windowStart = 0
  let windowCount = 0

  return async function report(input: RawErrorInput): Promise<boolean> {
    let scrubbed: ScrubbedError
    let ctx: ReporterContext
    try {
      ctx = deps.getContext()
      scrubbed = scrubError(input, { sensitiveTerms: ctx.sensitiveTerms })
    } catch {
      return false
    }

    const now = deps.now()
    const sig = signature(scrubbed)

    // De-dupe: identical signature within the dedupe window → drop (refresh ts
    // so a tight render loop keeps extending the window rather than escaping it).
    const prev = lastSeen.get(sig)
    if (prev !== undefined && now - prev < cfg.dedupeWindowMs) {
      lastSeen.set(sig, now)
      return false
    }

    // Rate-limit: cap total writes per rolling window.
    if (now - windowStart >= cfg.rateWindowMs) {
      windowStart = now
      windowCount = 0
    }
    if (windowCount >= cfg.maxWritesPerWindow) {
      return false
    }

    lastSeen.set(sig, now)
    windowCount += 1

    const record: ErrorRecord = {
      ...scrubbed,
      anonUserId: deps.getAnonUserId(),
      anonChildId: ctx.childId ? anonymizeId(ctx.childId) : null,
      appBuild: APP_BUILD,
      userAgent:
        typeof navigator !== 'undefined'
          ? navigator.userAgent.slice(0, 256)
          : 'unknown',
      clientTs: now,
    }

    try {
      await deps.write(record)
      return true
    } catch {
      return false
    }
  }
}
