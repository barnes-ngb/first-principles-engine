// ── Where am I in this? (UX-243) ─────────────────────────────────────────────
//
// Plan My Week is a three-step flow — set up, review, applied — and it showed no
// step. The page's subtitle was one static sentence ("Set up your week, review
// the plan, and you're done.") that read the same on all three screens, so the
// only thing telling a parent which one she was on was the *← Edit setup* link,
// which appears on exactly one of them.
//
// This is deliberately a **line, not a stepper**: a stepper is a component, a
// layout decision and a phone-width problem (filed as Batch B). One sentence in
// the slot that already holds one sentence is the whole change, and it says the
// two things a subtitle should say — where you are, and what this screen is for.

/** The planner's three page phases, as `PlannerChatPage` derives them. */
export type PlannerPhase = 'setup' | 'review' | 'active'

const PHASE_LINES: Record<PlannerPhase, string> = {
  // Step 1 — the setup card. "Tell me about the week" is what the card asks for;
  // the week itself is named by the selector directly above it, so this line
  // does not repeat a date it would then have to keep in sync.
  setup: 'Step 1 of 3 · Tell me about the week, then generate a plan.',
  // Step 2 — the draft. Naming Apply by the word on the button ("Apply") rather
  // than "save" or "lock in", the three vocabularies this flow used to hold.
  review: 'Step 2 of 3 · Read the plan, change anything, then Apply.',
  // Step 3 — written. It is not "done" in the sense of finished-with; the days
  // stay editable here all week (FEAT-138), and the line says where the plan is.
  active: "Step 3 of 3 · Applied — it's on Today. You can still change any day.",
}

/**
 * The one-line subtitle under "Plan My Week" for a phase.
 *
 * Pure, total, and the only place these three sentences exist.
 */
export function plannerPhaseLine(phase: PlannerPhase): string {
  return PHASE_LINES[phase]
}
