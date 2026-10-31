import type { PlannerAskHandoffRefusal } from '../planner-chat/plannerAskHandoff'

/**
 * One sentence per reason a question was not used, or stopped being usable.
 *
 * A `Record` over the reason union, so a new reason fails to compile until
 * somebody decides what it says. Every line names where her words still are —
 * the planner — except the account change, which names the account instead.
 *
 * Its own module so the notice file exports only a component
 * (`react-refresh/only-export-components`).
 */
export const PLANNER_ASK_HANDOFF_REFUSAL_LINES: Record<PlannerAskHandoffRefusal, string> = {
  missing: "Your question didn't come across — it's still in Plan My Week.",
  mismatched: "Your question didn't come across — it's still in Plan My Week.",
  expired: "That was a while ago, so your question wasn't carried over — it's still in Plan My Week.",
  'family-changed': "A different account is signed in now, so your question wasn't carried over.",
  'child-changed':
    "The active child changed, so that question was set down here — it's still in Plan My Week.",
  'child-unresolved':
    "I couldn't tell which child this is for, so your question wasn't carried over — it's still in Plan My Week.",
  'child-unknown':
    "I don't recognise the child that question was about, so it wasn't carried over — it's still in Plan My Week.",
  'context-unmapped':
    "Ask AI has no conversation open for that child, so the question wasn't carried over — it's still in Plan My Week.",
  'context-changed':
    "You moved to another child's conversation, so that question was set down here — it's still in Plan My Week.",
  'thread-changed': "That question wasn't added to this conversation — it's still in Plan My Week.",
  unauthorized: "This profile can't carry a planner question across. It's still in Plan My Week.",
  'week-invalid':
    "I couldn't read which week that question was about, so it wasn't carried over — it's still in Plan My Week.",
  'week-passed':
    "That planning week has finished, so your question wasn't carried over — it's still in Plan My Week.",
  malformed: "Something went wrong carrying your question across — it's still in Plan My Week.",
}
