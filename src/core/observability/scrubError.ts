/**
 * scrubError — privacy-first sanitization for client error reports (ARCH-11).
 *
 * This module is the SINGLE, central place that decides what error data is
 * allowed to leave the browser. It runs before anything is written to the
 * `errorLog` collection. Because the app records a minor's learning data, the
 * guiding rule is: keep only the *shape* of a failure, never its content.
 *
 * NEVER preserved: child names, message/story/chat content, sight words,
 * evaluation text, record values, emails, URLs, ids, or any free text we can't
 * confidently classify as safe. When in doubt, redact or drop.
 *
 * Pure + dependency-free so it is exhaustively unit-testable (see
 * `scrubError.test.ts` — the privacy guard is the most important test here).
 */

export const ErrorSource = {
  WindowError: 'window.onerror',
  UnhandledRejection: 'unhandledrejection',
  ReactErrorBoundary: 'react-error-boundary',
  ReactSectionBoundary: 'react-section-boundary',
} as const
export type ErrorSource = (typeof ErrorSource)[keyof typeof ErrorSource]

export interface RawErrorInput {
  name?: string | null
  message?: string | null
  stack?: string | null
  componentStack?: string | null
  /** Section label from SectionErrorBoundary (a static developer string). */
  section?: string | null
  /** `location.pathname` at the time of the error. */
  route?: string | null
  source: ErrorSource
}

export interface ScrubbedError {
  name: string
  message: string
  stack: string | null
  componentStack: string | null
  section: string | null
  route: string | null
  source: ErrorSource
}

export interface ScrubOptions {
  /**
   * Exact terms (e.g. children's names, family name) to strip everywhere,
   * case-insensitively. Supplied by the caller from app context so we can
   * positively remove known-PII even when it is not quoted.
   */
  sensitiveTerms?: readonly string[]
  maxMessageLength?: number
  maxStackLength?: number
  maxFrames?: number
}

const DEFAULT_MAX_MESSAGE = 300
const DEFAULT_MAX_STACK = 2000
const DEFAULT_MAX_FRAMES = 20

const REDACTED = '[redacted]'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function clamp(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/**
 * Error type names are class identifiers (`TypeError`, `FirebaseError`). We keep
 * them because they describe the *shape* of the failure, but coerce anything
 * that does not look like a bare identifier to a generic label so a contrived
 * `throw new (class X {})()` whose name carries content cannot leak.
 */
function safeName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return 'Error'
  if (/^[A-Za-z_$][A-Za-z0-9_$]{0,60}$/.test(trimmed)) return trimmed
  return 'Error'
}

/**
 * Strip known sensitive terms and content-bearing patterns from free text,
 * keeping only structural shape. Order matters: remove explicitly-known terms
 * first, then structural patterns.
 */
export function redactText(
  text: string,
  sensitiveTerms: readonly string[] = [],
): string {
  let out = text

  // 0. Normalize intra-word apostrophes (possessives/contractions like
  //    "London's" / "don't") so they can't break quote-pairing below and leave
  //    trailing quoted content un-redacted.
  out = out.replace(/(\w)['’](\w)/g, '$1$2')

  // 1. Known sensitive terms (child names, family name, …). Case-insensitive,
  //    all occurrences. Terms shorter than 2 chars are too risky to match.
  for (const term of sensitiveTerms) {
    const t = term.trim()
    if (t.length < 2) continue
    out = out.replace(new RegExp(escapeRegExp(t), 'gi'), REDACTED)
  }

  // 2. Emails.
  out = out.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')

  // 3. URLs / storage refs (may embed family/child ids or tokens).
  out = out.replace(/\b(?:https?|gs|blob|data|file):\S+/gi, '[url]')

  // 4. Quoted content — error messages routinely interpolate user data inside
  //    quotes (e.g. reading 'because'). Strip the contents, keep the quotes.
  out = out.replace(/"[^"]*"/g, `"${REDACTED}"`)
  out = out.replace(/'[^']*'/g, `'${REDACTED}'`)
  out = out.replace(/`[^`]*`/g, `\`${REDACTED}\``)

  // 5. Long digit runs (ids, phone numbers, record values).
  out = out.replace(/\d{4,}/g, '[num]')

  return out
}

/** True if a stack line looks like a call frame (V8 `at …`, or `name@url:line:col`). */
function isFrameLine(line: string): boolean {
  return /(^|\s)at\s/.test(line) || /@/.test(line) || /:\d+:\d+/.test(line)
}

/**
 * Reduce a stack to call frames only, dropping the header line (which is the
 * error message and may carry content). File URLs are reduced to their basename
 * so absolute paths / origins can't leak, while line:col are preserved.
 */
export function scrubStack(
  stack: string,
  sensitiveTerms: readonly string[],
  maxFrames: number,
): string | null {
  const frames: string[] = []
  for (const raw of stack.split('\n')) {
    const line = raw.trim()
    if (!line || !isFrameLine(line)) continue // drops the "Name: message" header
    // Reduce any URL/path to its basename, keeping a trailing :line:col.
    let f = line.replace(
      /(?:https?|file|blob):\/\/\S*?\/([^/\s)?:]+(?::\d+:\d+)?)/gi,
      '$1',
    )
    f = f.replace(/\/[^\s()]*\/([^/\s()?:]+(?::\d+:\d+)?)/g, '$1')
    // Remove known sensitive terms + emails (frames shouldn't contain these,
    // but defend anyway). We deliberately do NOT run digit/quote redaction here
    // so :line:col stay intact.
    for (const term of sensitiveTerms) {
      const t = term.trim()
      if (t.length < 2) continue
      f = f.replace(new RegExp(escapeRegExp(t), 'gi'), REDACTED)
    }
    f = f.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    frames.push(f)
    if (frames.length >= maxFrames) break
  }
  const joined = frames.join('\n')
  return joined.length ? joined : null
}

/**
 * React component stacks are lists of component identifiers ("in Foo (created by
 * Bar)"). Identifiers are safe, but we still strip terms + URLs and cap depth.
 */
function scrubComponentStack(
  componentStack: string,
  sensitiveTerms: readonly string[],
  maxFrames: number,
): string | null {
  const lines: string[] = []
  for (const raw of componentStack.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let f = line.replace(/(?:https?|file|blob):\/\/\S+/gi, '[url]')
    for (const term of sensitiveTerms) {
      const t = term.trim()
      if (t.length < 2) continue
      f = f.replace(new RegExp(escapeRegExp(t), 'gi'), REDACTED)
    }
    lines.push(f)
    if (lines.length >= maxFrames) break
  }
  const joined = lines.join('\n')
  return joined.length ? joined : null
}

/** Section labels are static code literals; allow only a safe shape, else drop. */
function scrubSection(section: string | null | undefined): string | null {
  const s = (section ?? '').trim()
  if (!s) return null
  if (/^[\w -]{1,40}$/.test(s)) return s
  return null
}

/** Keep the route shape, masking id-like path segments and dropping query/hash. */
function scrubRoute(
  route: string | null | undefined,
  sensitiveTerms: readonly string[],
): string | null {
  if (!route) return null
  const pathOnly = route.split(/[?#]/)[0]
  const masked = pathOnly
    .split('/')
    .map((seg) => {
      if (!seg) return seg
      if (seg.length > 20) return ':id'
      if (/^\d+$/.test(seg) && seg.length >= 4) return ':id'
      if (/\d/.test(seg) && /[a-z]/i.test(seg) && seg.length > 8) return ':id'
      return seg
    })
    .join('/')
  return clamp(redactText(masked, sensitiveTerms), 120) || null
}

/**
 * Sanitize a raw error into a record safe to persist. Every field is reduced to
 * shape; anything that can't be confidently scrubbed is dropped to null.
 */
export function scrubError(
  input: RawErrorInput,
  options: ScrubOptions = {},
): ScrubbedError {
  const terms = options.sensitiveTerms ?? []
  const maxMessage = options.maxMessageLength ?? DEFAULT_MAX_MESSAGE
  const maxStack = options.maxStackLength ?? DEFAULT_MAX_STACK
  const maxFrames = options.maxFrames ?? DEFAULT_MAX_FRAMES

  const message =
    clamp(collapse(redactText(input.message ?? '', terms)), maxMessage) ||
    '[empty]'

  const stack = input.stack
    ? clamp(scrubStack(input.stack, terms, maxFrames) ?? '', maxStack) || null
    : null

  const componentStack = input.componentStack
    ? scrubComponentStack(input.componentStack, terms, maxFrames)
    : null

  return {
    name: safeName(input.name),
    message,
    stack,
    componentStack,
    section: scrubSection(input.section),
    route: scrubRoute(input.route, terms),
    source: input.source,
  }
}
