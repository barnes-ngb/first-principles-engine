// ── Daily struggle signal → re-test target resolver (FEAT-68) ────────────
//
// The engine already has a CLOSED re-test sub-loop: a queued
// `openQuestion{ routedTo:'quest', conceptId }` on `learnerModels` becomes a
// targeted concept in the child's next Knowledge Mine session
// (`selectQuestTargets`), and results fold back into the model
// (`applyQuestResultsToModel`, upgrade-only, no-shame). But that queue was seeded
// ONLY by the manual Foundations Review Chat. The daily struggle signal — the
// "stuck" mastery chip on Today — wrote a `skillSnapshots.conceptualBlock` and
// went nowhere near the re-test queue.
//
// This module is the DETERMINISTIC bridge from a daily checklist item to the
// concept graph. The ONLY honest path (there is no `skillTag`/`subjectBucket →
// conceptId` helper in the repo, and `ChecklistItem` carries no `conceptId`) is:
//
//   item.workbookConfigId → activityConfig (workbook source + tracked position)
//       → workbookBridge.bridgeCoveredConcepts(bridge, nativePosition)
//       → the FRONTIER concept(s) at that position
//
// This path is real but GATED BY BRIDGE CURATION — the FEAT-63 situation. A source
// with no bridge, or a bridged source whose lesson→native mapping is still
// uncurated, resolves to `[]` (NO GUESS — the same no-guess discipline as
// `resolveNativePosition`). So this ships the mechanism and lights up per-source as
// bridge data is curated; it never fabricates a tag→concept mapping.
//
// PURE — no Firestore, no clock. The thin async writer lives in
// `src/features/today/stuckRetestQueue.ts`.

import { FOUNDATION_NODE_MAP } from './index'
import {
  bridgeCoveredConcepts,
  parseNativePositionFromUnit,
  resolveSyncNativePosition,
  workbookBridgeForSource,
} from './workbookBridge'
import type { BridgeCoverage } from './workbookBridge'
import type { ChecklistItem } from '../types/planning'
import type { LearnerModel } from '../types/learnerModel'

/** The minimal checklist-item shape this resolver reads — only the workbook link. */
export type StuckSignalItem = Pick<ChecklistItem, 'workbookConfigId'>

/**
 * The minimal ActivityConfig shape the resolver reads: the doc id (to confirm it is
 * the item's linked config), the workbook name fields, and the tracked position.
 * A standalone interface (not a `Pick<ActivityConfig>`) so the looser Today
 * `configs` prop shape — `WorkbookConfigLike & { currentPosition? }`, whose `name`
 * is optional — is assignable; the resolver already falls back to `curriculum`.
 */
export interface StuckSignalConfig {
  id: string
  name?: string | null
  curriculum?: string | null
  currentPosition?: number | null
}

/**
 * The FRONTIER of a coverage set: the concept(s) supplied by the HIGHEST unit at or
 * below the tracked position. `bridgeCoveredConcepts` labels each concept with the
 * highest unit that covers it, so the frontier is simply the concepts whose label
 * parses to the maximum native position. A struggle on today's work should re-test
 * what the child is CURRENTLY working on — not re-queue the whole cumulative spine.
 */
export function frontierConcepts(coverage: BridgeCoverage[]): string[] {
  if (coverage.length === 0) return []
  let maxPos = -Infinity
  for (const c of coverage) {
    const pos = parseNativePositionFromUnit(c.unitLabel)
    if (pos != null && pos > maxPos) maxPos = pos
  }
  if (!Number.isFinite(maxPos)) return []
  return coverage
    .filter((c) => parseNativePositionFromUnit(c.unitLabel) === maxPos)
    .map((c) => c.conceptId)
    // Never queue an id the graph does not define (would be inert in the quest
    // queue anyway — `selectQuestTargets` requires `FOUNDATION_NODE_MAP`).
    .filter((id) => Boolean(FOUNDATION_NODE_MAP[id]))
}

/**
 * Resolve a "stuck" daily checklist item to the foundation concept(s) to re-test.
 *
 * Returns the frontier concept(s) at the linked workbook's tracked position when the
 * item resolves to a bridged, position-addressable workbook; otherwise `[]` — NO
 * GUESS. `[]` is the honest curation gate (unmapped source, no curated lesson→native
 * translation, no tracked position), NOT an error. Coverage grows per-source as
 * bridge data is curated (FEAT-63/64 pattern).
 *
 * `model` (when supplied) applies the SAME provisional-position conflict cap the
 * learner-model sync uses (`resolveSyncNativePosition`): for a divisor-guessed
 * position (Fast Phonics), the guess is capped at the highest peak DIRECTLY
 * witnessed on the model, so a re-test is never queued *ahead* of the witnessed
 * position ("guesses defer to witnesses", FEAT-64 §3). Omit the model (or pass null)
 * and a deterministic bridge is unaffected while a provisional guess passes through
 * uncapped — so callers with the model loaded (the enqueue writer) get the cap.
 */
export function resolveStuckConcepts(
  item: StuckSignalItem,
  activityConfig: StuckSignalConfig | null | undefined,
  model?: LearnerModel | null,
): string[] {
  // No workbook link, or the config we were handed is not the linked one → no path.
  if (!item.workbookConfigId || !activityConfig) return []
  if (activityConfig.id !== item.workbookConfigId) return []

  // Resolve a bridge by the workbook's free-text name (tolerant FEAT-61 normalizer).
  // Unmapped source ⇒ [] (the curation gate — coverage lights up as bridges land).
  const name = activityConfig.name ?? activityConfig.curriculum
  const bridge = workbookBridgeForSource(name ?? undefined)
  if (!bridge) return []

  // No tracked position ⇒ nothing to address.
  const position = activityConfig.currentPosition
  if (position == null) return []

  // Translate the family's config position to the bridge's native unit, applying the
  // provisional-position conflict cap when a model is supplied. `null` when the
  // source's lesson numbering is not yet curated (`lessonToUnit` unset) — the honest
  // pending-curation gate, never a silent guess.
  const native = resolveSyncNativePosition(bridge, position, model ?? null)
  if (native == null) return []

  return frontierConcepts(bridgeCoveredConcepts(bridge, native))
}
