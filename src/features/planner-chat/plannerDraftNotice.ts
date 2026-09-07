// ── When the AI planner didn't answer, say so (UX-233) ───────────────────────
//
// `useAI().chat` returns `null` on a failure rather than throwing, so the
// planner's Generate path falls quietly into `generateDraftPlanFromInputs` — the
// local planner — and hands back a week. That is the right behaviour (principle
// 8: "AI is additive; local logic stays as fallback"). What was missing is the
// sentence.
//
// The same fallback is announced on the two OTHER surfaces that can hit it: the
// planner's own chat-adjustment path snacks *"AI planning unavailable — used
// local planner."*, and the Shelly-chat next-week draft card (FEAT-150) renders
// a standing alert saying the built-in planner wrote it and it *"won't have
// picked up everything you asked for"*. Generate — the main door, the one a
// parent taps first — said nothing at all. The only trace was the ABSENCE of
// "(AI-powered)" from a chat line, and an absence is not a message.
//
// It matters most exactly where it was missing: FEAT-198 forwards the parent's
// typed request to the model, and the local planner cannot read it. A week that
// silently ignored "less math, we're packing" looks like a week that disagreed.

/**
 * The line the draft turn carries when the local planner produced the week.
 *
 * Deliberately the same two claims FEAT-150's card makes — who wrote it, and
 * what that costs — because a parent should not have to learn two vocabularies
 * for one situation. It goes in the CHAT TURN, not only a snackbar: a snackbar
 * auto-hides in four seconds and this is a fact about the plan on screen.
 */
export const LOCAL_PLANNER_FALLBACK_NOTICE =
  "The AI planner wasn't available, so this came from the built-in planner. It follows the routine but won't have picked up anything you typed in the setup card — worth a read, and worth generating again later."

/** The transient version, for the snackbar the moment it happens. */
export const LOCAL_PLANNER_FALLBACK_SNACK =
  'AI planning unavailable — used local planner.'

/**
 * The draft turn's whole text.
 *
 * Pure so the three-way combination (AI / local-fallback / flag-off) is testable
 * without a page. `shapedByLine` is FEAT-198's "Shaped by …" line, which names
 * what was SENT to the model — so it is omitted when nothing was sent to one.
 */
export function draftTurnText(params: {
  /** True when the model answered and its plan is what is on screen. */
  usedAI: boolean
  /** True when the AI path was tried, returned nothing, and the local planner stood in. */
  fellBackToLocal: boolean
  /** FEAT-198's "Shaped by …" line, when there is one. */
  shapedByLine?: string | null
}): string {
  const { usedAI, fellBackToLocal, shapedByLine } = params
  return [
    `Here's your draft plan${usedAI ? ' (AI-powered)' : ''}.`,
    fellBackToLocal ? LOCAL_PLANNER_FALLBACK_NOTICE : '',
    usedAI && shapedByLine ? shapedByLine : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}
