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
// concept graph. It unions TWO honest, deterministic paths:
//
//   1. workbook (FEAT-68):
//      item.workbookConfigId → activityConfig (workbook source + tracked position)
//          → workbookBridge.bridgeCoveredConcepts(bridge, nativePosition)
//          → the FRONTIER concept(s) at that position
//   2. tag (FEAT-69):
//      item.skillTags → tagConceptBridge.conceptsForTags → concept(s)
//
// Both are real but GATED BY CURATION — the FEAT-63 situation. A source with no
// bridge (or an uncurated lesson→native mapping), and a tag with no curated concept
// equivalent, each resolve to `[]` (NO GUESS — the same discipline as
// `resolveNativePosition`). So this ships the mechanism and lights up per-source /
// per-tag as data is curated; it never fabricates a mapping. The tag path is what
// lets a NON-workbook struggle (a stuck chip or `engagement:'struggled'`) seed the
// same re-test queue.
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
import { conceptsForTags } from './tagConceptBridge'
import type { BridgeCoverage } from './workbookBridge'
import type { ChecklistItem } from '../types/planning'
import type { LearnerModel } from '../types/learnerModel'

/**
 * The minimal checklist-item shape this resolver reads: the workbook link (FEAT-68
 * position path) and the skill tags (FEAT-69 tag path). Either or both may be
 * absent — a non-workbook item resolves purely by its tags (or to `[]`).
 */
export type StuckSignalItem = Pick<ChecklistItem, 'workbookConfigId' | 'skillTags'>

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
 * Resolve a checklist item's skill tags to foundation concept(s) via the FEAT-69
 * tag bridge. Pure + tolerant: unmapped / unknown / empty tags ⇒ `[]` (NO GUESS).
 * This is the ONLY path a non-workbook struggle has to the concept graph.
 */
export function resolveTagConcepts(item: StuckSignalItem): string[] {
  return conceptsForTags(item.skillTags ?? [])
}

/**
 * The workbook-position path (FEAT-68): the frontier concept(s) at the linked
 * workbook's tracked position, or `[]` when the item has no bridged/curated/
 * position-addressable workbook. `model` (when supplied) applies the provisional-
 * position conflict cap (`resolveSyncNativePosition`): a Fast Phonics divisor guess
 * is capped at the highest peak DIRECTLY witnessed on the model ("guesses defer to
 * witnesses", FEAT-64 §3).
 */
function resolveWorkbookConcepts(
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

/**
 * Resolve a struggling daily checklist item to the foundation concept(s) to re-test.
 *
 * Unions two deterministic paths — the FEAT-68 workbook-position frontier and the
 * FEAT-69 skillTag bridge — deduped and re-filtered through `FOUNDATION_NODE_MAP`.
 * A workbook-tagged item keeps resolving exactly as before; a NON-workbook item now
 * resolves via its tags (or `[]`). `[]` remains the honest curation gate (unmapped
 * source / uncurated lesson→native / no position / no mapped tag), NOT an error —
 * coverage grows per-source and per-tag as data is curated (FEAT-63/64 pattern).
 *
 * `model` (when supplied) applies the provisional-position conflict cap to the
 * workbook path only (see `resolveWorkbookConcepts`); the tag path is model-free.
 */
export function resolveStuckConcepts(
  item: StuckSignalItem,
  activityConfig: StuckSignalConfig | null | undefined,
  model?: LearnerModel | null,
): string[] {
  const union = new Set<string>([
    ...resolveWorkbookConcepts(item, activityConfig, model),
    ...resolveTagConcepts(item),
  ])
  // Re-filter through the node map: both paths already filter, but the union is the
  // single choke point that guarantees no id the graph doesn't define ever escapes.
  return [...union].filter((id) => Boolean(FOUNDATION_NODE_MAP[id]))
}
