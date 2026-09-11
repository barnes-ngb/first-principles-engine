/**
 * **Put back a working level a scan wrote downwards** (UX-383; owner decision,
 * 2026-09-11).
 *
 * On 2026-09-10 and 11, four hours apart, Shelly scanned the handwriting page
 * each boy had just finished — exactly what Today asks her to do. The scan path
 * read *The Good and the Beautiful Handwriting Lesson 35* as phonics (UX-381)
 * and wrote **phonics level 2** over London's 5 and Lincoln's 3 (UX-382: a
 * `curriculum`-sourced write could move a level in either direction). Those two
 * fixes stop it happening again; they do not put the numbers back.
 *
 * This is the one-shot that does, and it is deliberately narrow:
 *
 * - **It derives the value; it never types one.** The restored level is the
 *   highest a child's own stored evidence supports — the `workingLevel`
 *   evidence refs the learner model stamped on its concept states, and the
 *   `projectedThrough` watermark FIX-225 records. With no such evidence it
 *   restores nothing and says so; it never guesses a number.
 * - **It only touches a level a scan wrote that the UX-381 rule would now
 *   refuse.** It asks that question through the *same* functions the scan path
 *   asks it with, so the two can never drift. A phonics level a Fast Phonics
 *   page set is left exactly where it is.
 * - **It only ever raises.** The write goes through the central
 *   `skillSnapshotWrites.ts`, whose restore op is upgrade-only, which is also
 *   what makes a second run write nothing.
 * - **It corrects one field.** No other snapshot field, no `hours`, no
 *   `xpLedger`, no history rewritten. The learner model's concept states are
 *   not edited either: the restore re-runs FIX-225's existing re-projection, so
 *   any concept the restored level genuinely raises moves through the one
 *   writer that owns that fold and leaves its own `changeFeed` line.
 *
 * It is run from a button on the admin Dev tab, never on a page view.
 */

import { doc, getDoc, getDocs } from 'firebase/firestore'

import {
  childrenCollection,
  learnerModelsCollection,
  skillSnapshotsCollection,
} from '../../core/firebase/firestore'
import type { SkillSnapshot, WorkingLevel, WorkingLevels } from '../../core/types'
import type { LearnerModel } from '../../core/types/learnerModel'
import { mapSubjectBucket } from '../../core/hooks/useScanToActivityConfig'
import { resolveScanWorkingLevelDomain } from '../../core/hooks/scanWorkingLevelDomain'
import type { ScanWorkingLevelDomain } from '../../core/hooks/scanWorkingLevelDomain'
import { workbookBridgeForSource } from '../../core/foundations/workbookBridge'
import { bootstrapLearnerModel } from '../../core/foundations/bootstrapLearnerModel'
import { writeSnapshotUpdate } from '../evaluate/skillSnapshotWrites'

/** The working-level slots a scan can write, and therefore the ones that can need putting back. */
export const RESTORABLE_KEYS = ['phonics', 'comprehension', 'math'] as const
export type RestorableKey = (typeof RESTORABLE_KEYS)[number]

/**
 * Which `workingLevel` evidence `domain` speaks for a snapshot key. The learner
 * model's band pass stamps refs under its own driver keys (`phonics` /
 * `writing` / `math`), so `comprehension` has no evidence of its own — and says
 * `no-restore-evidence` rather than borrowing another domain's number.
 */
const EVIDENCE_DOMAIN_FOR_KEY: Record<RestorableKey, 'phonics' | 'math' | null> = {
  phonics: 'phonics',
  comprehension: null,
  math: 'math',
}

export type RestoreSkipReason =
  /** Nothing stored in this slot. */
  | 'no-level-stored'
  /** The standing level was not written by a scan. */
  | 'not-scan-written'
  /** The stored evidence does not read as a scan of a named book. */
  | 'evidence-unreadable'
  /** That book would still write this domain today — the scan was legitimate. */
  | 'scan-still-valid'
  /** No stored evidence supports any level for this domain. */
  | 'no-restore-evidence'
  /** The evidence supports nothing higher than what is standing. */
  | 'nothing-to-raise'

export type WorkingLevelRestorePlan =
  | { action: 'restore'; key: RestorableKey; level: WorkingLevel; from: number; book: string }
  | { action: 'skip'; key: RestorableKey; reason: RestoreSkipReason }

/**
 * The book a scan-written level names, read back out of its own evidence
 * string. `derive*WorkingLevelFromScan` writes exactly
 * `Scanned <name> Lesson <n>`, so this is its inverse — and anything that does
 * not parse is left alone rather than guessed at.
 */
export function parseScannedBookName(evidence: string | undefined): string | null {
  if (!evidence) return null
  const match = evidence.match(/^\s*Scanned\s+(.+?)\s+Lesson\s+\d+\s*$/i)
  const name = match?.[1]?.trim()
  return name ? name : null
}

/**
 * Would a scan of this book still write this domain's level today? Asked
 * through the scan path's own subject mapping, bridge lookup and UX-381 rule,
 * so a book the rule accepts is never "restored" out from under a legitimate
 * write.
 *
 * The scan's `provider` is not recorded in the evidence string, so it is passed
 * as `null`. That can only make the answer *more* refusing, which is the safe
 * direction: the worst case is restoring a level to a value the child's own
 * model already recorded.
 */
export function scanWouldStillWriteDomain(book: string, key: RestorableKey): boolean {
  const subject = mapSubjectBucket(book, null)
  const bridgeSourceId = workbookBridgeForSource(book)?.sourceId ?? null
  const domain: ScanWorkingLevelDomain | null = resolveScanWorkingLevelDomain(
    subject,
    book,
    bridgeSourceId,
  )
  return domain === key
}

/**
 * Every level the child's learner model has on record for a domain: the
 * `workingLevel` evidence refs stamped on its concept states, plus FIX-225's
 * `projectedThrough` watermark. The **highest** of these is what the snapshot
 * held before the scan, because the model only ever recorded what the snapshot
 * said at the time and a lowering never removes the earlier refs.
 */
export function recordedLevelsForDomain(
  model: LearnerModel | null,
  domain: 'phonics' | 'math' | null,
): number[] {
  if (!model || !domain) return []
  const levels: number[] = []
  for (const entry of Object.values(model.conceptStates ?? {})) {
    for (const ref of entry.evidence ?? []) {
      if (ref.kind !== 'workingLevel') continue
      if (ref.domain !== domain) continue
      if (typeof ref.level === 'number' && Number.isFinite(ref.level)) levels.push(ref.level)
    }
  }
  const watermark = model.projectedThrough?.[domain]
  if (typeof watermark === 'number' && Number.isFinite(watermark)) levels.push(watermark)
  return levels
}

/** The sentence written onto the restored level, so the record says what happened. */
export function restoreEvidence(book: string, from: number, at: string): string {
  return `Restored ${at.slice(0, 10)} after UX-383 — a ${book} scan had written ${from}`
}

/**
 * The pure decision for one slot. Every refusal has its own reason, because
 * "nothing happened" is the answer this one-shot must be able to explain.
 */
export function planWorkingLevelRestore(args: {
  key: RestorableKey
  current: WorkingLevel | undefined
  recordedLevels: number[]
  at: string
}): WorkingLevelRestorePlan {
  const { key, current, recordedLevels, at } = args
  if (!current) return { action: 'skip', key, reason: 'no-level-stored' }
  if (current.source !== 'curriculum') return { action: 'skip', key, reason: 'not-scan-written' }

  const book = parseScannedBookName(current.evidence)
  if (!book) return { action: 'skip', key, reason: 'evidence-unreadable' }
  if (scanWouldStillWriteDomain(book, key)) {
    return { action: 'skip', key, reason: 'scan-still-valid' }
  }

  if (recordedLevels.length === 0) {
    return { action: 'skip', key, reason: 'no-restore-evidence' }
  }
  const best = Math.max(...recordedLevels)
  if (best <= current.level) return { action: 'skip', key, reason: 'nothing-to-raise' }

  return {
    action: 'restore',
    key,
    from: current.level,
    book,
    level: {
      level: best,
      updatedAt: at,
      // A person's decision, not a measurement: the owner authorised this
      // correction, and `manual` is both the honest word for it and what stops
      // any automated source treating the restored number as up for grabs.
      source: 'manual',
      evidence: restoreEvidence(book, current.level, at),
    },
  }
}

// ── Firestore orchestration ──────────────────────────────────────

export interface RestoreReport {
  childId: string
  childName: string
  restored: { key: RestorableKey; from: number; to: number; book: string }[]
  skipped: { key: RestorableKey; reason: RestoreSkipReason }[]
  /** Concept ids the follow-on re-projection moved (usually none — see the docblock). */
  reprojected: number
  error?: string
}

/**
 * Run the restore across every child in the family. Idempotent: a second run
 * finds `source: 'manual'` on the slots it fixed and skips them as
 * `not-scan-written`, and the central writer's upgrade-only op would refuse
 * anyway.
 */
export async function restoreScanLoweredWorkingLevels(
  familyId: string,
): Promise<RestoreReport[]> {
  const childrenSnap = await getDocs(childrenCollection(familyId))
  const reports: RestoreReport[] = []
  const at = new Date().toISOString()

  for (const childDoc of childrenSnap.docs) {
    const childId = childDoc.id
    const childName = (childDoc.data() as { name?: string }).name ?? childId
    const report: RestoreReport = { childId, childName, restored: [], skipped: [], reprojected: 0 }

    try {
      const [snapDoc, modelDoc] = await Promise.all([
        getDoc(doc(skillSnapshotsCollection(familyId), childId)),
        getDoc(doc(learnerModelsCollection(familyId), childId)),
      ])
      const snapshot: Partial<SkillSnapshot> = snapDoc.exists() ? snapDoc.data() : {}
      const model: LearnerModel | null = modelDoc.exists()
        ? (modelDoc.data() as LearnerModel)
        : null
      const levels: WorkingLevels = snapshot.workingLevels ?? {}

      for (const key of RESTORABLE_KEYS) {
        const plan = planWorkingLevelRestore({
          key,
          current: levels[key],
          recordedLevels: recordedLevelsForDomain(model, EVIDENCE_DOMAIN_FOR_KEY[key]),
          at,
        })
        if (plan.action === 'skip') {
          report.skipped.push({ key: plan.key, reason: plan.reason })
          continue
        }
        const { changed } = await writeSnapshotUpdate(familyId, childId, {
          masteredSkills: [],
          restoreWorkingLevel: { key: plan.key, level: plan.level },
          at,
        })
        if (changed) {
          report.restored.push({
            key: plan.key,
            from: plan.from,
            to: plan.level.level,
            book: plan.book,
          })
        } else {
          report.skipped.push({ key: plan.key, reason: 'nothing-to-raise' })
        }
      }

      // The restored level is an INPUT to the deterministic layer, so let the one
      // writer that owns that fold re-read it. Upgrade-only, and it appends its
      // own `changeFeed` line for every concept it moves; a restore that raises
      // nothing on the terrain moves nothing and writes nothing, which is the
      // repo's own "a no-op is a no-op" rule rather than a silence.
      if (report.restored.length > 0 && model) {
        const next = await bootstrapLearnerModel(familyId, childId, 'reproject')
        report.reprojected = Math.max(
          0,
          (next?.changeFeed?.length ?? 0) - (model.changeFeed?.length ?? 0),
        )
      }
    } catch (err) {
      report.error = err instanceof Error ? err.message : String(err)
    }

    reports.push(report)
  }

  return reports
}
