// ── Workbook position → learner-model evidence writer (FEAT-63) ──────────
//
// The thin async writer both position triggers call: the scan-sync path
// (`useScanToActivityConfig`, FEAT-62-fed) and manual lesson edits
// (`useActivityConfigs`). Given a workbook name + a tracked position, it:
//   1. resolves a bridge by name (tolerant, FEAT-61 normalizer) — no bridge ⇒ no-op;
//   2. translates the family's config position to the bridge's native unit — no
//      curated `lessonToUnit` (the Fast Phonics case) ⇒ no-op (honest gate);
//   3. converts native position → covered-concept set (deterministic);
//   4. folds that into `learnerModels/{childId}`, MERGE-ONLY, marking synthesis stale.
//
// Fire-and-forget by design (mirrors `questModelSync`): it NEVER blocks or fails
// the position write that triggered it. Writes ONLY `learnerModels` — no counting,
// no hours, no other collection.

import { doc, getDoc, setDoc } from 'firebase/firestore'

import { learnerModelsCollection } from '../firebase/firestore'
import {
  applyBridgeCoverageToModel,
  bridgeCoveredConcepts,
  matchWorkbookBridge,
  resolveNativePosition,
  resolveSyncNativePosition,
} from './workbookBridge'
import type { WorkbookBridge } from './workbookBridge'
import type { LearnerModel } from '../types/learnerModel'

/** Why a sync produced no model write — surfaced by the diag sync action so the
 *  absence of a write is VISIBLE, never mysterious (the FEAT-62 lesson). */
export type WorkbookSyncOutcome =
  | { status: 'no-bridge' }
  | { status: 'ambiguous'; bridgeIds: string[] }
  | { status: 'pending-curation'; source: string }
  | { status: 'no-model' }
  | { status: 'no-coverage'; source: string }
  | { status: 'written'; source: string; changedConceptIds: string[] }
  | { status: 'error'; message: string }

export interface WorkbookSyncInput {
  /** The workbook display name / curriculum — `ActivityConfig.name` or `.curriculum`. */
  workbookName: string
  /** The tracked config position (`ActivityConfig.currentPosition`). */
  position: number
  /** How the position changed (drives the evidence `via`). */
  via?: 'scan' | 'manual'
}

/**
 * Resolve the bridge + gate a position WITHOUT writing — the pure decision half.
 * Returns a terminal outcome (no-bridge / pending-curation) OR the resolved bridge so
 * the caller can apply the model-aware conflict rule and compute coverage. The
 * coverage step moved AFTER the model load (FEAT-64) because the Fast Phonics conflict
 * rule caps the divisor-guessed position against the model's witnessed peaks.
 */
export function planWorkbookSync(input: WorkbookSyncInput):
  | {
      outcome: Extract<
        WorkbookSyncOutcome,
        { status: 'no-bridge' | 'ambiguous' | 'pending-curation' }
      >
    }
  | { outcome: null; bridge: WorkbookBridge } {
  const match = matchWorkbookBridge(input.workbookName)
  if (match.status === 'none') return { outcome: { status: 'no-bridge' } }
  // Two bridges tied on the longest matching alias ⇒ surface, never guess.
  if (match.status === 'ambiguous') {
    return { outcome: { status: 'ambiguous', bridgeIds: match.bridgeIds } }
  }
  const bridge = match.bridge
  // Gate on the raw lesson→native translation (unset `lessonToUnit` ⇒ pending).
  if (resolveNativePosition(bridge, input.position) == null) {
    return { outcome: { status: 'pending-curation', source: bridge.sourceId } }
  }
  return { outcome: null, bridge }
}

/**
 * The writer. Fire-and-forget: resolves a bridge, applies the coverage delta to the
 * child's learner model (merge-only), and marks the LLM synthesis stale when
 * something changed. Returns a structured outcome so the diag sync action can print
 * a per-workbook result line; the trigger call sites ignore it.
 */
export async function syncWorkbookPositionToModel(
  familyId: string,
  childId: string,
  input: WorkbookSyncInput,
  nowIso: string,
): Promise<WorkbookSyncOutcome> {
  try {
    const planned = planWorkbookSync(input)
    if (planned.outcome) return planned.outcome
    const { bridge } = planned
    const source = bridge.sourceId

    const modelRef = doc(learnerModelsCollection(familyId), childId)
    const snap = await getDoc(modelRef)
    if (!snap.exists()) return { status: 'no-model' } // seed the model first (diag/review)

    const model = snap.data() as LearnerModel
    // Resolve native position WITH the conflict rule (provisional divisor guesses cap
    // against the model's directly-witnessed peaks). Deterministic bridges pass through.
    const native = resolveSyncNativePosition(bridge, input.position, model)
    if (native == null) return { status: 'pending-curation', source }
    const coverage = bridgeCoveredConcepts(bridge, native)
    if (coverage.length === 0) return { status: 'no-coverage', source }
    const { model: next, changedConceptIds } = applyBridgeCoverageToModel(
      model,
      coverage,
      source,
      nowIso,
      input.via ?? 'scan',
    )
    if (changedConceptIds.length === 0) return { status: 'no-coverage', source }

    // Merge-only, JSON-scrubbed to drop any `undefined` (Firestore rejects them) —
    // the same convention the diag seeder and the other model writers use.
    const merge: Partial<LearnerModel> = {
      conceptStates: Object.fromEntries(
        changedConceptIds.map((id) => [id, next.conceptStates[id]]),
      ),
      openQuestions: next.openQuestions,
      changeFeed: next.changeFeed,
      updatedAt: next.updatedAt,
      synthesisStaleAt: next.updatedAt,
    }
    await setDoc(modelRef, JSON.parse(JSON.stringify(merge)), { merge: true })
    return { status: 'written', source, changedConceptIds }
  } catch (err) {
    // Never let a model write-back break the position write that triggered it.
    console.warn('[workbookSync] Failed to sync position to learner model', err)
    return { status: 'error', message: err instanceof Error ? err.message : 'sync failed' }
  }
}
