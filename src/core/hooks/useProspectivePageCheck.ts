/**
 * The one call a prospective page check makes — and the only one.
 *
 * This is the I/O half of the before-work page check (see
 * `src/features/today/beforeWorkPageCheck.ts` for the contract and the copy).
 * It exists as a separate module from `useScan` on purpose: `useScan` is the
 * **retrospective** door and its job includes persisting the family's own scan
 * document, which is exactly what a prospective check must not do.
 *
 * ── What it does ─────────────────────────────────────────────────────────────
 *  1. resolves the bytes and the media type to send — the SAME
 *     `resolveScanUpload` the retrospective door uses, so an HEIC is refused by
 *     name here too rather than relabelled;
 *  2. asks for its OWN task — `TaskType.PageCheck`, never the scan task — which
 *     is how the server knows the question is prospective (the registry routes
 *     it to a handler that asks nothing else, and the dispatcher excludes it
 *     from the workbook backfill by that name);
 *  3. reads the reply through the shared `readScanAnalysis`.
 *
 * ── What it never does, and how that is actually known ───────────────────────
 * It writes no document and uploads no image **from the client**. This module
 * imports neither `firebase/firestore` nor `firebase/storage`, which is worth
 * keeping but is **not** a proof of "no writes": the call it makes is a Cloud
 * Function, and the server used to write workbook `activityConfigs` for every
 * child *before* the handler was chosen. A client-side import graph could not
 * see that, and an earlier version of this comment wrongly implied it could.
 *
 * The server side is handled where it happens and asserted by executing the
 * real dispatcher: `functions/src/ai/prospectiveCheck.ts` (the shared intent
 * predicate), `functions/src/ai/chat.ts` (skips the backfill for this intent)
 * and `functions/src/ai/chatProspectiveBypass.test.ts`.
 *
 * What the call does leave behind, deliberately, are the operational rows every
 * AI call leaves: the rate-limit entry, the AI usage row, and an error-log row
 * when something fails. The disclosure the parent reads says exactly that.
 *
 * Never throws: every failure comes back as an outcome.
 */

import { useCallback } from 'react'

import { useAI, TaskType } from '../ai/useAI'
import { compressIfNeeded } from '../utils/compressImage'
import { ErrorSource, reportError } from '../observability'
import { ScanDoor, scanFailureNote } from './scanFailureNote'
import type { ScanFailureShape } from './scanFailureNote'
import { readScanAnalysis, type ScanFailureKind } from './scanAnalysis'
import { resolveScanUpload } from '../utils/scanUpload'
import type { CaptureContext } from '../utils/contentNote'
import type { ScanResult } from '../types'

/**
 * The task this door calls, and the reason it is its own task.
 *
 * It is its own task — never the scan task with an intent flag. Hosting
 * deploys before functions, so a new client meets the previous dispatcher for a
 * window; an unknown task name is rejected there before any write, while a
 * `scan` carrying a flag the old dispatcher never reads would have been served
 * as an ordinary retrospective scan (backfill included). Server side:
 * `functions/src/ai/prospectiveCheck.ts`.
 */
export const PAGE_CHECK_TASK = TaskType.PageCheck

export interface ProspectivePageCheckOutcome {
  /** The analysis, or `null` when there is none. Never a partial one. */
  results: ScanResult | null
  /** Which reply failure it was, when the model answered but unusably. */
  kind?: ScanFailureKind
  /**
   * True when the request never got as far as a reply — an unsupported format,
   * a compression failure, a network error. The caller shows its own sentence;
   * the model's text and the exception's text never reach the screen.
   */
  sendFailed?: boolean
  /**
   * True when the SERVICE does not know this task — the release-skew window,
   * where the app is newer than the functions behind it. Distinguished from a
   * generic failure because the honest sentence is different: the check is
   * unavailable, nothing was analysed, and retrying now will not help.
   */
  unsupported?: boolean
}

export interface ProspectivePageCheckRequest {
  familyId: string
  childId: string
  /** What the app already knows about the page, when it knows anything. */
  captureContext?: CaptureContext
}

export interface UseProspectivePageCheckResult {
  /**
   * Ask the question. Resolves with an outcome — never rejects, and never
   * writes. Concurrency and staleness are the caller's business (see
   * `useBeforeWorkPageCheck`), which is why this returns a value and holds no
   * state of its own.
   */
  check: (file: File, request: ProspectivePageCheckRequest) => Promise<ProspectivePageCheckOutcome>
}

export function useProspectivePageCheck(): UseProspectivePageCheckResult {
  const { chat } = useAI()

  const check = useCallback(
    async (
      file: File,
      { familyId, childId, captureContext }: ProspectivePageCheckRequest,
    ): Promise<ProspectivePageCheckOutcome> => {
      // UX-276's shape note, same rules: the picture's shape only. No bytes, no
      // file name, no path — and for this door, no stored photo to name anyway.
      const shape: ScanFailureShape = { inputType: file.type, sizeBytes: file.size }

      try {
        const compressed = await compressIfNeeded(file, 1_000_000, {
          maxWidth: 2048,
          maxHeight: 2048,
          quality: 0.85,
        })
        const { uploadFile, mediaType, converted } = await resolveScanUpload(file, compressed)
        shape.converted = converted
        shape.sentType = mediaType

        const imageBase64 = await fileToBase64(uploadFile)

        const response = await chat({
          familyId,
          childId,
          // The intent IS the task. No purpose field is sent, because no server
          // reads one: `handlePageCheck` always asks the prospective question
          // and `handleScan` has no prospective branch, so neither request can
          // be mistaken for the other even by a forged payload.
          taskType: PAGE_CHECK_TASK,
          messages: [
            {
              role: 'user',
              content: JSON.stringify({
                imageBase64,
                mediaType,
                ...(captureContext && (captureContext.itemLabel || captureContext.subjectBucket)
                  ? { captureContext }
                  : {}),
              }),
            },
          ],
        })

        if (!response) return { results: null, sendFailed: true }

        const outcome = readScanAnalysis(response.message, response.stopReason)
        if (outcome.results) return { results: outcome.results }
        report(shape, `PageCheck:${outcome.kind ?? 'unreadable'}`, outcome.detail ?? 'reply not usable')
        return { results: null, ...(outcome.kind ? { kind: outcome.kind } : {}) }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        report(shape, err instanceof Error ? err.name : 'Error', message)
        // The release-skew case: the deployed functions are older than this app
        // and do not know the task, so the dispatcher refused it by name. It is
        // reported as its own outcome because it wrote nothing and because
        // "try again" is the wrong advice — the service has to catch up.
        return isUnsupportedTask(message)
          ? { results: null, sendFailed: true, unsupported: true }
          : { results: null, sendFailed: true }
      }
    },
    [chat],
  )

  return { check }
}

/**
 * Did the SERVICE refuse the task itself?
 *
 * The old dispatcher answers an unknown task with
 * `invalid-argument: taskType must be one of: plan, chat, …` — before the
 * workbook backfill and before any handler, so nothing was analysed and nothing
 * was written. The match is deliberately narrow (the sentence the dispatcher
 * actually writes, or the task name in an invalid-argument), so an ordinary
 * network failure is not mislabelled as a version skew.
 */
function isUnsupportedTask(message: string): boolean {
  if (/taskType must be one of/i.test(message)) return true
  return /invalid-argument/i.test(message) && /taskType|pageCheck/i.test(message)
}

/** The one path from a page-check failure to the log. The app's own words. */
function report(shape: ScanFailureShape, name: string, detail: string): void {
  void reportError({
    name,
    message: `${scanFailureNote(ScanDoor.PageCheck, shape)} ${detail}`,
    stack: null,
    route: typeof window !== 'undefined' ? window.location.pathname : null,
    section: ScanDoor.PageCheck,
    source: ErrorSource.Handled,
  })
}

/** File → base64 (data portion only). Same as the retrospective door's. */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
