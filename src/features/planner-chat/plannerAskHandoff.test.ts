import { afterEach, describe, expect, it } from 'vitest'

import type { ChatMessage } from '../../core/types'
import { ChatMessageRole } from '../../core/types/enums'
import { withDeclinedAskCleared } from './plannerRequest'
import {
  acceptPlannerAskHandoff,
  buildPlannerAskDraft,
  clearPlannerAskHandoff,
  evaluatePlannerAskAuthority,
  plannerAskContextLine,
  plannerAskHandoffGenerationFromState,
  plannerAskHandoffGoesToAskAi,
  resolveChatContextChild,
  PLANNER_ASK_HANDOFF_MAX_CHARS,
  PLANNER_ASK_HANDOFF_STATE_KEY,
  PLANNER_ASK_HANDOFF_TTL_MS,
  PlannerAskHandoffRefusal,
  resolvePlannerAskHandoffQuestion,
  stagePlannerAskHandoff,
  takePlannerAskHandoff,
  type PlannerAskHandoffRequest,
} from './plannerAskHandoff'

/**
 * UX-273 — the transfer, as data.
 *
 * The behaviour this file pins is mostly ABSENCE: that nothing is carried unless
 * every condition holds, that the slot can be read exactly once, and that a
 * question is refused rather than approximated. Each case below is one way a
 * sentence could end up in a composer it does not belong in — in front of a chat
 * that writes records behind confirm cards.
 */

const ASK = 'add TGTB Math Level 1, 30 minutes daily'

const QUESTION_SOURCE = {
  familyId: 'fam-1',
  childId: 'child-lincoln',
  childName: 'Lincoln',
  weekStart: '2026-10-25',
} as const

function request(over: Partial<PlannerAskHandoffRequest> = {}): PlannerAskHandoffRequest {
  return { ...QUESTION_SOURCE, question: ASK, jobId: 'curriculum', ...over }
}

/** The transcript the free-form path actually builds, declined-flag included. */
function declinedTranscript(over: { ask?: string; jobId?: string } = {}): ChatMessage[] {
  const userId = 'u1'
  const turns: ChatMessage[] = [
    {
      id: userId,
      role: ChatMessageRole.User,
      text: over.ask ?? ASK,
      typedByParent: true,
      createdAt: '2026-10-30T10:00:00.000Z',
    },
  ]
  // UX-269's own step: the declined ask is un-flagged so a regenerate does not
  // re-send it. That `false` is what the resolver reads.
  const cleared = withDeclinedAskCleared(turns, userId)
  return [
    ...cleared,
    {
      id: 'a1',
      role: ChatMessageRole.Assistant,
      text: "I can't change curriculum from here.",
      boundaryJobId: over.jobId ?? 'curriculum',
      createdAt: '2026-10-30T10:00:01.000Z',
    },
  ]
}

afterEach(() => clearPlannerAskHandoff())

describe('which refusals carry a question at all', () => {
  it('carries one where the destination is Ask AI', () => {
    expect(plannerAskHandoffGoesToAskAi('curriculum')).toBe(true)
    expect(plannerAskHandoffGoesToAskAi('videos')).toBe(true)
    expect(plannerAskHandoffGoesToAskAi('dad-lab')).toBe(true)
  })

  it('carries none where the destination is a screen with no composer', () => {
    for (const jobId of ['records', 'today', 'settings', 'videos-manage', 'curriculum-manage', 'dad-lab-manage']) {
      expect(plannerAskHandoffGoesToAskAi(jobId), jobId).toBe(false)
    }
  })

  it('treats an unknown job as Ask AI, exactly as UX-269 resolves it', () => {
    // The fallback is the general Ask AI link, so the question follows the link
    // rather than being dropped on a destination the table could not name.
    expect(plannerAskHandoffGoesToAskAi('schedule-settings')).toBe(true)
  })
})

describe('resolving the exact question a refusal declined', () => {
  it('reads the turn she typed, verbatim', () => {
    const messages = declinedTranscript()
    expect(resolvePlannerAskHandoffQuestion(messages, 1)).toBe(ASK)
  })

  it('is the positive control for the declined-flag coupling', () => {
    // Without UX-269's `withDeclinedAskCleared` step the resolver must find
    // nothing — this is the assertion that fails if that coupling is refactored
    // away, which is the whole reason the fallback is a plain navigation.
    const messages = declinedTranscript()
    const stillFlagged = messages.map((m, i) => (i === 0 ? { ...m, typedByParent: true } : m))
    expect(resolvePlannerAskHandoffQuestion(stillFlagged, 1)).toBeNull()
  })

  it('gives each refusal in one transcript its own question', () => {
    const first = declinedTranscript({ ask: 'retire the volcano video' })
    const second = declinedTranscript({ ask: 'add a nature walk every Thursday' })
    const messages = [...first, ...second.map((m) => ({ ...m, id: `${m.id}-b` }))]
    expect(resolvePlannerAskHandoffQuestion(messages, 1)).toBe('retire the volcano video')
    expect(resolvePlannerAskHandoffQuestion(messages, 3)).toBe('add a nature walk every Thursday')
  })

  it('carries nothing from a refusal that arrived beside a generated plan', () => {
    // UX-274's case: the ask was typed into the setup card's notes, the model
    // planned the week anyway, and the turn above is the planner's own.
    const messages = declinedTranscript()
    const withPlan: ChatMessage[] = messages.map((m, i) =>
      i === 1 ? { ...m, draftPlan: { days: [], skipSuggestions: [], minimumWin: '' } } : m,
    )
    expect(resolvePlannerAskHandoffQuestion(withPlan, 1)).toBeNull()
  })

  it('carries nothing from a turn that declined nothing', () => {
    const messages = declinedTranscript()
    const ordinary = messages.map((m, i) => (i === 1 ? { ...m, boundaryJobId: undefined } : m))
    expect(resolvePlannerAskHandoffQuestion(ordinary, 1)).toBeNull()
  })

  it('carries nothing when the destination is a screen', () => {
    expect(resolvePlannerAskHandoffQuestion(declinedTranscript({ jobId: 'records' }), 1)).toBeNull()
  })

  it("carries nothing from the planner's own synthetic turn", () => {
    // Synthetic turns leave `typedByParent` ABSENT, which is not `false`.
    const messages: ChatMessage[] = [
      {
        id: 's1',
        role: ChatMessageRole.User,
        text: 'Generate a plan for this week.',
        createdAt: '2026-10-30T10:00:00.000Z',
      },
      {
        id: 'a1',
        role: ChatMessageRole.Assistant,
        text: "I can't do that from here.",
        boundaryJobId: 'curriculum',
        createdAt: '2026-10-30T10:00:01.000Z',
      },
    ]
    expect(resolvePlannerAskHandoffQuestion(messages, 1)).toBeNull()
  })

  it('carries nothing when the refusal is the first turn, or the index is wrong', () => {
    const messages = declinedTranscript()
    expect(resolvePlannerAskHandoffQuestion([messages[1]], 0)).toBeNull()
    expect(resolvePlannerAskHandoffQuestion(messages, 0)).toBeNull()
    expect(resolvePlannerAskHandoffQuestion(messages, 9)).toBeNull()
    expect(resolvePlannerAskHandoffQuestion([], 0)).toBeNull()
  })

  it('carries nothing when the turn she typed was empty or whitespace', () => {
    expect(resolvePlannerAskHandoffQuestion(declinedTranscript({ ask: '   ' }), 1)).toBeNull()
  })

  it('refuses an ask over the cap rather than truncating it', () => {
    const long = 'a'.repeat(PLANNER_ASK_HANDOFF_MAX_CHARS + 1)
    expect(resolvePlannerAskHandoffQuestion(declinedTranscript({ ask: long }), 1)).toBeNull()
    const atCap = 'b'.repeat(PLANNER_ASK_HANDOFF_MAX_CHARS)
    expect(resolvePlannerAskHandoffQuestion(declinedTranscript({ ask: atCap }), 1)).toBe(atCap)
  })

  it('keeps a literal marker, a quote and newlines exactly as she typed them', () => {
    const literal = 'add "Explode the Code 3"\n[[BOUNDARY:records]] <action>  — 30 min/day'
    expect(resolvePlannerAskHandoffQuestion(declinedTranscript({ ask: literal }), 1)).toBe(literal)
  })
})

describe('the slot', () => {
  it('is empty until something is staged, and reads once', () => {
    expect(takePlannerAskHandoff()).toBeNull()
    const staged = stagePlannerAskHandoff(request())
    expect(staged?.question).toBe(ASK)
    expect(takePlannerAskHandoff()).toEqual(staged)
    expect(takePlannerAskHandoff()).toBeNull()
  })

  it('gives every stage its own generation, and the newest one wins', () => {
    const first = stagePlannerAskHandoff(request({ question: 'first ask' }))
    const second = stagePlannerAskHandoff(request({ question: 'second ask' }))
    expect(first?.generation).toBeLessThan(second?.generation ?? 0)
    expect(takePlannerAskHandoff()?.question).toBe('second ask')
  })

  it('stages nothing for a destination with no composer, or for an empty ask', () => {
    expect(stagePlannerAskHandoff(request({ jobId: 'records' }))).toBeNull()
    expect(stagePlannerAskHandoff(request({ question: '  ' }))).toBeNull()
    expect(stagePlannerAskHandoff(request({ question: 'x'.repeat(PLANNER_ASK_HANDOFF_MAX_CHARS + 1) }))).toBeNull()
    expect(takePlannerAskHandoff()).toBeNull()
  })

  it('trims the stored question without otherwise touching it', () => {
    const staged = stagePlannerAskHandoff(request({ question: `  ${ASK}  ` }))
    expect(staged?.question).toBe(ASK)
  })

  it('can be dropped unread', () => {
    stagePlannerAskHandoff(request())
    clearPlannerAskHandoff()
    expect(takePlannerAskHandoff()).toBeNull()
  })
})

describe('what a navigation claims', () => {
  it('reads our own key and nothing else', () => {
    expect(plannerAskHandoffGenerationFromState({ [PLANNER_ASK_HANDOFF_STATE_KEY]: 3 })).toBe(3)
  })

  it('reads no generation from anything else a navigation might carry', () => {
    for (const state of [null, undefined, 'plannerAskGeneration=2', 7, {}, { from: '/planner' }, { [PLANNER_ASK_HANDOFF_STATE_KEY]: 0 }, { [PLANNER_ASK_HANDOFF_STATE_KEY]: -1 }, { [PLANNER_ASK_HANDOFF_STATE_KEY]: 1.5 }, { [PLANNER_ASK_HANDOFF_STATE_KEY]: '2' }]) {
      expect(plannerAskHandoffGenerationFromState(state)).toBeNull()
    }
  })

  it('never carries the question itself', () => {
    const staged = stagePlannerAskHandoff(request())
    const state = { [PLANNER_ASK_HANDOFF_STATE_KEY]: staged?.generation }
    expect(JSON.stringify(state)).not.toContain('TGTB')
  })
})

describe('the receiving check', () => {
  const now = 1_700_000_000_000
  const receiver = {
    familyId: 'fam-1',
    profile: 'parents',
    chatContext: 'lincoln',
    contextChildId: 'child-lincoln',
    threadId: null,
  }
  const check = {
    receiver,
    activeChildId: 'child-lincoln',
    knownChildIds: ['child-lincoln', 'child-london'],
    isParent: true,
    todayKey: '2026-10-28',
    generation: 1,
    now,
  }

  function staged(over: Partial<PlannerAskHandoffRequest> = {}) {
    clearPlannerAskHandoff()
    const payload = stagePlannerAskHandoff(request(over), now)
    return payload
  }

  it('accepts the question it was staged with, unchanged', () => {
    const payload = staged()
    const decision = acceptPlannerAskHandoff(payload, { ...check, generation: payload!.generation })
    expect(decision).toEqual({ ok: true, handoff: { ...payload, question: ASK } })
  })

  it('refuses an empty slot — a Back, a reload, or a second read', () => {
    expect(acceptPlannerAskHandoff(null, check)).toEqual({
      ok: false,
      reason: PlannerAskHandoffRefusal.Missing,
    })
  })

  it('refuses a payload this navigation did not name', () => {
    const payload = staged()
    expect(
      acceptPlannerAskHandoff(payload, { ...check, generation: payload!.generation + 1 }).ok,
    ).toBe(false)
    expect(acceptPlannerAskHandoff(payload, { ...check, generation: null })).toEqual({
      ok: false,
      reason: PlannerAskHandoffRefusal.Mismatched,
    })
  })

  it('refuses a late read', () => {
    const payload = staged()
    const late = {
      ...check,
      generation: payload!.generation,
      now: now + PLANNER_ASK_HANDOFF_TTL_MS + 1,
    }
    expect(acceptPlannerAskHandoff(payload, late)).toEqual({
      ok: false,
      reason: PlannerAskHandoffRefusal.Expired,
    })
    // Inside the window it still lands — the TTL is a ceiling, not a race.
    expect(
      acceptPlannerAskHandoff(payload, { ...late, now: now + PLANNER_ASK_HANDOFF_TTL_MS }).ok,
    ).toBe(true)
  })

  it('refuses a different family', () => {
    const payload = staged()
    expect(
      acceptPlannerAskHandoff(payload, {
        ...check,
        generation: payload!.generation,
        receiver: { ...receiver, familyId: 'fam-2' },
      }),
    ).toEqual({ ok: false, reason: PlannerAskHandoffRefusal.FamilyChanged })
  })

  it('refuses a profile that may not use this door', () => {
    const payload = staged()
    expect(
      acceptPlannerAskHandoff(payload, { ...check, generation: payload!.generation, isParent: false }),
    ).toEqual({ ok: false, reason: PlannerAskHandoffRefusal.Unauthorized })
  })

  it('refuses when the active child is now someone else', () => {
    const payload = staged()
    expect(
      acceptPlannerAskHandoff(payload, {
        ...check,
        generation: payload!.generation,
        activeChildId: 'child-london',
      }),
    ).toEqual({ ok: false, reason: PlannerAskHandoffRefusal.ChildChanged })
  })

  it('keeps "could not tell" apart from "changed"', () => {
    const payload = staged()
    expect(
      acceptPlannerAskHandoff(payload, { ...check, generation: payload!.generation, activeChildId: '' }),
    ).toEqual({ ok: false, reason: PlannerAskHandoffRefusal.ChildUnresolved })
  })

  it('refuses a child this family does not have', () => {
    const payload = staged({ childId: 'child-ghost' })
    expect(
      acceptPlannerAskHandoff(payload, {
        ...check,
        generation: payload!.generation,
        activeChildId: 'child-ghost',
        receiver: { ...receiver, contextChildId: 'child-ghost' },
      }),
    ).toEqual({ ok: false, reason: PlannerAskHandoffRefusal.ChildUnknown })
  })

  it('refuses when the TAB would send under somebody else — the finding', () => {
    // The shell agrees; the chat does not. `handleSend` reads the tab, so this
    // is the one that matters and the one call 1 never asked.
    const payload = staged()
    expect(
      acceptPlannerAskHandoff(payload, {
        ...check,
        generation: payload!.generation,
        receiver: { ...receiver, chatContext: 'london', contextChildId: 'child-london' },
      }),
    ).toEqual({ ok: false, reason: PlannerAskHandoffRefusal.ContextUnmapped })
  })

  it('refuses when the tab maps to no child at all', () => {
    const payload = staged()
    expect(
      acceptPlannerAskHandoff(payload, {
        ...check,
        generation: payload!.generation,
        receiver: { ...receiver, chatContext: 'general', contextChildId: '' },
      }),
    ).toEqual({ ok: false, reason: PlannerAskHandoffRefusal.ContextUnmapped })
  })

  it('refuses a question whose planning week has finished', () => {
    const payload = staged({ weekStart: '2026-10-11' })
    expect(
      acceptPlannerAskHandoff(payload, { ...check, generation: payload!.generation, todayKey: '2026-10-28' }),
    ).toEqual({ ok: false, reason: PlannerAskHandoffRefusal.WeekPassed })
  })

  it('fails closed on a week it cannot read', () => {
    const payload = staged({ weekStart: 'next week' })
    expect(
      acceptPlannerAskHandoff(payload, { ...check, generation: payload!.generation }),
    ).toEqual({ ok: false, reason: PlannerAskHandoffRefusal.WeekInvalid })
  })

  it('refuses a payload whose question has gone missing', () => {
    const payload = staged()
    expect(
      acceptPlannerAskHandoff(
        { ...payload!, question: '   ' },
        { ...check, generation: payload!.generation },
      ),
    ).toEqual({ ok: false, reason: PlannerAskHandoffRefusal.Malformed })
  })

  it('reads a malformed payload before it reads anything about the family', () => {
    // Fail closed first: a payload with nothing usable in it must not get as far
    // as the identity branches, whatever else is wrong at the same time.
    const payload = staged()
    expect(
      acceptPlannerAskHandoff(
        { ...payload!, question: '' },
        { ...check, generation: payload!.generation, isParent: false, activeChildId: '' },
      ),
    ).toEqual({ ok: false, reason: PlannerAskHandoffRefusal.Malformed })
  })

  it('checks capability before it says anything about whose question it is', () => {
    // A kid profile must not be told which child a staged question was about.
    const payload = staged()
    expect(
      acceptPlannerAskHandoff(payload, {
        ...check,
        generation: payload!.generation,
        isParent: false,
        activeChildId: 'child-london',
      }),
    ).toEqual({ ok: false, reason: PlannerAskHandoffRefusal.Unauthorized })
  })
})

describe('which child a chat tab sends under', () => {
  const kids = [
    { id: 'a', name: 'Lincoln' },
    { id: 'b', name: 'London' },
  ]

  it('reads the tab the way the chat itself does', () => {
    expect(resolveChatContextChild(kids, 'lincoln')).toEqual({ ok: true, childId: 'a' })
    expect(resolveChatContextChild(kids, 'LONDON')).toEqual({ ok: true, childId: 'b' })
  })

  it('fails closed rather than guessing', () => {
    expect(resolveChatContextChild(kids, 'general')).toEqual({ ok: false, reason: 'no-child' })
    expect(resolveChatContextChild(kids, '')).toEqual({ ok: false, reason: 'no-child' })
    // A child the two tabs do not cover.
    expect(resolveChatContextChild([{ id: 'c', name: 'Rowan' }], 'lincoln')).toEqual({
      ok: false,
      reason: 'unknown',
    })
    // The duplicate-name documents UX-394 deliberately left in place.
    expect(
      resolveChatContextChild([...kids, { id: 'dupe', name: 'Lincoln' }], 'lincoln'),
    ).toEqual({ ok: false, reason: 'ambiguous' })
  })
})

describe('the authority a filled draft keeps', () => {
  const receiver = {
    familyId: 'fam-1',
    profile: 'parents',
    chatContext: 'lincoln',
    contextChildId: 'child-lincoln',
    threadId: null as string | null,
  }
  const handoff = {
    ...QUESTION_SOURCE,
    question: ASK,
    jobId: 'curriculum',
    generation: 1,
    stagedAt: 0,
  }
  const held = { handoff, receiver, activeChildId: 'child-lincoln', inComposer: true }
  const nowOk = {
    receiver,
    activeChildId: 'child-lincoln',
    isParent: true,
    todayKey: '2026-10-28',
  }

  it('holds while nothing has moved', () => {
    expect(evaluatePlannerAskAuthority(held, nowOk)).toEqual({ ok: true })
  })

  it('names what moved, one reason at a time', () => {
    const cases: [Partial<typeof nowOk>, string][] = [
      [{ isParent: false }, PlannerAskHandoffRefusal.Unauthorized],
      [{ receiver: { ...receiver, profile: 'lincoln' } }, PlannerAskHandoffRefusal.Unauthorized],
      [{ receiver: { ...receiver, familyId: 'fam-2' } }, PlannerAskHandoffRefusal.FamilyChanged],
      [{ activeChildId: '' }, PlannerAskHandoffRefusal.ChildUnresolved],
      [{ activeChildId: 'child-london' }, PlannerAskHandoffRefusal.ChildChanged],
      [{ receiver: { ...receiver, threadId: 'thread-7' } }, PlannerAskHandoffRefusal.ThreadChanged],
      [
        { receiver: { ...receiver, chatContext: 'london', contextChildId: 'child-london' } },
        PlannerAskHandoffRefusal.ContextChanged,
      ],
      // The tab did not move; the child it maps to did (a rename, a dedupe).
      [{ receiver: { ...receiver, contextChildId: '' } }, PlannerAskHandoffRefusal.ContextUnmapped],
      [{ todayKey: '2099-01-01' }, PlannerAskHandoffRefusal.WeekPassed],
    ]
    for (const [over, reason] of cases) {
      expect(evaluatePlannerAskAuthority(held, { ...nowOk, ...over }), reason).toEqual({
        ok: false,
        reason,
      })
    }
  })
})

describe('what travels with the question', () => {
  const handoff = {
    ...QUESTION_SOURCE,
    question: 'what should we do this week?',
    jobId: 'curriculum',
    generation: 1,
    stagedAt: 0,
  }

  it('puts the known child and week above her exact words', () => {
    const draft = buildPlannerAskDraft(handoff)
    expect(draft).toContain('Lincoln')
    expect(draft).toContain('week of')
    // Her question, verbatim and contiguous, is still in there to read and edit.
    expect(draft.endsWith(handoff.question)).toBe(true)
    expect(draft.split('\n\n')).toHaveLength(2)
  })

  it('says only what the planner knew', () => {
    expect(buildPlannerAskDraft({ ...handoff, childName: undefined })).not.toContain('Lincoln')
    const noWeek = buildPlannerAskDraft({ ...handoff, weekStart: 'not-a-date' })
    expect(noWeek).toContain('Lincoln')
    expect(noWeek).not.toContain('week of')
    // Nothing known at all: her words alone, never an empty context line.
    expect(
      buildPlannerAskDraft({ ...handoff, childName: undefined, weekStart: 'not-a-date' }),
    ).toBe(handoff.question)
  })

  it('shows the same context the draft carries', () => {
    expect(plannerAskContextLine(handoff)).toContain('Lincoln')
    expect(plannerAskContextLine(handoff)).toContain('Week of')
  })
})
