import type { ScanConfigResult } from '../../core/hooks/useScanToActivityConfig'
import type { ScanRecord, ScanResult, WorksheetScanResult } from '../../core/types'
import { isWorksheetScan } from '../../core/types/planning'

/**
 * Multi-page Curriculum scan (FEAT): stage N workbook photos, then process them
 * **sequentially** — each page is scanned and applied (`syncScanToConfig`)
 * before the next one starts. Sequential apply is the write-race fix: the
 * find-or-create in `syncScanToConfig` re-reads configs with a fresh `getDocs`,
 * so a prior page's write is visible to the next page. That makes same-workbook
 * pages merge (DATA-15 matcher) and distinct workbooks each create their own
 * config. A failed page never aborts the batch; the summary reports it.
 *
 * The DATA-15 matcher itself is untouched — this module only orchestrates the
 * loop and rolls the per-page outcomes into one combined summary.
 */

export type PageStatus = 'created' | 'updated' | 'merged' | 'skipped' | 'failed' | 'claimed'

export interface PageOutcome {
  index: number
  status: PageStatus
  configId?: string
  configName?: string
  position?: number | null
  error?: string
}

export interface BatchScanSummary {
  /** Per-page outcomes, in staging order. 2nd+ pages that landed on a config
   * already touched in this batch are marked `merged`. */
  outcomes: PageOutcome[]
  /** Distinct configs newly created this batch. */
  createdCount: number
  /** Distinct existing configs updated (no create) this batch. */
  updatedCount: number
  /** Distinct configs that absorbed more than one page this batch. */
  mergedConfigs: number
  /** Pages that failed to scan/apply. */
  failedCount: number
  /** Pages that scanned but weren't a workbook page (nothing to apply). */
  skippedCount: number
  /**
   * Pages the CALLER claimed (UX-321) — a non-worksheet page it will handle
   * itself, rather than one there was nowhere to send. Zero for a caller that
   * passes no `claimNonWorksheet`, which is the staging area.
   */
  claimedCount: number
  /** Human-readable combined summary for the snackbar. */
  message: string
}

export interface BatchScanHandlers {
  /** Scan a single file (upload + AI + save record). */
  scanOne: (file: File, index: number) => Promise<ScanRecord | null>
  /** Apply a worksheet result to a config (find-or-create). */
  syncOne: (results: WorksheetScanResult) => Promise<ScanConfigResult>
  /** Optional side-effect after a successful worksheet apply (e.g. skill map). */
  onWorksheet?: (results: ScanResult) => Promise<void> | void
  /**
   * Optional (UX-321). Called for a page whose analysis is NOT a worksheet —
   * which, since `isWorksheetScan` is `pageType !== 'certificate'`, means a
   * certificate. Return `true` to CLAIM it: the caller will handle the page
   * itself, and the batch reports it as claimed instead of "not recognized".
   *
   * It exists because "not recognized" is right for the staging area, which has
   * nowhere to send a certificate, and **wrong for a workbook card**, which
   * opens a confirm dialog for one. Without it, a certificate picked alongside
   * one other page silently reported as unrecognised while the identical file
   * picked alone opened the dialog (Codex round 1, P2).
   *
   * Synchronous by design: it decides ownership, it does not do the work. The
   * caller acts after the batch, so nothing blocks mid-loop.
   */
  claimNonWorksheet?: (results: ScanResult, index: number) => boolean
}

/**
 * Process staged pages one at a time. Each page's `scanOne` + `syncOne`
 * `await`s to completion **before** the next page begins — never `Promise.all`,
 * both to avoid rate limits and so each find-or-create sees prior writes.
 */
export async function processScanBatch(
  files: File[],
  handlers: BatchScanHandlers,
): Promise<BatchScanSummary> {
  const outcomes: PageOutcome[] = []

  for (let i = 0; i < files.length; i++) {
    try {
      const record = await handlers.scanOne(files[i], i)
      const results = record?.results
      if (!results) {
        outcomes.push({
          index: i,
          status: 'failed',
          error: record ? 'No analysis returned' : 'Scan failed',
        })
        continue
      }
      if (!isWorksheetScan(results)) {
        // Certificates / non-workbook pages: nothing to auto-apply HERE — but
        // the caller may own one (UX-321). Unclaimed is the previous behaviour.
        const claimed = handlers.claimNonWorksheet?.(results, i) === true
        outcomes.push({ index: i, status: claimed ? 'claimed' : 'skipped' })
        continue
      }
      const r = await handlers.syncOne(results)
      await handlers.onWorksheet?.(results)
      if (r.action === 'created') {
        outcomes.push({
          index: i,
          status: 'created',
          configId: r.configId,
          configName: r.configName,
          position: r.position,
        })
      } else if (r.action === 'updated') {
        outcomes.push({
          index: i,
          status: 'updated',
          configId: r.configId,
          configName: r.configName,
          position: r.position,
        })
      } else {
        outcomes.push({ index: i, status: 'skipped' })
      }
    } catch (err) {
      outcomes.push({
        index: i,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return summarizeScanBatch(outcomes)
}

/** Longest reason text carried into the combined summary line. */
const MAX_REASON_LENGTH = 160

/**
 * The reason(s) the failed pages gave, de-duplicated and capped (UX-275).
 * Returns `null` when no page carried one, so the summary falls back to the
 * bare count rather than printing a dangling dash.
 */
export function failureReason(outcomes: readonly PageOutcome[]): string | null {
  const seen: string[] = []
  for (const o of outcomes) {
    if (o.status !== 'failed') continue
    const reason = (o.error ?? '').trim()
    if (!reason || seen.includes(reason)) continue
    seen.push(reason)
    if (seen.length === 2) break
  }
  if (seen.length === 0) return null
  const joined = seen.join('; ')
  return joined.length > MAX_REASON_LENGTH
    ? `${joined.slice(0, MAX_REASON_LENGTH).trimEnd()}…`
    : joined
}

/** Indexes of the pages that failed — the ones worth keeping staged to retry. */
export function failedPageIndexes(summary: BatchScanSummary): number[] {
  return summary.outcomes.filter((o) => o.status === 'failed').map((o) => o.index)
}

/**
 * Roll per-page outcomes into a combined summary. Pure — unit-testable without
 * Firestore. Successful pages are grouped by `configId` (first-seen order); a
 * group with more than one page is a merge, and its 2nd+ pages are re-labelled
 * `merged`.
 */
export function summarizeScanBatch(outcomes: PageOutcome[]): BatchScanSummary {
  const order: string[] = []
  const groups = new Map<string, PageOutcome[]>()
  for (const o of outcomes) {
    if ((o.status === 'created' || o.status === 'updated') && o.configId) {
      if (!groups.has(o.configId)) {
        groups.set(o.configId, [])
        order.push(o.configId)
      }
      groups.get(o.configId)!.push(o)
    }
  }

  // Re-label 2nd+ page of a multi-page group as `merged` (on a copy).
  const marked = outcomes.map((o) => ({ ...o }))
  for (const id of order) {
    if (groups.get(id)!.length <= 1) continue
    let seen = 0
    for (const m of marked) {
      if ((m.status === 'created' || m.status === 'updated') && m.configId === id) {
        seen++
        if (seen > 1) m.status = 'merged'
      }
    }
  }

  const parts: string[] = []
  let createdCount = 0
  let updatedCount = 0
  let mergedConfigs = 0
  for (const id of order) {
    const group = groups.get(id)!
    const name = group.find((g) => g.configName)?.configName ?? 'workbook'
    const positions = group
      .map((g) => g.position)
      .filter((p): p is number => typeof p === 'number')
    const maxPos = positions.length ? Math.max(...positions) : null
    const created = group.some((g) => g.status === 'created')
    if (created) createdCount++
    else updatedCount++
    const verb = created ? 'Added' : 'Updated'
    parts.push(maxPos != null ? `${verb} ${name} → L${maxPos}` : `${verb} ${name}`)
    if (group.length > 1) {
      mergedConfigs++
      parts.push(`${group.length} pages merged into ${name}`)
    }
  }

  const failedCount = marked.filter((o) => o.status === 'failed').length
  const skippedCount = marked.filter((o) => o.status === 'skipped').length
  if (failedCount > 0) {
    // UX-275: the per-page reasons already existed and were summarised away, so
    // a parent read "2 pages failed" and had nothing to act on. Name the
    // reason. Distinct reasons only (four pages of the same unsupported photo
    // is one sentence, not four), capped so the snackbar stays a sentence.
    const reason = failureReason(marked)
    parts.push(
      `${failedCount} page${failedCount > 1 ? 's' : ''} failed${reason ? ` — ${reason}` : ''}`,
    )
  }
  if (skippedCount > 0) {
    parts.push(`${skippedCount} page${skippedCount > 1 ? 's' : ''} not recognized`)
  }
  const claimedCount = marked.filter((o) => o.status === 'claimed').length
  if (claimedCount > 0) {
    // UX-321: a claimed page WAS recognized — its owner is just not this loop.
    parts.push(`${claimedCount} certificate${claimedCount > 1 ? 's' : ''} to confirm`)
  }

  return {
    outcomes: marked,
    createdCount,
    updatedCount,
    mergedConfigs,
    failedCount,
    skippedCount,
    claimedCount,
    message: parts.length > 0 ? parts.join('; ') : 'No workbook pages recognized',
  }
}
