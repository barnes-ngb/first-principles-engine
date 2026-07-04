import { describe, expect, it } from 'vitest'

import {
  applyReviewActionToModel,
  clampCoveredState,
  parseFoundationsReviewActions,
} from './foundationsReviewActions'
import { mergeSeededModel } from '../../core/foundations/seedLearnerModel'
import type { FoundationsReviewAction } from './foundationsReviewActions'
import type { LearnerModel } from '../../core/types/learnerModel'

const NOW = '2026-07-04T12:00:00.000Z'
// Two real graph concept ids (validated by the parser against FOUNDATION_NODE_MAP).
const CVC = 'reading.phonics.cvc'
const LONG = 'reading.phonics.longVowels'

function emptyModel(): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: {},
    modalityCalibration: {
      reading: { note: '' },
      writing: { note: '' },
      math: { note: '' },
    },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
}

describe('clampCoveredState — §13 covered ≠ mastered', () => {
  it('forces solid down to forming', () => {
    expect(clampCoveredState('solid')).toBe('forming')
  })
  it('passes forming and frontier through (at/under the cap)', () => {
    expect(clampCoveredState('forming')).toBe('forming')
    expect(clampCoveredState('frontier')).toBe('frontier')
    expect(clampCoveredState('not-yet')).toBe('not-yet')
  })
})

describe('parseFoundationsReviewActions', () => {
  it('parses attest / covered / queueTest and strips the blocks', () => {
    const raw = [
      'Nice — that sounds solid.',
      `<action>{"kind":"attest","childId":"c1","conceptId":"${CVC}","state":"solid","note":"reads cat, run"}</action>`,
      `<action>{"kind":"covered","childId":"c1","conceptId":"${LONG}","source":"Fast Phonics","unit":"Peak 18"}</action>`,
      `<action>{"kind":"queueTest","childId":"c1","conceptId":"${LONG}"}</action>`,
    ].join('\n')
    const { actions, cleanText } = parseFoundationsReviewActions(raw)
    expect(actions.map((a) => a.kind)).toEqual(['attest', 'covered', 'queueTest'])
    expect(cleanText).toBe('Nice — that sounds solid.')
  })

  it('rejects an unknown concept id and an unknown kind', () => {
    const raw = [
      '<action>{"kind":"attest","childId":"c1","conceptId":"reading.made.up","state":"solid"}</action>',
      `<action>{"kind":"removeConcept","childId":"c1","conceptId":"${CVC}"}</action>`,
    ].join('\n')
    expect(parseFoundationsReviewActions(raw).actions).toHaveLength(0)
  })

  it('rejects an attest with state not-yet (that is "skip", no write)', () => {
    const raw = `<action>{"kind":"attest","childId":"c1","conceptId":"${CVC}","state":"not-yet"}</action>`
    expect(parseFoundationsReviewActions(raw).actions).toHaveLength(0)
  })
})

describe('applyReviewActionToModel — attest', () => {
  it('writes the parent-chosen state (may be solid) + an attestation ref + a change line', () => {
    const action: FoundationsReviewAction = {
      kind: 'attest',
      childId: 'c1',
      conceptId: CVC,
      state: 'solid',
      note: 'He reads cat, run, sit',
    }
    const { model, changedConceptId } = applyReviewActionToModel(emptyModel(), action, NOW)
    expect(changedConceptId).toBe(CVC)
    const entry = model.conceptStates[CVC]
    expect(entry.state).toBe('solid')
    expect(entry.evidence[0].kind).toBe('attestation')
    expect(entry.evidence[0].overriddenBy).toBe('parent')
    expect(model.changeFeed.at(-1)).toMatchObject({ conceptId: CVC, from: 'not-yet', to: 'solid' })
    expect(model.changeFeed.at(-1)?.cause).toContain('reviewChat')
  })
})

describe('applyReviewActionToModel — covered (the §13 clamp, end to end)', () => {
  it('clamps a covered proposal claiming solid down to forming, regardless of the LLM', () => {
    const action: FoundationsReviewAction = {
      kind: 'covered',
      childId: 'c1',
      conceptId: LONG,
      source: 'Fast Phonics',
      unit: 'Peak 18',
      proposedState: 'solid', // the LLM over-claimed
    }
    const { model } = applyReviewActionToModel(emptyModel(), action, NOW)
    const entry = model.conceptStates[LONG]
    expect(entry.state).toBe('forming') // clamped — never solid from coverage alone
    expect(entry.evidence[0].kind).toBe('curriculumPosition')
    expect(entry.evidence[0].source).toBe('Fast Phonics')
    // covered attaches a "verify with a quest?" openQuestion.
    expect(model.openQuestions).toHaveLength(1)
    expect(model.openQuestions[0]).toMatchObject({ conceptId: LONG, routedTo: 'quest' })
  })

  it('lets a covered frontier proposal through (below the cap)', () => {
    const action: FoundationsReviewAction = { kind: 'covered', childId: 'c1', conceptId: CVC, source: 'Workbook', proposedState: 'frontier' }
    expect(applyReviewActionToModel(emptyModel(), action, NOW).model.conceptStates[CVC].state).toBe('frontier')
  })

  it('never downgrades a stronger standing state on a coverage claim', () => {
    const base = emptyModel()
    base.conceptStates[CVC] = { state: 'forming', evidence: [{ kind: 'workingLevel', sourceId: 's', note: 'wl', observedAt: NOW }] }
    const action: FoundationsReviewAction = { kind: 'covered', childId: 'c1', conceptId: CVC, source: 'Workbook', proposedState: 'frontier' }
    // frontier < forming → keep forming.
    expect(applyReviewActionToModel(base, action, NOW).model.conceptStates[CVC].state).toBe('forming')
  })
})

describe('applyReviewActionToModel — queueTest', () => {
  it('queues a quest-routed openQuestion without changing state, deduped by concept', () => {
    const action: FoundationsReviewAction = { kind: 'queueTest', childId: 'c1', conceptId: LONG }
    const first = applyReviewActionToModel(emptyModel(), action, NOW)
    expect(first.changedConceptId).toBeUndefined()
    expect(first.model.conceptStates[LONG]).toBeUndefined() // no state write
    expect(first.model.openQuestions).toHaveLength(1)
    expect(first.model.openQuestions[0]).toMatchObject({ conceptId: LONG, routedTo: 'quest' })
    // Re-queuing the same concept does not duplicate.
    const second = applyReviewActionToModel(first.model, action, NOW)
    expect(second.model.openQuestions).toHaveLength(1)
  })
})

describe('re-seed guard protects chat-written entries (FEAT-51 creates the first real ones)', () => {
  it('mergeSeededModel preserves an attestation entry and a curriculumPosition entry, and carries openQuestions forward', () => {
    let m = emptyModel()
    m = applyReviewActionToModel(m, { kind: 'attest', childId: 'c1', conceptId: CVC, state: 'solid' }, NOW).model
    m = applyReviewActionToModel(m, { kind: 'covered', childId: 'c1', conceptId: LONG, source: 'Fast Phonics' }, NOW).model

    // A fresh seed would wipe these (it recomputes states + empties the arrays).
    const fresh: LearnerModel = {
      ...emptyModel(),
      conceptStates: { [CVC]: { state: 'not-yet', evidence: [] }, [LONG]: { state: 'not-yet', evidence: [] } },
    }
    const merged = mergeSeededModel(m, fresh)
    expect(merged.conceptStates[CVC].state).toBe('solid') // attestation preserved
    expect(merged.conceptStates[LONG].state).toBe('forming') // curriculumPosition preserved
    expect(merged.openQuestions.length).toBeGreaterThan(0) // queued check survives re-seed
  })
})
