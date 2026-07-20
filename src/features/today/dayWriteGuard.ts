import {
  deleteDoc,
  getDoc,
  setDoc,
  updateDoc,
  type DocumentReference,
} from 'firebase/firestore'

import type { ChecklistItem, DayBlock, DayLog } from '../../core/types'

/**
 * Day-write preservation guard (FEAT-113).
 *
 * Days (`families/{familyId}/days/{date}_{childId}`) are the **irrecoverable
 * source of truth** for what school actually happened — hours are derived and
 * regenerable, day logs are not. Twice now the same compliance-destroying filter
 * shipped independently (`handleApplyPlan`, fixed by FEAT-111; `handleRedoPlan`,
 * the P0 hotfix): a plan operation rebuilt a day's checklist/blocks and silently
 * dropped completed work along with its logged minutes and evidence. Convention
 * ("remember to preserve") did not prevent the second one.
 *
 * This module makes preservation a property of the write path, not of each
 * caller's memory. **Every** `days` write routes through one of the guarded
 * writers here; the CI invariant (`check-docs-alignment.mjs`, check
 * `day-write-routing`) fails the build if a raw `setDoc`/`updateDoc`/`deleteDoc`
 * targets the days collection anywhere else.
 *
 * ── What "preservation" means (identity-drop, not value-clamp) ───────────────
 * The guard is deliberately **identity-based**, mirroring the codebase's own
 * `applyReset.ts` precedent (`if (item.completed) return true`). It refuses a
 * write that makes a preservation-critical *entity disappear*, but it does NOT
 * clamp values on a **retained** entity. That distinction is load-bearing: the
 * single canonical manual-edit lane (`useDayLog.writeDayLog`, via every Today
 * toggle/capture/rollover) legitimately reduces a block's `actualMinutes` when a
 * parent un-checks an item (`TodayChecklist` clears the auto-filled minutes).
 * Un-checking keeps the item/block in the array — its identity survives — so the
 * guard allows it (the parent is the authority over their own day). A bulk
 * filter that *removes* the item is the bug, and that is exactly what the guard
 * catches. Every reachable **automated** transform (apply-retain, redo-retain,
 * rollover) only ever drops entities; none edits a number downward — so on those
 * paths "no entity dropped" is equivalent to "no minutes/completions lost."
 *
 * A write is refused when, comparing the current persisted doc (`before`) to the
 * document that would result (`after`):
 *   1. a `completed` checklist item present in `before` is absent (by identity)
 *      in `after` — a dropped completion (and with it, its minutes/evidence);
 *   2. a block carrying logged `actualMinutes` in `before` is absent (by
 *      identity) in `after` — logged compliance minutes vanishing;
 *   3. a checklist item carrying `evidenceArtifactId` in `before` has no matching
 *      present item still carrying it in `after` — dropped evidence.
 *
 * On violation the guard logs at warn+ (DOC-09 posture — no silent swallow).
 * Whether it *blocks* the write depends on the lane (see `assertDayPreservation`):
 * **automated structural writers** (apply/redo/quest/workshop/migrations) throw
 * `DayPreservationError` — dropping completed work there is always a bug (both
 * audited failures lived on these paths). The **interactive manual-edit lane**
 * (`useDayLog`, `enforce: false`) logs the anomaly but proceeds, because rename /
 * un-check / delete are the parent's authoritative edits over their own day and
 * id-less items key on the editable label (a strict block would reject a
 * legitimate rename of a completed item every keystroke). Legitimate writes
 * (additive completions, capture, fresh-day create, migrations) pass untouched.
 */

/** Named error thrown when a day write would drop preservation-critical data. */
export class DayPreservationError extends Error {
  readonly context: string
  readonly violations: string[]
  constructor(context: string, violations: string[]) {
    super(
      `Day-write preservation guard refused a write (${context}): ${violations.join(
        '; ',
      )}`,
    )
    this.name = 'DayPreservationError'
    this.context = context
    this.violations = violations
  }
}

// ── Identity keys ────────────────────────────────────────────────────────────
// Items/blocks often have no stable `id` (planner-created ones never set one),
// so identity falls back to a content key. Multiset counting below tolerates the
// rare same-key collision without ever *under*-counting a preserved entity.

const checklistKey = (item: ChecklistItem): string =>
  item.id ?? `${item.label}::${item.subjectBucket ?? ''}`

const blockKey = (block: DayBlock): string =>
  block.id ?? `${block.type}::${block.title ?? ''}`

const blockHasMinutes = (block: DayBlock): boolean =>
  (block.actualMinutes ?? 0) > 0

const itemHasEvidence = (item: ChecklistItem): boolean =>
  typeof item.evidenceArtifactId === 'string' && item.evidenceArtifactId.length > 0

/** Count occurrences of each key produced by `keyFor` over `items`. */
function countKeys<T>(items: T[], keyFor: (t: T) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const k = keyFor(item)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return counts
}

type DayShape = { checklist?: ChecklistItem[]; blocks?: DayBlock[] }

/**
 * Pure comparison: the list of preservation violations a `before → after`
 * transition would cause. Empty array means the write is safe. Exported for the
 * guard's unit tests and the CI pure-logic invariant test.
 */
export function findDayPreservationViolations(
  before: DayShape | null | undefined,
  after: DayShape,
): string[] {
  const violations: string[] = []
  if (!before) return violations // creating a fresh doc — nothing to preserve

  const beforeChecklist = before.checklist ?? []
  const afterChecklist = after.checklist ?? []
  const beforeBlocks = before.blocks ?? []
  const afterBlocks = after.blocks ?? []

  // (1) Dropped completions. Present-count in `after` must cover completed-count
  // in `before` for each identity — un-check keeps the item present (covered);
  // a filter that removes it does not.
  const presentAfter = countKeys(afterChecklist, checklistKey)
  const completedBefore = countKeys(
    beforeChecklist.filter((i) => i.completed),
    checklistKey,
  )
  const droppedCompletions: string[] = []
  for (const [key, needed] of completedBefore) {
    const have = presentAfter.get(key) ?? 0
    if (have < needed) {
      const label = beforeChecklist.find((i) => checklistKey(i) === key)?.label ?? key
      for (let n = 0; n < needed - have; n++) droppedCompletions.push(label)
    }
  }
  if (droppedCompletions.length > 0) {
    violations.push(
      `drops ${droppedCompletions.length} completed item(s): ${droppedCompletions.join(', ')}`,
    )
  }

  // (2) Dropped evidence. Each `before` item carrying evidence must have a
  // matching present `after` item still carrying it.
  const evidenceAfter = countKeys(
    afterChecklist.filter(itemHasEvidence),
    checklistKey,
  )
  const evidenceBefore = countKeys(
    beforeChecklist.filter(itemHasEvidence),
    checklistKey,
  )
  const droppedEvidence: string[] = []
  for (const [key, needed] of evidenceBefore) {
    const have = evidenceAfter.get(key) ?? 0
    if (have < needed) {
      const label = beforeChecklist.find((i) => checklistKey(i) === key)?.label ?? key
      for (let n = 0; n < needed - have; n++) droppedEvidence.push(label)
    }
  }
  if (droppedEvidence.length > 0) {
    violations.push(
      `drops evidence from ${droppedEvidence.length} item(s): ${droppedEvidence.join(', ')}`,
    )
  }

  // (3) Dropped block minutes. A block carrying logged `actualMinutes` must
  // survive by identity — the only vector by which an automated transform
  // reduces a day's logged minutes.
  const presentBlocksAfter = countKeys(afterBlocks, blockKey)
  const minutesBlocksBefore = countKeys(
    beforeBlocks.filter(blockHasMinutes),
    blockKey,
  )
  const droppedBlocks: string[] = []
  for (const [key, needed] of minutesBlocksBefore) {
    const have = presentBlocksAfter.get(key) ?? 0
    if (have < needed) {
      const title =
        beforeBlocks.find((b) => blockKey(b) === key)?.title ?? key
      for (let n = 0; n < needed - have; n++) droppedBlocks.push(title)
    }
  }
  if (droppedBlocks.length > 0) {
    violations.push(
      `drops ${droppedBlocks.length} block(s) with logged minutes: ${droppedBlocks.join(', ')}`,
    )
  }

  return violations
}

/**
 * Check `before → after` for preservation violations. Violations are ALWAYS
 * logged at warn+ (DOC-09 posture — never silent). Whether a violation *blocks*
 * the write depends on `enforce`:
 *
 *  - `enforce: true` (default) — **automated structural writers** (apply-plan,
 *    redo-plan, quest/fluency auto-complete, workshop, migrations): dropping a
 *    completed item here is always a bug (the two audited failures both lived on
 *    these paths), so it throws `DayPreservationError`.
 *  - `enforce: false` — the **interactive manual-edit lane** (`useDayLog`, all
 *    Today toggles/capture/rollover): rename, un-check, delete, reorder are the
 *    parent's *authoritative* edits over their own day and must never be blocked
 *    (id-less items key on the editable label, so a legitimate rename of a
 *    completed item would otherwise be misread as a dropped completion). Here a
 *    violation is logged for observability (a warn-logged anomaly also surfaces
 *    a genuine last-write-wins clobber, which the run-prompt scoped as a
 *    follow-up) but the write proceeds.
 */
export function assertDayPreservation(
  before: DayShape | null | undefined,
  after: DayShape,
  context: string,
  opts: { enforce?: boolean } = {},
): void {
  const enforce = opts.enforce ?? true
  const violations = findDayPreservationViolations(before, after)
  if (violations.length === 0) return
  console.warn(
    `[dayWriteGuard] ${enforce ? 'refusing to persist' : 'anomaly on trusted write'} ${context}: ${violations.join('; ')}`,
  )
  if (enforce) throw new DayPreservationError(context, violations)
}

/**
 * Preservation-relevant summary of a day, for the destructive-action warnings
 * (DevAdminTab / RecordsPage): how much irrecoverable work a delete would take.
 */
export function dayLogPreservationSummary(
  day: DayShape | null | undefined,
): { completedItems: number; minutesLogged: number } {
  if (!day) return { completedItems: 0, minutesLogged: 0 }
  const completedItems = (day.checklist ?? []).filter((i) => i.completed).length
  const minutesLogged = (day.blocks ?? []).reduce(
    (sum, b) => sum + (b.actualMinutes ?? 0),
    0,
  )
  return { completedItems, minutesLogged }
}

// ── Guarded writers ──────────────────────────────────────────────────────────
// The ONLY sanctioned place in the app that calls setDoc/updateDoc/deleteDoc on
// the days collection. Each reads the live doc, asserts preservation against the
// resulting document, then performs the underlying write.

/**
 * Full-document `setDoc`. Use for the canonical save, apply-plan, migrations.
 * `enforce: false` marks the interactive manual-edit lane (parent authority —
 * logs anomalies but never blocks the write); default `true` hard-throws.
 */
export async function setDayLogGuarded(
  ref: DocumentReference<DayLog>,
  payload: DayLog,
  context: string,
  opts: { enforce?: boolean } = {},
): Promise<void> {
  const snap = await getDoc(ref)
  const before = snap.exists() ? snap.data() : undefined
  assertDayPreservation(before, payload, context, opts)
  await setDoc(ref, payload)
}

/** `setDoc(..., { merge: true })`. Use for partial merges (workshop played). */
export async function mergeDayLogGuarded(
  ref: DocumentReference<DayLog>,
  partial: Partial<DayLog>,
  context: string,
  opts: { enforce?: boolean } = {},
): Promise<void> {
  const snap = await getDoc(ref)
  const before = snap.exists() ? snap.data() : undefined
  const after: DayShape = { ...(before ?? {}), ...partial }
  assertDayPreservation(before, after, context, opts)
  await setDoc(ref, partial as DayLog, { merge: true })
}

/** Field-level `updateDoc`. Use for redo-plan + quest/fluency auto-complete. */
export async function updateDayLogGuarded(
  ref: DocumentReference<DayLog>,
  partial: Partial<DayLog>,
  context: string,
  opts: { enforce?: boolean } = {},
): Promise<void> {
  const snap = await getDoc(ref)
  const before = snap.exists() ? snap.data() : undefined
  const after: DayShape = { ...(before ?? {}), ...partial }
  assertDayPreservation(before, after, context, opts)
  await updateDoc(ref, partial as Partial<DayLog>)
}

/**
 * Guarded delete for destructive admin sweeps. A delete cannot "preserve", so
 * this is the documented exemption from the set/update guard (Part 3 / the
 * audit's HARD STOP): it reads the doc first and, unless `force` is set, refuses
 * to delete a day that still holds completed work or logged minutes — throwing a
 * `DayPreservationError` whose message names the counts. The caller shows those
 * counts and only passes `force: true` after an explicit human confirmation, so
 * the destruction is loud, not silent.
 */
export async function deleteDayLogGuarded(
  ref: DocumentReference<DayLog>,
  context: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  if (!opts.force) {
    const snap = await getDoc(ref)
    if (snap.exists()) {
      const { completedItems, minutesLogged } = dayLogPreservationSummary(
        snap.data(),
      )
      if (completedItems > 0 || minutesLogged > 0) {
        const detail = `holds ${completedItems} completed item(s) and ${minutesLogged}m logged`
        console.warn(`[dayWriteGuard] refusing to delete ${context}: ${detail}`)
        throw new DayPreservationError(context, [detail])
      }
    }
  }
  await deleteDoc(ref)
}
