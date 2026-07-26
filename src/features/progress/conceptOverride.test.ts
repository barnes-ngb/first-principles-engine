import { describe, expect, it } from 'vitest'

import {
  buildOverrideAction,
  buildReconcileView,
  KEEP_MY_WORD_NOTE,
  PARENT_STATE_CHOICES,
  proposableState,
  RECONCILE_NOTICE,
  stateChoiceLabel,
  TAKE_MODEL_READ_NOTE,
} from './conceptOverride'
import { applyReviewActionToModel } from '../foundations-review/foundationsReviewActions'
import type { ConceptStateEntry, LearnerModel } from '../../core/types/learnerModel'

const NOW = '2026-07-25T12:00:00.000Z'
const CVC = 'reading.phonics.cvc'

/** Every string this module can put on screen, for the copy-rail sweep. */
const ALL_COPY = [
  RECONCILE_NOTICE,
  KEEP_MY_WORD_NOTE,
  TAKE_MODEL_READ_NOTE,
  ...PARENT_STATE_CHOICES.map((s) => stateChoiceLabel(s, 'Lincoln')),
]

function flaggedEntry(over: Partial<ConceptStateEntry> = {}): ConceptStateEntry {
  return {
    state: 'solid',
    evidence: [
      {
        kind: 'attestation',
        sourceId: 'reviewChat',
        note: 'He read cat, run, sit for me',
        observedAt: '2026-07-01T00:00:00.000Z',
        overriddenBy: 'parent',
        readState: 'solid',
      },
      {
        kind: 'eval',
        sourceId: 'sess-9',
        note: 'Guided eval — "Sound out short words": needed help on 3 of 5',
        observedAt: '2026-07-20T00:00:00.000Z',
        readState: 'forming',
      },
    ],
    needsReconcile: true,
    ...over,
  }
}

describe('the three parent choices', () => {
  it('offers solid / forming / frontier only — never not-yet', () => {
    expect([...PARENT_STATE_CHOICES]).toEqual(['solid', 'forming', 'frontier'])
    expect(proposableState('not-yet')).toBeNull()
    expect(proposableState('forming')).toBe('forming')
  })

  it('labels each choice with the shared confirm-card wording', () => {
    expect(stateChoiceLabel('solid', 'Lincoln')).toBe('Lincoln has this solid')
    expect(stateChoiceLabel('forming', 'Lincoln')).toBe('Lincoln is coming along with this')
    expect(stateChoiceLabel('frontier', 'Lincoln')).toBe('Lincoln is working on this')
  })
})

describe('buildReconcileView — the FEAT-76 flag, made visible', () => {
  it('is null when nothing is flagged', () => {
    expect(buildReconcileView({ state: 'solid', evidence: [] }, 'Lincoln')).toBeNull()
    expect(buildReconcileView(undefined, 'Lincoln')).toBeNull()
  })

  it('shows BOTH reads — the parent’s standing word first, then the eval’s', () => {
    const view = buildReconcileView(flaggedEntry(), 'Lincoln')
    expect(view?.yours.line).toContain('You recorded: Lincoln has this solid')
    expect(view?.yours.line).toContain('2026-07-01')
    expect(view?.theirs.line).toContain('The evaluation saw: Lincoln is coming along with this')
    expect(view?.theirs.line).toContain('2026-07-20')
    expect(view?.evalState).toBe('forming')
  })

  it('reports the state the parent attested, not later derived drift', () => {
    // Parent attested `forming`; a quest upgrade later moved the entry to `solid`
    // while the eval disagreement was still standing.
    const entry = flaggedEntry({ state: 'solid' })
    entry.evidence[0].readState = 'forming'
    const view = buildReconcileView(entry, 'Lincoln')
    expect(view?.yourState).toBe('forming')
    expect(view?.yours.line).toContain('You recorded: Lincoln is coming along with this')
  })

  it('falls back to the entry state when the attestation predates FEAT-66', () => {
    const entry = flaggedEntry()
    delete entry.evidence[0].readState
    expect(buildReconcileView(entry, 'Lincoln')?.yourState).toBe('solid')
  })

  it('falls back to "something different" when the eval ref predates FEAT-66 (no readState)', () => {
    const entry = flaggedEntry()
    delete entry.evidence[1].readState
    const view = buildReconcileView(entry, 'Lincoln')
    expect(view?.evalState).toBeUndefined() // "take the model's read" is not offered
    expect(view?.theirs.line).toContain('The evaluation saw something different')
  })

  it('scrubs §14 jargon out of both evidence notes', () => {
    const entry = flaggedEntry()
    entry.evidence[1].note = 'Guided eval — working level 4 (band 1 < frontier), 40% correct'
    const view = buildReconcileView(entry, 'Lincoln')
    const text = `${view?.yours.detail ?? ''} ${view?.theirs.detail ?? ''}`
    expect(text).not.toMatch(/\bband\s*\d/i)
    expect(text).not.toMatch(/\blevel\s*\d/i)
    expect(text).not.toContain('%')
  })
})

describe('buildOverrideAction — one write semantic for every route', () => {
  it('builds an attest action carrying the origin and a trimmed note', () => {
    expect(
      buildOverrideAction({
        childId: 'c1', conceptId: CVC, state: 'solid', note: '  he read cat  ', origin: 'foundationsTab',
      }),
    ).toEqual({
      kind: 'attest', childId: 'c1', conceptId: CVC, state: 'solid',
      origin: 'foundationsTab', note: 'he read cat',
    })
  })

  it('omits an empty note rather than writing a blank one', () => {
    const action = buildOverrideAction({
      childId: 'c1', conceptId: CVC, state: 'frontier', note: '   ', origin: 'foundationsTab',
    })
    expect('note' in action).toBe(false)
  })

  it('writes a parent attestation end to end through the shared projector', () => {
    const base: LearnerModel = {
      childId: 'c1',
      graphVersion: 'reading@1+math@1',
      status: 'seeded',
      conceptStates: { [CVC]: flaggedEntry() },
      modalityCalibration: { reading: { note: '' }, writing: { note: '' }, math: { note: '' } },
      whatMattersNext: [],
      changeFeed: [],
      openQuestions: [],
      seededAt: NOW,
      updatedAt: NOW,
    }
    const action = buildOverrideAction({
      childId: 'c1', conceptId: CVC, state: 'forming',
      note: TAKE_MODEL_READ_NOTE, origin: 'reconcileTake',
    })
    const { model } = applyReviewActionToModel(base, action, NOW)
    const entry = model.conceptStates[CVC]
    expect(entry.state).toBe('forming') // the eval's read, chosen by the parent
    expect(entry.evidence.at(-1)).toMatchObject({
      kind: 'attestation',
      overriddenBy: 'parent',
      note: TAKE_MODEL_READ_NOTE,
    })
    expect(entry.needsReconcile).toBe(false) // the disagreement is settled
  })

  it('attesting solid stays solid — the §13 clamp is `covered`-only', () => {
    const base: LearnerModel = {
      childId: 'c1', graphVersion: 'reading@1+math@1', status: 'seeded',
      conceptStates: {},
      modalityCalibration: { reading: { note: '' }, writing: { note: '' }, math: { note: '' } },
      whatMattersNext: [], changeFeed: [], openQuestions: [], seededAt: NOW, updatedAt: NOW,
    }
    const action = buildOverrideAction({ childId: 'c1', conceptId: CVC, state: 'solid', origin: 'foundationsTab' })
    expect(applyReviewActionToModel(base, action, NOW).model.conceptStates[CVC].state).toBe('solid')
  })
})

describe('§14 / ETHOS-02 copy rails', () => {
  it('carries no band number, working level, percentage, score, or shame word', () => {
    for (const copy of ALL_COPY) {
      expect(copy).not.toMatch(/\bband\s*\d/i)
      expect(copy).not.toMatch(/\b(working\s+)?level\s*\d/i)
      expect(copy).not.toMatch(/\d\s*%/)
      expect(copy).not.toMatch(/\bscore/i)
      expect(copy).not.toMatch(/regress|dropped|failed/i)
    }
  })
})
