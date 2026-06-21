// ── Shelly portal: plan-adjustment HANDOFF (chunk 2A/2) ─────────────────
//
// The `proposePlanAdjustment` ChatAction is the one confirmed action that is a
// HANDOFF, not a write: on Shelly's tap the chat stages a brief to the planner's
// per-child inbox and navigates to Plan My Week. shelly-chat NEVER writes the
// weekly plan — the planner owns plan writes and applies the adjustment via its
// existing generate / lock-in path (single-writer-lane discipline). This module
// mirrors `openChatWithContext`'s doc + navigate pattern, but in reverse
// (chat → planner). See docs/barnes-shelly-chat-portal-design.md.
//
// Staging (`stagePlanAdjustment`) and consuming (`consumePlanAdjustment`) both
// resolve the inbox doc via `pendingPlanAdjustmentRef` so the writer and the
// planner reader can never drift on the path.

import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'

import { db } from '../../core/firebase/firestore'
import type { ChatAction, PendingPlanAdjustment } from '../../core/types'

export type PlanAdjustmentAction = Extract<ChatAction, { kind: 'proposePlanAdjustment' }>

/**
 * The per-child planner inbox doc:
 * `families/{familyId}/settings/pendingPlanAdjustment_{childId}`. One brief per
 * child at a time — a fresh handoff overwrites any un-consumed prior brief.
 */
export function pendingPlanAdjustmentRef(familyId: string, childId: string) {
  return doc(db, `families/${familyId}/settings/pendingPlanAdjustment_${childId}`)
}

/**
 * Stage a confirmed `proposePlanAdjustment` brief to the planner's per-child
 * inbox. This is the HANDOFF write — it writes ONLY the brief doc, never the
 * weekly plan or any child record. Navigation to `/planner` is the caller's
 * job (so the inline confirm-audit can be recorded before we leave the page).
 */
export async function stagePlanAdjustment(
  familyId: string,
  action: PlanAdjustmentAction,
): Promise<void> {
  const payload: PendingPlanAdjustment = {
    childId: action.childId,
    summary: action.summary,
    rationale: action.rationale,
    ...(action.scope ? { scope: action.scope } : {}),
    ...(action.targetWeek ? { targetWeek: action.targetWeek } : {}),
    stagedAt: new Date().toISOString(),
  }
  await setDoc(pendingPlanAdjustmentRef(familyId, action.childId), payload)
}

/**
 * Read AND clear the pending adjustment for a child (apply-once). Returns the
 * staged brief, or null when the inbox is empty. The planner calls this on load:
 * it preloads the brief into the generation context + surfaces it, then the doc
 * is gone so a refresh or child-switch can't replay it.
 */
export async function consumePlanAdjustment(
  familyId: string,
  childId: string,
): Promise<PendingPlanAdjustment | null> {
  const ref = pendingPlanAdjustmentRef(familyId, childId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data() as PendingPlanAdjustment
  await deleteDoc(ref)
  return data
}
