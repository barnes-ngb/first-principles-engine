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
  resolveNativePosition,
  workbookBridgeForSource,
} from './workbookBridge'
import type { LearnerModel } from '../types/learnerModel'

/** Why a sync produced no model write — surfaced by the diag sync action so the
 *  absence of a write is VISIBLE, never mysterious (the FEAT-62 lesson). */
export type WorkbookSyncOutcome =
  | { status: 'no-bridge' }
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
 * Resolve + convert a position WITHOUT writing — the pure decision half, reused by
 * both the writer and the diag preview. Returns the outcome plus (when written-able)
 * the coverage to apply.
 */
export function planWorkbookSync(input: WorkbookSyncInput):
  | { outcome: Extract<WorkbookSyncOutcome, { status: 'no-bridge' | 'pending-curation' }> }
  | {
      outcome: null
      source: string
      coverage: ReturnType<typeof bridgeCoveredConcepts>
    } {
  const bridge = workbookBridgeForSource(input.workbookName)
  if (!bridge) return { outcome: { status: 'no-bridge' } }
  const native = resolveNativePosition(bridge, input.position)
  if (native == null) {
    return { outcome: { status: 'pending-curation', source: bridge.sourceId } }
  }
  return {
    outcome: null,
    source: bridge.sourceId,
    coverage: bridgeCoveredConcepts(bridge, native),
  }
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
    const { source, coverage } = planned
    if (coverage.length === 0) return { status: 'no-coverage', source }

    const modelRef = doc(learnerModelsCollection(familyId), childId)
    const snap = await getDoc(modelRef)
    if (!snap.exists()) return { status: 'no-model' } // seed the model first (diag/review)

    const model = snap.data() as LearnerModel
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
