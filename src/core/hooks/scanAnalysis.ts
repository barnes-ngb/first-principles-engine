/**
 * Reading a scan reply — the ONE answer to *did the analysis come back, and if
 * not, what happened* (UX-311).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `useScan` parsed the model's reply with a bare `JSON.parse` and reported every
 * failure with one sentence: *"The analysis came back in a form the app couldn't
 * read … try that page again."* That sentence was FIX-214 working — it replaced
 * "spinner then nothing" and it told the truth — but it is the same words for
 * four different failures, and "try that page again" is wrong advice for three
 * of them:
 *
 *  - the reply was **fenced or prefaced** (```json …, or `Here is the JSON:`).
 *    Nothing is wrong; the app just would not read it. Three other client parse
 *    sites already use `sanitizeAndParseJson` for exactly this. This one did
 *    not, while the prompt asks the model for "no markdown fences, no
 *    commentary" — a request, not a guarantee.
 *  - the reply was **cut short** by the output budget (`stop_reason:
 *    max_tokens`). Truncated JSON has an unbalanced brace, so the sanitizer's
 *    span fallback cannot rescue it either. Retrying the identical page tends to
 *    truncate identically.
 *  - the model **refused**. The same photo will refuse again; "try that page
 *    again" wastes the afternoon, which is the case the run named.
 *  - the request **never reached the model** — `handleScan` returns
 *    `{"error": …}` for its own four bail-outs, which is *valid JSON*. It parsed
 *    cleanly, and since `isWorksheetScan` is `pageType !== 'certificate'` an
 *    object with no `pageType` at all read as a worksheet. A server-side error
 *    was being stored and applied as a successful scan.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * Tolerant about **wrapping**, strict about **shape**. The parse forgives fences
 * and preamble (through the shared parser — there is no second one here), and
 * then a reply is an analysis only if it carries a real `pageType`. That
 * strictness is the point: a tolerant parse that let a refusal through would
 * store `results: null` and report success, which is worse than the sentence it
 * replaced.
 *
 * Pure: no I/O, never throws. The model's own text never appears in a returned
 * `message` — it is unbounded and may echo the child's page, so it stays on the
 * scan record and out of both the screen and the error log (the FIX-214 rule,
 * kept). `detail` is the app's own words, for the log only.
 */

import { sanitizeAndParseJson } from '../utils/sanitizeJson'
import type { ScanResult } from '../types'

/** Which failure a scan reply was, when it was not an analysis. */
export const ScanFailureKind = {
  /** The output budget ran out mid-reply (`stop_reason: max_tokens`). */
  CutShort: 'cut-short',
  /** The model declined to analyse the picture. */
  Refused: 'refused',
  /** The request never reached the model — the CF returned its own error. */
  NotDelivered: 'not-delivered',
  /** It parsed, or it did not, but it is not an analysis. */
  Unreadable: 'unreadable',
} as const
export type ScanFailureKind = (typeof ScanFailureKind)[keyof typeof ScanFailureKind]

/** `stop_reason` values we give their own sentence. */
const MAX_TOKENS_STOP_REASON = 'max_tokens'
const REFUSAL_STOP_REASON = 'refusal'

/**
 * The page kinds a real analysis declares. A reply missing this field is not an
 * analysis, whatever else it parsed into.
 */
const PAGE_TYPES = new Set([
  'worksheet',
  'textbook',
  'test',
  'activity',
  'other',
  'certificate',
])

export interface ScanAnalysisOutcome {
  /** The analysis, or `null` when there is none. Never a partial one. */
  results: ScanResult | null
  /** Which failure it was. Absent on success. */
  kind?: ScanFailureKind
  /** What the parent reads. The app's own sentence. Absent on success. */
  message?: string
  /** One line for the log — the app's own words, never the model's. */
  detail?: string
}

/**
 * What a parent reads for each failure. Each one says the same two things — what
 * happened, and that nothing was written — and then differs on the ONE thing
 * that differs: what to do next.
 *
 * `Unreadable` keeps FIX-214's exact sentence. It is the one the owner has
 * already seen, it is still right for its own case, and it now covers only that
 * case.
 */
export const SCAN_FAILURE_MESSAGE: Record<ScanFailureKind, string> = {
  [ScanFailureKind.CutShort]:
    "The analysis was cut off before it finished. Nothing was added to the curriculum — that's on us, not the photo. Scan one page at a time, or set the lesson by hand from the card's menu.",
  [ScanFailureKind.Refused]:
    'The AI would not analyse this picture. Nothing was added to the curriculum — try a different photo of the page, or set the lesson by hand.',
  [ScanFailureKind.NotDelivered]:
    "The photo didn't reach the AI, so nothing was analysed and nothing was added to the curriculum. Check your connection and try again.",
  [ScanFailureKind.Unreadable]:
    "The analysis came back in a form the app couldn't read. Nothing was added to the curriculum — try that page again.",
}

/** Build the outcome for a failure kind, with an optional log-only detail. */
function failure(kind: ScanFailureKind, detail: string): ScanAnalysisOutcome {
  return { results: null, kind, message: SCAN_FAILURE_MESSAGE[kind], detail }
}

/**
 * Does this parsed value carry a real `pageType`?
 *
 * The strict half of the rule. `isWorksheetScan` asks `pageType !== 'certificate'`
 * and so answers `true` for an object with no `pageType` at all — which is how
 * `{"error": "imageBase64 is required"}` reached `syncScanToConfig` as a
 * worksheet. Nothing without a declared page kind gets past here.
 */
function isAnalysis(value: unknown): value is ScanResult {
  if (typeof value !== 'object' || value === null) return false
  const pageType = (value as { pageType?: unknown }).pageType
  return typeof pageType === 'string' && PAGE_TYPES.has(pageType)
}

/** Did the CF hand back one of its own `{"error": …}` bail-outs? */
function isDeliveryError(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  return typeof (value as { error?: unknown }).error === 'string'
}

/**
 * Read a scan reply.
 *
 * @param raw the model's reply text, verbatim.
 * @param stopReason why the model stopped, when the server reported one.
 *   `undefined` means "unknown" — never success — so an older deploy that sends
 *   no `stopReason` falls through to the shape checks and behaves as before,
 *   only with the forgiving parse and the delivery-error rule added.
 */
export function readScanAnalysis(
  raw: string | undefined | null,
  stopReason?: string,
): ScanAnalysisOutcome {
  const text = (raw ?? '').trim()

  // A refusal is named by the server before we look at the text at all: a model
  // that declined may still have written a polite paragraph, and that paragraph
  // must not be mistaken for a page we failed to parse.
  if (stopReason === REFUSAL_STOP_REASON) {
    return failure(ScanFailureKind.Refused, 'stop_reason=refusal')
  }

  if (text.length === 0) {
    // No visible text. Cut short with nothing to show is still cut short.
    return stopReason === MAX_TOKENS_STOP_REASON
      ? failure(ScanFailureKind.CutShort, 'stop_reason=max_tokens, no visible text')
      : failure(
          ScanFailureKind.Unreadable,
          `empty analysis text (stop_reason=${stopReason ?? 'unknown'})`,
        )
  }

  let parsed: unknown
  try {
    parsed = sanitizeAndParseJson(text)
  } catch {
    // Truncation is checked HERE and not before the parse: a reply can stop at
    // `max_tokens` and still be complete JSON (the budget ran out on trailing
    // prose), and that is a usable analysis, not a failure.
    return stopReason === MAX_TOKENS_STOP_REASON
      ? failure(
          ScanFailureKind.CutShort,
          `stop_reason=max_tokens, ${text.length} chars of unparseable text`,
        )
      : failure(
          ScanFailureKind.Unreadable,
          `analysis response was not JSON (stop_reason=${stopReason ?? 'unknown'}, ${text.length} chars)`,
        )
  }

  if (isAnalysis(parsed)) return { results: parsed }

  // Parsed, but not an analysis. The CF's own bail-out is the one shape we can
  // name; anything else is an unreadable reply that happened to be valid JSON.
  if (isDeliveryError(parsed)) {
    return failure(ScanFailureKind.NotDelivered, 'scan handler returned an error envelope')
  }
  return stopReason === MAX_TOKENS_STOP_REASON
    ? failure(ScanFailureKind.CutShort, 'stop_reason=max_tokens, parsed reply carried no pageType')
    : failure(ScanFailureKind.Unreadable, 'parsed reply carried no pageType')
}
