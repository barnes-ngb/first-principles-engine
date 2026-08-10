/**
 * FEAT-135: what a parent is told when a workbook page doesn't register.
 *
 * Reporting only. Nothing here scans, writes, or advances anything — it turns a
 * list of per-page outcomes into ONE honest line. It exists because the old
 * banner ("Couldn't read the workbook page. The photo is still saved.") was a
 * single red sentence standing in for six different failures, one of which
 * ("the workbook this row points at is gone") no photo can ever fix.
 *
 * Two rails the wording holds:
 *  - **Never send the parent to do useless work.** `config-missing` means the
 *    activity config the row targets no longer exists; retaking the photo
 *    changes nothing, so the message must not suggest it.
 *  - **The photo being kept is the reassuring half.** A total failure where the
 *    capture succeeded is a `warning`, not an `error` — red argues against the
 *    message's own second sentence.
 */

/**
 * Why a single page failed to register. Six kinds, not the prompt-sketched
 * four, because `analyzeWorkbookPage`'s null had six distinguishable causes and
 * collapsing any two of them would put a wrong sentence in front of the parent:
 *
 *  - `timeout`                — the scan exceeded `WORKBOOK_SCAN_TIMEOUT_MS`.
 *  - `no-result`              — `runScan` came back with no parsed results at
 *                               all (upload/CF failure, or the model returned
 *                               non-JSON). The scan never happened; retry.
 *  - `not-a-worksheet`        — `isWorksheetScan` said no. That predicate only
 *                               excludes `pageType: 'certificate'`, so this is
 *                               literally "you photographed a certificate".
 *  - `no-curriculum-detected` — the page WAS read, but nothing in it identified
 *                               a curriculum or subject, so there is nothing to
 *                               register against. This is the "couldn't find a
 *                               workbook page in the photo" case a parent means.
 *  - `config-missing`         — the row's target activity config is gone.
 *  - `error`                  — anything else thrown.
 */
export const WorkbookScanFailure = {
  Timeout: 'timeout',
  NoResult: 'no-result',
  NotAWorksheet: 'not-a-worksheet',
  NoCurriculumDetected: 'no-curriculum-detected',
  ConfigMissing: 'config-missing',
  Error: 'error',
} as const
export type WorkbookScanFailure = (typeof WorkbookScanFailure)[keyof typeof WorkbookScanFailure]

/** What a successfully registered page advanced (name + lesson, lesson may be unknown). */
export interface WorkbookRegistration {
  configName: string
  position: number | null
}

/** The discriminated result of analyzing ONE workbook page. Replaces the old `null`. */
export type WorkbookPageOutcome =
  | { ok: true; registration: WorkbookRegistration }
  | { ok: false; reason: WorkbookScanFailure }

/**
 * A capture/analysis toast. `warning` is the new member (FEAT-135): a failed
 * read whose photo is safely saved is not an error.
 */
export interface CaptureMessage {
  text: string
  severity: 'success' | 'error' | 'warning'
}

/**
 * Tie-break order when a batch fails for more than one reason. Most-specific
 * and most-actionable first: `config-missing` outranks everything because it is
 * the only kind where retrying is pointless, and saying so is the whole point.
 */
const FAILURE_PRIORITY: WorkbookScanFailure[] = [
  'config-missing',
  'timeout',
  'not-a-worksheet',
  'no-curriculum-detected',
  'no-result',
  'error',
]

/**
 * The reason to lead with across a batch: the most frequent failure, ties
 * broken by `FAILURE_PRIORITY`. One banner, never three stacked.
 */
export function dominantFailure(outcomes: WorkbookPageOutcome[]): WorkbookScanFailure | null {
  const counts = new Map<WorkbookScanFailure, number>()
  for (const o of outcomes) {
    if (o.ok) continue
    counts.set(o.reason, (counts.get(o.reason) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  let best: WorkbookScanFailure | null = null
  for (const reason of FAILURE_PRIORITY) {
    const n = counts.get(reason)
    if (n == null) continue
    if (best == null || n > (counts.get(best) ?? 0)) best = reason
  }
  return best
}

function lessonSuffix(position: number | null): string {
  return position != null ? ` · Lesson ${position}` : ''
}

function pages(n: number): string {
  return n === 1 ? 'page' : 'pages'
}

/** The whole story when NOTHING registered — names the reason, never the generic sentence. */
function totalFailureSentence(reason: WorkbookScanFailure): string {
  switch (reason) {
    case 'timeout':
      return 'The scan took too long. The photo is saved — try again.'
    case 'no-result':
      return "Couldn't read the workbook page. The photo is saved — try again."
    case 'not-a-worksheet':
      return 'That looks like a certificate, not a workbook page. The photo is saved.'
    case 'no-curriculum-detected':
      return "Couldn't find a workbook page in the photo. The photo is saved — try one page, flat and straight on, in good light."
    case 'config-missing':
      // Deliberately no "try again" / no photo advice: the row's workbook is
      // gone, so no photo of any quality will ever register against it.
      return "This row isn't linked to a workbook any more, so there's nothing to register the page to. The photo is saved."
    case 'error':
      return 'Something went wrong reading the page. The photo is saved — try again.'
  }
}

/**
 * The short tail naming what happened to the pages that didn't read, when some
 * did. `failed` is EVERY unread page, attributed to the dominant reason, so the
 * counts reconcile with the lead ("1 of 4 pages read" + "3 pages …") rather than
 * leaving a page silently unaccounted for. One banner, not three.
 */
function partialFailureTail(reason: WorkbookScanFailure, failed: number): string {
  const n = `${failed} ${pages(failed)}`
  switch (reason) {
    case 'timeout':
      return `${n} took too long to scan`
    case 'no-result':
      return `${n} couldn't be read`
    case 'not-a-worksheet':
      return `${n} looked like a certificate, not a workbook page`
    case 'no-curriculum-detected':
      return `${n} couldn't be matched to a lesson`
    case 'config-missing':
      return `${n} lost the workbook link`
    case 'error':
      return `${n} failed to read`
  }
}

/**
 * Turn per-page outcomes into the one line the parent sees.
 *
 *  - all read           → the existing success line, unchanged.
 *  - some read          → the count (`2 of 3 pages read`), what registered, and
 *                         what happened to the rest. `warning`.
 *  - none read          → the reason, not the generic sentence. `warning`.
 *  - mixed reasons      → lead with the count, then the dominant reason.
 *
 * Returns `null` for an empty batch (there is nothing to report).
 */
export function buildWorkbookScanReport(outcomes: WorkbookPageOutcome[]): CaptureMessage | null {
  const total = outcomes.length
  if (total === 0) return null

  const registered = outcomes.filter((o): o is Extract<WorkbookPageOutcome, { ok: true }> => o.ok)
  const failed = total - registered.length
  const last = registered.at(-1)?.registration ?? null

  // A page can register WITHOUT advancing anything: the scan read it, named the
  // subject, but found no lesson number, so `syncScanToConfig` reports
  // `action: 'updated'` with `position: null` and the workbook stays put. That
  // is the common shape for a blurry / angled / two-page-spread photo (the scan
  // prompt always fills `subject`, so the `no-curriculum-detected` branch below
  // is rare in the field). Calling it "Registered to GATB Math" is a non-event
  // dressed as a success — the mirror of the failure-dressed-as-error bug this
  // module fixes — so when NOT ONE page produced a lesson, say so.
  // Reporting only: the checklist stamp and every write are unchanged; whether
  // this should stop registering at all is FEAT-136, deliberately not decided here.
  const anyAdvanced = registered.some((o) => o.registration.position != null)
  if (last && !anyAdvanced) {
    const read =
      failed === 0
        ? registered.length > 1
          ? `Read ${registered.length} pages, but couldn't tell which lesson`
          : "Read the page, but couldn't tell which lesson"
        : `${registered.length} of ${total} ${pages(total)} read, but couldn't tell which lesson`
    const tail =
      failed === 0 ? '' : `; ${partialFailureTail(dominantFailure(outcomes) ?? 'error', failed)}`
    return {
      text: `${read} — nothing advanced in ${last.configName}${tail}. The photo is saved — try one page, flat and straight on, in good light.`,
      severity: 'warning',
    }
  }

  if (failed === 0 && last) {
    return {
      text:
        registered.length > 1
          ? `Registered ${registered.length} pages to ${last.configName}${lessonSuffix(last.position)}`
          : `Registered to ${last.configName}${lessonSuffix(last.position)}`,
      severity: 'success',
    }
  }

  const reason = dominantFailure(outcomes) ?? 'error'

  if (last) {
    return {
      text: `${registered.length} of ${total} ${pages(total)} read · ${last.configName}${lessonSuffix(last.position)} — ${partialFailureTail(reason, failed)}`,
      severity: 'warning',
    }
  }

  // Nothing registered. With more than one page, lead with the count so the
  // parent isn't left wondering whether some of the batch got through.
  const lead = total > 1 ? `None of the ${total} pages read. ` : ''
  return { text: `${lead}${totalFailureSentence(reason)}`, severity: 'warning' }
}
