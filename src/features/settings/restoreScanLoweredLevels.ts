/**
 * **Find the working levels a scan wrote downwards, and let a parent put one
 * back** (UX-383; owner decision, 2026-09-11).
 *
 * On 2026-09-10 and 11, four hours apart, Shelly scanned the handwriting page
 * each boy had just finished — exactly what Today asks her to do. The scan path
 * read *The Good and the Beautiful Handwriting Lesson 35* as phonics (UX-381)
 * and wrote **phonics level 2** over London's 5 and Lincoln's 3 (UX-382: a
 * `curriculum`-sourced write could move a level in either direction). Those two
 * fixes stop it happening again; they do not put the numbers back.
 *
 * **This module finds the rows; a person supplies the number.** Two rounds of
 * review went to the same place and the second settled it (Codex round 2, P1):
 * *the pre-scan level is not recoverable from anything this repo stores.*
 * `WorkingLevel` is a single mutable field with **no history**; the learner
 * model's `workingLevel` evidence refs are stamped only when the Foundations
 * view is opened and a projection runs, so a quest that lowered the level while
 * nobody opened that tab leaves **no trace at all**; the refs do not record
 * which source produced the level they were stamped from; and `projectedThrough`
 * records only the most recent projection's inputs. So a single recorded level
 * does not prove it was the one overwritten, and neither does the highest.
 *
 * Deriving a number from that would be guessing with a confident face, on a
 * field the whole engine reads. So:
 *
 * - {@link findScanLoweredLevels} **detects** every slot whose standing level
 *   was written by a scan of a book the `UX-381` rule would now refuse — asked
 *   through the *same* subject mapping, bridge lookup and domain rule the scan
 *   asks it with, so a level a Fast Phonics page legitimately set is never
 *   listed. It reports the levels the learner model has on record as
 *   **context, labelled as not a history**, and asserts nothing.
 * - The parent reads the row and types the level. The write is
 *   `skillSnapshotWrites.writeRestoredWorkingLevel` — transactional,
 *   identity-checked against the exact level she was shown, upgrade-only, and
 *   stamped `manual` with a sentence saying what it corrected.
 *
 * That is the app's own propose→confirm→write rule applied to a correction of a
 * child's record, which is what this always should have been.
 *
 * It is a button on the admin Dev tab, never a page-view effect.
 */

import { doc, getDoc } from 'firebase/firestore'

import {
  learnerModelsCollection,
  skillSnapshotsCollection,
} from '../../core/firebase/firestore'
import { loadCanonicalChildren } from '../../core/firebase/loadCanonicalChildren'
import type { SkillSnapshot, WorkingLevel, WorkingLevels } from '../../core/types'
import type { LearnerModel } from '../../core/types/learnerModel'
import { mapSubjectBucket } from '../../core/hooks/useScanToActivityConfig'
import { resolveScanWorkingLevelDomain } from '../../core/hooks/scanWorkingLevelDomain'
import type { ScanWorkingLevelDomain } from '../../core/hooks/scanWorkingLevelDomain'
import { workbookBridgeForSource } from '../../core/foundations/workbookBridge'
import { QUEST_MODE_LEVEL_CAP, DEFAULT_LEVEL_CAP } from '../quest/questTypes'
import {
  writeRestoredWorkingLevel,
  type RestoreWriteOutcome,
} from '../evaluate/skillSnapshotWrites'

/** The working-level slots a scan can write, and therefore the ones that can need putting back. */
export const RESTORABLE_KEYS = ['phonics', 'comprehension', 'math'] as const
export type RestorableKey = (typeof RESTORABLE_KEYS)[number]

/**
 * Which `workingLevel` evidence `domain` speaks for a snapshot key. The learner
 * model's band pass stamps refs under its own driver keys (`phonics` /
 * `writing` / `math`), so `comprehension` has none — and the row says "nothing
 * on record" rather than borrowing another domain's number.
 */
const EVIDENCE_DOMAIN_FOR_KEY: Record<RestorableKey, 'phonics' | 'math' | null> = {
  phonics: 'phonics',
  comprehension: null,
  math: 'math',
}

export type SkipReason =
  /** Nothing stored in this slot. */
  | 'no-level-stored'
  /** The standing level was not written by a scan. */
  | 'not-scan-written'
  /** The stored evidence does not read as a scan of a named book. */
  | 'evidence-unreadable'
  /** That book would still write this domain today — the scan was legitimate. */
  | 'scan-still-valid'

/** One level the learner model has on record, with when it was observed. */
export interface RecordedLevel {
  level: number
  observedAt: string
}

/** A slot a scan lowered, offered to a parent to correct. */
export interface ScanLoweredLevel {
  key: RestorableKey
  /** The level standing in the slot — what the refused scan wrote. */
  standing: WorkingLevel
  /** The book named in that level's own evidence string. */
  book: string
  /**
   * Levels the learner model has on record for this domain, highest first.
   * **Context, not a history** — see the module docblock. Often empty.
   */
  onRecord: RecordedLevel[]
  /** The highest level this slot accepts (the quest mode's ceiling). */
  maxLevel: number
}

export type ScanLoweredLevelFinding =
  | ({ action: 'offer' } & ScanLoweredLevel)
  | { action: 'skip'; key: RestorableKey; reason: SkipReason }

/**
 * The book a scan-written level names, read back out of its own evidence
 * string. `derive*WorkingLevelFromScan` writes exactly `Scanned <name> Lesson
 * <n>`, so this is its inverse — and anything that does not parse is left alone
 * rather than guessed at.
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
 * so a legitimately-set level is never offered for correction.
 *
 * The scan's `provider` is not recorded in the evidence string, so it is passed
 * as `null`. That can only make the answer *more* refusing — which lists a row
 * for a parent to look at rather than writing anything, so the failure mode is
 * a question, not a wrong number.
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
 * Every level the child's learner model has on record for a domain, highest
 * first, deduped. **Shown to a parent as context and read by nothing that
 * decides** — the module docblock says why it cannot be a history.
 */
export function recordedLevelsForDomain(
  model: LearnerModel | null,
  domain: 'phonics' | 'math' | null,
): RecordedLevel[] {
  if (!model || !domain) return []
  const byLevel = new Map<number, string>()
  for (const entry of Object.values(model.conceptStates ?? {})) {
    for (const ref of entry.evidence ?? []) {
      if (ref.kind !== 'workingLevel' || ref.domain !== domain) continue
      if (typeof ref.level !== 'number' || !Number.isFinite(ref.level)) continue
      const seen = byLevel.get(ref.level)
      if (!seen || ref.observedAt > seen) byLevel.set(ref.level, ref.observedAt)
    }
  }
  const watermark = model.projectedThrough?.[domain]
  if (typeof watermark === 'number' && Number.isFinite(watermark) && !byLevel.has(watermark)) {
    byLevel.set(watermark, model.updatedAt)
  }
  return [...byLevel.entries()]
    .map(([level, observedAt]) => ({ level, observedAt }))
    .sort((a, b) => b.level - a.level)
}

/** The sentence written onto the restored level, so the record says what happened. */
export function restoreEvidence(book: string, from: number, at: string): string {
  return `Restored ${at.slice(0, 10)} after UX-383 — a ${book} scan had written ${from}`
}

/**
 * The pure detection for one slot. Every refusal has its own reason, because
 * "this row is not listed" is an answer the one-shot must be able to explain.
 *
 * It decides only **whether this slot was lowered by a scan the rule would now
 * refuse**. It does not decide the level — see the module docblock.
 */
export function findScanLoweredLevel(args: {
  key: RestorableKey
  current: WorkingLevel | undefined
  onRecord: RecordedLevel[]
}): ScanLoweredLevelFinding {
  const { key, current, onRecord } = args
  if (!current) return { action: 'skip', key, reason: 'no-level-stored' }
  if (current.source !== 'curriculum') return { action: 'skip', key, reason: 'not-scan-written' }

  const book = parseScannedBookName(current.evidence)
  if (!book) return { action: 'skip', key, reason: 'evidence-unreadable' }
  if (scanWouldStillWriteDomain(book, key)) {
    return { action: 'skip', key, reason: 'scan-still-valid' }
  }

  return {
    action: 'offer',
    key,
    standing: current,
    book,
    onRecord,
    maxLevel: QUEST_MODE_LEVEL_CAP[key] ?? DEFAULT_LEVEL_CAP,
  }
}

/** Is a typed level a level at all, for this slot? */
export function isRestorableLevel(level: number, offer: ScanLoweredLevel): boolean {
  return (
    Number.isInteger(level) &&
    level > offer.standing.level &&
    level <= offer.maxLevel
  )
}

// ── Firestore orchestration ──────────────────────────────────────

export interface ChildScanLoweredLevels {
  childId: string
  childName: string
  offers: ScanLoweredLevel[]
  skipped: { key: RestorableKey; reason: SkipReason }[]
  error?: string
}

/**
 * Survey every child for working levels a refused scan wrote. **Reads only** —
 * it writes nothing at all, so running it is free and repeatable.
 */
export async function findScanLoweredLevels(
  familyId: string,
): Promise<ChildScanLoweredLevels[]> {
  // UX-394: the app's own children, not every document in the collection. This
  // survey is where the ~20 duplicate Lincoln/London documents were first seen,
  // because it looped the raw collection while every screen deduped.
  const children = await loadCanonicalChildren(familyId)
  const results: ChildScanLoweredLevels[] = []

  for (const child of children) {
    const childId = child.id
    const childName = child.name
    const row: ChildScanLoweredLevels = { childId, childName, offers: [], skipped: [] }

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
        const finding = findScanLoweredLevel({
          key,
          current: levels[key],
          onRecord: recordedLevelsForDomain(model, EVIDENCE_DOMAIN_FOR_KEY[key]),
        })
        if (finding.action === 'skip') row.skipped.push({ key: finding.key, reason: finding.reason })
        else row.offers.push(finding)
      }
    } catch (err) {
      row.error = err instanceof Error ? err.message : String(err)
    }

    results.push(row)
  }

  return results
}

/**
 * Write one parent-confirmed level. The transaction re-reads the slot and
 * refuses unless it still holds **exactly** the level the parent was shown, so
 * a quest or evaluation landing between the survey and the tap stands, and the
 * restore says it stood down rather than pinning a stale number as her word.
 */
export async function applyConfirmedRestore(
  familyId: string,
  childId: string,
  offer: ScanLoweredLevel,
  level: number,
  at: string = new Date().toISOString(),
): Promise<RestoreWriteOutcome> {
  return writeRestoredWorkingLevel(familyId, childId, {
    key: offer.key,
    expect: offer.standing,
    level,
    evidence: restoreEvidence(offer.book, offer.standing.level, at),
    at,
  })
}
