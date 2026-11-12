import { describe, expect, it, vi } from 'vitest'

/**
 * UX-495 — the ONE local checked item, and what may be read back off a saved
 * source as a probe observation.
 *
 * The gaps these close are the ones a tag cannot see: a provider question that
 * echoed the pilot's concept, an ordinary question, arithmetic that does not
 * add up, a malformed or legacy stored record, and two rows claiming to be the
 * probe. None of them may become a probe observation, and exactly one valid
 * answered row must become exactly one.
 */

import {
  MINE_ADDITION_PROBE_CONCEPT,
  MINE_ADDITION_PROBE_LEVEL,
  MINE_ADDITION_PROBE_SKILL,
  MINE_ADDITION_PROBE_TEMPLATE_ID,
  buildMineAdditionProbeQuestion,
  checkedMineAdditionProbeQuestion,
  mineAdditionProbeAssistantTurn,
  mineAdditionProbeResult,
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

const target: MineAdditionPilotTarget = {
  kind: MINE_ADDITION_PROBE_KIND,
  templateId: MINE_ADDITION_PROBE_TEMPLATE_ID,
  conceptId: MINE_ADDITION_PROBE_CONCEPT,
  offerSource: 'synthesis',
  synthesisGeneratedAt: GENERATION,
  level: MINE_ADDITION_PROBE_LEVEL,
}

/** The answered row the live session records for the probe. */
function probeRow(overrides: Partial<SessionQuestion> = {}): SessionQuestion {
  const stamp = mineAdditionProbeStamp(target)
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

const mathSource = { domain: 'math', questMode: 'math', pilotProbe: target }

describe('the one checked item', () => {
  it('builds an ordinary level-2 multiple-choice addition item showing the exact sum', () => {
    const q = buildMineAdditionProbeQuestion(target)!
    expect(q).toBeTruthy()
    expect(q.type).toBe('multiple-choice')
    expect(q.level).toBe(2)
    expect(q.prompt).toContain('8 + 7')
    expect(q.stimulus).toBe('8 + 7')
    expect(q.correctAnswer).toBe('15')
    // Three distinct choices, exactly one of them the single correct answer.
    expect(q.options).toHaveLength(3)
    expect(new Set(q.options).size).toBe(3)
    expect(q.options.filter((o) => o === '15')).toHaveLength(1)
    expect(q.targetConceptId).toBe(MINE_ADDITION_PROBE_CONCEPT)
  })

  it('carries provenance sufficient to identify the item: template, operands, sum, choices, answer, generation', () => {
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
      choices: ['14', '15', '16'],
    })
  })

  it('records the asked item as the conversation turn the provider would have produced', () => {
    const q = buildMineAdditionProbeQuestion(target)!
    const turn = mineAdditionProbeAssistantTurn(q)
    expect(turn).toContain('<quest>')
    const json = JSON.parse(/<quest>([\s\S]*?)<\/quest>/.exec(turn)![1]) as Record<string, unknown>
    expect(json).toMatchObject({
      prompt: q.prompt,
      correctAnswer: '15',
      options: ['14', '15', '16'],
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
    expect(readMineAdditionPilotTarget({ ...target, level: 5 })).toBeNull()
    expect(readMineAdditionPilotTarget(target)).toMatchObject({ conceptId: MINE_ADDITION_PROBE_CONCEPT })
  })

  it('refuses a stamp whose arithmetic or choices do not check out', () => {
    const good = mineAdditionProbeStamp(target)
    const bad = (patch: Partial<QuestLocalProbeStamp>) =>
      readMineAdditionProbeStamp({ ...good, ...patch })

    expect(readMineAdditionProbeStamp(good)).toBeTruthy()
    // The sum is wrong for the operands.
    expect(bad({ expectedAnswer: '16' })).toBeNull()
    // The displayed sum is not the operands' own.
    expect(bad({ displayedSum: '9 + 7' })).toBeNull()
    // Out of the within-20 band.
    expect(bad({ operands: [18, 7], displayedSum: '18 + 7', expectedAnswer: '25', choices: ['24', '25', '26'] })).toBeNull()
    // Not two operands.
    expect(bad({ operands: [8] })).toBeNull()
    expect(bad({ operands: [8, 7, 1] })).toBeNull()
    // Not three distinct choices.
    expect(bad({ choices: ['15', '16'] })).toBeNull()
    expect(bad({ choices: ['15', '15', '16'] })).toBeNull()
    // The correct answer is not among them, or is there twice.
    expect(bad({ choices: ['14', '16', '17'] })).toBeNull()
  })

  it('refuses a live item whose shown question disagrees with its own provenance', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const q = buildMineAdditionProbeQuestion(target)!
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

  it('adds nothing for a provider question that merely echoed the concept', () => {
    const echoed = ordinaryRow({ targetConceptId: MINE_ADDITION_PROBE_CONCEPT })
    expect(mineAdditionProbeResult(mathSource, [echoed])).toBeNull()
    // …and an echoed row beside the real probe does not become a second one:
    // the single valid row is still the only observation.
    expect(mineAdditionProbeResult(mathSource, [probeRow(), echoed])).toEqual({
      conceptId: MINE_ADDITION_PROBE_CONCEPT,
      correct: 1,
      total: 1,
    })
  })

  it('refuses TWO rows claiming to be the probe — a duplicate is not resolved, it is refused', () => {
    expect(mineAdditionProbeResult(mathSource, [probeRow(), probeRow({ id: 'q_pilot_2' })])).toBeNull()
    // A malformed claim beside a real one is still two claims.
    expect(
      mineAdditionProbeResult(mathSource, [
        probeRow(),
        probeRow({ id: 'q_pilot_3', localProbe: { nonsense: true } as unknown as QuestLocalProbeStamp }),
      ]),
    ).toBeNull()
  })

  it('refuses a malformed or legacy stored record', () => {
    // No stamp anywhere — an ordinary or legacy session.
    expect(mineAdditionProbeResult(mathSource, [ordinaryRow()])).toBeNull()
    expect(mineAdditionProbeResult(mathSource, [])).toBeNull()
    // A stamp whose math is broken.
    const broken = probeRow()
    broken.localProbe = { ...broken.localProbe!, expectedAnswer: '16' }
    expect(mineAdditionProbeResult(mathSource, [broken])).toBeNull()
    // A source with no accepted target cannot have a probe at all.
    expect(mineAdditionProbeResult({ domain: 'math', questMode: 'math' }, [probeRow()])).toBeNull()
    expect(
      mineAdditionProbeResult({ domain: 'math', questMode: 'math', pilotProbe: { kind: 'x' } }, [probeRow()]),
    ).toBeNull()
  })

  it('refuses a row whose provenance is not the SOURCE’s own accepted target', () => {
    const otherGeneration = mineAdditionProbeStamp({
      ...target,
      synthesisGeneratedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(mineAdditionProbeResult(mathSource, [probeRow({ localProbe: otherGeneration })])).toBeNull()
  })

  it('refuses another mode, another domain or another level', () => {
    expect(
      mineAdditionProbeResult({ ...mathSource, questMode: 'phonics' }, [probeRow()]),
    ).toBeNull()
    expect(mineAdditionProbeResult({ ...mathSource, domain: 'reading' }, [probeRow()])).toBeNull()
    expect(mineAdditionProbeResult(mathSource, [probeRow({ level: 5 })])).toBeNull()
  })
})
