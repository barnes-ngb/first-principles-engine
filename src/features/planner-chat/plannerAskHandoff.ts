// ── Planner refusal → Ask AI, carrying her sentence (UX-273) ────────────────
//
// UX-269 gave a planner-chat refusal a button. The button lands on `/chat` with
// an EMPTY box: her sentence — *"add TGTB Math Level 1, 30 minutes daily"* —
// stays behind in the planner and she retypes it. This module carries it across.
//
// ## What this is, and the four things it deliberately is not
//
// It is a ONE-TIME, IN-MEMORY transfer of exactly one sentence the parent typed,
// handed over by an explicit tap and landing as an UNSENT composer draft.
//
//  1. **Not a write.** Opening the handoff creates no thread, no message, calls
//     no model and touches no child record. `openChatWithContext` — the existing
//     planner→chat door for a *staged* conversation — writes a thread document
//     and a user message and then navigates, which is precisely why it is not
//     reused here: it would put a model call one navigation away from a refusal.
//     The destination's own Send button, with the confirm cards behind it, stays
//     the only thing that writes anything.
//  2. **Not a URL parameter.** UX-273's own proposal was `?ask=<text>`; the
//     query string is browser history, which means a sentence a parent typed
//     about her child is in the back stack, in a shared-screen title bar, and in
//     anything that logs a path. The transfer is a module-level slot read once
//     and cleared, so a refresh or a Back cannot replay it. The URL carries
//     nothing; the navigation carries only an opaque GENERATION NUMBER in router
//     state, which is how the receiver tells "she tapped the button" from "she
//     opened Ask AI herself" (see {@link PLANNER_ASK_HANDOFF_STATE_KEY}).
//  3. **Not a store.** Nothing is persisted and nothing survives a reload, and
//     the receiving view says so rather than implying durability. The parent's
//     words are not at risk either way: the planner transcript still holds the
//     turn she typed, which is the recoverable copy.
//  4. **Not a protocol.** One slot, one sentence, one navigation. No shared
//     draft, no cross-chat state, no merging of two transcripts.
//
// ## Why the ask is resolved from the transcript rather than stored on the turn
//
// The exact question is the user turn that drew the refusal. `ChatMessage` is
// persisted inside `plannerConversations`, so stamping the question onto the
// assistant turn would mean a second durable copy of her sentence for a feature
// whose whole shape is "nothing is stored" — so the resolver reads the turn that
// is already there. Which turn that is, is not a guess: UX-269's
// `withDeclinedAskCleared` sets `typedByParent` to **exactly `false`** on the
// one turn whose ask was declined, and nothing else in the planner ever writes
// that value (its synthetic turns leave the field ABSENT, and a turn she typed
// that was answered stays `true`). So `typedByParent === false` on the turn
// immediately before the refusal is the app's own record of "she typed this and
// the planner declined it", and the resolver reads nothing weaker. If a future
// change stops writing it, this returns `null` and the button falls back to the
// plain UX-269 navigation — the safe direction, since the failure costs a retype
// and the alternative would be carrying a sentence nobody can prove she asked.

import type { ChatMessage } from '../../core/types'
import { ChatMessageRole } from '../../core/types/enums'
import {
  PLANNER_BOUNDARY_FALLBACK,
  plannerBoundaryJobById,
  plannerBoundaryRoutePath,
} from '../../../functions/src/shared/plannerBoundary'
import { formatPlanningWeekLabel, isPlanningWeekPast } from './chatPlanner.logic'

/** The one destination that can take a question — Ask AI. */
const ASK_AI_ROUTE_PATH = '/chat'

/**
 * The longest question carried across.
 *
 * A cap, not a truncation: a longer ask is handed over NOT AT ALL rather than
 * cut, because half a sentence arriving in a composer in front of a chat that
 * can write records is worse than an empty one she pastes into herself. Her
 * words are still in the planner transcript either way.
 */
export const PLANNER_ASK_HANDOFF_MAX_CHARS = 4000

/**
 * How long a staged handoff stays readable.
 *
 * The transfer is one navigation — milliseconds — so this is a generous ceiling
 * on the only gap that exists: the receiving view mounting and its child read
 * settling. It exists so that a tap followed by a Back, a different screen, or
 * a phone put in a pocket cannot leave a sentence sitting in the slot to surface
 * on some later, unrelated visit to Ask AI.
 */
export const PLANNER_ASK_HANDOFF_TTL_MS = 120_000

/**
 * The router-state key the navigation carries.
 *
 * Router state, not a query parameter: it is not in the URL, not in a title bar
 * and not in anything that logs paths — and the value is only the generation
 * NUMBER, never the question. It answers one question for the receiver: was this
 * navigation the one the handoff button made? A parent who opens Ask AI from the
 * nav bar carries no state, so a slot that somehow still holds a payload is
 * never read on that visit.
 */
export const PLANNER_ASK_HANDOFF_STATE_KEY = 'plannerAskGeneration'

/** What the planner knows about where the question came from. No guessing. */
export interface PlannerAskHandoffSource {
  /** The signed-in family, re-checked by the receiver before anything is shown. */
  familyId: string
  /** The child the planner was planning for — '' when it had none. */
  childId: string
  /** Her name, for the receiving note. Omitted when the child has not loaded. */
  childName?: string
  /** Sunday-start key of the week the planner was planning (the source week). */
  weekStart: string
}

/** One tap's worth of handoff: the source, her sentence, and the declined job. */
export interface PlannerAskHandoffRequest extends PlannerAskHandoffSource {
  /** Her words, verbatim — never re-worded, re-wrapped or summarised. */
  question: string
  /** The job the planner declined (UX-269's id), for the receiving note. */
  jobId: string
}

/** A staged handoff, as the receiver reads it. */
export interface PlannerAskHandoff extends PlannerAskHandoffRequest {
  /**
   * The nth handoff staged in this page load. Matched against the navigation's
   * router state so a payload can only be read by the visit that staged it.
   */
  generation: number
  /** `Date.now()` at staging — the TTL's only input. */
  stagedAt: number
}

/**
 * Does this declined job go to Ask AI at all?
 *
 * Only the `/chat` rows carry a question. `videos-manage` lands on Watch Library
 * and `records` on Records — screens with no composer to fill — so those links
 * keep UX-269's behaviour exactly: navigate, nothing carried. Read off the one
 * boundary table rather than a second list of which rows are "the chat ones".
 */
export function plannerAskHandoffGoesToAskAi(jobId: string): boolean {
  const destination = plannerBoundaryJobById(jobId) ?? PLANNER_BOUNDARY_FALLBACK
  return plannerBoundaryRoutePath(destination.route) === ASK_AI_ROUTE_PATH
}

/**
 * The exact question an assistant refusal declined, or `null` when this turn is
 * not a free-form refusal with a question behind it.
 *
 * Three conditions, and all three must hold:
 *
 *  - the turn **declined a job** (`boundaryJobId`) and that job goes to Ask AI;
 *  - the turn **carries no plan** — a refusal that arrives BESIDE a generated
 *    week is UX-274's case: the ask was typed into the setup card's notes, the
 *    model planned the week anyway, and the turn before it is the planner's own
 *    synthetic "Generate a plan" turn, not a question she asked. Those keep
 *    UX-269's plain navigation;
 *  - the turn **immediately before it** is hers and was declined — see this
 *    module's header on `typedByParent === false`.
 *
 * `index` is the position of the assistant turn in the transcript, so the
 * neighbour relationship is read rather than searched: a transcript with three
 * refusals in it carries three different questions, and each button must get the
 * one directly above it rather than the first or the nearest-looking.
 */
export function resolvePlannerAskHandoffQuestion(
  messages: readonly ChatMessage[],
  index: number,
): string | null {
  const turn = messages[index]
  if (!turn || turn.role !== ChatMessageRole.Assistant) return null
  if (!turn.boundaryJobId || !plannerAskHandoffGoesToAskAi(turn.boundaryJobId)) return null
  if (turn.draftPlan) return null

  const ask = messages[index - 1]
  if (!ask || ask.role !== ChatMessageRole.User) return null
  if (ask.typedByParent !== false) return null

  const question = (ask.text ?? '').trim()
  if (!question) return null
  if (question.length > PLANNER_ASK_HANDOFF_MAX_CHARS) return null
  return question
}

// ── The slot ────────────────────────────────────────────────────────────────
//
// Module-level and deliberately so: it is the one thing a navigation cannot
// carry and a URL must not. One slot, because the feature is one sentence in
// flight — a queue would be a protocol, which UX-273 says explicitly it is not.

let staged: PlannerAskHandoff | null = null
let generations = 0

/**
 * Put one question in the slot and return it, or `null` when there is nothing
 * honest to carry.
 *
 * Refuses — rather than carrying something approximate — when the job does not
 * go to Ask AI, when the question is empty, or when it is over the cap. A fresh
 * stage REPLACES any unread one: two taps are the same parent asking for the
 * same thing, and the newer payload is the one her navigation names.
 */
export function stagePlannerAskHandoff(
  request: PlannerAskHandoffRequest,
  now: number = Date.now(),
): PlannerAskHandoff | null {
  const question = request.question.trim()
  if (!question || question.length > PLANNER_ASK_HANDOFF_MAX_CHARS) return null
  if (!plannerAskHandoffGoesToAskAi(request.jobId)) return null

  generations += 1
  staged = { ...request, question, generation: generations, stagedAt: now }
  return staged
}

/**
 * Read the slot and EMPTY it, in one call.
 *
 * Read-once is the whole lifetime rule: there is no second reader, so a double
 * mount, a Back, a re-render or a later unrelated visit finds nothing. Callers
 * must therefore not take until they can decide — the receiving hook waits for
 * the family and the child read to settle first, because taking early and
 * refusing on an unsettled read would discard a payload that was fine.
 */
export function takePlannerAskHandoff(): PlannerAskHandoff | null {
  const payload = staged
  staged = null
  return payload
}

/** Drop any unread payload. For a scope change, and for test isolation. */
export function clearPlannerAskHandoff(): void {
  staged = null
}

/**
 * The generation a navigation claims, read defensively out of router state.
 *
 * `location.state` is `unknown` by contract and is whatever a previous
 * navigation put there, so every shape that is not a positive integer under our
 * own key reads as "no handoff was intended".
 */
export function plannerAskHandoffGenerationFromState(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as Record<string, unknown>)[PLANNER_ASK_HANDOFF_STATE_KEY]
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return null
  return value
}

/** Why a staged question was not put in the composer, or was withdrawn from it. */
export const PlannerAskHandoffRefusal = {
  /** The slot was empty — a Back, a reload, or a second read. */
  Missing: 'missing',
  /** The navigation named a different handoff than the one in the slot. */
  Mismatched: 'mismatched',
  /** Staged longer ago than the TTL. */
  Expired: 'expired',
  /** A different family is signed in than the one that staged it. */
  FamilyChanged: 'family-changed',
  /** The active child is no longer the child the question was asked about. */
  ChildChanged: 'child-changed',
  /**
   * Nobody is active at the receiving end — the children read came back empty
   * or failed. Kept apart from `ChildChanged` because a failed read is not an
   * affirmative answer.
   */
  ChildUnresolved: 'child-unresolved',
  /** The staged child is not one of this family's children. Fails closed. */
  ChildUnknown: 'child-unknown',
  /**
   * The chat has no conversation open for that child, so the Send that exists
   * would address someone else (or nobody). `General`, a child the tabs do not
   * cover, and two children answering to one tab all land here.
   */
  ContextUnmapped: 'context-unmapped',
  /** The parent moved to a different child's tab while holding the question. */
  ContextChanged: 'context-changed',
  /** The parent opened a saved conversation while holding the question. */
  ThreadChanged: 'thread-changed',
  /** The signed-in profile may not use this door. */
  Unauthorized: 'unauthorized',
  /** The staged week is not a date this app can read. Fails closed. */
  WeekInvalid: 'week-invalid',
  /** The week the planner was planning has finished since the tap. */
  WeekPassed: 'week-passed',
  /** The payload did not hold a usable question. */
  Malformed: 'malformed',
} as const
export type PlannerAskHandoffRefusal =
  (typeof PlannerAskHandoffRefusal)[keyof typeof PlannerAskHandoffRefusal]

/**
 * The receiving composer's identity — **what Send would actually do**, not what
 * the shell happens to be showing.
 *
 * This distinction is the whole repair. `ShellyChatPage` derives the child it
 * sends under from the CHAT TAB (`getChildIdForContext`), not from the app
 * header, so agreeing with the header proved nothing: a question accepted for
 * Lincoln could be sent on London's tab, with the source note still naming
 * Lincoln. Every check and every guard therefore reads this shape.
 */
export interface PlannerAskReceiver {
  familyId: string
  /** The signed-in profile. `null` until one is chosen, which is never valid. */
  profile: string | null
  /** The tab, verbatim. */
  chatContext: string
  /** The child that tab maps to — `''` when it maps to none. */
  contextChildId: string
  /** The saved conversation the composer would send into, or `null` for a fresh one. */
  threadId: string | null
}

/** The tab→child answer, with its two failure modes kept apart from success. */
export type ChatContextChildResolution =
  | { ok: true; childId: string }
  | { ok: false; reason: 'no-child' | 'unknown' | 'ambiguous' }

/**
 * Which child a chat tab sends under.
 *
 * Deliberately the SAME name-keyed rule `ShellyChatPage` already uses for
 * `contextChildId` — reading it rather than inventing a second mapping is the
 * point, because a second mapping could disagree with the one Send obeys. What
 * is added is the refusal: zero matches (a child the two tabs do not cover) and
 * more than one (the duplicate-name documents `UX-394` left in place) both fail
 * closed instead of resolving to a guess.
 */
export function resolveChatContextChild(
  children: readonly { id: string; name: string }[],
  chatContext: string,
): ChatContextChildResolution {
  const key = chatContext.trim().toLowerCase()
  if (key === '' || key === 'general') return { ok: false, reason: 'no-child' }
  const matches = children.filter((c) => c.name.trim().toLowerCase() === key)
  if (matches.length === 0) return { ok: false, reason: 'unknown' }
  if (matches.length > 1) return { ok: false, reason: 'ambiguous' }
  return { ok: true, childId: matches[0].id }
}

/** Identical receiver? Field by field, so a new field cannot be forgotten. */
export function sameReceiver(a: PlannerAskReceiver, b: PlannerAskReceiver): boolean {
  return (
    a.familyId === b.familyId &&
    a.profile === b.profile &&
    a.chatContext === b.chatContext &&
    a.contextChildId === b.contextChildId &&
    a.threadId === b.threadId
  )
}

/** What the receiver can see about itself when it reads the slot. */
export interface PlannerAskHandoffCheck {
  /** What Send would do right now. */
  receiver: PlannerAskReceiver
  /** The active child NOW (the shell's own answer). */
  activeChildId: string
  /** Every child id this family has, for the fail-closed unknown-child check. */
  knownChildIds: readonly string[]
  /** Whether the signed-in profile is a parent. */
  isParent: boolean
  /** Today, as `YYYY-MM-DD`, for the source-week check. */
  todayKey: string
  /** The generation this navigation named, if any. */
  generation: number | null
  /** `Date.now()` at the read. */
  now: number
}

export type PlannerAskHandoffDecision =
  | { ok: true; handoff: PlannerAskHandoff }
  | { ok: false; reason: PlannerAskHandoffRefusal }

/**
 * Decide whether a payload may be shown, re-checking every identity it was
 * staged under — and, since the repair, what Send would actually do with it.
 *
 * Order is load-bearing: the payload's OWN shape is checked first (a malformed
 * question or an unreadable week fails closed before anything about the family
 * is read), then capability, then identity, then the receiving context. The
 * reasons stay separate because the view says which one happened; a question
 * that silently fails to arrive reads as the app having lost her words.
 *
 * The source-week checks are the planner's own `isPlanningWeekPast` and its own
 * label formatter, so this cannot become a second definition of which week has
 * finished or of which strings are weeks.
 */
export function acceptPlannerAskHandoff(
  payload: PlannerAskHandoff | null,
  check: PlannerAskHandoffCheck,
): PlannerAskHandoffDecision {
  if (!payload) return { ok: false, reason: PlannerAskHandoffRefusal.Missing }
  if (check.generation === null || check.generation !== payload.generation) {
    return { ok: false, reason: PlannerAskHandoffRefusal.Mismatched }
  }
  const question = typeof payload.question === 'string' ? payload.question.trim() : ''
  if (!question || question.length > PLANNER_ASK_HANDOFF_MAX_CHARS) {
    return { ok: false, reason: PlannerAskHandoffRefusal.Malformed }
  }
  if (!plannerAskWeekLabel(payload.weekStart)) {
    return { ok: false, reason: PlannerAskHandoffRefusal.WeekInvalid }
  }
  if (check.now - payload.stagedAt > PLANNER_ASK_HANDOFF_TTL_MS) {
    return { ok: false, reason: PlannerAskHandoffRefusal.Expired }
  }
  if (!check.isParent || check.receiver.profile === null) {
    return { ok: false, reason: PlannerAskHandoffRefusal.Unauthorized }
  }
  if (!payload.familyId || payload.familyId !== check.receiver.familyId) {
    return { ok: false, reason: PlannerAskHandoffRefusal.FamilyChanged }
  }
  if (!check.activeChildId) {
    return { ok: false, reason: PlannerAskHandoffRefusal.ChildUnresolved }
  }
  if (!check.knownChildIds.includes(payload.childId)) {
    return { ok: false, reason: PlannerAskHandoffRefusal.ChildUnknown }
  }
  if (payload.childId !== check.activeChildId) {
    return { ok: false, reason: PlannerAskHandoffRefusal.ChildChanged }
  }
  if (check.receiver.contextChildId !== payload.childId) {
    return { ok: false, reason: PlannerAskHandoffRefusal.ContextUnmapped }
  }
  if (isPlanningWeekPast(payload.weekStart, check.todayKey)) {
    return { ok: false, reason: PlannerAskHandoffRefusal.WeekPassed }
  }
  return { ok: true, handoff: { ...payload, question } }
}

/**
 * An accepted question, still unsent, with the identity it may be sent under.
 *
 * Held for the draft's WHOLE unsent life — through edits, through a dismissed
 * notice, through a keep-my-draft detour — because the reported defect was
 * authority that stopped being checked once the text had landed.
 */
export interface PlannerAskAuthority {
  handoff: PlannerAskHandoff
  /** What Send would have done at the moment it was accepted. */
  receiver: PlannerAskReceiver
  /** The shell's child at the moment it was accepted. */
  activeChildId: string
  /** Is the (possibly edited) question in the composer right now? */
  inComposer: boolean
}

/** The receiver as it stands at the moment an action is taken. */
export interface PlannerAskAuthorityNow {
  receiver: PlannerAskReceiver
  activeChildId: string
  isParent: boolean
  todayKey: string
}

/**
 * May this held question still be used?
 *
 * Called from BOTH the invalidation effect and the Send/replace guards, which is
 * the only reason the guards can be synchronous: an action re-evaluates from
 * render-scope values at call time instead of trusting whatever an effect last
 * wrote. A revoked authority is dropped rather than recomputed, so A → B → A
 * cannot revive it.
 */
export function evaluatePlannerAskAuthority(
  held: PlannerAskAuthority,
  now: PlannerAskAuthorityNow,
): { ok: true } | { ok: false; reason: PlannerAskHandoffRefusal } {
  if (!now.isParent || now.receiver.profile === null) {
    return { ok: false, reason: PlannerAskHandoffRefusal.Unauthorized }
  }
  if (now.receiver.familyId !== held.receiver.familyId) {
    return { ok: false, reason: PlannerAskHandoffRefusal.FamilyChanged }
  }
  if (now.receiver.profile !== held.receiver.profile) {
    return { ok: false, reason: PlannerAskHandoffRefusal.Unauthorized }
  }
  if (!now.activeChildId) {
    return { ok: false, reason: PlannerAskHandoffRefusal.ChildUnresolved }
  }
  if (now.activeChildId !== held.activeChildId) {
    return { ok: false, reason: PlannerAskHandoffRefusal.ChildChanged }
  }
  if (now.receiver.threadId !== held.receiver.threadId) {
    return { ok: false, reason: PlannerAskHandoffRefusal.ThreadChanged }
  }
  if (now.receiver.chatContext !== held.receiver.chatContext) {
    return { ok: false, reason: PlannerAskHandoffRefusal.ContextChanged }
  }
  // The tab's own answer, re-resolved: a child renamed or deduplicated under a
  // live tab moves this without the tab itself changing.
  if (now.receiver.contextChildId !== held.handoff.childId) {
    return { ok: false, reason: PlannerAskHandoffRefusal.ContextUnmapped }
  }
  if (isPlanningWeekPast(held.handoff.weekStart, now.todayKey)) {
    return { ok: false, reason: PlannerAskHandoffRefusal.WeekPassed }
  }
  return { ok: true }
}

// ── What travels with the question on Send ──────────────────────────────────
//
// The independent review found the model receiving the question and nothing
// else: `familyId` / `childId` / `taskType` / `messages`, with no week in it,
// while the notice on screen named one. A notice that claims context the request
// does not carry is a worse failure than no context at all, and the send payload
// is not this run's to change (no schema, no provider, no action writer).
//
// So the context travels where a parent's own words travel — in the draft
// itself, as a plain sentence above her question. It is visible before Send,
// editable like everything else in the composer, it reaches the model through
// the existing `messages` field, and the stored user turn says what it meant.

/** The week's own label, or `''` when the stored key is not a date. */
export function plannerAskWeekLabel(weekStart: string): string {
  return formatPlanningWeekLabel(weekStart)
}

/** "Lincoln · Week of Nov 2–6" — only the parts the planner actually knew. */
export function plannerAskContextLine(handoff: PlannerAskHandoff): string {
  return [handoff.childName, plannerAskWeekLabel(handoff.weekStart)].filter(Boolean).join(' · ')
}

/**
 * The sentence that goes INTO the draft, above her question.
 *
 * Says only what the planner knew — never a guess, and nothing at all when it
 * knew neither the name nor a readable week.
 */
export function plannerAskSendContextSentence(handoff: PlannerAskHandoff): string {
  const week = plannerAskWeekLabel(handoff.weekStart)
  const bits = [
    ...(handoff.childName ? [handoff.childName] : []),
    ...(week ? [`${week.charAt(0).toLowerCase()}${week.slice(1)}`] : []),
  ]
  if (bits.length === 0) return ''
  return `Context: ${bits.join(', ')} (from Plan My Week).`
}

/**
 * The composer draft: the context sentence, a blank line, then her question
 * **verbatim** — so the exact words are still there to read, edit or delete.
 */
export function buildPlannerAskDraft(handoff: PlannerAskHandoff): string {
  const sentence = plannerAskSendContextSentence(handoff)
  return sentence ? `${sentence}\n\n${handoff.question}` : handoff.question
}
