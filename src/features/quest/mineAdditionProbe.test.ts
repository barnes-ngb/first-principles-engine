import { describe, expect, it, vi } from 'vitest'

/**
 * UX-495 — the ONE local checked item, and what may be read back off a saved
 * source as a probe observation.
 *
 * The gaps these close are the ones a tag cannot see: a provider question that
 * echoed the pilot's concept, an ordinary question, arithmetic that does not add
 * up, a malformed or legacy stored record, and two rows claiming to be the
 * probe.
 *
 * The correction round adds the ones a self-consistent record could still get
 * past: a saved prompt, stimulus, option set or displayed ORDER that is not the
 * checked item's; a recorded answer that was never one of the offered choices;
 * a recorded correctness that disagrees with the existing scoring; a stamp from
 * a different synthesis generation than the source accepted; a source carrying
 * both a pilot claim and a queued ask plan; and an invalid pending item at the
 * Resume boundary. Each has a positive control beside it.
 */

import {
  MINE_ADDITION_PROBE_CONCEPT,
  MINE_ADDITION_PROBE_LEVEL,
  MINE_ADDITION_PROBE_SKILL,
  MINE_ADDITION_PROBE_TEMPLATE_ID,
  buildMineAdditionProbeQuestion,
  checkedMineAdditionProbeItem,
  checkedMineAdditionProbeQuestion,
  mineAdditionProbeAssistantTurn,
  mineAdditionProbeResult,
  mineAdditionProbeResumeRefusal,
  mineAdditionProbeStamp,
  readMineAdditionPilotTarget,
  readMineAdditionProbeStamp,
} from './mineAdditionProbe'
import { MINE_ADDITION_PROBE_KIND } from './questTypes'
import type {
  MineAdditionPilotTarget,
  MultipleChoiceQuestion,
  QuestLocalProbeStamp,
  SessionQuestion,
} from './questTypes'

const GENERATION = '2026-11-10T08:00:00.000Z'
const OTHER_GENERATION = '2026-11-11T07:00:00.000Z'

const target: MineAdditionPilotTarget = {
  kind: MINE_ADDITION_PROBE_KIND,
  templateId: MINE_ADDITION_PROBE_TEMPLATE_ID,
  conceptId: MINE_ADDITION_PROBE_CONCEPT,
  offerSource: 'synthesis',
  synthesisGeneratedAt: GENERATION,
  level: MINE_ADDITION_PROBE_LEVEL,
}

/** The canonical set, ascending — what an omitted order means. */
const ASCENDING = ['14', '15', '16']

/**
 * The answered row the live session records for the probe.
 *
 * Its options are the stamp's displayed order, because that is the invariant
 * this round is about: what was shown is what is stored and what is checked.
 */
function probeRow(
  overrides: Partial<SessionQuestion> = {},
  order: readonly string[] = ASCENDING,
): SessionQuestion {
  const stamp = mineAdditionProbeStamp(target, order)
  return {
    id: 'q_pilot_1',
    type: 'multiple-choice',
    level: MINE_ADDITION_PROBE_LEVEL,
    skill: MINE_ADDITION_PROBE_SKILL,
    prompt: 'What is 8 + 7?',
    stimulus: '8 + 7',
    options: [...stamp.choices],
    correctAnswer: '15',
    childAnswer: '15',
    correct: true,
    responseTimeMs: 4200,
    timestamp: GENERATION,
    inputMethod: 'multiple-choice',
    targetConceptId: MINE_ADDITION_PROBE_CONCEPT,
    localProbe: stamp,
    ...overrides,
  }
}

/** An ordinary math row — no provenance of any kind. */
function ordinaryRow(overrides: Partial<SessionQuestion> = {}): SessionQuestion {
  return {
    id: 'q1',
    type: 'multiple-choice',
    level: 2,
    skill: MINE_ADDITION_PROBE_SKILL,
    prompt: 'What is 3 + 4?',
    options: ['6', '7', '8'],
    correctAnswer: '7',
    childAnswer: '7',
    correct: true,
    responseTimeMs: 1000,
    timestamp: GENERATION,
    ...overrides,
  }
}

const mathSource = { domain: 'math', questMode: 'math', pilotProbe: target, targetPlan: [] }

describe('the one checked item', () => {
  it('builds an ordinary level-2 multiple-choice addition item showing the exact sum', () => {
    const q = buildMineAdditionProbeQuestion(target)!
    expect(q).toBeTruthy()
    expect(q.type).toBe('multiple-choice')
    expect(q.level).toBe(2)
    expect(q.prompt).toBe('What is 8 + 7?')
    expect(q.stimulus).toBe('8 + 7')
    expect(q.correctAnswer).toBe('15')
    // Three distinct choices — the canonical set — exactly one of them correct.
    expect(q.options).toHaveLength(3)
    expect([...q.options].sort()).toEqual([...ASCENDING].sort())
    expect(q.options.filter((o) => o === '15')).toHaveLength(1)
    expect(q.targetConceptId).toBe(MINE_ADDITION_PROBE_CONCEPT)
  })

  it('carries provenance sufficient to identify the item: template, operands, sum, answer, generation', () => {
    const q = buildMineAdditionProbeQuestion(target)!
    expect(q.localProbe).toMatchObject({
      kind: MINE_ADDITION_PROBE_KIND,
      templateId: MINE_ADDITION_PROBE_TEMPLATE_ID,
      conceptId: MINE_ADDITION_PROBE_CONCEPT,
      offerSource: 'synthesis',
      synthesisGeneratedAt: GENERATION,
      level: 2,
      operands: [8, 7],
      displayedSum: '8 + 7',
      expectedAnswer: '15',
    })
    // And the provenance records the order the child will actually SEE.
    expect(q.localProbe!.choices).toEqual(q.options)
  })

  /**
   * The display order is chosen once, at generation, rather than being fixed —
   * a fixed ascending set would make the correct answer the middle tap every
   * time. The positive control is that a shuffled order still validates.
   */
  it('chooses the display order once, and a non-canonical ORDER still validates', () => {
    const lowest = buildMineAdditionProbeQuestion(target, () => 0)!
    const highest = buildMineAdditionProbeQuestion(target, () => 0.999)!
    expect([...lowest.options].sort()).toEqual([...ASCENDING].sort())
    expect([...highest.options].sort()).toEqual([...ASCENDING].sort())
    // Whatever order each one drew, each is its own stamp's order…
    expect(lowest.localProbe!.choices).toEqual(lowest.options)
    expect(highest.localProbe!.choices).toEqual(highest.options)
    // …and the two rngs really do produce different orders.
    expect(lowest.options).not.toEqual(highest.options)
  })

  it('records the asked item as the conversation turn the provider would have produced', () => {
    const q = buildMineAdditionProbeQuestion(target)!
    const turn = mineAdditionProbeAssistantTurn(q)
    expect(turn).toContain('<quest>')
    const json = JSON.parse(/<quest>([\s\S]*?)<\/quest>/.exec(turn)![1]) as Record<string, unknown>
    expect(json).toMatchObject({
      prompt: q.prompt,
      correctAnswer: '15',
      options: q.options,
      targetConceptId: MINE_ADDITION_PROBE_CONCEPT,
    })
  })

  it('refuses a target that is not this exact template, concept, source, level or generation', () => {
    expect(readMineAdditionPilotTarget(null)).toBeNull()
    expect(readMineAdditionPilotTarget({ ...target, kind: 'something-else' })).toBeNull()
    expect(readMineAdditionPilotTarget({ ...target, templateId: 'other.v9' })).toBeNull()
    expect(readMineAdditionPilotTarget({ ...target, conceptId: 'reading.phonics.cvc' })).toBeNull()
    expect(readMineAdditionPilotTarget({ ...target, offerSource: 'ask' })).toBeNull()
    expect(readMineAdditionPilotTarget({ ...target, synthesisGeneratedAt: '  ' })).toBeNull()
    expect(readMineAdditionPilotTarget({ ...target, synthesisGeneratedAt: undefined })).toBeNull()
    // A timestamp field: non-blank is not enough, it has to BE one.
    for (const generatedAt of ['generation-2', '42', 'yesterday', '2026-13-45T99:99:99Z']) {
      expect(readMineAdditionPilotTarget({ ...target, synthesisGeneratedAt: generatedAt })).toBeNull()
    }
    // Positive control: the real ISO shape, which is what is stored.
    expect(
      readMineAdditionPilotTarget({ ...target, synthesisGeneratedAt: GENERATION }),
    ).toMatchObject({ synthesisGeneratedAt: GENERATION })
    expect(readMineAdditionPilotTarget({ ...target, level: 5 })).toBeNull()
    expect(readMineAdditionPilotTarget(target)).toMatchObject({
      conceptId: MINE_ADDITION_PROBE_CONCEPT,
    })
  })

  /**
   * The stamp is checked against the template RECONSTRUCTED here, not against
   * itself: a corrupt record is internally consistent with its own corruption.
   */
  it('refuses a stamp that is not the reconstructed template', () => {
    const good = mineAdditionProbeStamp(target)
    const bad = (patch: Partial<QuestLocalProbeStamp>) =>
      readMineAdditionProbeStamp({ ...good, ...patch })

    expect(readMineAdditionProbeStamp(good)).toBeTruthy()
    // Positive control: the canonical set in another order is valid, and the
    // order is kept exactly as stored.
    expect(bad({ choices: ['15', '14', '16'] })?.choices).toEqual(['15', '14', '16'])
    // Other operands — self-consistent, but not this item.
    expect(
      bad({ operands: [9, 6], displayedSum: '9 + 6', expectedAnswer: '15' }),
    ).toBeNull()
    expect(bad({ expectedAnswer: '16' })).toBeNull()
    expect(bad({ displayedSum: '9 + 7' })).toBeNull()
    expect(bad({ operands: [8] })).toBeNull()
    expect(bad({ operands: [8, 7, 1] })).toBeNull()
    // Not the canonical option set.
    expect(bad({ choices: ['15', '16'] })).toBeNull()
    expect(bad({ choices: ['15', '15', '16'] })).toBeNull()
    expect(bad({ choices: ['14', '16', '17'] })).toBeNull()
    expect(bad({ choices: ['14', '15', '16', '17'] })).toBeNull()
  })

  it('refuses a live item whose shown question disagrees with its own provenance', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const q = buildMineAdditionProbeQuestion(target, () => 0)!
    const tweak = (patch: Partial<MultipleChoiceQuestion>) =>
      checkedMineAdditionProbeQuestion({ ...q, ...patch })

    expect(checkedMineAdditionProbeQuestion(q)).toBe(q)
    expect(tweak({ correctAnswer: '16' })).toBeNull()
    expect(tweak({ options: ['14', '16', '17'] })).toBeNull()
    expect(tweak({ stimulus: '9 + 7' })).toBeNull()
    expect(tweak({ prompt: 'What is 9 + 7?' })).toBeNull()
    expect(tweak({ level: 3 })).toBeNull()
    expect(tweak({ skill: 'phonics.cvc' })).toBeNull()
    expect(tweak({ targetConceptId: 'reading.phonics.cvc' })).toBeNull()
    expect(tweak({ localProbe: undefined })).toBeNull()
    // The DISPLAYED order is part of the item: the same three choices in a
    // different sequence is not the item that was stamped.
    expect(tweak({ options: [...q.options].reverse() })).toBeNull()
  })

  it('ties the item to the accepted target’s own generation when one is supplied', () => {
    const q = buildMineAdditionProbeQuestion(target)!
    expect(checkedMineAdditionProbeItem(q, target)).toBeTruthy()
    expect(
      checkedMineAdditionProbeItem(q, { ...target, synthesisGeneratedAt: OTHER_GENERATION }),
    ).toBeNull()
    expect(checkedMineAdditionProbeItem(q, { ...target, templateId: 'other.v9' })).toBeNull()
  })
})

describe('what may be read back as ONE probe observation', () => {
  it('counts a single valid answered probe row once, correct', () => {
    expect(mineAdditionProbeResult(mathSource, [probeRow(), ordinaryRow()])).toEqual({
      conceptId: MINE_ADDITION_PROBE_CONCEPT,
      correct: 1,
      total: 1,
    })
  })

  it('counts it in whatever order the choices were displayed in', () => {
    const shuffled = ['16', '15', '14']
    expect(
      mineAdditionProbeResult(mathSource, [probeRow({ childAnswer: '15' }, shuffled)]),
    ).toEqual({ conceptId: MINE_ADDITION_PROBE_CONCEPT, correct: 1, total: 1 })
  })

  it('counts a wrong answer once too — it is an observation, not a failure to record', () => {
    expect(
      mineAdditionProbeResult(mathSource, [probeRow({ childAnswer: '14', correct: false })]),
    ).toEqual({ conceptId: MINE_ADDITION_PROBE_CONCEPT, correct: 0, total: 1 })
  })

  it('adds nothing for a skipped or flagged probe row', () => {
    expect(
      mineAdditionProbeResult(mathSource, [probeRow({ skipped: true, correct: false })]),
    ).toBeNull()
    expect(mineAdditionProbeResult(mathSource, [probeRow({ flaggedAsError: true })])).toBeNull()
  })

  /**
   * The response itself is validated now, not just the item. A record whose
   * answer was never on screen, or whose correctness disagrees with the
   * existing `checkAnswer` scoring, is not an observation about the child.
   */
  it('adds nothing when the recorded answer was not one of the offered choices', () => {
    expect(mineAdditionProbeResult(mathSource, [probeRow({ childAnswer: '' })])).toBeNull()
    expect(
      mineAdditionProbeResult(mathSource, [probeRow({ childAnswer: '15 ', correct: true })]),
    ).toBeNull()
    expect(
      mineAdditionProbeResult(mathSource, [probeRow({ childAnswer: '21', correct: false })]),
    ).toBeNull()
    expect(
      mineAdditionProbeResult(mathSource, [
        probeRow({ childAnswer: undefined as unknown as string }),
      ]),
    ).toBeNull()
  })

  it('adds nothing when the recorded correctness disagrees with the scoring', () => {
    // Claimed right, answered wrong.
    expect(
      mineAdditionProbeResult(mathSource, [probeRow({ childAnswer: '14', correct: true })]),
    ).toBeNull()
    // Claimed wrong, answered right.
    expect(
      mineAdditionProbeResult(mathSource, [probeRow({ childAnswer: '15', correct: false })]),
    ).toBeNull()
    expect(
      mineAdditionProbeResult(mathSource, [
        probeRow({ correct: 'yes' as unknown as boolean }),
      ]),
    ).toBeNull()
  })

  it('adds nothing when the saved item’s own fields are not the checked item', () => {
    expect(mineAdditionProbeResult(mathSource, [probeRow({ prompt: 'What is 9 + 7?' })])).toBeNull()
    expect(mineAdditionProbeResult(mathSource, [probeRow({ stimulus: '9 + 7' })])).toBeNull()
    expect(mineAdditionProbeResult(mathSource, [probeRow({ correctAnswer: '16' })])).toBeNull()
    expect(
      mineAdditionProbeResult(mathSource, [probeRow({ options: ['14', '16', '17'] })]),
    ).toBeNull()
    // Stored in a different order than the one the stamp recorded.
    expect(
      mineAdditionProbeResult(mathSource, [probeRow({ options: ['16', '15', '14'] })]),
    ).toBeNull()
    expect(
      mineAdditionProbeResult(mathSource, [probeRow({ targetConceptId: 'reading.phonics.cvc' })]),
    ).toBeNull()
    expect(mineAdditionProbeResult(mathSource, [probeRow({ skill: 'phonics.cvc' })])).toBeNull()
  })

  it('adds nothing for a provider question that merely echoed the concept', () => {
    const echoed = ordinaryRow({ targetConceptId: MINE_ADDITION_PROBE_CONCEPT })
    expect(mineAdditionProbeResult(mathSource, [echoed])).toBeNull()
    // …and an echoed row beside the real probe does not become a second one.
    expect(mineAdditionProbeResult(mathSource, [probeRow(), echoed])).toEqual({
      conceptId: MINE_ADDITION_PROBE_CONCEPT,
      correct: 1,
      total: 1,
    })
  })

  it('refuses TWO rows claiming to be the probe — a duplicate is not resolved, it is refused', () => {
    expect(
      mineAdditionProbeResult(mathSource, [probeRow(), probeRow({ id: 'q_pilot_2' })]),
    ).toBeNull()
    expect(
      mineAdditionProbeResult(mathSource, [
        probeRow(),
        probeRow({
          id: 'q_pilot_3',
          localProbe: { nonsense: true } as unknown as QuestLocalProbeStamp,
        }),
      ]),
    ).toBeNull()
  })

  it('refuses a malformed or legacy stored record', () => {
    expect(mineAdditionProbeResult(mathSource, [ordinaryRow()])).toBeNull()
    expect(mineAdditionProbeResult(mathSource, [])).toBeNull()
    const broken = probeRow()
    broken.localProbe = { ...broken.localProbe!, expectedAnswer: '16' }
    expect(mineAdditionProbeResult(mathSource, [broken])).toBeNull()
    expect(
      mineAdditionProbeResult({ domain: 'math', questMode: 'math' }, [probeRow()]),
    ).toBeNull()
    expect(
      mineAdditionProbeResult({ domain: 'math', questMode: 'math', pilotProbe: { kind: 'x' } }, [
        probeRow(),
      ]),
    ).toBeNull()
  })

  it('refuses a row whose provenance is not the SOURCE’s own accepted generation', () => {
    const otherGeneration = mineAdditionProbeStamp({
      ...target,
      synthesisGeneratedAt: OTHER_GENERATION,
    })
    expect(
      mineAdditionProbeResult(mathSource, [probeRow({ localProbe: otherGeneration })]),
    ).toBeNull()
  })

  it('refuses another mode, another domain or another level', () => {
    expect(mineAdditionProbeResult({ ...mathSource, questMode: 'phonics' }, [probeRow()])).toBeNull()
    expect(mineAdditionProbeResult({ ...mathSource, domain: 'reading' }, [probeRow()])).toBeNull()
    expect(mineAdditionProbeResult(mathSource, [probeRow({ level: 5 })])).toBeNull()
  })

  /**
   * Mutual exclusion. A source carrying both a pilot claim and a queued ask
   * plan is corrupt, not richer: reconciling it is what let provider-echoed
   * tags be tallied as queued probes.
   */
  it('refuses a source that claims BOTH a pilot and a queued ask plan', () => {
    const plan = [
      {
        conceptId: MINE_ADDITION_PROBE_CONCEPT,
        rowIndex: 0,
        digest: 'abcd1234',
        modelSeededAt: 'seeded',
      },
    ]
    expect(mineAdditionProbeResult({ ...mathSource, targetPlan: plan }, [probeRow()])).toBeNull()
    // Positive control: an absent or empty plan is the pilot's own shape.
    expect(
      mineAdditionProbeResult({ ...mathSource, targetPlan: undefined }, [probeRow()]),
    ).toBeTruthy()
    expect(mineAdditionProbeResult({ ...mathSource, targetPlan: [] }, [probeRow()])).toBeTruthy()
  })
})

/**
 * UX-495 correction — the Resume boundary.
 *
 * A pending item that CLAIMS to be the probe is judged before it can be
 * restored, so a corrupt or target-mismatched one is never displayed or scored.
 * Ordinary and legacy pending questions are not this function's business.
 */
describe('the saved pending probe, at the Resume boundary', () => {
  const pendingProbe = {
    id: 'q_pilot_1',
    type: 'multiple-choice',
    level: 2,
    skill: MINE_ADDITION_PROBE_SKILL,
    prompt: 'What is 8 + 7?',
    stimulus: '8 + 7',
    options: [...ASCENDING],
    correctAnswer: '15',
    targetConceptId: MINE_ADDITION_PROBE_CONCEPT,
    localProbe: mineAdditionProbeStamp(target),
  }

  it('allows a valid pending probe, with its exact order and provenance', () => {
    expect(
      mineAdditionProbeResumeRefusal({
        domain: 'math',
        questMode: 'math',
        pilotProbe: target,
        targetPlan: [],
        questions: [],
        savedCurrentQuestion: pendingProbe,
      }),
    ).toBeNull()
  })

  /**
   * The browser blocker: a checked MATH item stored under a reading/phonics
   * session was restored and shown, so `8 + 7` appeared on a phonics screen.
   */
  it('refuses a pending probe on a record that is not the Math quest', () => {
    const refuse = (record: Record<string, unknown>) =>
      mineAdditionProbeResumeRefusal({
        pilotProbe: target,
        questions: [],
        savedCurrentQuestion: pendingProbe,
        ...record,
      })
    expect(refuse({ domain: 'reading', questMode: 'phonics' })).toBe('no-resume-point')
    expect(refuse({ domain: 'reading', questMode: 'math' })).toBe('no-resume-point')
    expect(refuse({ domain: 'math', questMode: 'phonics' })).toBe('no-resume-point')
    expect(refuse({ domain: 'math', questMode: 'comprehension' })).toBe('no-resume-point')
    expect(refuse({ domain: undefined, questMode: undefined })).toBe('no-resume-point')
    // Positive control: the Math quest it was checked for.
    expect(refuse({ domain: 'math', questMode: 'math' })).toBeNull()
  })

  it('says nothing about an ordinary or legacy pending question', () => {
    expect(
      mineAdditionProbeResumeRefusal({ questions: [], savedCurrentQuestion: ordinaryRow() }),
    ).toBeNull()
    expect(mineAdditionProbeResumeRefusal({ savedCurrentQuestion: undefined })).toBeNull()
    expect(mineAdditionProbeResumeRefusal(null)).toBeNull()
    // An ordinary READING partial resumes exactly as it always did — the
    // domain/mode check above is only reached by a pending probe claim.
    expect(
      mineAdditionProbeResumeRefusal({
        domain: 'reading',
        questMode: 'phonics',
        questions: [],
        savedCurrentQuestion: { ...ordinaryRow(), prompt: 'Which word says /kat/?' },
      }),
    ).toBeNull()
    // Including on a record that carries a malformed pilot claim but whose
    // pending item is an ordinary question — those answers are still resumable.
    expect(
      mineAdditionProbeResumeRefusal({
        pilotProbe: { kind: 'nonsense' },
        savedCurrentQuestion: ordinaryRow(),
      }),
    ).toBeNull()
  })

  it('refuses a pending probe with no valid accepted target behind it', () => {
    expect(
      mineAdditionProbeResumeRefusal({
        domain: 'math',
        questMode: 'math',
        savedCurrentQuestion: pendingProbe,
      }),
    ).toBe('no-resume-point')
    expect(
      mineAdditionProbeResumeRefusal({
        domain: 'math',
        questMode: 'math',
        pilotProbe: { kind: 'nonsense' },
        savedCurrentQuestion: pendingProbe,
      }),
    ).toBe('no-resume-point')
  })

  it('refuses a corrupt, mismatched or reordered pending probe', () => {
    const refuse = (pending: Record<string, unknown>) =>
      mineAdditionProbeResumeRefusal({
        domain: 'math',
        questMode: 'math',
        pilotProbe: target,
        questions: [],
        savedCurrentQuestion: pending,
      })
    expect(refuse({ ...pendingProbe, localProbe: { nonsense: true } })).toBe('no-resume-point')
    expect(refuse({ ...pendingProbe, correctAnswer: '16' })).toBe('no-resume-point')
    expect(refuse({ ...pendingProbe, prompt: 'What is 9 + 7?' })).toBe('no-resume-point')
    expect(refuse({ ...pendingProbe, options: ['16', '15', '14'] })).toBe('no-resume-point')
    expect(
      refuse({
        ...pendingProbe,
        localProbe: mineAdditionProbeStamp({ ...target, synthesisGeneratedAt: OTHER_GENERATION }),
      }),
    ).toBe('no-resume-point')
  })

  it('refuses a pending probe on a record whose probe was already answered', () => {
    expect(
      mineAdditionProbeResumeRefusal({
        domain: 'math',
        questMode: 'math',
        pilotProbe: target,
        questions: [probeRow()],
        savedCurrentQuestion: pendingProbe,
      }),
    ).toBe('no-resume-point')
  })

  it('refuses a pending probe on a record that also claims a queued ask plan', () => {
    expect(
      mineAdditionProbeResumeRefusal({
        domain: 'math',
        questMode: 'math',
        pilotProbe: target,
        targetPlan: [{ conceptId: MINE_ADDITION_PROBE_CONCEPT, rowIndex: 0, digest: 'd', modelSeededAt: 's' }],
        questions: [],
        savedCurrentQuestion: pendingProbe,
      }),
    ).toBe('no-resume-point')
  })
})
